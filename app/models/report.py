from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ReviewActionType(str, Enum):
    APPROVE = "approve"
    REQUEST_REVISION = "request_revision"
    ESCALATE = "escalate"


class ReviewStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REVISION_REQUESTED = "revision_requested"
    ESCALATED = "escalated"


class ReviewAction(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    action: ReviewActionType
    counsel_name: str
    comments: Optional[str] = None
    reviewed_at: datetime = Field(default_factory=datetime.utcnow)


class Report(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    matter_id: str
    docket_number: str
    executive_summary: str
    agreed_clauses_count: int = 0
    contested_clauses_count: int = 0
    counsel_cost_saved: float = 0.0
    turnaround_time_minutes: float = 0.0
    review_status: ReviewStatus = ReviewStatus.PENDING_REVIEW
    attestation_hash: Optional[str] = None
    block_digest: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AuditRecord(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    matter_id: str
    report_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    actor: str
    action: str
    details: str
    sha256_hash: str
    previous_hash: Optional[str] = None
