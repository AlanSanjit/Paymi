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
user_debts_collection = db["user_debts"]  # Individualized debt tracking

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
    contact_email: str  # Creditor's email (who is being paid)
    debtor_email: str  # Debtor's email (who is making the payment)
    amount: float
    description: Optional[str] = None

class SplitConfirmation(BaseModel):
    participants: list[str]  # List of contact emails
    amount_per_person: float
    total_amount: float
    items: Optional[list] = None
    sender_email: str  # Email of the person who is splitting the bill
    sender_name: Optional[str] = None  # Full name of the sender

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

# Get all contacts with debt information (individualized per user)
@app.get("/contacts")
async def get_contacts(user_email: Optional[str] = None):
    """Get all contacts with their debt information from the logged-in user's perspective"""
    try:
        # If no user_email provided, return contacts without debt info
        if not user_email:
            contacts = []
            async for contact in contacts_collection.find({}):
                contact["contact_id"] = str(contact["_id"])
                contact["_id"] = str(contact["_id"])
                contact["category"] = "neutral"
                contact["total_debt"] = 0.0
                contact["paid_back"] = 0.0
                if "created_at" in contact and contact["created_at"]:
                    contact["created_at"] = contact["created_at"].isoformat()
                contacts.append(contact)
            return JSONResponse(content={"contacts": contacts})
        
        # Get all contacts
        all_contacts = []
        async for contact in contacts_collection.find({}):
            all_contacts.append(contact)
        
        # Get debts where this user is the creditor (others owe them)
        owes_me_debts = {}
        async for debt in user_debts_collection.find({"creditor_email": user_email}):
            debtor_email = debt.get("debtor_email")
            if debtor_email:
                if debtor_email not in owes_me_debts:
                    owes_me_debts[debtor_email] = {"total": 0.0, "paid_back": 0.0}
                owes_me_debts[debtor_email]["total"] += debt.get("amount", 0.0)
                owes_me_debts[debtor_email]["paid_back"] += debt.get("paid_back", 0.0)
        
        # Get debts where this user is the debtor (they owe others)
        i_owe_debts = {}
        async for debt in user_debts_collection.find({"debtor_email": user_email}):
            creditor_email = debt.get("creditor_email")
            creditor_name = debt.get("creditor_name", "")
            if creditor_email:
                if creditor_email not in i_owe_debts:
                    i_owe_debts[creditor_email] = {
                        "total": 0.0, 
                        "paid_back": 0.0,
                        "creditor_name": creditor_name
                    }
                i_owe_debts[creditor_email]["total"] += debt.get("amount", 0.0)
                i_owe_debts[creditor_email]["paid_back"] += debt.get("paid_back", 0.0)
                # Preserve creditor_name if it's available (use the most recent one if multiple debts exist)
                if creditor_name and not i_owe_debts[creditor_email].get("creditor_name"):
                    i_owe_debts[creditor_email]["creditor_name"] = creditor_name
                elif creditor_name:
                    # Update if we have a name (prefer non-empty names)
                    i_owe_debts[creditor_email]["creditor_name"] = creditor_name
        
        # Build response with categorized contacts
        contacts = []
        
        # First, process all contacts (excluding the current user)
        for contact in all_contacts:
            contact_email = contact["email"]
            
            # Skip if this contact is the current user
            if contact_email == user_email:
                continue
            
            # Check if this contact owes the user
            if contact_email in owes_me_debts:
                debt_info = owes_me_debts[contact_email]
                net_debt = debt_info["total"] - debt_info["paid_back"]
                if net_debt > 0:
                    category = "owes_me"
                    total_debt = net_debt
                    paid_back = debt_info["paid_back"]
                else:
                    category = "neutral"
                    total_debt = 0.0
                    paid_back = 0.0
            # Check if user owes this contact (this contact is a creditor)
            elif contact_email in i_owe_debts:
                debt_info = i_owe_debts[contact_email]
                net_debt = debt_info["total"] - debt_info["paid_back"]
                if net_debt > 0:
                    category = "i_owe"
                    total_debt = net_debt
                    paid_back = debt_info["paid_back"]
                    # Use creditor_name from debt if available (the person who split the bill)
                    creditor_name = debt_info.get("creditor_name", "")
                    if creditor_name:
                        # Override contact name with creditor name to show who split the bill
                        name_parts = creditor_name.split(" ", 1)
                        if len(name_parts) == 2:
                            contact["first_name"] = name_parts[0]
                            contact["last_name"] = name_parts[1]
                        else:
                            contact["first_name"] = creditor_name
                            contact["last_name"] = ""
                else:
                    category = "neutral"
                    total_debt = 0.0
                    paid_back = 0.0
            else:
                category = "neutral"
                total_debt = 0.0
                paid_back = 0.0
            
            contact["contact_id"] = str(contact["_id"])
            contact["_id"] = str(contact["_id"])
            contact["category"] = category
            contact["total_debt"] = total_debt
            contact["paid_back"] = paid_back
            
            if "created_at" in contact and contact["created_at"]:
                contact["created_at"] = contact["created_at"].isoformat()
            
            contacts.append(contact)
        
        # Also add users who owe the current user (who might not be in contacts)
        users_db = mongo_client["Paymi"]
        users_collection = users_db["users"]
        
        for debtor_email, debt_info in owes_me_debts.items():
            # Skip if this debtor is the current user
            if debtor_email == user_email:
                continue
            
            # Check if this debtor is already in contacts
            debtor_in_contacts = any(c["email"] == debtor_email for c in contacts)
            if not debtor_in_contacts:
                # Get debtor info from users collection
                debtor_user = await users_collection.find_one({"email": debtor_email})
                
                if debtor_user:
                    net_debt = debt_info["total"] - debt_info["paid_back"]
                    if net_debt > 0:
                        debtor_contact = {
                            "email": debtor_email,
                            "first_name": debtor_user.get("first_name", ""),
                            "last_name": debtor_user.get("last_name", ""),
                            "username": debtor_user.get("username", ""),
                            "wallet_id": debtor_user.get("wallet_address", ""),
                            "contact_id": str(debtor_user.get("_id", "")),
                            "_id": str(debtor_user.get("_id", "")),
                            "category": "owes_me",
                            "total_debt": net_debt,
                            "paid_back": debt_info["paid_back"],
                            "is_user": True  # Flag to indicate this is a user, not a contact
                        }
                        contacts.append(debtor_contact)
        
        # Also add creditors that the user owes (who might not be in contacts)
        for creditor_email, debt_info in i_owe_debts.items():
            # Skip if this creditor is the current user
            if creditor_email == user_email:
                continue
            
            # Check if this creditor is already in contacts
            creditor_in_contacts = any(c["email"] == creditor_email for c in contacts)
            if not creditor_in_contacts:
                # Get creditor info from users collection
                creditor_user = await users_collection.find_one({"email": creditor_email})
                
                if creditor_user:
                    net_debt = debt_info["total"] - debt_info["paid_back"]
                    if net_debt > 0:
                        # Use creditor_name from debt (the person who split the bill)
                        creditor_name = debt_info.get("creditor_name", "")
                        if creditor_name:
                            name_parts = creditor_name.split(" ", 1)
                            if len(name_parts) == 2:
                                first_name = name_parts[0]
                                last_name = name_parts[1]
                            else:
                                first_name = creditor_name
                                last_name = ""
                        else:
                            first_name = creditor_user.get("first_name", "")
                            last_name = creditor_user.get("last_name", "")
                        
                        creditor_contact = {
                            "email": creditor_email,
                            "first_name": first_name,
                            "last_name": last_name,
                            "username": creditor_user.get("username", ""),
                            "wallet_id": creditor_user.get("wallet_address", ""),
                            "contact_id": str(creditor_user.get("_id", "")),
                            "_id": str(creditor_user.get("_id", "")),
                            "category": "i_owe",
                            "total_debt": net_debt,
                            "paid_back": debt_info["paid_back"],
                            "is_user": True  # Flag to indicate this is a user, not a contact
                        }
                        contacts.append(creditor_contact)
        
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

# Record payment (someone paid you back) - updated for user_debts_collection
@app.post("/record_payment")
async def record_payment(payment: PaymentUpdate):
    """Record payment - update debt records in user_debts_collection"""
    try:
        if not payment.debtor_email:
            raise HTTPException(status_code=400, detail="debtor_email is required")
        
        if not payment.contact_email:
            raise HTTPException(status_code=400, detail="contact_email (creditor_email) is required")
        
        # Find all debt records where debtor owes creditor
        debts = []
        async for debt in user_debts_collection.find({
            "debtor_email": payment.debtor_email,
            "creditor_email": payment.contact_email
        }):
            debts.append(debt)
        
        if not debts:
            raise HTTPException(
                status_code=404, 
                detail=f"No debt records found where {payment.debtor_email} owes {payment.contact_email}"
            )
        
        # Calculate total debt and total paid back
        total_debt = sum(d.get("amount", 0.0) for d in debts)
        total_paid_back = sum(d.get("paid_back", 0.0) for d in debts)
        remaining_debt = total_debt - total_paid_back
        
        if payment.amount > remaining_debt:
            raise HTTPException(
                status_code=400, 
                detail=f"Payment amount ${payment.amount:.2f} exceeds remaining debt ${remaining_debt:.2f}"
            )
        
        # Distribute payment across debt records (oldest first)
        remaining_payment = payment.amount
        
        for debt in sorted(debts, key=lambda d: d.get("created_at", datetime.utcnow())):
            if remaining_payment <= 0:
                break
            
            debt_amount = debt.get("amount", 0.0)
            current_paid = debt.get("paid_back", 0.0)
            debt_remaining = debt_amount - current_paid
            
            if debt_remaining > 0:
                # Pay as much as possible towards this debt record
                payment_to_this_debt = min(remaining_payment, debt_remaining)
                new_paid_back = current_paid + payment_to_this_debt
                
                await user_debts_collection.update_one(
                    {"_id": debt["_id"]},
                    {
                        "$set": {
                            "paid_back": new_paid_back,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                
                remaining_payment -= payment_to_this_debt
        
        return JSONResponse(content={
            "status": "success", 
            "message": f"Recorded ${payment.amount} payment",
            "total_debt": total_debt,
            "total_paid_back": total_paid_back + payment.amount,
            "remaining_debt": remaining_debt - payment.amount
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record payment: {str(e)}")

# Confirm split bill - update debts for all participants (individualized)
@app.post("/confirm_split")
async def confirm_split(split: SplitConfirmation):
    """Confirm a bill split and create individualized debt records for all participants"""
    try:
        if not split.participants or len(split.participants) == 0:
            raise HTTPException(status_code=400, detail="At least one participant is required")
        
        if split.amount_per_person <= 0:
            raise HTTPException(status_code=400, detail="Amount per person must be greater than 0")
        
        if not split.sender_email:
            raise HTTPException(status_code=400, detail="Sender email is required")
        
        # Get sender's name from users collection
        users_db = mongo_client["Paymi"]
        users_collection = users_db["users"]
        sender_user = await users_collection.find_one({"email": split.sender_email})
        
        sender_name = split.sender_name
        if not sender_name and sender_user:
            first_name = sender_user.get("first_name", "")
            last_name = sender_user.get("last_name", "")
            sender_name = f"{first_name} {last_name}".strip() or sender_user.get("username", "")
        
        results = []
        
        # For each participant, create a debt record showing they owe the sender
        for participant_email in split.participants:
            # Check if participant exists (could be a contact or a user)
            # We don't require them to be a contact - they just need to be a user
            participant_user = await users_collection.find_one({"email": participant_email})
            
            if not participant_user:
                # Try contacts collection as fallback
                participant_contact = await contacts_collection.find_one({"email": participant_email})
                if not participant_contact:
                    results.append({
                        "participant_email": participant_email,
                        "status": "error",
                        "message": f"Participant with email '{participant_email}' not found as user or contact"
                    })
                    continue
            
            # Create individualized debt record: participant owes sender
            debt_doc = {
                "creditor_email": split.sender_email,  # Who is owed money
                "creditor_name": sender_name,  # Name of the person who split the bill
                "debtor_email": participant_email,  # Who owes money
                "amount": split.amount_per_person,
                "paid_back": 0.0,
                "items": split.items or [],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            
            await user_debts_collection.insert_one(debt_doc)
            
            results.append({
                "participant_email": participant_email,
                "status": "success",
                "amount_added": split.amount_per_person
            })
        
        return JSONResponse(content={
            "status": "success",
            "message": f"Split confirmed: ${split.amount_per_person} per person for {len(split.participants)} participants",
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

