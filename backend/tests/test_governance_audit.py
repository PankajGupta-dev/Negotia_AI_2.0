"""
Unit & Integration Tests for Governance Endpoint:
    GET /api/matters/{id}/audit

Verifies:
    • Complete audit chain structure:
        - block index
        - event
        - timestamp
        - previous hash
        - current hash
        - human reviewer
        - review action
    • Basic hash verification (cryptographic chain continuity & block integrity).
    • Non-existent matter 404 handling.
    • Empty audit chain handling.
    • Chain tampering detection (broken hash linkage).
    • Full provenance integration through Review & Seal lifecycle.
"""

from datetime import datetime
import json
import os
import sys
import uuid

# Ensure repository and backend root are on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from fastapi.testclient import TestClient
from app.db.database import SessionLocal, init_db
from app.db.models import (
    AgentVerdictDB,
    AuditRecordDB,
    ContractClauseDB,
    MatterDB,
    ReportDB,
    ReviewActionDB,
)
from app.main import app
from app.services.audit_service import (
    GENESIS_HASH,
    AuditService,
    calculate_sha256,
    serialize_canonical_json,
)


def ensure_db():
    """Ensure DB tables exist for all tests."""
    init_db()


def _seed_governance_chain(matter_id: str, counsel_name: str = "Elena Rostova") -> str:
    """Helper to seed a realistic 3-block audit chain for a matter."""
    with SessionLocal() as db:
        # 1. Create Matter
        matter = MatterDB(
            id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            title="Enterprise AI Procurement Agreement",
            counterparty="Starlight Systems Inc.",
            type="Enterprise MSA",
            stage="Cryptographically Sealed & Ratified",
            status="sealed",
            arr_value="$5,000,000",
            variance_ceiling=0.15,
            lead_counsel=counsel_name,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(matter)

        # 2. Block 0: Ingestion
        b0_time = "2026-09-12T00:00:00.000000Z"
        b0_payload = {"event": "ingest", "matter_id": matter_id, "files": ["contract_a.docx", "contract_b.docx"]}
        b0_payload_hash = calculate_sha256(serialize_canonical_json(b0_payload))
        b0_header = {
            "matter_id": matter_id,
            "payload_hash": b0_payload_hash,
            "previous_hash": GENESIS_HASH,
            "timestamp": b0_time,
        }
        b0_current_hash = calculate_sha256(serialize_canonical_json(b0_header))

        rec0 = AuditRecordDB(
            id=f"aud_0_{matter_id}",
            matter_id=matter_id,
            timestamp=datetime.strptime(b0_time, "%Y-%m-%dT%H:%M:%S.%fZ"),
            actor="Lex-Ingestor",
            action="contract_ingested",
            details=json.dumps({
                "payload_hash": b0_payload_hash,
                "previous_hash": GENESIS_HASH,
                "current_hash": b0_current_hash,
                "timestamp": b0_time,
            }),
            sha256_hash=b0_current_hash,
            previous_hash=GENESIS_HASH,
        )
        db.add(rec0)

        # 3. Block 1: Negotiation Deliberation
        b1_time = "2026-09-12T00:05:00.000000Z"
        b1_payload = {"event": "deliberation", "clauses_reviewed": 4, "compromise_achieved": True}
        b1_payload_hash = calculate_sha256(serialize_canonical_json(b1_payload))
        b1_header = {
            "matter_id": matter_id,
            "payload_hash": b1_payload_hash,
            "previous_hash": b0_current_hash,
            "timestamp": b1_time,
        }
        b1_current_hash = calculate_sha256(serialize_canonical_json(b1_header))

        rec1 = AuditRecordDB(
            id=f"aud_1_{matter_id}",
            matter_id=matter_id,
            timestamp=datetime.strptime(b1_time, "%Y-%m-%dT%H:%M:%S.%fZ"),
            actor="Arbiter-3",
            action="nash_equilibrium_deliberated",
            details=json.dumps({
                "payload_hash": b1_payload_hash,
                "previous_hash": b0_current_hash,
                "current_hash": b1_current_hash,
                "timestamp": b1_time,
            }),
            sha256_hash=b1_current_hash,
            previous_hash=b0_current_hash,
        )
        db.add(rec1)

        # 4. Block 2: Human Counsel Approval & Cryptographic Seal
        b2_time = "2026-09-12T00:10:00.000000Z"
        b2_payload = {
            "event": "counsel_approval",
            "action": "approve",
            "counsel": counsel_name,
            "decision": "All terms conformed and ratified.",
        }
        b2_payload_hash = calculate_sha256(serialize_canonical_json(b2_payload))
        b2_header = {
            "matter_id": matter_id,
            "payload_hash": b2_payload_hash,
            "previous_hash": b1_current_hash,
            "timestamp": b2_time,
        }
        b2_current_hash = calculate_sha256(serialize_canonical_json(b2_header))

        rec2 = AuditRecordDB(
            id=f"aud_2_{matter_id}",
            matter_id=matter_id,
            timestamp=datetime.strptime(b2_time, "%Y-%m-%dT%H:%M:%S.%fZ"),
            actor=counsel_name,
            action="cryptographic_seal_anchored",
            details=json.dumps({
                "payload_hash": b2_payload_hash,
                "previous_hash": b1_current_hash,
                "current_hash": b2_current_hash,
                "sealed_by": counsel_name,
                "timestamp": b2_time,
            }),
            sha256_hash=b2_current_hash,
            previous_hash=b1_current_hash,
        )
        db.add(rec2)

        # Also add Report and ReviewAction for cross-referencing
        report_id = f"rep_{matter_id}"
        rep = ReportDB(
            id=report_id,
            matter_id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            executive_summary="Approved and sealed contract negotiation.",
            review_status="approved",
            attestation_hash=b2_payload_hash,
            block_digest=b2_current_hash,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(rep)

        rev_action = ReviewActionDB(
            id=f"rev_{matter_id}",
            report_id=report_id,
            action="approve",
            counsel_name=counsel_name,
            comments="Final seal authorized.",
            reviewed_at=datetime.utcnow(),
        )
        db.add(rev_action)

        db.commit()

    return matter_id


# ═════════════════════════════════════════════════════════════════════════════
# Test Cases
# ═════════════════════════════════════════════════════════════════════════════

def test_audit_endpoint_404_on_missing_matter():
    """GET /api/matters/{id}/audit should return 404 for a non-existent matter."""
    client = TestClient(app)
    response = client.get("/api/matters/non_existent_matter_xyz/audit")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_audit_endpoint_empty_chain():
    """GET /api/matters/{id}/audit returns 200 with valid empty chain if no records exist."""
    matter_id = f"mat_empty_{uuid.uuid4().hex[:6]}"
    with SessionLocal() as db:
        matter = MatterDB(
            id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            title="Empty Matter",
            counterparty="Acme Corp",
            status="pending_review",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(matter)
        db.commit()

    client = TestClient(app)
    response = client.get(f"/api/matters/{matter_id}/audit")
    assert response.status_code == 200
    data = response.json()

    assert data["matterId"] == matter_id or data["matter_id"] == matter_id
    assert data["chainLength"] == 0 or data["chain_length"] == 0
    assert data["isValid"] is True or data["is_valid"] is True
    assert data["blocks"] == []


def test_audit_endpoint_complete_chain_and_required_fields():
    """
    GET /api/matters/{id}/audit returns complete audit chain with all 7 required fields:
    - block index
    - event
    - timestamp
    - previous hash
    - current hash
    - human reviewer
    - review action
    plus basic hash verification.
    """
    matter_id = f"mat_gov_{uuid.uuid4().hex[:6]}"
    counsel = "Elena Rostova, General Counsel"
    _seed_governance_chain(matter_id, counsel_name=counsel)

    client = TestClient(app)
    response = client.get(f"/api/matters/{matter_id}/audit")
    assert response.status_code == 200
    data = response.json()

    # Verify top-level metadata
    assert data["matterId"] == matter_id
    assert data["chainLength"] == 3
    assert data["isValid"] is True
    assert "Verified 3 blocks" in data["verificationMessage"]

    blocks = data["blocks"]
    assert len(blocks) == 3

    # Check each block for all 7 required fields + hash verification
    for idx, block in enumerate(blocks):
        # 1. block index
        assert block["blockIndex"] == idx
        assert block["block_index"] == idx

        # 2. event
        assert "event" in block
        assert len(block["event"]) > 0

        # 3. timestamp
        assert "timestamp" in block
        assert block["timestamp"] is not None

        # 4. previous hash
        assert "previousHash" in block
        assert "previous_hash" in block
        assert len(block["previousHash"]) == 64

        # 5. current hash
        assert "currentHash" in block
        assert "current_hash" in block
        assert len(block["currentHash"]) == 64

        # 6. human reviewer
        assert "humanReviewer" in block
        assert "human_reviewer" in block

        # 7. review action
        assert "reviewAction" in block
        assert "review_action" in block

        # Hash verification
        assert block["isHashValid"] is True
        assert block["is_hash_valid"] is True

    # Block 0 specifics (Genesis block)
    assert blocks[0]["previousHash"] == GENESIS_HASH
    assert blocks[0]["event"] == "contract_ingested"

    # Block 1 specifics
    assert blocks[1]["previousHash"] == blocks[0]["currentHash"]
    assert blocks[1]["event"] == "nash_equilibrium_deliberated"

    # Block 2 specifics (Human Approval & Seal block)
    assert blocks[2]["previousHash"] == blocks[1]["currentHash"]
    assert blocks[2]["event"] == "cryptographic_seal_anchored"
    assert blocks[2]["humanReviewer"] == counsel
    assert blocks[2]["reviewAction"] == "approve"


def test_audit_endpoint_tamper_detection():
    """
    Verify that basic hash verification detects corrupted previous_hash or block tampering.
    """
    matter_id = f"mat_tamper_{uuid.uuid4().hex[:6]}"
    _seed_governance_chain(matter_id)

    # Corrupt Block 1's previous hash in the database
    with SessionLocal() as db:
        rec1 = db.query(AuditRecordDB).filter(AuditRecordDB.id == f"aud_1_{matter_id}").first()
        assert rec1 is not None
        rec1.previous_hash = "f" * 64  # Invalid bogus previous hash
        db.commit()

    client = TestClient(app)
    response = client.get(f"/api/matters/{matter_id}/audit")
    assert response.status_code == 200
    data = response.json()

    # The chain should fail validation
    assert data["isValid"] is False or data["is_valid"] is False
    assert "Cryptographic integrity failure" in data["verificationMessage"]

    # Block 1 should report hash invalidity
    blocks = data["blocks"]
    assert blocks[1]["isHashValid"] is False or blocks[1]["is_hash_valid"] is False


def test_audit_endpoint_lifecycle_integration():
    """
    Test end-to-end integration:
    Review report with approval -> seal matter -> query /api/matters/{id}/audit ->
    assert governance chain includes counsel name, approve action, and valid hash.
    """
    matter_id = f"mat_life_{uuid.uuid4().hex[:6]}"
    report_id = f"rep_{matter_id}"
    counsel = "Marcus Vance, Lead Counsel"

    # Create matter, clause, verdict, report in pending_review
    with SessionLocal() as db:
        matter = MatterDB(
            id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            title="SaaS Service Agreement",
            counterparty="OmniCorp Global",
            stage="Stage 4 Concluded — Pending Human Review",
            status="pending_review",
            arr_value="$1,200,000",
            variance_ceiling=0.10,
            lead_counsel=counsel,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(matter)

        cid = f"{matter_id}_sec_1"
        clause = ContractClauseDB(
            id=cid,
            matter_id=matter_id,
            section="§ 1",
            title="Confidentiality",
            original_text="3 years standard term.",
            counterparty_text="5 years indefinite term.",
            conformed_proposal="3 years with standard trade secret carve-outs.",
            status="agreed",
        )
        db.add(clause)

        verdict = AgentVerdictDB(
            id=f"v_{cid}",
            clause_id=cid,
            legal_lens="Standard commercial protections verified.",
            marketing_lens="Preserves deal velocity.",
            nash_equilibrium_clause="3 years with standard trade secret carve-outs.",
            compromise_score=95.0,
        )
        db.add(verdict)

        report = ReportDB(
            id=report_id,
            matter_id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            executive_summary="Draft negotiation report awaiting review.",
            review_status="pending_review",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(report)
        db.commit()

    client = TestClient(app)

    # 1. Human review: Approve
    rev_resp = client.post(
        f"/api/reports/{report_id}/review",
        json={"action": "approve", "counselName": counsel, "comments": "Approved without exception."},
    )
    assert rev_resp.status_code == 200

    # 2. Cryptographic seal via AuditService
    with SessionLocal() as db:
        seal_res = AuditService.seal_matter(
            db=db,
            matter_id=matter_id,
            counsel_name=counsel,
            comments="Cryptographic ratification confirmed.",
        )
        assert seal_res.is_sealed is True

    # 3. Query governance endpoint
    audit_resp = client.get(f"/api/matters/{matter_id}/audit")
    assert audit_resp.status_code == 200
    audit_data = audit_resp.json()

    assert audit_data["isValid"] is True
    assert audit_data["chainLength"] >= 1

    last_block = audit_data["blocks"][-1]
    assert last_block["humanReviewer"] == counsel
    assert last_block["reviewAction"] == "approve"
    assert last_block["event"] == "cryptographic_seal_anchored"
    assert last_block["isHashValid"] is True
    assert len(last_block["currentHash"]) == 64
    assert len(last_block["previousHash"]) == 64


if __name__ == "__main__":
    ensure_db()
    test_audit_endpoint_404_on_missing_matter()
    print("PASS: test_audit_endpoint_404_on_missing_matter")
    test_audit_endpoint_empty_chain()
    print("PASS: test_audit_endpoint_empty_chain")
    test_audit_endpoint_complete_chain_and_required_fields()
    print("PASS: test_audit_endpoint_complete_chain_and_required_fields")
    test_audit_endpoint_tamper_detection()
    print("PASS: test_audit_endpoint_tamper_detection")
    test_audit_endpoint_lifecycle_integration()
    print("PASS: test_audit_endpoint_lifecycle_integration")
    print("ALL GOVERNANCE AUDIT TESTS PASSED SUCCESSFULLY!")
