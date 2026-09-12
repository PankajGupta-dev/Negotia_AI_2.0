from datetime import datetime
from typing import List, Optional, Union
import uuid
from sqlalchemy.orm import Session

from app.db.models import ContractDocumentDB, MatterDB
from app.models.matter import DocumentParty, MatterStatus


def create_matter(
    db: Session,
    title: str,
    counterparty: str,
    matter_id: Optional[str] = None,
    docket_number: Optional[str] = None,
    type: str = "Enterprise MSA",
    stage: str = "Round 1 Ingestion",
    arr_value: Optional[str] = None,
    variance_ceiling: Optional[float] = None,
    lead_counsel: str = "Unassigned",
) -> MatterDB:
    """Create and persist a new negotiation matter across SQL & MongoDB Atlas."""
    if not matter_id:
        matter_id = f"2025-INT-{uuid.uuid4().hex[:4].upper()}"
    if not docket_number:
        docket_number = f"DOCKET #{matter_id}"

    now = datetime.utcnow()
    matter = MatterDB(
        id=matter_id,
        docket_number=docket_number,
        title=title,
        counterparty=counterparty,
        type=type,
        stage=stage,
        arr_value=arr_value,
        variance_ceiling=variance_ceiling,
        lead_counsel=lead_counsel,
        created_at=now,
        updated_at=now,
    )
    db.add(matter)
    db.commit()
    db.refresh(matter)

    # Sync to MongoDB Atlas collection 'matters'
    try:
        from app.db.database import get_collection, COLLECTION_MATTERS
        coll = get_collection(COLLECTION_MATTERS)
        import asyncio
        doc = {
            "id": matter_id,
            "docket_number": docket_number,
            "title": title,
            "counterparty": counterparty,
            "type": type,
            "stage": stage,
            "round": 1,
            "total_rounds": 4,
            "status": "active",
            "risk_level": "moderate",
            "risk_score": 5.0,
            "precedent_match": 90.0,
            "arr_value": arr_value,
            "variance_ceiling": variance_ceiling,
            "lead_counsel": lead_counsel,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coll.replace_one({"id": matter_id}, doc, upsert=True))
        except RuntimeError:
            asyncio.run(coll.replace_one({"id": matter_id}, doc, upsert=True))
    except Exception:
        pass

    return matter


def get_matter(db: Session, matter_id: str) -> Optional[MatterDB]:
    """Retrieve a matter by its ID."""
    return db.query(MatterDB).filter(MatterDB.id == matter_id).first()


def list_matters(db: Session, skip: int = 0, limit: int = 100) -> List[MatterDB]:
    """List matters with pagination."""
    return db.query(MatterDB).offset(skip).limit(limit).all()


def update_matter_status(
    db: Session,
    matter_id: str,
    status: Union[str, MatterStatus],
    stage: Optional[str] = None,
    risk_score: Optional[float] = None,
) -> Optional[MatterDB]:
    """Update status, stage, or risk score of an existing matter across SQL & MongoDB Atlas."""
    matter = get_matter(db, matter_id)
    if not matter:
        return None

    status_str = status.value if isinstance(status, MatterStatus) else status
    matter.status = status_str
    if stage is not None:
        matter.stage = stage
    if risk_score is not None:
        matter.risk_score = risk_score
    now = datetime.utcnow()
    matter.updated_at = now

    db.commit()
    db.refresh(matter)

    # Sync to MongoDB Atlas
    try:
        from app.db.database import get_collection, COLLECTION_MATTERS
        coll = get_collection(COLLECTION_MATTERS)
        import asyncio
        update_fields: dict = {"status": status_str, "updated_at": now.isoformat()}
        if stage is not None:
            update_fields["stage"] = stage
        if risk_score is not None:
            update_fields["risk_score"] = risk_score
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coll.update_one({"id": matter_id}, {"$set": update_fields}))
        except RuntimeError:
            asyncio.run(coll.update_one({"id": matter_id}, {"$set": update_fields}))
    except Exception:
        pass

    return matter


def store_document_metadata(
    db: Session,
    matter_id: str,
    party: Union[str, DocumentParty],
    filename: str,
    file_path: Optional[str] = None,
    file_type: Optional[str] = None,
    document_id: Optional[str] = None,
) -> ContractDocumentDB:
    """Store uploaded contract document metadata across SQL & MongoDB Atlas."""
    if not document_id:
        document_id = f"doc_{uuid.uuid4().hex[:8]}"

    party_str = party.value if isinstance(party, DocumentParty) else party
    now = datetime.utcnow()

    doc = ContractDocumentDB(
        id=document_id,
        matter_id=matter_id,
        party=party_str,
        filename=filename,
        file_path=file_path,
        file_type=file_type,
        uploaded_at=now,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Sync to MongoDB Atlas collection 'documents'
    try:
        from app.db.database import get_collection, COLLECTION_DOCUMENTS
        coll = get_collection(COLLECTION_DOCUMENTS)
        import asyncio
        doc_record = {
            "id": document_id,
            "matter_id": matter_id,
            "party": party_str,
            "filename": filename,
            "file_path": file_path,
            "file_type": file_type,
            "uploaded_at": now.isoformat(),
        }
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coll.replace_one({"id": document_id}, doc_record, upsert=True))
        except RuntimeError:
            asyncio.run(coll.replace_one({"id": document_id}, doc_record, upsert=True))
    except Exception:
        pass

    return doc


def get_matter_documents(db: Session, matter_id: str) -> List[ContractDocumentDB]:
    """Retrieve all uploaded documents associated with a matter."""
    return db.query(ContractDocumentDB).filter(ContractDocumentDB.matter_id == matter_id).all()
