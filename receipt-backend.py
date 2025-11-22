import json
import os
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import google.generativeai as genai
from PIL import Image
import io

app = FastAPI(title="Receipt Parser Backend")

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini API configuration
genai.configure(api_key="AIzaSyD6wOVdhU07Q2PP2062XoUQbMFfANUWBoU")
model = genai.GenerativeModel('gemini-2.0-flash')

# Data models
class Item(BaseModel):
    name: str
    price: float
    quantity: int = 1

class ReceiptResponse(BaseModel):
    items: List[Item]
    total: float
@app.post("/upload_receipt", response_model=ReceiptResponse)
async def upload_receipt(file: UploadFile = File(...)):
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg", "application/pdf"]:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPG, PNG, PDF allowed.")

    contents = await file.read()
    output_text = ""
    
    try:
        image = Image.open(io.BytesIO(contents))
        
        prompt = (
            "Extract all items, quantities, and prices from this receipt image. "
            "Return ONLY valid JSON in the following format (no markdown, no code blocks, just pure JSON): "
            '{"items": [{"name": "item name", "price": 0.00, "quantity": 1}], "total": 0.00}. '
            "Include all items found on the receipt with their individual prices and quantities. "
            "Calculate the total amount from the receipt."
        )

        response = model.generate_content([prompt, image])
        output_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if output_text.startswith("```json"):
            output_text = output_text[7:]
        if output_text.startswith("```"):
            output_text = output_text[3:]
        if output_text.endswith("```"):
            output_text = output_text[:-3]
        output_text = output_text.strip()

        receipt_data = json.loads(output_text)
        
        if not isinstance(receipt_data, dict) or "items" not in receipt_data or "total" not in receipt_data:
            raise ValueError("Invalid response format from Gemini")
        
        # Save to JSON file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        json_filename = f"receipt_{timestamp}.json"
        json_path = os.path.join(os.path.dirname(__file__), json_filename)
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(receipt_data, f, indent=2, ensure_ascii=False)
        
        print(f"Receipt data saved to {json_filename}")
        return receipt_data

    except json.JSONDecodeError as e:
        error_detail = f"Failed to parse JSON from Gemini response: {str(e)}"
        if output_text:
            error_detail += f". Response was: {output_text[:200]}"
        raise HTTPException(status_code=500, detail=error_detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse receipt via Gemini: {str(e)}")
