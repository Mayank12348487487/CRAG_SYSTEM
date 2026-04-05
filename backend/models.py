from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime


# ─── Auth Models ───────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: str
    username: str
    email: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ─── Chat Models ───────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str

class MessageOut(BaseModel):
    id: str
    role: str          # "user" | "assistant"
    content: str
    created_at: datetime
    sources: Optional[List[str]] = []


# ─── Memory Models ─────────────────────────────────────────────────────────────

class ShortTermMessage(BaseModel):
    role: str
    content: str
    created_at: datetime

class LongTermMemory(BaseModel):
    user_id: str
    facts: List[str] = []
    summary: str = ""
    updated_at: datetime
