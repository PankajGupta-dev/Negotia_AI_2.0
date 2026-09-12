from __future__ import annotations

import logging
from typing import Any, Dict, Generator, List, Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import pymongo
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)

# ═════════════════════════════════════════════════════════════════════════════
# 1. MongoDB Atlas Configuration & Collections
# ═════════════════════════════════════════════════════════════════════════════

_mongo_client: Optional[AsyncIOMotorClient] = None
_mongo_db: Optional[AsyncIOMotorDatabase] = None

# Canonical collection names required by spec
COLLECTION_MATTERS = "matters"
COLLECTION_DOCUMENTS = "documents"
COLLECTION_CLAUSES = "clauses"
COLLECTION_AGENT_RUNS = "agent_runs"
COLLECTION_VERDICTS = "verdicts"
COLLECTION_REVIEWS = "reviews"
COLLECTION_REPORTS = "reports"
COLLECTION_AUDIT_BLOCKS = "audit_blocks"
COLLECTION_CHECKPOINTS = "checkpoints"
COLLECTION_DELIBERATIONS = "agent_deliberations"


def get_mongodb_uri() -> str:
    """Resolve MongoDB URI from settings without printing or logging credentials."""
    uri = settings.MONGODB_URI or ""
    if not uri and settings.DATABASE_URL.startswith("mongodb"):
        uri = settings.DATABASE_URL
    return uri.strip()


def get_database_name() -> str:
    """Resolve database name from settings."""
    return settings.MONGODB_DATABASE or "negotia_ai"


async def connect_to_mongodb() -> Optional[AsyncIOMotorDatabase]:
    """
    Establish connection to MongoDB Atlas, run ping verification,
    and create required indexes.
    Fails gracefully to local SQLite fallback if not configured or unreachable.
    """
    global _mongo_client, _mongo_db

    if _mongo_db is not None:
        return _mongo_db

    uri = get_mongodb_uri()
    if not uri:
        logger.info("[MONGODB] MONGODB_URI is not configured. Backend running with local SQLite storage.")
        return None

    db_name = get_database_name()

    try:
        logger.info(f"[MONGODB] Connecting to MongoDB Atlas database '{db_name}'...")
        _mongo_client = AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            maxPoolSize=50,
            minPoolSize=5,
        )

        _mongo_db = _mongo_client[db_name]
        ping_res = await _mongo_db.command("ping")
        if not ping_res or ping_res.get("ok") != 1:
            raise RuntimeError(f"MongoDB ping check returned unexpected response: {ping_res}")

        logger.info(f"[MONGODB] Connected and verified ping successfully on '{db_name}'.")
        await _create_indexes(_mongo_db)
        return _mongo_db

    except Exception as ex:
        _mongo_client = None
        _mongo_db = None
        logger.warning(f"[MONGODB] Failed to connect to MongoDB Atlas: {str(ex)}. Continuing with local SQLite storage.")
        return None


async def close_mongodb_connection() -> None:
    """Cleanly close MongoDB connection pool on application shutdown."""
    global _mongo_client, _mongo_db
    if _mongo_client is not None:
        logger.info("[MONGODB] Closing MongoDB client connection pool...")
        _mongo_client.close()
        _mongo_client = None
        _mongo_db = None
        logger.info("[MONGODB] MongoDB connection closed cleanly.")


def get_mongo_db() -> AsyncIOMotorDatabase:
    """Get the active MongoDB database instance. Raises RuntimeError if not connected."""
    if _mongo_db is None:
        raise RuntimeError("MongoDB is not initialized. Ensure connect_to_mongodb() has been called.")
    return _mongo_db


def get_collection(name: str):
    """Access a specific MongoDB collection."""
    db = get_mongo_db()
    return db[name]


def sync_mongo_doc(collection_name: str, filter_dict: Dict[str, Any], doc: Dict[str, Any]) -> None:
    """Helper to persist/upsert documents into MongoDB Atlas safely in both async and sync contexts."""
    try:
        import asyncio
        global _mongo_client, _mongo_db
        if _mongo_db is None:
            uri = get_mongodb_uri()
            db_name = get_database_name()
            _mongo_client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
            _mongo_db = _mongo_client[db_name]

        coll = _mongo_db[collection_name]
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coll.replace_one(filter_dict, doc, upsert=True))
        except RuntimeError:
            asyncio.run(coll.replace_one(filter_dict, doc, upsert=True))
    except Exception as ex:
        logger.debug(f"[MONGODB] sync_mongo_doc failed for {collection_name}: {ex}")



async def _create_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create practical, non-redundant indexes on core collections."""
    try:
        # 1. matters: matter_id (unique), docket_number, status
        await db[COLLECTION_MATTERS].create_index([("id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_MATTERS].create_index([("docket_number", pymongo.ASCENDING)])
        await db[COLLECTION_MATTERS].create_index([("status", pymongo.ASCENDING)])

        # 2. documents: document_id (unique), matter_id
        await db[COLLECTION_DOCUMENTS].create_index([("id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_DOCUMENTS].create_index([("matter_id", pymongo.ASCENDING)])

        # 3. clauses: id (unique), matter_id + clause_id
        await db[COLLECTION_CLAUSES].create_index([("id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_CLAUSES].create_index([("matter_id", pymongo.ASCENDING), ("clause_id", pymongo.ASCENDING)])

        # 4. agent_runs: id (unique), compound matter_id + agent_id
        await db[COLLECTION_AGENT_RUNS].create_index([("id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_AGENT_RUNS].create_index([("matter_id", pymongo.ASCENDING), ("agent_id", pymongo.ASCENDING)])

        # 5. verdicts: id (unique), clause_id
        await db[COLLECTION_VERDICTS].create_index([("id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_VERDICTS].create_index([("clause_id", pymongo.ASCENDING)], unique=True)

        # 6. reviews: id (unique), report_id
        await db[COLLECTION_REVIEWS].create_index([("id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_REVIEWS].create_index([("report_id", pymongo.ASCENDING)])

        # 7. reports: id (unique), matter_id
        await db[COLLECTION_REPORTS].create_index([("id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_REPORTS].create_index([("matter_id", pymongo.ASCENDING)])

        # 8. audit_blocks: id (unique), matter_id + timestamp
        await db[COLLECTION_AUDIT_BLOCKS].create_index([("id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_AUDIT_BLOCKS].create_index([("matter_id", pymongo.ASCENDING), ("timestamp", pymongo.ASCENDING)])

        # 9. checkpoints: id (unique), matter_id + round_number
        await db[COLLECTION_CHECKPOINTS].create_index([("id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_CHECKPOINTS].create_index([("matter_id", pymongo.ASCENDING), ("round_number", pymongo.DESCENDING)])

        # 10. agent_deliberations: event_id (unique), matter_id + timestamp
        await db[COLLECTION_DELIBERATIONS].create_index([("event_id", pymongo.ASCENDING)], unique=True)
        await db[COLLECTION_DELIBERATIONS].create_index([("matter_id", pymongo.ASCENDING), ("timestamp", pymongo.ASCENDING)])

        logger.info("[MONGODB] Practical indexes verified on all collections.")
    except Exception as ex:
        logger.warning(f"[MONGODB] Warning while creating collection indexes: {ex}")


async def store_deliberation_event(event_data: Dict[str, Any]) -> None:
    """Store structured deliberation event into MongoDB Atlas agent_deliberations collection."""
    try:
        db = get_mongo_db()
        event_id = event_data.get("event_id") or event_data.get("eventId")
        if event_id:
            await db[COLLECTION_DELIBERATIONS].replace_one(
                {"event_id": event_id}, event_data, upsert=True
            )
        else:
            await db[COLLECTION_DELIBERATIONS].insert_one(event_data)
    except Exception as ex:
        logger.debug(f"[MONGODB] store_deliberation_event failed: {ex}")


async def get_deliberations_by_matter(matter_id: str) -> List[Dict[str, Any]]:
    """Retrieve all persisted deliberation events for a given matter ordered by timestamp."""
    try:
        db = get_mongo_db()
        cursor = db[COLLECTION_DELIBERATIONS].find(
            {"matter_id": matter_id},
            {"_id": 0}
        ).sort("timestamp", pymongo.ASCENDING)
        items = await cursor.to_list(length=1000)
        return items
    except Exception as ex:
        logger.warning(f"[MONGODB] get_deliberations_by_matter failed: {ex}")
        return []


# ═════════════════════════════════════════════════════════════════════════════
# 2. Synchronous SQLite Fallback / Compatibility Layer
# ═════════════════════════════════════════════════════════════════════════════

sqlite_url = "sqlite:///./negotia.db" if settings.DATABASE_URL.startswith("mongodb") else settings.DATABASE_URL
engine = create_engine(
    sqlite_url,
    connect_args={"check_same_thread": False} if "sqlite" in sqlite_url else {},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all database tables based on SQLAlchemy models and ensure required columns."""
    from sqlalchemy import text
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE negotiation_rooms ADD COLUMN room_id VARCHAR"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE negotiation_rooms ADD COLUMN participant_id VARCHAR"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("UPDATE negotiation_rooms SET room_id = id WHERE room_id IS NULL"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("UPDATE negotiation_rooms SET participant_id = guest_id WHERE participant_id IS NULL"))
            conn.commit()
        except Exception:
            pass

