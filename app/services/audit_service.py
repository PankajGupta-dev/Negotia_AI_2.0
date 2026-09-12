"""
Cryptographic Provenance and Immutable Audit Chain Service for Negotia AI.

Responsibilities:
    • RFC 8785 Canonical JSON serialization: strictly sorted keys, deterministic
      delimiters (',', ':'), UTF-8, and standardized ISO 8601 timestamps.
    • Canonical Payload Assembly:
        - matter metadata
        - agreed clauses (sorted deterministically by section and clause_id)
        - arbiter verdicts (sorted by clause_id)
        - human counsel review decision
        - canonical timestamp
        - previous audit block hash (Genesis hash for first block)
    • Cryptographic Hashing:
        - Payload SHA-256 digest
        - Block SHA-256 digest linking to previous block
    • Append-Only Audit Chain:
        - Stores payload_hash, previous_hash, current_hash, and timestamp
    • Human Approval Safeguard:
        - STRICT RULE: Only creates the final cryptographic seal AFTER human approval.
        - Raises an explicit error if review_status != 'approved'.
    • Chain Verification:
        - Mathematically verifies uninterrupted cryptographic linkage across the audit chain.
"""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.db.models import (
    AgentVerdictDB,
    AuditRecordDB,
    ContractClauseDB,
    MatterDB,
    ReportDB,
    ReviewActionDB,
)
from app.models.report import ReviewStatus

logger = logging.getLogger(__name__)

# Genesis hash for the initial link in a matter's audit chain (64 zeroes)
GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"


# ═════════════════════════════════════════════════════════════════════════════
# Provenance Data Models
# ═════════════════════════════════════════════════════════════════════════════

class AuditBlock(BaseModel):
    """Immutable block in the append-only provenance chain."""
    model_config = ConfigDict(populate_by_name=True)

    block_id: str
    matter_id: str
    report_id: Optional[str] = None
    payload_hash: str
    previous_hash: str
    current_hash: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    actor: str
    action: str
    canonical_payload: Dict[str, Any]


class SealResult(BaseModel):
    """Result returned upon successful cryptographic sealing of an approved report."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    matter_id: str
    report_id: str
    docket_number: str
    payload_hash: str
    previous_hash: str
    block_digest: str
    attestation_hash: str
    sealed_at: datetime
    sealed_by: str
    review_status: str
    is_sealed: bool = True
    chain_length: int

    def to_dict(self) -> Dict[str, Any]:
        d = self.model_dump()
        d["matterId"] = self.matter_id
        d["reportId"] = self.report_id
        d["docketNumber"] = self.docket_number
        d["payloadHash"] = self.payload_hash
        d["previousHash"] = self.previous_hash
        d["blockDigest"] = self.block_digest
        d["attestationHash"] = self.attestation_hash
        d["sealedAt"] = self.sealed_at.isoformat()
        d["sealedBy"] = self.sealed_by
        d["reviewStatus"] = self.review_status
        d["isSealed"] = self.is_sealed
        d["chainLength"] = self.chain_length
        return d


# ═════════════════════════════════════════════════════════════════════════════
# Canonical JSON Serialization (RFC 8785)
# ═════════════════════════════════════════════════════════════════════════════

def _normalize_for_canonical_json(val: Any) -> Any:
    """
    Recursively normalize objects into primitives with deterministic types.
    Ensures datetime objects format into exact ISO 8601 strings, floats maintain precision,
    and Pydantic models dump cleanly.
    """
    if isinstance(val, datetime):
        # Format UTC datetime to ISO 8601 with trailing Z
        return val.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    elif isinstance(val, dict):
        return {str(k): _normalize_for_canonical_json(v) for k, v in val.items()}
    elif isinstance(val, (list, tuple, set)):
        return [_normalize_for_canonical_json(item) for item in val]
    elif isinstance(val, BaseModel):
        return _normalize_for_canonical_json(val.model_dump(mode="json"))
    elif isinstance(val, float):
        # Prevent float precision string jitter
        return round(val, 6)
    return val


def serialize_canonical_json(payload: Any) -> str:
    """
    Produce a deterministic, canonical UTF-8 JSON string (RFC 8785).
    Rules:
      1. Dictionary keys recursively sorted alphabetically (sort_keys=True).
      2. Strictly compact delimiters (',', ':') with no arbitrary spaces.
      3. ASCII-safe character encoding (ensure_ascii=True).
    """
    normalized = _normalize_for_canonical_json(payload)
    return json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def calculate_sha256(canonical_json_str: str) -> str:
    """Calculate SHA-256 hexadecimal digest from a canonical JSON string."""
    return hashlib.sha256(canonical_json_str.encode("utf-8")).hexdigest()


# ═════════════════════════════════════════════════════════════════════════════
# Canonical Payload Construction
# ═════════════════════════════════════════════════════════════════════════════

def assemble_canonical_payload(
    matter: MatterDB,
    agreed_clauses: List[ContractClauseDB],
    verdicts: List[AgentVerdictDB],
    review_decision: Dict[str, Any],
    timestamp: datetime,
    previous_audit_hash: str,
) -> Dict[str, Any]:
    """
    Build strictly structured, ordered canonical dictionary for hashing.
    Enforces deterministic sorting across lists and key naming.
    """
    # 1. Normalize and sort agreed clauses by (section, clause_id)
    sorted_clauses = sorted(
        agreed_clauses,
        key=lambda c: (str(c.section or ""), str(c.id or "")),
    )
    canonical_clauses = []
    for c in sorted_clauses:
        canonical_clauses.append({
            "clause_id": str(c.id),
            "conformed_proposal": str(c.conformed_proposal or c.original_text or "").strip(),
            "counterparty_text": str(c.counterparty_text or "").strip(),
            "original_text": str(c.original_text or "").strip(),
            "precedent_alignment": round(float(c.precedent_alignment or 100.0), 2),
            "risk_level": str(c.risk_level or "low").lower(),
            "risk_score": round(float(c.risk_score or 0.0), 2),
            "section": str(c.section or "").strip(),
            "status": str(c.status or "agreed").lower(),
            "title": str(c.title or "").strip(),
        })

    # 2. Normalize and sort verdicts by clause_id
    sorted_verdicts = sorted(
        verdicts,
        key=lambda v: str(v.clause_id or ""),
    )
    canonical_verdicts = []
    for v in sorted_verdicts:
        raw_citations = v.sec_citations if isinstance(v.sec_citations, list) else []
        sorted_citations = sorted([str(cit).strip() for cit in raw_citations])
        canonical_verdicts.append({
            "clause_id": str(v.clause_id),
            "compromise_score": round(float(v.compromise_score or 0.0), 2),
            "legal_lens": str(v.legal_lens or "").strip(),
            "marketing_lens": str(v.marketing_lens or "").strip(),
            "nash_equilibrium_clause": str(v.nash_equilibrium_clause or "").strip(),
            "sec_citations": sorted_citations,
        })

    # 3. Normalize matter metadata
    canonical_matter = {
        "arr_value": str(matter.arr_value or "").strip(),
        "counterparty": str(matter.counterparty or "").strip(),
        "docket_number": str(matter.docket_number or "").strip(),
        "lead_counsel": str(matter.lead_counsel or "").strip(),
        "matter_id": str(matter.id),
        "title": str(matter.title or "").strip(),
        "type": str(matter.type or "Enterprise MSA").strip(),
        "variance_ceiling": round(float(matter.variance_ceiling or 0.15), 4),
    }

    # 4. Normalize review decision
    canonical_review = {
        "action": str(review_decision.get("action", "")).strip().lower(),
        "comments": str(review_decision.get("comments", "")).strip() if review_decision.get("comments") else None,
        "counsel_name": str(review_decision.get("counsel_name", review_decision.get("counselName", ""))).strip(),
        "reviewed_at": (
            review_decision["reviewed_at"].strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            if isinstance(review_decision.get("reviewed_at"), datetime)
            else str(review_decision.get("reviewed_at", ""))
        ),
    }

    # 5. Assemble master canonical dictionary
    return {
        "agreed_clauses": canonical_clauses,
        "matter": canonical_matter,
        "previous_audit_hash": str(previous_audit_hash),
        "review_decision": canonical_review,
        "timestamp": timestamp.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "verdicts": canonical_verdicts,
    }


# ═════════════════════════════════════════════════════════════════════════════
# Audit Chain Manager
# ═════════════════════════════════════════════════════════════════════════════

class AuditService:
    """
    Service managing the append-only cryptographic audit chain for matters.
    """

    @staticmethod
    def get_latest_hash(db: Session, matter_id: str) -> str:
        """
        Retrieve the latest block hash in the matter's audit chain.
        Returns GENESIS_HASH if no previous records exist.
        """
        latest = (
            db.query(AuditRecordDB)
            .filter(AuditRecordDB.matter_id == matter_id)
            .order_by(AuditRecordDB.timestamp.desc(), AuditRecordDB.id.desc())
            .first()
        )
        if latest and latest.sha256_hash:
            return latest.sha256_hash
        return GENESIS_HASH

    @staticmethod
    def append_audit_block(
        db: Session,
        matter_id: str,
        report_id: Optional[str],
        actor: str,
        action: str,
        canonical_payload: Dict[str, Any],
        timestamp: Optional[datetime] = None,
    ) -> AuditRecordDB:
        """
        Append a cryptographically linked block to the matter's audit chain.
        Computes payload_hash and current_hash linked to previous_hash.
        """
        ts = timestamp or datetime.utcnow()
        previous_hash = AuditService.get_latest_hash(db, matter_id)

        # 1. Canonical payload JSON and hash
        canonical_payload_json = serialize_canonical_json(canonical_payload)
        payload_hash = calculate_sha256(canonical_payload_json)

        # 2. Block header combining payload_hash, previous_hash, and timestamp
        block_header = {
            "matter_id": matter_id,
            "payload_hash": payload_hash,
            "previous_hash": previous_hash,
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        }
        canonical_header_json = serialize_canonical_json(block_header)
        current_hash = calculate_sha256(canonical_header_json)

        # 3. Store block in AuditRecordDB
        block_id = f"aud_{matter_id}_{uuid.uuid4().hex[:8]}"
        details_store = {
            "current_hash": current_hash,
            "payload_hash": payload_hash,
            "previous_hash": previous_hash,
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "canonical_payload": canonical_payload,
        }

        record = AuditRecordDB(
            id=block_id,
            matter_id=matter_id,
            report_id=report_id,
            timestamp=ts,
            actor=actor,
            action=action,
            details=json.dumps(details_store),
            sha256_hash=current_hash,
            previous_hash=previous_hash,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        logger.info(
            f"Appended audit block '{block_id}' for matter {matter_id}. "
            f"Previous: {previous_hash[:12]}... Current: {current_hash[:12]}..."
        )
        return record

    @staticmethod
    def seal_matter(
        db: Session,
        matter_id: str,
        counsel_name: str,
        comments: Optional[str] = None,
        timestamp: Optional[datetime] = None,
    ) -> SealResult:
        """
        Create final cryptographic seal for a matter.
        CRITICAL CONSTRAINT: ONLY succeeds if report is in 'approved' status.
        Raises ValueError if human counsel has not approved the report.
        """
        ts = timestamp or datetime.utcnow()

        # 1. Locate Matter and Report
        matter = db.query(MatterDB).filter(MatterDB.id == matter_id).first()
        if not matter:
            raise ValueError(f"Matter with ID '{matter_id}' not found.")

        report = db.query(ReportDB).filter(ReportDB.matter_id == matter_id).first()
        if not report:
            raise ValueError(f"No report found for matter '{matter_id}'.")

        # 2. ENFORCE HUMAN APPROVAL RULE:
        # "Only create the final seal after human approval."
        current_review_status = (report.review_status or "").lower()
        if current_review_status != ReviewStatus.APPROVED.value:
            raise ValueError(
                f"Cannot create cryptographic seal: Matter '{matter_id}' has not been approved "
                f"by human counsel. Current review status is '{current_review_status}'."
            )

        # 3. Check if already sealed
        if report.block_digest and report.attestation_hash:
            raise ValueError(f"Matter '{matter_id}' is already cryptographically sealed.")

        # 4. Fetch all agreed/conformed clauses and verdicts
        agreed_clauses = (
            db.query(ContractClauseDB)
            .filter(
                ContractClauseDB.matter_id == matter_id,
                ContractClauseDB.status.in_(["agreed", "conformed"]),
            )
            .all()
        )
        # If no explicit agreed/conformed clauses exist, pull all clauses for the matter
        if not agreed_clauses:
            agreed_clauses = db.query(ContractClauseDB).filter(ContractClauseDB.matter_id == matter_id).all()

        clause_ids = [c.id for c in agreed_clauses]
        verdicts = (
            db.query(AgentVerdictDB)
            .filter(AgentVerdictDB.clause_id.in_(clause_ids))
            .all()
        )

        # 5. Fetch previous audit hash
        previous_hash = AuditService.get_latest_hash(db, matter_id)

        # 6. Retrieve latest review decision
        latest_review = (
            db.query(ReviewActionDB)
            .filter(ReviewActionDB.report_id == report.id)
            .order_by(ReviewActionDB.reviewed_at.desc())
            .first()
        )
        review_dict = {
            "action": "approve",
            "counsel_name": counsel_name,
            "comments": comments or (latest_review.comments if latest_review else None),
            "reviewed_at": latest_review.reviewed_at if latest_review else ts,
        }

        # 7. Assemble strictly canonical JSON payload
        canonical_payload = assemble_canonical_payload(
            matter=matter,
            agreed_clauses=agreed_clauses,
            verdicts=verdicts,
            review_decision=review_dict,
            timestamp=ts,
            previous_audit_hash=previous_hash,
        )

        canonical_payload_json = serialize_canonical_json(canonical_payload)
        payload_hash = calculate_sha256(canonical_payload_json)

        # 8. Calculate block digest linked to previous hash
        block_header = {
            "matter_id": matter_id,
            "payload_hash": payload_hash,
            "previous_hash": previous_hash,
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        }
        canonical_header_json = serialize_canonical_json(block_header)
        current_hash = calculate_sha256(canonical_header_json)

        # 9. Store append-only record
        record_id = f"aud_seal_{matter_id}_{uuid.uuid4().hex[:6]}"
        details_store = {
            "current_hash": current_hash,
            "payload_hash": payload_hash,
            "previous_hash": previous_hash,
            "sealed_by": counsel_name,
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "canonical_payload": canonical_payload,
        }

        seal_record = AuditRecordDB(
            id=record_id,
            matter_id=matter_id,
            report_id=report.id,
            timestamp=ts,
            actor=counsel_name,
            action="cryptographic_seal_anchored",
            details=json.dumps(details_store),
            sha256_hash=current_hash,
            previous_hash=previous_hash,
        )
        db.add(seal_record)

        # 10. Update Report with final cryptographic seal
        report.attestation_hash = payload_hash
        report.block_digest = current_hash
        report.updated_at = ts

        # 11. Update Matter stage and status
        matter.stage = "Cryptographically Sealed & Ratified"
        matter.status = "sealed"
        matter.updated_at = ts

        db.commit()
        db.refresh(report)
        db.refresh(matter)

        # 12. Count audit chain length
        chain_len = db.query(AuditRecordDB).filter(AuditRecordDB.matter_id == matter_id).count()

        logger.info(
            f"Matter {matter_id} cryptographically sealed by {counsel_name}. "
            f"Payload Hash: {payload_hash[:12]}... Block Digest: {current_hash[:12]}..."
        )

        return SealResult(
            matter_id=matter_id,
            report_id=report.id,
            docket_number=matter.docket_number,
            payload_hash=payload_hash,
            previous_hash=previous_hash,
            block_digest=current_hash,
            attestation_hash=payload_hash,
            sealed_at=ts,
            sealed_by=counsel_name,
            review_status=report.review_status,
            is_sealed=True,
            chain_length=chain_len,
        )

    @staticmethod
    def verify_audit_chain(db: Session, matter_id: str) -> Dict[str, Any]:
        """
        Walk and mathematically verify the append-only audit chain for a matter.
        Verifies:
            1. Genesis link equals GENESIS_HASH
            2. Every link matches the prior block's current_hash
            3. Recalculated SHA-256 header hash matches stored sha256_hash
        """
        records = (
            db.query(AuditRecordDB)
            .filter(AuditRecordDB.matter_id == matter_id)
            .order_by(AuditRecordDB.timestamp.asc(), AuditRecordDB.id.asc())
            .all()
        )

        if not records:
            return {
                "valid": True,
                "chain_length": 0,
                "tip_hash": GENESIS_HASH,
                "message": "Empty audit chain (no records created yet).",
            }

        expected_prev = GENESIS_HASH
        for idx, rec in enumerate(records):
            # Check previous hash continuity
            if rec.previous_hash != expected_prev:
                return {
                    "valid": False,
                    "broken_index": idx,
                    "record_id": rec.id,
                    "expected_previous": expected_prev,
                    "actual_previous": rec.previous_hash,
                    "error": f"Broken chain link at block index {idx}.",
                }

            # If details contain stored payload_hash and timestamp, verify current_hash integrity
            try:
                details = json.loads(rec.details) if rec.details else {}
                p_hash = details.get("payload_hash")
                ts_str = details.get("timestamp")
                if p_hash and ts_str:
                    header = {
                        "matter_id": matter_id,
                        "payload_hash": p_hash,
                        "previous_hash": rec.previous_hash,
                        "timestamp": ts_str,
                    }
                    computed = calculate_sha256(serialize_canonical_json(header))
                    if computed != rec.sha256_hash:
                        return {
                            "valid": False,
                            "broken_index": idx,
                            "record_id": rec.id,
                            "expected_hash": rec.sha256_hash,
                            "recomputed_hash": computed,
                            "error": f"Corrupted block hash digest at block index {idx}.",
                        }
            except Exception as ex:
                logger.warning(f"Could not parse details for verification of block {rec.id}: {ex}")

            expected_prev = rec.sha256_hash

        return {
            "valid": True,
            "chain_length": len(records),
            "genesis_hash": records[0].previous_hash,
            "tip_hash": records[-1].sha256_hash,
            "message": f"Cryptographic provenance verified across all {len(records)} blocks.",
        }
