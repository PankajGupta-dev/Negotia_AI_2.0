from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class MatterStatus(str, Enum):
    ACTIVE = "active"
    REVIEW = "review"
    CONCLUDED = "concluded"
    ESCALATED = "escalated"
    INGESTED = "ingested"


class RiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class DocumentParty(str, Enum):
    PARTY_A = "party_a"
    PARTY_B = "party_b"


class ContractDocument(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    matter_id: str
    party: DocumentParty
    filename: str
    file_path: Optional[str] = None
    file_type: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


class Matter(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    docket_number: str
    title: str
    counterparty: str
    type: str = "Enterprise MSA"
    stage: str = "Round 1 Ingestion"
    round: int = 1
    total_rounds: int = 4
    status: MatterStatus = MatterStatus.ACTIVE
    risk_level: RiskLevel = RiskLevel.MODERATE
    risk_score: float = Field(default=5.0, ge=0.0, le=10.0)
    precedent_match: float = Field(default=90.0, ge=0.0, le=100.0)
    last_updated: Optional[str] = None
    arr_value: Optional[str] = None
    variance_ceiling: Optional[float] = None
    lead_counsel: str = "Unassigned"
    pending_redlines_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
