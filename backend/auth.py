"""
JWT Authentication routes: /api/auth/register, /api/auth/login, /api/auth/me
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
from bson import ObjectId
from database import users_col
from models import UserRegister, UserLogin, UserOut, Token
from dotenv import load_dotenv
import os

load_dotenv()

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ─── Config ────────────────────────────────────────────────────────────────────

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-crag-key-change-in-prod")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72

security = HTTPBearer()


# ─── Helpers ───────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    user_id = decode_token(credentials.credentials)
    user = await users_col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=Token)
async def register(body: UserRegister):
    # Check duplicates
    existing = await users_col.find_one({"$or": [{"email": body.email}, {"username": body.username}]})
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already taken")

    user_doc = {
        "username": body.username,
        "email": body.email,
        "password_hash": hash_password(body.password),
        "created_at": datetime.utcnow()
    }
    result = await users_col.insert_one(user_doc)
    user_id = str(result.inserted_id)
    token = create_token(user_id)

    return Token(
        access_token=token,
        user=UserOut(id=user_id, username=body.username, email=body.email)
    )


@router.post("/login", response_model=Token)
async def login(body: UserLogin):
    user = await users_col.find_one({"email": body.email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(user["_id"])
    token = create_token(user_id)

    return Token(
        access_token=token,
        user=UserOut(id=user_id, username=user["username"], email=user["email"])
    )


@router.get("/me", response_model=UserOut)
async def me(current_user: dict = Depends(get_current_user)):
    return UserOut(
        id=str(current_user["_id"]),
        username=current_user["username"],
        email=current_user["email"]
    )
