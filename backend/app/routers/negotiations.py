"""
Negotiation Workspace Router for Negotia AI.

Endpoints:
    GET  /api/matters/{id}/clauses
         Returns all clauses for a matter with baseline, redline, word-level diff,
         risk assessment, dual-lens verdicts (legal & commercial), recommended language,
         and settlement status.

    POST /api/matters/{id}/clauses/{clause_id}/conform
         Accepts conformed clause text and persists it.
         CRITICAL CONSTRAINT: MUST NOT automatically approve, ratify, or seal the matter.
         The matter strictly remains in pending_review status.
"""

from __future__ import annotations

from datetime import datetime
import difflib
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Path, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import AgentVerdictDB, ContractClauseDB, MatterDB
from app.models.clause import ClauseStatus
from app.services.event_manager import event_manager
from app.services.matter_service import get_matter, list_matters

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/matters", tags=["Negotiations"])


# ═════════════════════════════════════════════════════════════════════════════
# Request & Response Models
# ═════════════════════════════════════════════════════════════════════════════

class ClauseDiff(BaseModel):
    """Detailed bilateral redline diff."""
    insertions: List[str] = Field(default_factory=list)
    deletions: List[str] = Field(default_factory=list)
    summary: str = ""
    diff_text: str = ""


class ClauseDetailResponse(BaseModel):
    """Full negotiation clause record for general counsel workspace."""
    model_config = ConfigDict(populate_by_name=True)

    id: str
    clause_id: str = Field(..., serialization_alias="clauseId")
    matter_id: str = Field(..., serialization_alias="matterId")
    section: str
    title: str
    original_text: str = Field(..., serialization_alias="originalText")
    counterparty_text: str = Field(..., serialization_alias="counterpartyText")
    diff: ClauseDiff
    risk: Dict[str, Any]
    legal_verdict: str = Field(..., serialization_alias="legalVerdict")
    commercial_verdict: str = Field(..., serialization_alias="commercialVerdict")
    recommended_language: str = Field(..., serialization_alias="recommendedLanguage")
    conformed_proposal: Optional[str] = Field(None, serialization_alias="conformedProposal")
    precedent_alignment: float = Field(default=100.0, serialization_alias="precedentAlignment")
    status: str
    rationale: Optional[str] = None


class ConformClauseRequest(BaseModel):
    """Payload to conform or finalize specific clause language."""
    model_config = ConfigDict(populate_by_name=True)

    conformed_text: Optional[str] = Field(None, alias="conformedText")
    text: Optional[str] = None
    conformed_language: Optional[str] = Field(None, alias="conformedLanguage")
    rationale: Optional[str] = None

    def get_resolved_text(self) -> str:
        """Resolve conformed text from supported field aliases."""
        val = self.conformed_text or self.conformed_language or self.text
        if not val or not val.strip():
            raise ValueError("Conformed text must not be empty.")
        return val.strip()


class ConformClauseResponse(BaseModel):
    """Confirmation of clause conformance while preserving pending_review matter status."""
    model_config = ConfigDict(populate_by_name=True)

    clause_id: str = Field(..., serialization_alias="clauseId")
    matter_id: str = Field(..., serialization_alias="matterId")
    status: str
    conformed_proposal: str = Field(..., serialization_alias="conformedProposal")
    matter_status: str = Field(..., serialization_alias="matterStatus")
    is_sealed: bool = Field(default=False, serialization_alias="isSealed")
    message: str


# ═════════════════════════════════════════════════════════════════════════════
# Helper Functions
# ═════════════════════════════════════════════════════════════════════════════

def _compute_word_diff(original: str, counterparty: str) -> ClauseDiff:
    """Generate structured word-level diff between original and counterparty text."""
    orig_words = original.split()
    counter_words = counterparty.split()

    matcher = difflib.SequenceMatcher(None, orig_words, counter_words)
    insertions: List[str] = []
    deletions: List[str] = []
    annotated_parts: List[str] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            annotated_parts.append(" ".join(orig_words[i1:i2]))
        elif tag == "delete":
            del_text = " ".join(orig_words[i1:i2])
            deletions.append(del_text)
            annotated_parts.append(f"[-{del_text}-]")
        elif tag == "insert":
            ins_text = " ".join(counter_words[j1:j2])
            insertions.append(ins_text)
            annotated_parts.append(f"[+{ins_text}+]")
        elif tag == "replace":
            del_text = " ".join(orig_words[i1:i2])
            ins_text = " ".join(counter_words[j1:j2])
            deletions.append(del_text)
            insertions.append(ins_text)
            annotated_parts.append(f"[-{del_text}-] [+{ins_text}+]")

    summary = f"+{len(insertions)} additions, -{len(deletions)} deletions"
    diff_text = " ".join(annotated_parts)

    return ClauseDiff(
        insertions=insertions,
        deletions=deletions,
        summary=summary,
        diff_text=diff_text,
    )


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════

def _format_matter(m: MatterDB) -> Dict[str, Any]:
    """Format matter DB model into canonical JSON matching frontend Matter interface."""
    return {
        "id": m.id,
        "matterId": m.id,
        "matter_id": m.id,
        "docketNumber": m.docket_number or f"DOCKET #{m.id}",
        "docket_number": m.docket_number or f"DOCKET #{m.id}",
        "title": m.title,
        "counterparty": m.counterparty,
        "type": m.type,
        "stage": m.stage,
        "round": m.round,
        "totalRounds": m.total_rounds,
        "total_rounds": m.total_rounds,
        "status": m.status,
        "riskLevel": m.risk_level,
        "risk_level": m.risk_level,
        "riskScore": m.risk_score,
        "risk_score": m.risk_score,
        "precedentMatch": m.precedent_match,
        "precedent_match": m.precedent_match,
        "arrValue": m.arr_value,
        "arr_value": m.arr_value,
        "varianceCeiling": m.variance_ceiling,
        "variance_ceiling": m.variance_ceiling,
        "leadCounsel": m.lead_counsel,
        "lead_counsel": m.lead_counsel,
        "pendingRedlinesCount": m.pending_redlines_count,
        "pending_redlines_count": m.pending_redlines_count,
        "lastUpdated": m.updated_at.isoformat() if m.updated_at else "",
        "createdAt": m.created_at.isoformat() if m.created_at else "",
        "created_at": m.created_at.isoformat() if m.created_at else "",
        "updatedAt": m.updated_at.isoformat() if m.updated_at else "",
        "updated_at": m.updated_at.isoformat() if m.updated_at else "",
    }


@router.get(
    "",
    summary="List all negotiation matters",
    description="Retrieve all negotiation matter dockets stored in the database.",
)
def list_all_matters(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """List all matters with pagination."""
    matters = list_matters(db, skip=skip, limit=limit)
    return [_format_matter(m) for m in matters]


@router.get(
    "/{id}",
    summary="Get single negotiation matter by ID",
    description="Retrieve matter metadata and status for a specific docket ID.",
)
def get_single_matter(
    id: str = Path(..., description="Matter ID or docket identifier"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieve matter details."""
    matter = get_matter(db, id)
    if not matter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Matter with ID '{id}' not found.",
        )
    return _format_matter(matter)


@router.get(
    "/{id}/clauses",
    summary="Get all clauses and verdicts for a matter",
    description=(
        "Returns all negotiated clauses for the specified matter docket, "
        "including original text, counterparty text, diff, risk score/tier, "
        "legal verdict, commercial verdict, recommended language, and status."
    ),
    response_model=List[ClauseDetailResponse],
)
def get_matter_clauses(
    id: str = Path(..., description="Matter ID or docket number"),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    Retrieve all clauses with bilateral analysis and Arbiter verdicts for a matter.
    """
    matter = get_matter(db, id)
    if not matter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Matter with ID '{id}' not found.",
        )

    # Query all clauses for this matter, joined with their verdicts
    clauses: List[ContractClauseDB] = (
        db.query(ContractClauseDB)
        .filter(ContractClauseDB.matter_id == id)
        .all()
    )

    results: List[Dict[str, Any]] = []

    for c in clauses:
        # Compute bilateral redline diff
        diff_obj = _compute_word_diff(c.original_text, c.counterparty_text)

        # Extract verdicts
        legal_v = c.verdict.legal_lens if c.verdict else "Standard commercial terms applied; within acceptable legal tolerances."
        comm_v = c.verdict.marketing_lens if c.verdict else "Revenue protected under baseline ARR; discount terms preserved."
        rec_lang = (
            c.verdict.nash_equilibrium_clause
            if (c.verdict and c.verdict.nash_equilibrium_clause)
            else (c.conformed_proposal or c.original_text)
        )

        risk_payload = {
            "score": round(c.risk_score, 1),
            "level": c.risk_level,
            "precedent_alignment": round(c.precedent_alignment, 1),
        }

        # Normalize clean clause identifier
        clean_cid = c.id
        if clean_cid.startswith(f"{id}_"):
            clean_cid = clean_cid[len(f"{id}_"):]

        results.append({
            "id": c.id,
            "clauseId": clean_cid,
            "clause_id": clean_cid,
            "matterId": id,
            "matter_id": id,
            "section": c.section,
            "title": c.title,
            "originalText": c.original_text,
            "original_text": c.original_text,
            "counterpartyText": c.counterparty_text,
            "counterparty_text": c.counterparty_text,
            "diff": diff_obj.model_dump(),
            "risk": risk_payload,
            "risk_score": round(c.risk_score, 1),
            "risk_level": c.risk_level,
            "legalVerdict": legal_v,
            "legal_verdict": legal_v,
            "commercialVerdict": comm_v,
            "commercial_verdict": comm_v,
            "recommendedLanguage": rec_lang,
            "recommended_language": rec_lang,
            "conformedProposal": c.conformed_proposal,
            "conformed_proposal": c.conformed_proposal,
            "precedentAlignment": round(c.precedent_alignment, 1),
            "precedent_alignment": round(c.precedent_alignment, 1),
            "status": c.status,
            "rationale": c.rationale,
        })

    return results


@router.post(
    "/{id}/clauses/{clause_id}/conform",
    summary="Conform clause language and persist to matter record",
    description=(
        "Accepts conformed clause text and persists it to the database. "
        "CRITICAL SAFEGUARD: Does NOT approve or seal the matter. "
        "The matter remains strictly in 'pending_review' status awaiting human counsel sign-off."
    ),
    response_model=None,
)
def conform_clause(
    id: str = Path(..., description="Matter ID"),
    clause_id: str = Path(..., description="Clause ID"),
    payload: ConformClauseRequest = Body(..., description="Conformed clause text and optional rationale"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Persist conformed proposal for a clause without auto-approving the matter.
    """
    # 1. Verify matter exists
    matter = get_matter(db, id)
    if not matter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Matter with ID '{id}' not found.",
        )

    # 2. Extract resolved conformed text
    try:
        new_text = payload.get_resolved_text()
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )

    # 3. Locate the clause (support both raw clause_id and matter-prefixed id)
    clause = (
        db.query(ContractClauseDB)
        .filter(
            ContractClauseDB.matter_id == id,
            (ContractClauseDB.id == clause_id) | (ContractClauseDB.id == f"{id}_{clause_id}"),
        )
        .first()
    )

    if not clause:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Clause '{clause_id}' not found for matter '{id}'.",
        )

    # 4. Persist conformed proposal
    clause.conformed_proposal = new_text
    clause.status = ClauseStatus.CONFORMED.value
    if payload.rationale:
        clause.rationale = payload.rationale

    # 5. CRITICAL SAFEGUARD: Do NOT automatically approve the matter!
    # Matter MUST remain pending_review (or active), never 'approved', 'sealed', or 'signed'.
    current_matter_status = matter.status or "pending_review"
    if current_matter_status.lower() in ("approved", "sealed", "signed"):
        # Reset to pending_review if somehow marked approved
        matter.status = "pending_review"
        current_matter_status = "pending_review"

    # Always ensure unsealed
    matter.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(clause)
    db.refresh(matter)

    # 6. Publish event via event_manager for real-time SSE observers
    try:
        clean_cid = clause.id
        if clean_cid.startswith(f"{id}_"):
            clean_cid = clean_cid[len(f"{id}_"):]

        event_manager.publish(
            matter_id=id,
            event_type="agent_update",
            agent="orchestrator",
            status="conformed",
            message=f"Clause '{clause.section} {clause.title}' conformed.",
            thought=f"Counsel settled clause {clean_cid}. Matter remains pending General Counsel review.",
            payload={
                "clause_id": clean_cid,
                "status": "conformed",
                "matter_status": current_matter_status,
            },
        )
    except Exception as ex:
        logger.debug(f"Event manager notification notice: {ex}")

    clean_cid = clause.id
    if clean_cid.startswith(f"{id}_"):
        clean_cid = clean_cid[len(f"{id}_"):]

    return {
        "clauseId": clean_cid,
        "clause_id": clean_cid,
        "matterId": id,
        "matter_id": id,
        "status": clause.status,
        "conformedProposal": clause.conformed_proposal,
        "conformed_proposal": clause.conformed_proposal,
        "matterStatus": current_matter_status,
        "matter_status": current_matter_status,
        "isSealed": False,
        "is_sealed": False,
        "message": "Clause successfully conformed and persisted. Matter remains pending human review.",
    }


# ═════════════════════════════════════════════════════════════════════════════
# Governance & Audit Chain Models & Endpoints
# ═════════════════════════════════════════════════════════════════════════════

class AuditBlockResponse(BaseModel):
    """Provenance entry representing an immutable block in the matter audit chain."""
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    block_index: int
    blockIndex: Optional[int] = None
    event: str
    timestamp: datetime
    previous_hash: Optional[str] = None
    previousHash: Optional[str] = None
    current_hash: str
    currentHash: Optional[str] = None
    human_reviewer: Optional[str] = None
    humanReviewer: Optional[str] = None
    review_action: Optional[str] = None
    reviewAction: Optional[str] = None
    is_hash_valid: bool = True
    isHashValid: Optional[bool] = None


class MatterAuditChainResponse(BaseModel):
    """Complete governance audit trail with cryptographic verification."""
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    matter_id: str
    matterId: Optional[str] = None
    docket_number: str
    docketNumber: Optional[str] = None
    is_valid: bool
    isValid: Optional[bool] = None
    chain_length: int
    chainLength: Optional[int] = None
    genesis_hash: Optional[str] = None
    genesisHash: Optional[str] = None
    tip_hash: str
    tipHash: Optional[str] = None
    blocks: List[AuditBlockResponse]
    verification_message: str
    verificationMessage: Optional[str] = None


@router.get(
    "/{id}/audit",
    summary="Get complete governance audit chain for a matter",
    description=(
        "Returns the complete immutable provenance chain with block index, event, timestamp, "
        "previous hash, current hash, human reviewer, review action, and basic mathematical hash verification."
    ),
    response_model=MatterAuditChainResponse,
)
def get_matter_audit_chain(
    id: str = Path(..., description="Matter ID or docket identifier"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Retrieve and mathematically verify the full append-only audit chain for a matter.
    """
    matter = get_matter(db, id)
    if not matter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Matter with ID '{id}' not found.",
        )

    import json
    from app.services.audit_service import (
        GENESIS_HASH,
        calculate_sha256,
        serialize_canonical_json,
    )
    from app.db.models import AuditRecordDB, ReportDB, ReviewActionDB

    # Retrieve all audit records in chronological order
    records: List[AuditRecordDB] = (
        db.query(AuditRecordDB)
        .filter(AuditRecordDB.matter_id == id)
        .order_by(AuditRecordDB.timestamp.asc(), AuditRecordDB.id.asc())
        .all()
    )

    # Retrieve review decisions for this matter to cross-reference human counsel actions
    review_actions: List[ReviewActionDB] = (
        db.query(ReviewActionDB)
        .join(ReportDB, ReviewActionDB.report_id == ReportDB.id)
        .filter(ReportDB.matter_id == id)
        .order_by(ReviewActionDB.reviewed_at.asc())
        .all()
    )

    blocks: List[Dict[str, Any]] = []
    expected_prev = GENESIS_HASH
    all_hashes_valid = True

    for idx, rec in enumerate(records):
        human_rev: Optional[str] = None
        rev_act: Optional[str] = None

        # Parse stored details JSON
        details_obj: Dict[str, Any] = {}
        if rec.details:
            try:
                details_obj = json.loads(rec.details) if isinstance(rec.details, str) else rec.details
            except Exception:
                details_obj = {}

        # Resolve human reviewer and review action
        if details_obj.get("sealed_by"):
            human_rev = details_obj["sealed_by"]
            rev_act = "approve"
        elif details_obj.get("counsel_name"):
            human_rev = details_obj["counsel_name"]
            rev_act = details_obj.get("action")
        elif rec.actor and rec.actor not in ("Scrivener-4", "Lex-Ingestor", "Arbiter-3", "System"):
            human_rev = rec.actor
            rev_act = rec.action
        elif review_actions:
            human_rev = review_actions[-1].counsel_name
            rev_act = review_actions[-1].action
        else:
            human_rev = matter.lead_counsel if matter.lead_counsel and matter.lead_counsel != "Unassigned" else None
            rev_act = None

        # Basic hash verification
        block_hash_valid = True

        effective_prev = rec.previous_hash or GENESIS_HASH
        # 1. Continuity check against prior block
        if effective_prev != expected_prev:
            block_hash_valid = False
            all_hashes_valid = False

        # 2. Recompute header digest if payload and timestamp exist
        p_hash = details_obj.get("payload_hash")
        ts_str = details_obj.get("timestamp")
        if p_hash and ts_str:
            header = {
                "matter_id": id,
                "payload_hash": p_hash,
                "previous_hash": effective_prev,
                "timestamp": ts_str,
            }
            computed_hash = calculate_sha256(serialize_canonical_json(header))
            if computed_hash != rec.sha256_hash:
                block_hash_valid = False
                all_hashes_valid = False

        expected_prev = rec.sha256_hash

        blocks.append({
            "blockIndex": idx,
            "block_index": idx,
            "event": rec.action,
            "timestamp": rec.timestamp,
            "previousHash": effective_prev,
            "previous_hash": effective_prev,
            "currentHash": rec.sha256_hash,
            "current_hash": rec.sha256_hash,
            "humanReviewer": human_rev,
            "human_reviewer": human_rev,
            "reviewAction": rev_act,
            "review_action": rev_act,
            "isHashValid": block_hash_valid,
            "is_hash_valid": block_hash_valid,
        })

    tip_hash = records[-1].sha256_hash if records else GENESIS_HASH
    first_hash = (records[0].previous_hash or GENESIS_HASH) if records else GENESIS_HASH

    verif_msg = (
        f"Verified {len(records)} blocks in audit chain. Mathematical integrity intact."
        if all_hashes_valid
        else "Cryptographic integrity failure: one or more blocks in the audit chain are corrupted or out of order."
    )

    return {
        "matterId": id,
        "matter_id": id,
        "docketNumber": matter.docket_number,
        "docket_number": matter.docket_number,
        "isValid": all_hashes_valid,
        "is_valid": all_hashes_valid,
        "chainLength": len(records),
        "chain_length": len(records),
        "genesisHash": first_hash,
        "genesis_hash": first_hash,
        "tipHash": tip_hash,
        "tip_hash": tip_hash,
        "blocks": blocks,
        "verificationMessage": verif_msg,
        "verification_message": verif_msg,
    }


@router.get(
    "/{id}/deliberations",
    summary="Get persisted real-time agent deliberations for a matter",
    description="Returns chronological deliberation transcript generated by Agent 1, Agent 2, and Agent 3.",
)
async def get_matter_deliberations(
    id: str = Path(..., description="Unique matter docket or ID"),
) -> List[Dict[str, Any]]:
    """Retrieve persisted deliberation events for matter from MongoDB Atlas or in-memory event manager."""
    from app.db.database import get_deliberations_by_matter
    delibs = await get_deliberations_by_matter(id)

    if not delibs:
        mem_events = event_manager.replay(id)
        for ev in mem_events:
            if ev.event_type == "deliberation" and isinstance(ev.payload, dict):
                delibs.append(ev.payload)

    return delibs
