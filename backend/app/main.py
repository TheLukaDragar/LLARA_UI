import os
from typing import List, Optional

from datasets import load_dataset
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI()

# Enable CORS
allowed_origins = [
    "http://localhost:3000",
    "http://frontend:3000",  # Docker service name
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load dataset (replace with your dataset name)
#    test_dataset = load_dataset('skadooah2/testiranje_alinej_poglobljeno_test')['train']

dataset = load_dataset("skadooah2/testiranje_alinej_poglobljeno_test")["train"]


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


class SummaryUpdate(BaseModel):
    summary: str


@app.get("/summaries/", response_model=List[Summary])
async def get_summaries(skip: int = 0, limit: int = 10):
    try:
        dataset_size = len(dataset)
        if skip >= dataset_size:
            return []

        end_idx = min(skip + limit, dataset_size)
        indices = list(range(skip, end_idx))
        subset = dataset.select(indices)

        summaries = []
        for i, item in enumerate(subset):
            summaries.append(
                Summary(
                    id=skip + i,
                    input=item["input"],
                    output=item["output"],
                    num_words=item["num_words"],
                    is_bullet=item["is_bullet"],
                    summary_category=item["summary_category"],
                    num_bullet_points=item["num_bullet_points"],
                    instruction=item["instruction"],
                    token_length=item["token_length"]
                )
            )
        return summaries
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/summaries/{summary_id}")
async def update_summary(summary_id: int, update_data: SummaryUpdate):
    try:
        # In a real application, you'd want to persist these changes
        # For now, we'll just return success
        return {"message": "Summary updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
