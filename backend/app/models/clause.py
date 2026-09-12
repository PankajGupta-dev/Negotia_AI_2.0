from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ClauseStatus(str, Enum):
    AGREED = "agreed"
    PENDING = "pending"
    FLAGGED = "flagged"
    CONCEDED = "conceded"
    CONFORMED = "conformed"


class ClauseRiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class ClauseDiff(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    clause_id: str
    section: str
    baseline_text: str
    markup_text: str
    insertions: List[str] = Field(default_factory=list)
    deletions: List[str] = Field(default_factory=list)
    risk_score: float = Field(default=0.0, ge=0.0, le=10.0)
    breach_alert: Optional[str] = None


class ContractClause(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    matter_id: str
    section: str
    title: str
    original_text: str
    counterparty_text: str
    conformed_proposal: Optional[str] = None
    risk_level: ClauseRiskLevel = ClauseRiskLevel.LOW
    risk_score: float = Field(default=0.0, ge=0.0, le=10.0)
    precedent_alignment: float = Field(default=100.0, ge=0.0, le=100.0)
    status: ClauseStatus = ClauseStatus.PENDING
    rationale: Optional[str] = None
    sec_edgar_citation: Optional[str] = None
