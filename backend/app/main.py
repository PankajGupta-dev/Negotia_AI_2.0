from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.db.database import close_mongodb_connection, connect_to_mongodb
from app.routers.contracts import router as contracts_router
from app.routers.negotiations import router as negotiations_router
from app.routers.pipeline import router as pipeline_router
from app.routers.reports import router as reports_router
from app.routers.sandbox import router as sandbox_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Connect to MongoDB Atlas and ping verification (fail clearly if unreachable)
    await connect_to_mongodb()
    # 2. Initialize database models/tables
    init_db()
    try:
        yield
    finally:
        # Graceful shutdown of MongoDB Atlas client
        await close_mongodb_connection()


app = FastAPI(
    title=settings.APP_NAME,
    description="FastAPI Backend powering Negotia AI 4-Agent contract deliberation pipeline",
    version="0.1.0",
    lifespan=lifespan,
)


# CORS configuration allowing FRONTEND_URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(pipeline_router)
app.include_router(contracts_router)
app.include_router(negotiations_router)
app.include_router(reports_router)
app.include_router(sandbox_router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "Negotia AI Backend Engine",
        "version": "0.1.0"
    }
