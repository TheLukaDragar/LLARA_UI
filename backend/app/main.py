import asyncio
import json
import logging
import os
import time
from asyncio import Lock
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import urlparse

import classla
import httpx
from app.database import AsyncSessionLocal, SummaryModel, get_db, init_db
from celery import Celery
from celery.result import AsyncResult
from datasets import load_dataset
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

# Set up logging configuration
logging.basicConfig(
    level=logging.DEBUG, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI()

# Enable CORS
allowed_origins = [
    "*",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client
logger.info("Initializing OpenAI client")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize both old and new text processing methods
# Old direct pipeline
RESOURCES_DIR = "/root/classla_resources"
os.environ["STANZA_RESOURCES_DIR"] = RESOURCES_DIR

logger.info(f"Checking for Classla models in {RESOURCES_DIR}")
# Download models if needed
if not (Path(RESOURCES_DIR) / "sl").exists():
    logger.info("Downloading Slovenian language models...")
    classla.download("sl")
    logger.info("Model download completed")
else:
    logger.info("Slovenian language models already present")

logger.info("Initializing Classla pipeline")
nlp = classla.Pipeline("sl", processors="tokenize,pos,lemma")
logger.info("Classla pipeline initialized successfully")

# New Celery pipeline (keep for future use)
logger.info("Initializing Celery connection")
celery_app = Celery(
    "text_processor",
    broker=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"),
)

# Add these constants near the top of the file
OPENAI_API_BASE = "https://api.openai.com/v1/chat/completions"

# Add these class variables after app initialization
app.model_switch_lock = Lock()
app.current_model = "gpt-3.5-turbo"  # Default model


@app.on_event("startup")
async def startup_event():
    logger.info("Application starting up")
    try:
        logger.info("Initializing database")
        await init_db()
        logger.info("Loading initial data")
        await load_initial_data()
        logger.info("Startup completed successfully")
    except Exception as e:
        logger.error(f"Error during startup: {str(e)}", exc_info=True)
        raise


async def load_initial_data():
    async with AsyncSessionLocal() as session:
        # Check if we already have data
        result = await session.execute(select(SummaryModel).limit(1))
        if result.scalar_one_or_none() is not None:
            return

        # Load from Hugging Face
        dataset = load_dataset("skadooah2/testiranje_alinej_poglobljeno_test")["train"]

        for item in dataset:
            instruction_prefix = get_instruction_prefix(
                is_bullet=item["is_bullet"],
                summary_category=item["summary_category"],
                num_bullet_points=item.get("num_bullet_points"),
            )
            db_summary = SummaryModel(
                input=item["input"],
                output=item["output"],
                num_words=item["num_words"],
                is_bullet=item["is_bullet"],
                summary_category=item["summary_category"],
                num_bullet_points=item["num_bullet_points"],
                instruction=item["instruction"],
                instruction_prefix=instruction_prefix,
                token_length=item["token_length"],
            )
            session.add(db_summary)

        await session.commit()


class Summary(BaseModel):
    id: int
    input: str
    output: str
    num_words: int
    is_bullet: bool
    summary_category: str
    instruction: Optional[str]
    instruction_prefix: Optional[str]
    token_length: Optional[int]


class SummaryUpdate(BaseModel):
    summary: str


class Parameters(BaseModel):
    summary_category: str
    is_bullet: bool


class TextAnalysisRequest(BaseModel):
    original_text: str
    summary_text: str


def get_instruction_prefix(
    is_bullet: bool, summary_category: str, num_bullet_points: Optional[int] = None
) -> str:
    if is_bullet:
        if summary_category == "ultra_concise":
            return f"Naredi {num_bullet_points} kraih alinej iz besedila. Naj bodo izjemno kratke in jedrnate."
        elif summary_category == "concise":
            return f"Pretvori besedilo v {num_bullet_points} alinej. Naj bodo kratke in jasne."
        elif summary_category == "short":
            return f"Ustvari {num_bullet_points} alinej iz besedila, z nekoliko več podrobnosti."
        elif summary_category == "medium":
            return f"Naredi {num_bullet_points} alinej iz besedila z zmerno količino podrobnosti."
        elif summary_category == "long":
            return f"Razčleni besedilo v {num_bullet_points} alinej z več podrobnostmi in razširjenimi pojasnili."
        else:
            return f"Razvij {num_bullet_points} alinej iz besedila, pri čemer vključuješ poglobljene informacije in podrobne razlage."
    else:
        if summary_category == "ultra_concise":
            return "Zgoščeno povzemite glavno idejo v eni sami, osrednji misli. Povzetek naj bo čim krajši."
        elif summary_category == "concise":
            return "Strnite bistvo v kratke in jedrnate povedi, izpostavljajoč najpomembnejše informacije."
        elif summary_category == "short":
            return "Napišite kratek povzetek, ki zajame ključne točke in poudari pomembne informacije."
        elif summary_category == "medium":
            return "Oblikujte povzetek, ki vključuje pomembne podrobnosti in argumente."
        elif summary_category == "long":
            return "Pripravite obširen povzetek, ki pokriva vse ključne vidike in informacije."
        else:
            return "Ustvarite temeljit povzetek, ki podrobno povzema vse glavne točke, podatke in zaključke."


def getSimilarity(str1: str, str2: str) -> bool:
    # Since we're comparing lemmas that are already provided by Classla,
    # we just need to check for exact matches or substring containment
    return (
        str1 == str2
        or str1 in str2
        or str2 in str1
        or (
            len(str1) > 3
            and len(str2) > 3
            and
            # Keep the Levenshtein-like distance for slight spelling variations
            sum(1 for i in range(min(len(str1), len(str2))) if str1[i] != str2[i])
            + abs(len(str1) - len(str2))
            <= max(len(str1), len(str2)) * 0.3
        )
    )


@app.get("/summaries/", response_model=List[Summary])
async def get_summaries(
    skip: int = 0, limit: int = 10, db: AsyncSession = Depends(get_db)
):
    try:
        query = select(SummaryModel).offset(skip).limit(limit)
        result = await db.execute(query)
        summaries = result.scalars().all()

        if not summaries:
            return []

        return [
            Summary(
                id=summary.id,
                input=summary.input,
                output=summary.output,
                num_words=summary.num_words,
                is_bullet=summary.is_bullet,
                summary_category=summary.summary_category,
                instruction=summary.instruction,
                instruction_prefix=summary.instruction_prefix,
                token_length=summary.token_length,
            )
            for summary in summaries
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/summaries/{summary_id}")
async def update_summary(
    summary_id: int, update_data: SummaryUpdate, db: AsyncSession = Depends(get_db)
):
    try:
        query = select(SummaryModel).where(SummaryModel.id == summary_id)
        result = await db.execute(query)
        summary = result.scalar_one_or_none()

        if not summary:
            raise HTTPException(status_code=404, detail="Summary not found")

        summary.output = update_data.summary
        await db.commit()

        return {"message": "Summary updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def process_chat(chat_request: dict, db: AsyncSession = Depends(get_db)):
    start_time = time.time()
    message = chat_request.get("message")
    current_summary = chat_request.get("current_summary")
    original_text = chat_request.get("original_text")

    logger.info("Received chat request")
    logger.debug(
        f"Message length: {len(message)}, Current summary length: {len(current_summary)}, Original text length: {len(original_text)}"
    )

    try:
        system_message = """Si pomočnik za urejanje in izboljševanje povzetkov. 
        Imaš dostop do izvirnega besedila in trenutnega povzetka. Zagotovi, da so tvoje spremembe točne glede na izvirno besedilo."""

        user_prompt = f"""Izvirno besedilo: {original_text}

Trenutni povzetek: {current_summary}

Navodilo uporabnika: {message}

Prosim, spremeni povzetek v skladu z zgornjim navodilom in ostani zvest izvirnemu besedilu. Vrni samo spremenjeni povzetek brez dodatnih pojasnil."""

        logger.debug("Sending request to OpenAI")
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=1000,
        )

        updated_summary = response.choices[0].message.content.strip()
        processing_time = time.time() - start_time
        logger.info(f"Chat processing completed in {processing_time:.2f} seconds")
        logger.debug(f"Generated summary length: {len(updated_summary)}")

        return {"updated_summary": updated_summary}
    except Exception as e:
        logger.error(f"Error in chat processing: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")


@app.post("/analyze-text")
async def analyze_text(request: dict):
    start_time = time.time()
    original_text = request.get("original_text")
    summary_text = request.get("summary_text")

    logger.info(
        f"Received text analysis request - Original text length: {len(original_text)}, Summary length: {len(summary_text)}"
    )

    try:
        # Use the direct pipeline instead of Celery
        logger.debug("Processing original text...")
        doc_original = nlp(original_text)
        logger.debug("Original text processing completed")

        logger.debug("Processing summary text...")
        doc_summary = nlp(summary_text)
        logger.debug("Summary text processing completed")

        # Extract lemmas from original text
        logger.debug("Extracting lemmas from original text...")
        original_lemmas = {
            word.lemma.lower()
            for sent in doc_original.sentences
            for word in sent.words
            if word.upos not in ["PUNCT", "SYM", "SPACE"]
        }
        logger.debug(
            f"Extracted {len(original_lemmas)} unique lemmas from original text"
        )

        # Analyze summary words
        logger.debug("Analyzing summary words...")
        summary_analysis = []
        for sent in doc_summary.sentences:
            for word in sent.words:
                if word.upos in ["PUNCT", "SYM", "SPACE"]:
                    continue

                analysis = {
                    "word": word.text,
                    "lemma": word.lemma.lower(),
                    "found_in_original": word.lemma.lower() in original_lemmas,
                    "pos": word.upos,
                }
                summary_analysis.append(analysis)

        processing_time = time.time() - start_time
        logger.info(
            f"Analysis completed in {processing_time:.2f} seconds. Analyzed {len(summary_analysis)} words"
        )

        return {"analysis": summary_analysis}
    except Exception as e:
        logger.error(f"Error in text analysis: {str(e)}", exc_info=True)
        logger.error(
            f"Failed text lengths - Original: {len(original_text)}, Summary: {len(summary_text)}"
        )
        raise HTTPException(status_code=500, detail=str(e))


# Keep the Celery-based endpoints for future use, but rename them
@app.post("/analyze-text-async")
async def analyze_text_async(request: TextAnalysisRequest):
    original_task = celery_app.send_task(
        "tasks.process_text", args=[request.original_text]
    )
    summary_task = celery_app.send_task(
        "tasks.process_text", args=[request.summary_text]
    )

    return {
        "task_ids": {"original_text": original_task.id, "summary_text": summary_task.id}
    }


@app.get("/task-status/{task_id}")
async def get_task_status(task_id: str):
    result = AsyncResult(task_id)
    if result.ready():
        return {"status": "completed", "result": result.get()}
    return {"status": "pending"}


@app.post("/analyze-text-results")
async def get_analysis_results(task_ids: dict):
    original_result = AsyncResult(task_ids["original_text"])
    summary_result = AsyncResult(task_ids["summary_text"])

    if not (original_result.ready() and summary_result.ready()):
        raise HTTPException(status_code=202, detail="Tasks still processing")

    original_results = original_result.get()
    summary_results = summary_result.get()

    # Process results and create analysis
    analysis = []
    for word_info in summary_results:
        found = any(
            getSimilarity(word_info["lemma"], orig["lemma"])
            for orig in original_results
        )
        analysis.append(
            {
                "word": word_info["word"],
                "lemma": word_info["lemma"],
                "pos": word_info["pos"],
                "found_in_original": found,
            }
        )

    return {"analysis": analysis}


@app.get("/summaries/{summary_id}/parameters")
async def get_parameters(summary_id: int, db: AsyncSession = Depends(get_db)):
    try:
        query = select(SummaryModel).where(SummaryModel.id == summary_id)
        result = await db.execute(query)
        summary = result.scalar_one_or_none()

        if not summary:
            raise HTTPException(status_code=404, detail="Summary not found")

        return {
            "is_bullet": summary.is_bullet,
            "summary_category": summary.summary_category,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/summaries/{summary_id}/parameters")
async def update_parameters(
    summary_id: int, params: Parameters, db: AsyncSession = Depends(get_db)
):
    try:
        query = select(SummaryModel).where(SummaryModel.id == summary_id)
        result = await db.execute(query)
        summary = result.scalar_one_or_none()

        if not summary:
            raise HTTPException(status_code=404, detail="Summary not found")

        summary.is_bullet = params.is_bullet
        summary.summary_category = params.summary_category

        await db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ChatRequest(BaseModel):
    input_text: str
    api_endpoint: Optional[str] = None
    is_bullet: bool
    summary_category: str
    instruction_prefix: str
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1)
    top_k: int = Field(default=50, ge=0, description="Limits the number of tokens to consider for sampling")
    top_p: float = Field(default=0.9, ge=0.0, le=1.0, description="Nucleus sampling threshold")
    frequency_penalty: float = Field(default=0.0, ge=-2.0, le=2.0, description="Penalizes frequent tokens")


class ChatResponse(BaseModel):
    summary: str


@app.post("/api/chat")
async def generate_chat_response(request: ChatRequest):
    try:
        # Log the incoming request details
        logger.info("Received chat request:")
        logger.info(f"Input text: {request.input_text}")
        logger.info(f"API endpoint: {request.api_endpoint}")
        logger.info(f"Is bullet: {request.is_bullet}")
        logger.info(f"Summary category: {request.summary_category}")
        logger.info(f"Instruction prefix: {request.instruction_prefix}")
        logger.info(f"Temperature: {request.temperature}")
        logger.info(f"Max tokens: {request.max_tokens}")
        logger.info(f"Top K: {request.top_k}")
        logger.info(f"Top P: {request.top_p}")
        logger.info(f"Frequency penalty: {request.frequency_penalty}")  

        # Use the default OpenAI endpoint if none provided
        api_endpoint = request.api_endpoint or OPENAI_API_BASE
        # add v1/chat/completions join url
        api_endpoint = api_endpoint.rstrip("/") + "/v1/chat/completions"
        logger.info(f"Using API endpoint: {api_endpoint}")

        # Prepare the OpenAI-compatible payload with the provided parameters
        payload = {
            "model": app.current_model,  # Use the current model instead of hardcoded value
            "messages": [
                {
                    "role": "user",
                    "content": f"{request.instruction_prefix}\n\n{request.input_text}",
                }
            ],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "top_k": request.top_k,
            "top_p": request.top_p,
            "frequency_penalty": request.frequency_penalty,
            "stream": True,  # Enable streaming
        }
        logger.debug(f"Prepared payload: {json.dumps(payload, indent=2)}")

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("OpenAI API key not found in environment variables")
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        logger.debug("Request headers prepared")

        async def generate():
            try:
                logger.info("Starting streaming request to OpenAI API")
                async with httpx.AsyncClient(timeout=30.0) as client:
                    async with client.stream(
                        "POST",
                        api_endpoint,
                        json=payload,
                        headers=headers,
                    ) as response:
                        if response.status_code != 200:
                            error_msg = await response.text()
                            logger.error(f"API Error: {error_msg}")
                            yield f"data: {json.dumps({'error': f'API Error: {error_msg}'})}\n\n"
                            return

                        logger.info("Successfully connected to API, starting stream")
                        async for line in response.aiter_lines():
                            if line:
                                if line.startswith("data: "):
                                    yield f"{line}\n\n"
            except httpx.ConnectError as e:
                logger.error(f"Connection error: {str(e)}")
                yield f"data: {json.dumps({'error': 'Failed to connect to API service'})}\n\n"
            except Exception as e:
                logger.error(f"Streaming error: {str(e)}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        logger.info("Initiating streaming response")
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )

    except Exception as e:
        logger.error(f"Chat generation error: {str(e)}")
        return StreamingResponse(
            iter([f"data: {json.dumps({'error': str(e)})}\n\n"]),
            media_type="text/event-stream",
        )


class ModelsRequest(BaseModel):
    api_endpoint: str


@app.post("/api/models")
async def get_models(request: ModelsRequest):
    try:
        api_endpoint = request.api_endpoint.strip()
        logger.info(f"Original API endpoint: {api_endpoint}")

        # Basic URL validation
        from urllib.parse import urlparse

        parsed_url = urlparse(api_endpoint)
        if not all([parsed_url.scheme, parsed_url.netloc]):
            raise ValueError(f"Invalid URL format: {api_endpoint}")

        to_call = f"{api_endpoint.rstrip('/')}/models"
        logger.info(f"Making request to: {to_call}")

        async with httpx.AsyncClient(verify=True) as client:
            response = await client.get(
                to_call,
                headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}"},
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.error(f"Failed to fetch models: {response.text}")
                raise HTTPException(
                    status_code=response.status_code, detail=response.text
                )

            data = response.json()
            logger.info(f"Successfully retrieved models data")
            return data

    except ValueError as e:
        logger.error(f"URL validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching models: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class ModelSwitchRequest(BaseModel):
    model_name: str
    api_endpoint: Optional[str] = None


@app.post("/switch_model")
async def switch_model(request: ModelSwitchRequest):
    try:
        if app.model_switch_lock.locked():
            raise HTTPException(
                status_code=409,
                detail="Model switch already in progress. Please try again later.",
            )

        async with app.model_switch_lock:
            if not request.api_endpoint:
                raise ValueError("API endpoint is required")

            api_endpoint = request.api_endpoint.strip()
            switch_url = f"{api_endpoint.rstrip('/')}/switch_model/{request.model_name}"
            
            async def generate():
                try:
                    async with httpx.AsyncClient(verify=True, timeout=120.0) as client:
                        async with client.stream(
                            "POST", 
                            switch_url,
                            headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}"},
                        ) as response:
                            if response.status_code != 200:
                                error_msg = await response.text()
                                yield f"data: {json.dumps({'error': error_msg})}\n\n"
                                return

                            # Pass through the streaming response
                            async for line in response.aiter_lines():
                                if line:
                                    # Forward the SSE line as-is
                                    yield f"{line}\n\n"
                                    
                                    # Update current model if success message received
                                    try:
                                        if line.startswith('data: '):
                                            data = json.loads(line[6:])
                                            if data.get('status') == 'success':
                                                app.current_model = request.model_name
                                    except json.JSONDecodeError:
                                        continue

                except Exception as e:
                    logger.error(f"Error during model switch: {str(e)}")
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"

            return StreamingResponse(
                generate(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                },
            )

    except Exception as e:
        logger.error(f"Error in switch_model: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class ModelInfoRequest(BaseModel):
    api_endpoint: str


@app.post(
    "/current_model",
    response_model=Dict[str, str],
    responses={200: {"model": "str", "checkpoint_dir": "str"}},
)
async def get_current_model(request: ModelInfoRequest) -> Dict[str, str]:
    """Get current model info from LLM service."""
    try:
        # Validate URL
        url = request.api_endpoint.strip()
        if not all([x for x in urlparse(url)[0:2]]):
            raise HTTPException(status_code=400, detail="Invalid URL")

        # Make request with increased timeout and better error handling
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0)
        ) as client:
            try:
                response = await client.get(
                    f"{url.rstrip('/')}/current_model",
                    headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}"},
                )
                response.raise_for_status()
                return response.json()
            except httpx.TimeoutException:
                logger.error(f"Timeout while connecting to LLM service at {url}")
                raise HTTPException(
                    status_code=504, detail="Timeout while connecting to LLM service"
                )
            except httpx.ConnectError:
                logger.error(f"Failed to connect to LLM service at {url}")
                raise HTTPException(
                    status_code=503, detail="Could not connect to LLM service"
                )

    except httpx.HTTPError as e:
        logger.error(f"LLM service error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch model info")
