"""
Unit & Integration Tests for Cryptographic Provenance & Audit Service.
"""

from datetime import datetime
import json
import os
import sys
import time

# Ensure repository root is on sys.path
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
    assemble_canonical_payload,
    calculate_sha256,
    serialize_canonical_json,
)


def setup_module():
    """Ensure database tables are initialized."""
    init_db()


def _seed_matter_and_report_for_audit(matter_id: str, report_id: str, review_status: str = "pending_review"):
    """Helper to populate matter and report in database."""
    with SessionLocal() as db:
        matter = MatterDB(
            id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            title="Enterprise Cloud Agreement",
            counterparty="Starlight Tech Corp",
            type="Enterprise MSA",
            stage="Stage 4 Concluded",
            status=review_status,
            arr_value="$4.2M",
            variance_ceiling=0.15,
            lead_counsel="Elena Rostova",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(matter)

        # Add 2 clauses in reverse section order
        c2 = ContractClauseDB(
            id=f"{matter_id}_clause_14_1",
            matter_id=matter_id,
            section="§ 14.1",
            title="Indemnification",
            original_text="Party A indemnifies for US patent infringements.",
            counterparty_text="Vendor indemnifies all claims globally without limitation.",
            conformed_proposal="Party A indemnifies for registered US and EU patents.",
            risk_level="moderate",
            risk_score=5.5,
            precedent_alignment=88.0,
            status="agreed",
        )
        c1 = ContractClauseDB(
            id=f"{matter_id}_clause_11_2",
            matter_id=matter_id,
            section="§ 11.2",
            title="Liability Cap",
            original_text="1.0x annual fees cap.",
            counterparty_text="Unlimited liability.",
            conformed_proposal="1.5x annual fees with mutual IP carve-out.",
            risk_level="high",
            risk_score=7.2,
            precedent_alignment=94.0,
            status="agreed",
        )
        db.add(c2)
        db.add(c1)

        v1 = AgentVerdictDB(
            id=f"v_{matter_id}_clause_11_2",
            clause_id=f"{matter_id}_clause_11_2",
            legal_lens="Liability cap balanced with IP exclusion.",
            marketing_lens="Protects $4.2M ARR deal velocity.",
            nash_equilibrium_clause="1.5x annual fees with mutual IP carve-out.",
            compromise_score=94.0,
            sec_citations=["SEC 10-K Precedent 2024"],
        )
        db.add(v1)

        report = ReportDB(
            id=report_id,
            matter_id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            executive_summary="Deliberation complete.",
            agreed_clauses_count=2,
            contested_clauses_count=0,
            counsel_cost_saved=28500.0,
            turnaround_time_minutes=18.0,
            review_status=review_status,
            attestation_hash=None,
            block_digest=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(report)

        if review_status == "approved":
            rev = ReviewActionDB(
                id=f"rev_{matter_id}",
                report_id=report_id,
                action="approve",
                counsel_name="Elena Rostova",
                comments="Approved for sealing.",
                reviewed_at=datetime.utcnow(),
            )
            db.add(rev)

        db.commit()


def test_canonical_json_determinism():
    """Verify RFC 8785 byte-for-byte reproducibility regardless of key insertion order."""
    dict_a = {
        "zeta": 1,
        "alpha": "hello",
        "nested": {"gamma": [3, 2, 1], "beta": True},
    }
    dict_b = {
        "alpha": "hello",
        "nested": {"beta": True, "gamma": [3, 2, 1]},
        "zeta": 1,
    }

    canonical_a = serialize_canonical_json(dict_a)
    canonical_b = serialize_canonical_json(dict_b)

    assert canonical_a == canonical_b
    assert calculate_sha256(canonical_a) == calculate_sha256(canonical_b)
    # Strict formatting: no spaces after separators
    assert ", " not in canonical_a
    assert ": " not in canonical_a
    print("PASS: test_canonical_json_determinism")


def test_append_only_audit_chain():
    """Verify append-only cryptographic continuity from Genesis hash across multiple blocks."""
    matter_id = f"TEST-CHAIN-{int(time.time())}"
    report_id = f"rep_{matter_id}"
    _seed_matter_and_report_for_audit(matter_id, report_id, review_status="approved")

    with SessionLocal() as db:
        # Block 1: Initial ingestion block
        block1 = AuditService.append_audit_block(
            db=db,
            matter_id=matter_id,
            report_id=report_id,
            actor="Lex-Ingestor",
            action="ingest_complete",
            canonical_payload={"stage": "ingest", "files_count": 2},
        )
        assert block1.previous_hash == GENESIS_HASH
        assert len(block1.sha256_hash) == 64

        # Block 2: Deliberation block
        block2 = AuditService.append_audit_block(
            db=db,
            matter_id=matter_id,
            report_id=report_id,
            actor="Arbiter-3",
            action="verdicts_rendered",
            canonical_payload={"verdicts_count": 2, "compromise_index": 94.0},
        )
        assert block2.previous_hash == block1.sha256_hash
        assert block2.sha256_hash != block1.sha256_hash

        # Block 3: Executive synthesis block
        block3 = AuditService.append_audit_block(
            db=db,
            matter_id=matter_id,
            report_id=report_id,
            actor="Scrivener-4",
            action="synthesis_complete",
            canonical_payload={"dossier_ready": True},
        )
        assert block3.previous_hash == block2.sha256_hash

        # Verify entire chain integrity
        verification = AuditService.verify_audit_chain(db, matter_id)
        assert verification["valid"] is True
        assert verification["chain_length"] == 3
        assert verification["tip_hash"] == block3.sha256_hash

    print("PASS: test_append_only_audit_chain")


def test_human_approval_safeguard_before_sealing():
    """
    CRITICAL TEST: Verify that sealing MUST fail before human counsel approval,
    and succeeds once approved.
    """
    matter_id = f"TEST-SEAL-SAFEGUARD-{int(time.time())}"
    report_id = f"rep_{matter_id}"
    # Seed as pending_review
    _seed_matter_and_report_for_audit(matter_id, report_id, review_status="pending_review")

    with SessionLocal() as db:
        # 1. Attempt sealing before approval -> MUST FAIL
        failed_as_expected = False
        try:
            AuditService.seal_matter(
                db=db,
                matter_id=matter_id,
                counsel_name="Elena Rostova",
            )
        except ValueError as err:
            failed_as_expected = True
            assert "has not been approved by human counsel" in str(err)

        assert failed_as_expected, "Security failure: Sealing succeeded before human counsel approval!"

        # Verify report remains unsealed
        rep = db.query(ReportDB).filter(ReportDB.id == report_id).first()
        assert rep.attestation_hash is None
        assert rep.block_digest is None

        # 2. Now simulate General Counsel review approval
        rep.review_status = "approved"
        mat = db.query(MatterDB).filter(MatterDB.id == matter_id).first()
        mat.status = "approved"
        db.add(ReviewActionDB(
            id=f"rev_{matter_id}",
            report_id=report_id,
            action="approve",
            counsel_name="Elena Rostova",
            reviewed_at=datetime.utcnow(),
        ))
        db.commit()

        # 3. Attempt sealing after approval -> MUST SUCCEED
        seal_res = AuditService.seal_matter(
            db=db,
            matter_id=matter_id,
            counsel_name="Elena Rostova",
            comments="Final ratification after bilateral review.",
        )
        assert seal_res.is_sealed is True
        assert len(seal_res.attestation_hash) == 64
        assert len(seal_res.block_digest) == 64
        assert seal_res.review_status == "approved"

        # Verify DB records updated
        db.refresh(rep)
        db.refresh(mat)
        assert rep.attestation_hash == seal_res.attestation_hash
        assert rep.block_digest == seal_res.block_digest
        assert mat.status == "sealed"
        assert mat.stage == "Cryptographically Sealed & Ratified"

        # Verify chain validity
        verif = AuditService.verify_audit_chain(db, matter_id)
        assert verif["valid"] is True
        assert verif["chain_length"] >= 1
        assert verif["tip_hash"] == seal_res.block_digest

    print("PASS: test_human_approval_safeguard_before_sealing")


def test_tamper_detection_in_audit_chain():
    """Verify that tampering with any block hash in the database breaks chain verification."""
    matter_id = f"TEST-TAMPER-{int(time.time())}"
    report_id = f"rep_{matter_id}"
    _seed_matter_and_report_for_audit(matter_id, report_id, review_status="approved")

    with SessionLocal() as db:
        # Append 2 blocks
        b1 = AuditService.append_audit_block(db, matter_id, report_id, "System", "step1", {"data": 1})
        b2 = AuditService.append_audit_block(db, matter_id, report_id, "System", "step2", {"data": 2})

        # Pre-tamper verification passes
        assert AuditService.verify_audit_chain(db, matter_id)["valid"] is True

        # Malicious actor tampers with block 1 digest in DB
        b1.sha256_hash = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
        db.commit()

        # Chain verification MUST fail
        tampered_result = AuditService.verify_audit_chain(db, matter_id)
        assert tampered_result["valid"] is False
        assert tampered_result["broken_index"] in (0, 1)

    print("PASS: test_tamper_detection_in_audit_chain")


def test_seal_and_verify_api_endpoints():
    """Verify POST /api/reports/{id}/seal and GET /api/reports/{id}/audit-chain endpoints."""
    matter_id = f"TEST-API-SEAL-{int(time.time())}"
    report_id = f"rep_{matter_id}"
    _seed_matter_and_report_for_audit(matter_id, report_id, review_status="pending_review")

    with TestClient(app) as client:
        # 1. Attempt seal before approval -> 400 Bad Request
        resp_premature = client.post(
            f"/api/reports/{report_id}/seal",
            json={"counselName": "Elena Rostova"},
        )
        assert resp_premature.status_code == 400
        assert "has not been approved by human counsel" in resp_premature.text

        # 2. Approve the report via review endpoint
        resp_approve = client.post(
            f"/api/reports/{report_id}/review",
            json={"action": "approve", "counselName": "Elena Rostova"},
        )
        assert resp_approve.status_code == 200
        assert resp_approve.json().get("eligibleForSealing") is True
        assert resp_approve.json().get("isSealed") is False

        # 3. Seal the report via seal endpoint -> 200 OK
        resp_seal = client.post(
            f"/api/reports/{report_id}/seal",
            json={"counselName": "Elena Rostova", "comments": "Sealed with Hardware Cryptographic Token."},
        )
        assert resp_seal.status_code == 200
        data_seal = resp_seal.json()
        assert data_seal.get("isSealed") is True
        assert len(data_seal.get("blockDigest", "")) == 64
        assert len(data_seal.get("attestationHash", "")) == 64

        # 4. Verify audit chain endpoint
        resp_chain = client.get(f"/api/reports/{report_id}/audit-chain")
        assert resp_chain.status_code == 200
        chain_info = resp_chain.json()
        assert chain_info.get("valid") is True
        assert chain_info.get("chain_length") >= 1
        assert chain_info.get("tip_hash") == data_seal.get("blockDigest")

    print("PASS: test_seal_and_verify_api_endpoints")


if __name__ == "__main__":
    test_canonical_json_determinism()
    test_append_only_audit_chain()
    test_human_approval_safeguard_before_sealing()
    test_tamper_detection_in_audit_chain()
    test_seal_and_verify_api_endpoints()
    print("ALL CRYPTOGRAPHIC PROVENANCE TESTS PASSED SUCCESSFULLY!")
