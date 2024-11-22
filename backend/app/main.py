import os
from typing import List, Optional
from openai import OpenAI
from dotenv import load_dotenv
from datasets import load_dataset
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import Session
import classla
from pathlib import Path

from .database import init_db, get_db, SummaryModel, AsyncSessionLocal

load_dotenv()

app = FastAPI()

# Enable CORS
allowed_origins = [
    "http://localhost:3000",
    "http://frontend:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Set CLASSLA resources path
os.environ['STANZA_RESOURCES_DIR'] = '/root/stanza_resources'

# Initialize CLASSLA with Slovenian models only if not already downloaded
if not (Path('/root/stanza_resources/sl').exists()):
    classla.download('sl')
nlp = classla.Pipeline('sl', processors='tokenize,pos,lemma')

@app.on_event("startup")
async def startup_event():
    await init_db()
    await load_initial_data()

async def load_initial_data():
    async with AsyncSessionLocal() as session:
        # Check if we already have data
        result = await session.execute(select(SummaryModel).limit(1))
        if result.scalar_one_or_none() is not None:
            return

        # Load from Hugging Face
        dataset = load_dataset("skadooah2/testiranje_alinej_poglobljeno_test")["train"]
        
        for item in dataset:
            db_summary = SummaryModel(
                input=item["input"],
                output=item["output"],
                num_words=item["num_words"],
                is_bullet=item["is_bullet"],
                summary_category=item["summary_category"],
                num_bullet_points=item["num_bullet_points"],
                instruction=item["instruction"],
                token_length=item["token_length"]
            )
            session.add(db_summary)
        
        await session.commit()

class Summary(BaseModel):
    id: int
    text: str = Field(alias="input")
    summary: str = Field(alias="output")
    num_words: int
    is_bullet: bool
    summary_category: Optional[str] = None
    num_bullet_points: Optional[int] = None
    instruction: Optional[str] = None
    token_length: Optional[int] = None

    class Config:
        orm_mode = True

class SummaryUpdate(BaseModel):
    summary: str

@app.get("/summaries/", response_model=List[Summary])
async def get_summaries(
    skip: int = 0, 
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
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
                num_bullet_points=summary.num_bullet_points,
                instruction=summary.instruction,
                token_length=summary.token_length
            ) for summary in summaries
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/summaries/{summary_id}")
async def update_summary(
    summary_id: int, 
    update_data: SummaryUpdate,
    db: AsyncSession = Depends(get_db)
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
async def process_chat(
    chat_request: dict,
    db: AsyncSession = Depends(get_db)
):
    message = chat_request.get("message")
    current_summary = chat_request.get("current_summary")
    original_text = chat_request.get("original_text")
    
    try:
        system_message = """You are a helpful AI assistant specialized in modifying and improving summaries based on user instructions. 
        You have access to both the original text and its current summary. Ensure your modifications maintain accuracy with respect to the original text."""
        
        user_prompt = f"""Original text: {original_text}

Current summary: {current_summary}

User instruction: {message}

Please modify the summary according to the instruction above while staying faithful to the original text. Return only the modified summary without any additional explanation."""

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        
        updated_summary = response.choices[0].message.content.strip()
        
        return {"updated_summary": updated_summary}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error processing chat: {str(e)}"
        )

@app.post("/analyze-text")
async def analyze_text(request: dict):
    original_text = request.get("original_text")
    summary_text = request.get("summary_text")
    
    # Process both texts
    doc_original = nlp(original_text)
    doc_summary = nlp(summary_text)
    
    # Extract lemmas (base forms) from original text
    original_lemmas = {word.lemma.lower() for sent in doc_original.sentences 
                      for word in sent.words 
                      if word.upos not in ['PUNCT', 'SYM', 'SPACE']}
    
    # Analyze summary words
    summary_analysis = []
    for sent in doc_summary.sentences:
        for word in sent.words:
            if word.upos in ['PUNCT', 'SYM', 'SPACE']:
                continue
                
            analysis = {
                'word': word.text,
                'lemma': word.lemma.lower(),
                'found_in_original': word.lemma.lower() in original_lemmas,
                'pos': word.upos,  # Part of speech
                'features': word.feats  # Morphological features
            }
            summary_analysis.append(analysis)
    
    return {"analysis": summary_analysis}
