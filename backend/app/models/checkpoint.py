from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class NegotiationStatus(str, Enum):
    NEGOTIATING = "NEGOTIATING"
    AGREE = "AGREE"
    DISAGREE = "DISAGREE"


class TerminationReason(str, Enum):
    AGREEMENT_REACHED = "AGREEMENT_REACHED: Buyer and Seller reached full bilateral agreement."
    MAX_ROUNDS_REACHED = "MAX_ROUNDS: Reached maximum limit of 6 rounds without consensus."
    TIMEOUT = "TIMEOUT: Reached maximum negotiation duration (90 seconds)."
    STALEMATE = "STALEMATE: Deadlock reached — no meaningful progress or concessions for 2 consecutive rounds."
    TOKEN_BUDGET_GUARD = "TOKEN_LIMIT_GUARD: Compact token budget threshold approached; stopped safely before token exhaustion."


class ClauseOffer(BaseModel):
    clause_id: str
    section: str
    title: str
    proposed_text: str
    rationale: str = ""
    is_non_negotiable: bool = False


class AgreedClause(BaseModel):
    clause_id: str
    section: str
    title: str
    agreed_text: str
    round_agreed: int
    compromise_score: float = 100.0
    rationale: Optional[str] = None


class UnresolvedClause(BaseModel):
    clause_id: str
    section: str
    title: str
    buyer_position: str
    seller_position: str
    gap_summary: str = ""
    is_buyer_non_negotiable: bool = False
    is_seller_non_negotiable: bool = False
    compromise_score: float = 0.0


class Concession(BaseModel):
    round_number: int
    party: str  # "Buyer" or "Seller"
    clause_id: str
    section: str
    description: str


class NegotiationCheckpoint(BaseModel):
    """
    Compact negotiation checkpoint schema.
    Contains only essential state to prevent unbounded context growth.
    """
    matter_id: str
    round_number: int
    buyer_offer: Dict[str, Any] = Field(default_factory=dict)
    seller_offer: Dict[str, Any] = Field(default_factory=dict)
    agreed_clauses: List[Dict[str, Any]] = Field(default_factory=list)
    unresolved_clauses: List[Dict[str, Any]] = Field(default_factory=list)
    concessions_made: List[Dict[str, Any]] = Field(default_factory=list)
    buyer_non_negotiables: List[str] = Field(default_factory=list)
    seller_non_negotiables: List[str] = Field(default_factory=list)
    status: str = NegotiationStatus.NEGOTIATING.value
    termination_reason: Optional[str] = None
    elapsed_seconds: float = 0.0
    token_usage_estimate: int = 0
    created_at: Optional[datetime] = None
