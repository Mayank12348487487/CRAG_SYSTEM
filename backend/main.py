"""
FastAPI entrypoint for the CRAG system.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import init_db
from auth import router as auth_router
from chat import router as chat_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(
    title="CRAG System API",
    description="Corrective RAG with long/short-term memory",
    version="1.0.0",
    lifespan=lifespan
)

# CORS — allow React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://localhost:3000",
        "https://crag-system-pdf.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chat_router)


@app.get("/")
async def health():
    return {"status": "ok", "service": "CRAG System API"}


@app.get("/api/health")
async def api_health():
    return {"status": "ok"}
