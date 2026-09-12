from datetime import datetime
from typing import List, Optional
from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class MatterDB(Base):
    __tablename__ = "matters"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    docket_number: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String)
    counterparty: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String, default="Enterprise MSA")
    stage: Mapped[str] = mapped_column(String, default="Round 1 Ingestion")
    round: Mapped[int] = mapped_column(Integer, default=1)
    total_rounds: Mapped[int] = mapped_column(Integer, default=4)
    status: Mapped[str] = mapped_column(String, default="active")
    risk_level: Mapped[str] = mapped_column(String, default="moderate")
    risk_score: Mapped[float] = mapped_column(Float, default=5.0)
    precedent_match: Mapped[float] = mapped_column(Float, default=90.0)
    last_updated: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    arr_value: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    variance_ceiling: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lead_counsel: Mapped[str] = mapped_column(String, default="Unassigned")
    pending_redlines_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    documents: Mapped[List["ContractDocumentDB"]] = relationship(
        "ContractDocumentDB", back_populates="matter", cascade="all, delete-orphan"
    )
    clauses: Mapped[List["ContractClauseDB"]] = relationship(
        "ContractClauseDB", back_populates="matter", cascade="all, delete-orphan"
    )
    agent_runs: Mapped[List["AgentRunDB"]] = relationship(
        "AgentRunDB", back_populates="matter", cascade="all, delete-orphan"
    )
    reports: Mapped[List["ReportDB"]] = relationship(
        "ReportDB", back_populates="matter", cascade="all, delete-orphan"
    )
    audit_records: Mapped[List["AuditRecordDB"]] = relationship(
        "AuditRecordDB", back_populates="matter", cascade="all, delete-orphan"
    )
    checkpoints: Mapped[List["NegotiationCheckpointDB"]] = relationship(
        "NegotiationCheckpointDB", back_populates="matter", cascade="all, delete-orphan"
    )


class ContractDocumentDB(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    matter_id: Mapped[str] = mapped_column(String, ForeignKey("matters.id"), index=True)
    party: Mapped[str] = mapped_column(String)  # party_a or party_b
    filename: Mapped[str] = mapped_column(String)
    file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    file_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationship
    matter: Mapped["MatterDB"] = relationship("MatterDB", back_populates="documents")


class ContractClauseDB(Base):
    __tablename__ = "clauses"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    matter_id: Mapped[str] = mapped_column(String, ForeignKey("matters.id"), index=True)
    section: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    original_text: Mapped[str] = mapped_column(Text)
    counterparty_text: Mapped[str] = mapped_column(Text)
    conformed_proposal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str] = mapped_column(String, default="low")
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    precedent_alignment: Mapped[float] = mapped_column(Float, default=100.0)
    status: Mapped[str] = mapped_column(String, default="pending")
    rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sec_edgar_citation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    matter: Mapped["MatterDB"] = relationship("MatterDB", back_populates="clauses")
    verdict: Mapped[Optional["AgentVerdictDB"]] = relationship(
        "AgentVerdictDB", back_populates="clause", uselist=False, cascade="all, delete-orphan"
    )


class AgentRunDB(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    matter_id: Mapped[str] = mapped_column(String, ForeignKey("matters.id"), index=True)
    agent_id: Mapped[str] = mapped_column(String)
    agent_name: Mapped[str] = mapped_column(String)
    technical_name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="idle")
    thoughts: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationship
    matter: Mapped["MatterDB"] = relationship("MatterDB", back_populates="agent_runs")


class AgentVerdictDB(Base):
    __tablename__ = "verdicts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    clause_id: Mapped[str] = mapped_column(
        String, ForeignKey("clauses.id"), unique=True, index=True
    )
    legal_lens: Mapped[str] = mapped_column(Text)
    marketing_lens: Mapped[str] = mapped_column(Text)
    nash_equilibrium_clause: Mapped[str] = mapped_column(Text)
    compromise_score: Mapped[float] = mapped_column(Float, default=0.0)
    sec_citations: Mapped[Optional[dict]] = mapped_column(JSON, default=list)

    # Relationship
    clause: Mapped["ContractClauseDB"] = relationship("ContractClauseDB", back_populates="verdict")


class ReportDB(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    matter_id: Mapped[str] = mapped_column(String, ForeignKey("matters.id"), index=True)
    docket_number: Mapped[str] = mapped_column(String)
    executive_summary: Mapped[str] = mapped_column(Text)
    agreed_clauses_count: Mapped[int] = mapped_column(Integer, default=0)
    contested_clauses_count: Mapped[int] = mapped_column(Integer, default=0)
    counsel_cost_saved: Mapped[float] = mapped_column(Float, default=0.0)
    turnaround_time_minutes: Mapped[float] = mapped_column(Float, default=0.0)
    review_status: Mapped[str] = mapped_column(String, default="pending_review")
    attestation_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    block_digest: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    matter: Mapped["MatterDB"] = relationship("MatterDB", back_populates="reports")
    reviews: Mapped[List["ReviewActionDB"]] = relationship(
        "ReviewActionDB", back_populates="report", cascade="all, delete-orphan"
    )


class ReviewActionDB(Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    report_id: Mapped[str] = mapped_column(String, ForeignKey("reports.id"), index=True)
    action: Mapped[str] = mapped_column(String)
    counsel_name: Mapped[str] = mapped_column(String)
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationship
    report: Mapped["ReportDB"] = relationship("ReportDB", back_populates="reviews")


class AuditRecordDB(Base):
    __tablename__ = "audit_records"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    matter_id: Mapped[str] = mapped_column(String, ForeignKey("matters.id"), index=True)
    report_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("reports.id"), nullable=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    actor: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    details: Mapped[str] = mapped_column(Text)
    sha256_hash: Mapped[str] = mapped_column(String)
    previous_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Relationship
    matter: Mapped["MatterDB"] = relationship("MatterDB", back_populates="audit_records")


class NegotiationCheckpointDB(Base):
    __tablename__ = "negotiation_checkpoints"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    matter_id: Mapped[str] = mapped_column(String, ForeignKey("matters.id"), index=True)
    round_number: Mapped[int] = mapped_column(Integer, index=True)
    buyer_offer: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    seller_offer: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    agreed_clauses: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    unresolved_clauses: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    concessions_made: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    buyer_non_negotiables: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    seller_non_negotiables: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default="NEGOTIATING")
    termination_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    token_usage_estimate: Mapped[int] = mapped_column(Integer, default=0)
    elapsed_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationship
    matter: Mapped["MatterDB"] = relationship("MatterDB", back_populates="checkpoints")


class NegotiationRoomDB(Base):
    __tablename__ = "negotiation_rooms"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # Primary key (Room ID)
    room_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    matter_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    creator_id: Mapped[str] = mapped_column(String)
    participant_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Status: waiting | active | closed | expired
    status: Mapped[str] = mapped_column(String, default="waiting")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Additional metadata fields for room management and live WebSocket communication
    title: Mapped[str] = mapped_column(String, default="Private Bilateral Negotiation Room")
    passcode: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="SEC-0000")
    creator_name: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="Creator")
    creator_role: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="buyer")
    creator_token: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    guest_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    guest_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    guest_role: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    guest_token: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    guest_status: Mapped[str] = mapped_column(String, default="none")  # none, pending_approval, admitted, rejected, left
    active_participants_count: Mapped[int] = mapped_column(Integer, default=1)
    messages: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    shared_state: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __init__(self, **kwargs):
        # Ensure room_id and id are always synchronized
        if "room_id" in kwargs and "id" not in kwargs:
            kwargs["id"] = kwargs["room_id"]
        elif "id" in kwargs and "room_id" not in kwargs:
            kwargs["room_id"] = kwargs["id"]

        # Ensure participant_id and guest_id are synchronized
        if "participant_id" in kwargs and "guest_id" not in kwargs:
            kwargs["guest_id"] = kwargs["participant_id"]
        elif "guest_id" in kwargs and "participant_id" not in kwargs:
            kwargs["participant_id"] = kwargs["guest_id"]

        if "creator_token" not in kwargs or not kwargs["creator_token"]:
            import secrets
            kwargs["creator_token"] = f"ctok_{secrets.token_hex(12)}"

        super().__init__(**kwargs)


# Alias for database model
NegotiationRoom = NegotiationRoomDB

