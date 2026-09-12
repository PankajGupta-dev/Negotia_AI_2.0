"""
Report Management & Review Router for Negotia AI.

Endpoints:
    GET  /api/reports/{id}
         Retrieves executive summary, settled clauses, arbiter verdicts, efficiency metrics,
         review status, and canonical audit digest if available.

    POST /api/reports/{id}/review
         Counsel review decision endpoint:
             • "approve"          → sets status to "approved"; marks report eligible for sealing
             • "request_revision" → sets status to "revision_requested"
             • "escalate"         → sets status to "escalated"
         CRITICAL CONSTRAINT: Do NOT cryptographically seal before approval.
"""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Path, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import (
    AgentVerdictDB,
    AuditRecordDB,
    ContractClauseDB,
    MatterDB,
    ReportDB,
    ReviewActionDB,
)
from app.models.report import ReviewActionType, ReviewStatus
from app.services.event_manager import event_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["Reports"])


# ═════════════════════════════════════════════════════════════════════════════
# Request & Response Schemas
# ═════════════════════════════════════════════════════════════════════════════

class ReviewRequest(BaseModel):
    """Review action payload submitted by legal counsel."""
    model_config = ConfigDict(populate_by_name=True)

    action: str = Field(..., description="Action: 'approve', 'request_revision', or 'escalate'")
    counsel_name: Optional[str] = Field(None, alias="counselName", description="Name of reviewing counsel")
    counsel: Optional[str] = None
    comments: Optional[str] = Field(None, description="Optional commentary or feedback notes")

    def get_resolved_counsel(self) -> str:
        name = self.counsel_name or self.counsel
        if not name or not name.strip():
            raise ValueError("counselName is required.")
        return name.strip()


class ReportMetrics(BaseModel):
    """Aggregate efficiency and financial metrics."""
    agreed_clauses_count: int = Field(default=0, serialization_alias="agreedClausesCount")
    contested_clauses_count: int = Field(default=0, serialization_alias="contestedClausesCount")
    counsel_cost_saved: float = Field(default=0.0, serialization_alias="counselCostSaved")
    turnaround_time_minutes: float = Field(default=0.0, serialization_alias="turnaroundTimeMinutes")


class ReportDetailResponse(BaseModel):
    """Comprehensive executive dossier response."""
    model_config = ConfigDict(populate_by_name=True)

    id: str
    report_id: str = Field(..., serialization_alias="reportId")
    matter_id: str = Field(..., serialization_alias="matterId")
    docket_number: str = Field(..., serialization_alias="docketNumber")
    executive_summary: str = Field(..., serialization_alias="executiveSummary")
    settled_clauses: List[Dict[str, Any]] = Field(default_factory=list, serialization_alias="settledClauses")
    verdicts: List[Dict[str, Any]] = Field(default_factory=list)
    metrics: ReportMetrics
    review_status: str = Field(..., serialization_alias="reviewStatus")
    audit_digest: Optional[str] = Field(None, serialization_alias="auditDigest")
    is_sealed: bool = Field(default=False, serialization_alias="isSealed")
    eligible_for_sealing: bool = Field(default=False, serialization_alias="eligibleForSealing")
    created_at: datetime = Field(..., serialization_alias="createdAt")
    updated_at: datetime = Field(..., serialization_alias="updatedAt")


class ReviewResponse(BaseModel):
    """Response confirming review transition."""
    model_config = ConfigDict(populate_by_name=True)

    report_id: str = Field(..., serialization_alias="reportId")
    matter_id: str = Field(..., serialization_alias="matterId")
    action: str
    counsel_name: str = Field(..., serialization_alias="counselName")
    review_status: str = Field(..., serialization_alias="reviewStatus")
    matter_status: str = Field(..., serialization_alias="matterStatus")
    eligible_for_sealing: bool = Field(..., serialization_alias="eligibleForSealing")
    is_sealed: bool = Field(default=False, serialization_alias="isSealed")
    message: str


# ═════════════════════════════════════════════════════════════════════════════
# Helper Functions
# ═════════════════════════════════════════════════════════════════════════════

def _find_report(db: Session, report_or_matter_id: str) -> Optional[ReportDB]:
    """Find report by report.id or associated matter.id."""
    return (
        db.query(ReportDB)
        .filter(
            (ReportDB.id == report_or_matter_id)
            | (ReportDB.matter_id == report_or_matter_id)
        )
        .first()
    )


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/{id}",
    summary="Get executive deliberation report by ID or matter ID",
    description=(
        "Retrieves the executive summary, settled clauses, dual-lens verdicts, "
        "time and cost metrics, review status, and canonical audit digest if available."
    ),
    response_model=ReportDetailResponse,
)
def get_report(
    id: str = Path(..., description="Report ID or Matter ID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Retrieve full executive dossier for a matter or report.
    """
    report = _find_report(db, id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{id}' not found.",
        )

    matter_id = report.matter_id

    # 1. Fetch settled clauses for this matter
    clauses: List[ContractClauseDB] = (
        db.query(ContractClauseDB)
        .filter(ContractClauseDB.matter_id == matter_id)
        .all()
    )

    settled_clauses_data = []
    verdicts_data = []

    for c in clauses:
        clean_cid = c.id[len(f"{matter_id}_"):] if c.id.startswith(f"{matter_id}_") else c.id
        settled_clauses_data.append({
            "id": c.id,
            "clauseId": clean_cid,
            "clause_id": clean_cid,
            "section": c.section,
            "title": c.title,
            "originalText": c.original_text,
            "original_text": c.original_text,
            "counterpartyText": c.counterparty_text,
            "counterparty_text": c.counterparty_text,
            "conformedProposal": c.conformed_proposal or c.original_text,
            "conformed_proposal": c.conformed_proposal or c.original_text,
            "riskLevel": c.risk_level,
            "risk_level": c.risk_level,
            "riskScore": c.risk_score,
            "risk_score": c.risk_score,
            "status": c.status,
            "rationale": c.rationale,
        })

        if c.verdict:
            verdicts_data.append({
                "clauseId": clean_cid,
                "clause_id": clean_cid,
                "legalVerdict": c.verdict.legal_lens,
                "legal_verdict": c.verdict.legal_lens,
                "commercialVerdict": c.verdict.marketing_lens,
                "commercial_verdict": c.verdict.marketing_lens,
                "nashEquilibriumClause": c.verdict.nash_equilibrium_clause,
                "compromiseScore": c.verdict.compromise_score,
                "secCitations": c.verdict.sec_citations or [],
            })

    # 2. Fetch canonical audit digest if available
    audit_rec: Optional[AuditRecordDB] = (
        db.query(AuditRecordDB)
        .filter(
            (AuditRecordDB.report_id == report.id)
            | (AuditRecordDB.matter_id == matter_id)
        )
        .order_by(AuditRecordDB.timestamp.desc())
        .first()
    )

    audit_digest = (
        report.block_digest
        or report.attestation_hash
        or (audit_rec.sha256_hash if audit_rec else None)
    )

    # 3. Assess review status and eligibility
    is_approved = report.review_status.lower() == ReviewStatus.APPROVED.value
    is_sealed = bool(report.block_digest or report.attestation_hash)

    metrics_obj = {
        "agreedClausesCount": report.agreed_clauses_count or len(settled_clauses_data),
        "agreed_clauses_count": report.agreed_clauses_count or len(settled_clauses_data),
        "contestedClausesCount": report.contested_clauses_count,
        "contested_clauses_count": report.contested_clauses_count,
        "counselCostSaved": report.counsel_cost_saved,
        "counsel_cost_saved": report.counsel_cost_saved,
        "turnaroundTimeMinutes": report.turnaround_time_minutes,
        "turnaround_time_minutes": report.turnaround_time_minutes,
    }

    return {
        "id": report.id,
        "reportId": report.id,
        "report_id": report.id,
        "matterId": matter_id,
        "matter_id": matter_id,
        "docketNumber": report.docket_number,
        "docket_number": report.docket_number,
        "executiveSummary": report.executive_summary,
        "executive_summary": report.executive_summary,
        "settledClauses": settled_clauses_data,
        "settled_clauses": settled_clauses_data,
        "verdicts": verdicts_data,
        "metrics": metrics_obj,
        "reviewStatus": report.review_status,
        "review_status": report.review_status,
        "auditDigest": audit_digest,
        "audit_digest": audit_digest,
        "isSealed": is_sealed,
        "is_sealed": is_sealed,
        "eligibleForSealing": is_approved and not is_sealed,
        "eligible_for_sealing": is_approved and not is_sealed,
        "createdAt": report.created_at,
        "created_at": report.created_at,
        "updatedAt": report.updated_at,
        "updated_at": report.updated_at,
    }


@router.post(
    "/{id}/review",
    summary="Submit counsel review decision (approve, request_revision, escalate)",
    description=(
        "Records General Counsel's review action on the report:\n"
        "• approve → sets review status to 'approved'; marks report eligible for sealing\n"
        "• request_revision → sets review status to 'revision_requested'\n"
        "• escalate → sets review status to 'escalated'\n"
        "Enforces strict safeguard: does NOT seal the report before explicit approval."
    ),
    response_model=ReviewResponse,
)
def review_report(
    id: str = Path(..., description="Report ID or Matter ID"),
    payload: ReviewRequest = Body(..., description="Review action and counsel identification"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Process review decision on a matter report.
    """
    # 1. Validate counsel name
    try:
        counsel_name = payload.get_resolved_counsel()
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )

    # 2. Validate action
    action_raw = payload.action.strip().lower() if payload.action else ""
    valid_actions = {
        ReviewActionType.APPROVE.value: ReviewStatus.APPROVED.value,
        ReviewActionType.REQUEST_REVISION.value: ReviewStatus.REVISION_REQUESTED.value,
        ReviewActionType.ESCALATE.value: ReviewStatus.ESCALATED.value,
    }

    if action_raw not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid review action '{payload.action}'. "
                f"Must be one of: {', '.join(valid_actions.keys())}"
            ),
        )

    target_status = valid_actions[action_raw]

    # 3. Locate report
    report = _find_report(db, id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{id}' not found.",
        )

    # 4. Locate associated matter
    matter = db.query(MatterDB).filter(MatterDB.id == report.matter_id).first()

    # 5. Apply status transition
    report.review_status = target_status
    report.updated_at = datetime.utcnow()

    if matter:
        matter.status = target_status
        matter.lead_counsel = counsel_name
        matter.updated_at = datetime.utcnow()

    # 6. SAFEGUARD ENFORCEMENT:
    # "Do not seal before approve"
    # Even on approve, the report is merely ELIGIBLE for sealing; it is NOT yet sealed
    # (attestation_hash and block_digest remain unchanged/None).
    eligible_for_sealing = (action_raw == ReviewActionType.APPROVE.value)
    is_sealed = bool(report.block_digest or report.attestation_hash)

    # 7. Record review audit record
    review_record = ReviewActionDB(
        id=f"rev_{uuid.uuid4().hex[:8]}",
        report_id=report.id,
        action=action_raw,
        counsel_name=counsel_name,
        comments=payload.comments,
        reviewed_at=datetime.utcnow(),
    )
    db.add(review_record)

    db.commit()
    db.refresh(report)
    if matter:
        db.refresh(matter)

    # 8. Notify event broker for live SSE subscribers
    try:
        event_manager.publish(
            matter_id=report.matter_id,
            event_type="agent_update",
            agent="human_counsel",
            status=target_status,
            message=f"Counsel review completed: {action_raw.upper()} by {counsel_name}",
            thought=(
                f"General Counsel {counsel_name} submitted action '{action_raw}'. "
                f"Review status transitioned to '{target_status}'. "
                f"Eligible for cryptographic sealing: {eligible_for_sealing}."
            ),
            payload={
                "report_id": report.id,
                "action": action_raw,
                "counsel_name": counsel_name,
                "review_status": target_status,
                "eligible_for_sealing": eligible_for_sealing,
            },
        )
    except Exception as ex:
        logger.debug(f"Event manager notification notice: {ex}")

    msg_map = {
        "approve": "Report approved by General Counsel. Dossier is now eligible for cryptographic sealing.",
        "request_revision": "Revision requested by General Counsel. Matter marked for another negotiation round.",
        "escalate": "Matter escalated for senior executive review and legal risk consultation.",
    }

    return {
        "reportId": report.id,
        "report_id": report.id,
        "matterId": report.matter_id,
        "matter_id": report.matter_id,
        "action": action_raw,
        "counselName": counsel_name,
        "counsel_name": counsel_name,
        "reviewStatus": target_status,
        "review_status": target_status,
        "matterStatus": matter.status if matter else target_status,
        "matter_status": matter.status if matter else target_status,
        "eligibleForSealing": eligible_for_sealing,
        "eligible_for_sealing": eligible_for_sealing,
        "isSealed": is_sealed,
        "is_sealed": is_sealed,
        "message": msg_map.get(action_raw, f"Review action '{action_raw}' recorded successfully."),
    }


class SealRequest(BaseModel):
    """Payload to authorize cryptographic seal."""
    model_config = ConfigDict(populate_by_name=True)

    counsel_name: Optional[str] = Field(None, alias="counselName")
    counsel: Optional[str] = None
    comments: Optional[str] = None

    def get_resolved_counsel(self) -> str:
        name = self.counsel_name or self.counsel
        if not name or not name.strip():
            return "General Counsel"
        return name.strip()


@router.post(
    "/{id}/seal",
    summary="Cryptographically seal an approved matter report",
    description=(
        "Anchors the canonical SHA-256 payload and linked block digest in the append-only "
        "audit chain. CRITICAL CONSTRAINT: Fails with 400 Bad Request if human counsel has not "
        "first explicitly approved the report."
    ),
)
def seal_report(
    id: str = Path(..., description="Report ID or Matter ID"),
    payload: SealRequest = Body(default_factory=SealRequest),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Finalize cryptographic sealing of an approved report dossier.
    """
    report = _find_report(db, id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{id}' not found.",
        )

    from app.services.audit_service import AuditService
    counsel_name = payload.get_resolved_counsel()

    try:
        seal_result = AuditService.seal_matter(
            db=db,
            matter_id=report.matter_id,
            counsel_name=counsel_name,
            comments=payload.comments,
        )
        return seal_result.to_dict()
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )


@router.get(
    "/{id}/audit-chain",
    summary="Verify mathematical integrity of the cryptographic audit chain",
    description="Validates uninterrupted linkage from Genesis hash to tip across all audit records.",
)
def verify_audit_chain(
    id: str = Path(..., description="Report ID or Matter ID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Verify complete audit chain provenance for a matter.
    """
    report = _find_report(db, id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{id}' not found.",
        )

    from app.services.audit_service import AuditService
    return AuditService.verify_audit_chain(db, report.matter_id)
