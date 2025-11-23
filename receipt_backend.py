import json
import os
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import google.generativeai as genai
from PIL import Image
import io
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

# Load environment variables from .env file
# Get the directory where this script is located
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise ValueError("MONGODB_URI environment variable is not set.")

# Configure MongoDB connection with SSL/TLS support for Atlas
# MongoDB Atlas requires TLS/SSL connections
# IMPORTANT: Your connection string should use mongodb+srv:// protocol for Atlas
# Example: mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
# 
# Common SSL issues and solutions:
# 1. Make sure your IP is whitelisted in MongoDB Atlas Network Access settings
# 2. Install pymongo with OCSP support: pip install pymongo[ocsp]
# 3. Python 3.13 may need tlsAllowInvalidCertificates=True as a workaround

# Check if connection string uses +srv protocol (which handles SSL automatically)
use_srv = "mongodb+srv://" in MONGODB_URI.lower()

if use_srv:
    # mongodb+srv automatically handles TLS
    # Using tlsAllowInvalidCertificates as workaround for Python 3.13 SSL issues
    mongo_client = AsyncIOMotorClient(
        MONGODB_URI,
        tlsAllowInvalidCertificates=True,  # Workaround for Python 3.13 SSL issues (development only)
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000,
        socketTimeoutMS=30000,
    )
else:
    # For regular mongodb:// connections, explicitly enable TLS
    mongo_client = AsyncIOMotorClient(
        MONGODB_URI,
        tls=True,
        tlsAllowInvalidCertificates=True,  # Workaround for Python 3.13 SSL issues (development only)
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000,
        socketTimeoutMS=30000,
    )

db = mongo_client["Paymi"]
receipts_collection = db["receipts"]


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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is not set. Please set it in your .env file or environment.")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash')

# Data models
class Item(BaseModel):
    store_name: Optional[str] = None
    item_name: Optional[str] = None
    name: Optional[str] = None  # For backward compatibility
    price: Optional[float] = None
    subtotal: Optional[float] = None
    quantity: int = 1
    tax_code: Optional[str] = None
    tax_amount: float = 0.0
    total: Optional[float] = None

class ReceiptResponse(BaseModel):
    items: List[Item]
    total: float

# Health check endpoint to test database connection
@app.get("/health")
async def health_check():
    """Check if the database connection is working"""
    try:
        # Test the connection by pinging the database
        await mongo_client.admin.command('ping')
        return {
            "status": "healthy",
            "database": "connected",
            "database_name": db.name,
            "collection": receipts_collection.name
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }

@app.post("/upload_receipt")
async def upload_receipt(file: UploadFile = File(...)):
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg", "application/pdf"]:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPG, PNG, PDF allowed.")

    contents = await file.read()
    output_text = ""
    
    try:
        image = Image.open(io.BytesIO(contents))
        
        prompt = (
            "Extract all items, quantities, prices, and tax information from this receipt image. "
            "For each item, identify its tax code (if visible) and calculate the tax amount using the tax table below.\n\n"
            "TAX CODE LEGEND (Ontario Tax Rates):\n"
            "* Code A: GST/HST applies → Apply 13% HST (subtotal × 0.13)\n"
            "* Code B: PST/QST applies → Apply 8% PST (subtotal × 0.08)\n"
            "* Code C: Both GST/HST and PST/QST apply → Apply 13% HST (subtotal × 0.13)\n"
            "* Code D: No Tax → tax_amount = 0.00\n"
            "* Code E: Both GST/HST and PST/QST apply (Eligible for Associate Discount) → Apply 13% HST (subtotal × 0.13)\n"
            "* Code H: Tax Exempt → tax_amount = 0.00\n"
            "* Code J: GST/HST applies (Eligible for Associate Discount) → Apply 13% HST (subtotal × 0.13)\n"
            "* Code K: PST/QST applies (Eligible for Associate Discount) → Apply 8% PST (subtotal × 0.08)\n"
            "* Code Y: GST (5%) applies → Apply 5% GST (subtotal × 0.05)\n"
            "* Code Z: GST (5%) applies (Eligible for Associate Discount) → Apply 5% GST (subtotal × 0.05)\n\n"
            "INSTRUCTIONS:\n"
            "1. For each item on the receipt, identify the tax code (A, B, C, D, E, H, J, K, Y, Z) if visible.\n"
            "2. Extract the item's subtotal (price before tax).\n"
            "3. Calculate tax_amount using the formula from the tax code legend above.\n"
            "4. Calculate total = subtotal + tax_amount for each item.\n"
            "5. If no tax code is visible, check if the receipt shows tax breakdown and calculate accordingly.\n"
            "6. If tax is already included in the price shown, extract the tax amount from the receipt's tax breakdown.\n\n"
            "Return ONLY valid JSON (no markdown, no code blocks, just pure JSON):\n"
            '{"items": [{"store_name": "merchant name", "item_name": "item name", "quantity": 1, "subtotal": 0.00, "tax_code": "A", "tax_amount": 0.00, "total": 0.00}], "total": 0.00}\n\n'
            "IMPORTANT:\n"
            "- Include tax_code field for each item (use the code letter if visible, or null if not found)\n"
            "- Calculate tax_amount based on the tax code using Ontario rates\n"
            "- Ensure total for each item = subtotal + tax_amount\n"
            "- The receipt total should match the sum of all item totals"
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

        # -------- SAVE THIS RECEIPT INTO MONGODB (SIMPLE VERSION) --------
        try:
            # Get store_name from the first item, if it exists
            store_name = None
            if receipt_data.get("items"):
                store_name = receipt_data["items"][0].get("store_name")

            # Build the document to store
            receipt_doc = {
                "store_name": store_name,
                "items": receipt_data.get("items", []),  # the exact items array
                "total": receipt_data.get("total", 0.0),
                "created_at": datetime.utcnow(),
            }

            # Insert into the "receipts" collection
            result = await receipts_collection.insert_one(receipt_doc)
            receipt_id = result.inserted_id

            # Add the ID to the response so the frontend knows which DB record this is
            receipt_data["receipt_id"] = str(receipt_id)
            print(f"Receipt saved to MongoDB with ID: {receipt_id}")
        except Exception as db_error:
            # Log the error and raise it since we need the database to work
            error_msg = str(db_error)
            print(f"ERROR: Failed to save receipt to MongoDB: {error_msg}")
            # Re-raise if it's a critical error (not just SSL), otherwise continue
            if "SSL" not in error_msg and "handshake" not in error_msg:
                # If it's not an SSL error, it might be a critical DB issue
                print(f"Critical database error: {error_msg}")
                raise HTTPException(status_code=500, detail=f"Failed to save receipt to database: {error_msg}")
            # For SSL errors, we'll still try to return the data but warn the user
            print(f"Warning: SSL error occurred but continuing with response")
        # -----------------------------------------------------------------
        
        # Validate response structure
        if "items" not in receipt_data or not isinstance(receipt_data["items"], list):
            raise HTTPException(status_code=500, detail="Invalid response: items array is missing or invalid")
        
        if "total" not in receipt_data:
            raise HTTPException(status_code=500, detail="Invalid response: total is missing")
        
        # Return JSON response directly
        return JSONResponse(content=receipt_data)

    except json.JSONDecodeError as e:
        error_detail = f"Failed to parse JSON from Gemini response: {str(e)}"
        if output_text:
            error_detail += f". Response was: {output_text[:200]}"
        raise HTTPException(status_code=500, detail=error_detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse receipt via Gemini: {str(e)}")