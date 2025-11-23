import json
import os
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise ValueError("MONGODB_URI environment variable is not set.")

# Initialize MongoDB connection
use_srv = "mongodb+srv://" in MONGODB_URI.lower()

if use_srv:
    mongo_client = AsyncIOMotorClient(
        MONGODB_URI,
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000,
        socketTimeoutMS=30000,
    )
else:
    mongo_client = AsyncIOMotorClient(
        MONGODB_URI,
        tls=True,
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000,
        socketTimeoutMS=30000,
    )

db = mongo_client["Paymi"]
contacts_collection = db["contacts"]
debts_collection = db["debts"]

app = FastAPI(title="Contact Backend")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data models
class Contact(BaseModel):
    first_name: str
    last_name: str
    username: str
    email: str  # Primary key (unique)
    wallet_id: str

class DebtUpdate(BaseModel):
    contact_email: str
    amount: float
    description: Optional[str] = None

class PaymentUpdate(BaseModel):
    contact_email: str
    amount: float
    description: Optional[str] = None

class SplitConfirmation(BaseModel):
    participants: list[str]  # List of contact emails
    amount_per_person: float
    total_amount: float
    items: Optional[list] = None

# Health check endpoint
@app.get("/health")
async def health_check():
    """Check if the database connection is working"""
    try:
        await mongo_client.admin.command('ping')
        return {
            "status": "healthy",
            "database": "connected",
            "database_name": db.name
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }

# Add new contact
@app.post("/add_contact")
async def add_contact(contact: Contact):
    """Add a new contact to the database"""
    try:
        # Check if email already exists (since it's the primary key)
        existing_contact = await contacts_collection.find_one({"email": contact.email})
        if existing_contact:
            raise HTTPException(
                status_code=400, 
                detail=f"Contact with email '{contact.email}' already exists. Email must be unique."
            )
        
        # Check if wallet_id already exists
        existing_wallet = await contacts_collection.find_one({"wallet_id": contact.wallet_id})
        if existing_wallet:
            raise HTTPException(
                status_code=400,
                detail=f"Contact with wallet ID '{contact.wallet_id}' already exists. Wallet ID must be unique."
            )

        # Build the document to store
        contact_doc = {
            "first_name": contact.first_name,
            "last_name": contact.last_name,
            "username": contact.username,
            "email": contact.email,  # Primary key
            "wallet_id": contact.wallet_id,
            "created_at": datetime.utcnow(),
        }

        # Insert into the "contacts" collection
        result = await contacts_collection.insert_one(contact_doc)
        contact_id = result.inserted_id

        # Initialize debt record for this contact
        debt_doc = {
            "contact_email": contact.email,
            "owes_me": 0.0,  # How much they owe you
            "i_owe": 0.0,    # How much you owe them
            "paid_back_to_me": 0.0,  # How much they've paid back
            "paid_back_by_me": 0.0,  # How much you've paid back
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        await debts_collection.insert_one(debt_doc)

        # Build response dictionary with all fields as JSON-serializable types
        response_data = {
            "first_name": contact_doc["first_name"],
            "last_name": contact_doc["last_name"],
            "username": contact_doc["username"],
            "email": contact_doc["email"],
            "wallet_id": contact_doc["wallet_id"],
            "contact_id": str(contact_id),
            "_id": str(contact_id),
            "created_at": contact_doc["created_at"].isoformat() if contact_doc.get("created_at") else None,
        }
        
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add contact: {str(e)}")

# Get all contacts with debt information
@app.get("/contacts")
async def get_contacts():
    """Get all contacts with their debt information"""
    try:
        contacts = []
        async for contact in contacts_collection.find({}):
            contact_email = contact["email"]
            
            # Get debt information for this contact
            debt_info = await debts_collection.find_one({"contact_email": contact_email})
            
            if debt_info:
                owes_me = debt_info.get("owes_me", 0.0)
                i_owe = debt_info.get("i_owe", 0.0)
                paid_back_to_me = debt_info.get("paid_back_to_me", 0.0)
                paid_back_by_me = debt_info.get("paid_back_by_me", 0.0)
                
                # Calculate net amounts
                net_owes_me = owes_me - paid_back_to_me
                net_i_owe = i_owe - paid_back_by_me
                
                # Determine category - only categorize as owes_me or i_owe if there's actual outstanding debt
                # If both are 0 or negative, or if net amounts are exactly 0, put in neutral
                if net_owes_me > 0:
                    category = "owes_me"
                    total_debt = net_owes_me
                    paid_back = paid_back_to_me
                elif net_i_owe > 0:
                    category = "i_owe"
                    total_debt = net_i_owe
                    paid_back = paid_back_by_me
                else:
                    # Both net amounts are 0 or negative - no outstanding debt
                    category = "neutral"
                    total_debt = 0.0
                    paid_back = 0.0
            else:
                # No debt record exists - definitely neutral
                category = "neutral"
                total_debt = 0.0
                paid_back = 0.0
                net_owes_me = 0.0
                net_i_owe = 0.0
            
            contact["contact_id"] = str(contact["_id"])
            contact["_id"] = str(contact["_id"])
            contact["category"] = category
            contact["total_debt"] = total_debt
            contact["paid_back"] = paid_back
            contact["net_owes_me"] = net_owes_me
            contact["net_i_owe"] = net_i_owe
            
            if "created_at" in contact and contact["created_at"]:
                contact["created_at"] = contact["created_at"].isoformat()
            
            contacts.append(contact)
        
        return JSONResponse(content={"contacts": contacts})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get contacts: {str(e)}")

# Add debt (someone owes you money)
@app.post("/add_debt")
async def add_debt(debt: DebtUpdate):
    """Add debt - someone owes you money"""
    try:
        # Check if contact exists
        contact = await contacts_collection.find_one({"email": debt.contact_email})
        if not contact:
            raise HTTPException(status_code=404, detail=f"Contact with email '{debt.contact_email}' not found")
        
        # Update or create debt record
        debt_doc = await debts_collection.find_one({"contact_email": debt.contact_email})
        
        if debt_doc:
            # Update existing debt
            new_owes_me = debt_doc.get("owes_me", 0.0) + debt.amount
            await debts_collection.update_one(
                {"contact_email": debt.contact_email},
                {
                    "$set": {
                        "owes_me": new_owes_me,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        else:
            # Create new debt record
            debt_doc = {
                "contact_email": debt.contact_email,
                "owes_me": debt.amount,
                "i_owe": 0.0,
                "paid_back_to_me": 0.0,
                "paid_back_by_me": 0.0,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            await debts_collection.insert_one(debt_doc)
        
        return JSONResponse(content={"status": "success", "message": f"Added ${debt.amount} to debt"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add debt: {str(e)}")

# Record payment (someone paid you back)
@app.post("/record_payment")
async def record_payment(payment: PaymentUpdate):
    """Record payment - someone paid you back"""
    try:
        debt_doc = await debts_collection.find_one({"contact_email": payment.contact_email})
        if not debt_doc:
            raise HTTPException(status_code=404, detail=f"No debt record found for '{payment.contact_email}'")
        
        current_owes_me = debt_doc.get("owes_me", 0.0)
        current_paid_back = debt_doc.get("paid_back_to_me", 0.0)
        
        # Update paid back amount (can't exceed what they owe)
        new_paid_back = min(current_paid_back + payment.amount, current_owes_me)
        
        await debts_collection.update_one(
            {"contact_email": payment.contact_email},
            {
                "$set": {
                    "paid_back_to_me": new_paid_back,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        return JSONResponse(content={"status": "success", "message": f"Recorded ${payment.amount} payment"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record payment: {str(e)}")

# Confirm split bill - update debts for all participants
@app.post("/confirm_split")
async def confirm_split(split: SplitConfirmation):
    """Confirm a bill split and update debts for all participants"""
    try:
        if not split.participants or len(split.participants) == 0:
            raise HTTPException(status_code=400, detail="At least one participant is required")
        
        if split.amount_per_person <= 0:
            raise HTTPException(status_code=400, detail="Amount per person must be greater than 0")
        
        results = []
        
        # For each participant, add to their debt (they owe the sender)
        for contact_email in split.participants:
            # Check if contact exists
            contact = await contacts_collection.find_one({"email": contact_email})
            if not contact:
                results.append({
                    "contact_email": contact_email,
                    "status": "error",
                    "message": f"Contact with email '{contact_email}' not found"
                })
                continue
            
            # Get or create debt record
            debt_doc = await debts_collection.find_one({"contact_email": contact_email})
            
            if debt_doc:
                # Update existing debt - they owe you more
                new_owes_me = debt_doc.get("owes_me", 0.0) + split.amount_per_person
                await debts_collection.update_one(
                    {"contact_email": contact_email},
                    {
                        "$set": {
                            "owes_me": new_owes_me,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
            else:
                # Create new debt record
                debt_doc = {
                    "contact_email": contact_email,
                    "owes_me": split.amount_per_person,
                    "i_owe": 0.0,
                    "paid_back_to_me": 0.0,
                    "paid_back_by_me": 0.0,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
                await debts_collection.insert_one(debt_doc)
            
            results.append({
                "contact_email": contact_email,
                "status": "success",
                "amount_added": split.amount_per_person
            })
        
        return JSONResponse(content={
            "status": "success",
            "message": f"Split confirmed: ${split.amount_per_person} per person for {len(split.participants)} contacts",
            "results": results
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to confirm split: {str(e)}")

# Get contact by email
@app.get("/contact/{email}")
async def get_contact_by_email(email: str):
    """Get a specific contact by email"""
    try:
        contact = await contacts_collection.find_one({"email": email})
        if not contact:
            raise HTTPException(status_code=404, detail=f"Contact with email '{email}' not found")
        
        # Get debt information
        debt_info = await debts_collection.find_one({"contact_email": email})
        
        contact["contact_id"] = str(contact["_id"])
        contact["_id"] = str(contact["_id"])
        if debt_info:
            contact["debt_info"] = {
                "owes_me": debt_info.get("owes_me", 0.0),
                "i_owe": debt_info.get("i_owe", 0.0),
                "paid_back_to_me": debt_info.get("paid_back_to_me", 0.0),
                "paid_back_by_me": debt_info.get("paid_back_by_me", 0.0),
            }
        
        if "created_at" in contact and contact["created_at"]:
            contact["created_at"] = contact["created_at"].isoformat()
        
        return JSONResponse(content=contact)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get contact: {str(e)}")

