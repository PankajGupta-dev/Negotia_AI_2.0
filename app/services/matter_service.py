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
    """Create and persist a new negotiation matter."""
    if not matter_id:
        matter_id = f"2025-INT-{uuid.uuid4().hex[:4].upper()}"
    if not docket_number:
        docket_number = f"DOCKET #{matter_id}"

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
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(matter)
    db.commit()
    db.refresh(matter)
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
    """Update status, stage, or risk score of an existing matter."""
    matter = get_matter(db, matter_id)
    if not matter:
        return None

    status_str = status.value if isinstance(status, MatterStatus) else status
    matter.status = status_str
    if stage is not None:
        matter.stage = stage
    if risk_score is not None:
        matter.risk_score = risk_score
    matter.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(matter)
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
    """Store uploaded contract document metadata for Party A or Party B."""
    if not document_id:
        document_id = f"doc_{uuid.uuid4().hex[:8]}"

    party_str = party.value if isinstance(party, DocumentParty) else party

    doc = ContractDocumentDB(
        id=document_id,
        matter_id=matter_id,
        party=party_str,
        filename=filename,
        file_path=file_path,
        file_type=file_type,
        uploaded_at=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def get_matter_documents(db: Session, matter_id: str) -> List[ContractDocumentDB]:
    """Retrieve all uploaded documents associated with a matter."""
    return db.query(ContractDocumentDB).filter(ContractDocumentDB.matter_id == matter_id).all()
