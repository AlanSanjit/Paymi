import os
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import hashlib

# Load environment variables from .env file
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise ValueError("MONGODB_URI environment variable is not set.")

# Configure MongoDB connection with SSL/TLS support for Atlas
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
users_collection = db["users"]

app = FastAPI(title="Authentication Backend")

# Create unique indexes for email and username to enforce uniqueness at database level
@app.on_event("startup")
async def create_unique_indexes():
    try:
        # Create unique index on email
        await users_collection.create_index("email", unique=True)
        # Create unique index on username
        await users_collection.create_index("username", unique=True)
        print("Unique indexes created successfully for email and username")
    except Exception as e:
        # Indexes might already exist, which is fine
        print(f"Index creation note: {str(e)}")

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# User models
class UserRegister(BaseModel):
    email: str
    username: str
    password: str
    wallet_address: str
    first_name: str
    last_name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    wallet_address: str
    first_name: str
    last_name: str

# Helper function to hash passwords
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# User registration endpoint
@app.post("/api/register")
async def register_user(user_data: UserRegister):
    try:
        # Check if email already exists (separate check for clarity)
        existing_email = await users_collection.find_one({"email": user_data.email})
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Check if username already exists (separate check for clarity)
        existing_username = await users_collection.find_one({"username": user_data.username})
        if existing_username:
            raise HTTPException(status_code=400, detail="Username already taken")
        
        # Check if wallet address already exists
        existing_wallet = await users_collection.find_one({"wallet_address": user_data.wallet_address})
        if existing_wallet:
            raise HTTPException(status_code=400, detail="Wallet address already registered")
        
        # Hash password
        hashed_password = hash_password(user_data.password)
        
        # Create user document
        user_doc = {
            "email": user_data.email,
            "username": user_data.username,
            "password": hashed_password,
            "wallet_address": user_data.wallet_address,
            "first_name": user_data.first_name,
            "last_name": user_data.last_name,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        # Insert into database
        # MongoDB unique indexes will also enforce uniqueness as a safety net
        try:
            result = await users_collection.insert_one(user_doc)
            user_id = str(result.inserted_id)
        except Exception as db_error:
            error_str = str(db_error)
            # Handle duplicate key errors from MongoDB unique indexes
            if "duplicate key" in error_str.lower() or "E11000" in error_str:
                if "email" in error_str.lower():
                    raise HTTPException(status_code=400, detail="Email already registered")
                elif "username" in error_str.lower():
                    raise HTTPException(status_code=400, detail="Username already taken")
                else:
                    raise HTTPException(status_code=400, detail="A field must be unique but already exists")
            raise
        
        return {
            "success": True,
            "message": "User registered successfully",
            "user": {
                "id": user_id,
                "email": user_data.email,
                "username": user_data.username,
                "wallet_address": user_data.wallet_address,
                "first_name": user_data.first_name,
                "last_name": user_data.last_name
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

# User login endpoint
@app.post("/api/login")
async def login_user(login_data: UserLogin):
    try:
        # Find user by email
        user = await users_collection.find_one({"email": login_data.email})
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Verify password
        hashed_password = hash_password(login_data.password)
        if user.get("password") != hashed_password:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Return user data (without password)
        return {
            "success": True,
            "message": "Login successful",
            "user": {
                "id": str(user["_id"]),
                "email": user.get("email"),
                "username": user.get("username"),
                "wallet_address": user.get("wallet_address"),
                "first_name": user.get("first_name", ""),
                "last_name": user.get("last_name", "")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

# Get all users endpoint (for splitting bills)
@app.get("/api/users")
async def get_users():
    """Get all users from the database (excluding passwords)"""
    try:
        # Fetch all users, excluding password field
        cursor = users_collection.find({}, {"password": 0})
        users = await cursor.to_list(length=None)
        
        # Convert ObjectId to string and format user data
        users_list = []
        for user in users:
            users_list.append({
                "id": str(user["_id"]),
                "email": user.get("email", ""),
                "username": user.get("username", ""),
                "wallet_address": user.get("wallet_address", ""),
                "first_name": user.get("first_name", ""),
                "last_name": user.get("last_name", "")
            })
        
        return {
            "success": True,
            "users": users_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch users: {str(e)}")

# Health check endpoint
@app.get("/health")
async def health_check():
    """Check if the database connection is working"""
    try:
        await mongo_client.admin.command('ping')
        return {
            "status": "healthy",
            "database": "connected",
            "database_name": db.name,
            "collection": users_collection.name
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }

