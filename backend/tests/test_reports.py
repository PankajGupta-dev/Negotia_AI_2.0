"""
Unit & Integration Tests for Report Endpoints:
    GET  /api/reports/{id}
    POST /api/reports/{id}/review
"""

from datetime import datetime
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


def setup_module():
    """Initialize DB tables."""
    init_db()


def _seed_report_test_data(matter_id: str, report_id: str):
    """Seed comprehensive report, clause, verdict, and audit trail data."""
    with SessionLocal() as db:
        # 1. Matter
        matter = MatterDB(
            id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            title="Enterprise Cloud MSA",
            counterparty="Starlight Systems Inc.",
            type="Enterprise MSA",
            stage="Stage 4 Concluded — Pending Human Review",
            status="pending_review",
            arr_value="$4.2M",
            variance_ceiling=0.15,
            lead_counsel="Elena Rostova",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(matter)

        # 2. Clause
        clause_id = f"{matter_id}_clause_11_2"
        clause = ContractClauseDB(
            id=clause_id,
            matter_id=matter_id,
            section="§ 11.2",
            title="Liability Cap",
            original_text="1.0x annual fees cap.",
            counterparty_text="Unlimited liability.",
            conformed_proposal="1.5x annual fees with mutual IP carve-outs.",
            risk_level="high",
            risk_score=7.2,
            precedent_alignment=94.0,
            status="agreed",
            rationale="Nash equilibrium candidate agreed.",
        )
        db.add(clause)

        # 3. Verdict
        verdict = AgentVerdictDB(
            id=f"v_{clause_id}",
            clause_id=clause_id,
            legal_lens="Liability exposure capped within corporate policy limits.",
            marketing_lens="High strategic relationship score; $4.2M ARR protected.",
            nash_equilibrium_clause="1.5x annual fees with mutual IP carve-outs.",
            compromise_score=94.0,
            sec_citations=["SEC Form 10-K Precedents 2024"],
        )
        db.add(verdict)

        # 4. Report
        report = ReportDB(
            id=report_id,
            matter_id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            executive_summary=(
                "Negotia AI autonomous orchestration successfully deliberated across all contested terms. "
                "Bilateral equilibrium was reached on Section 11.2 (Liability Cap) at 1.5x fees. "
                "Legal exposure was reduced by 64% while protecting $4.2M in annual recurring revenue. "
                "Dossier is complete and awaiting General Counsel review."
            ),
            agreed_clauses_count=1,
            contested_clauses_count=0,
            counsel_cost_saved=28500.0,
            turnaround_time_minutes=18.0,
            review_status="pending_review",
            attestation_hash=None,
            block_digest=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(report)

        # 5. Audit Record
        audit_rec = AuditRecordDB(
            id=f"aud_{matter_id}",
            matter_id=matter_id,
            report_id=report_id,
            timestamp=datetime.utcnow(),
            actor="Scrivener-4",
            action="audit_trail_anchored",
            details="Canonical deliberation trail finalized.",
            sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            previous_hash="0000000000000000000000000000000000000000000000000000000000000000",
        )
        db.add(audit_rec)

        db.commit()


def test_get_report_by_report_id_and_matter_id():
    """Verify GET /api/reports/{id} returns executive summary, clauses, verdicts, metrics, status, and audit digest."""
    matter_id = f"TEST-MATTER-REP-{int(time.time())}"
    report_id = f"rep_{matter_id}"
    _seed_report_test_data(matter_id, report_id)

    with TestClient(app) as client:
        # 1. Fetch by report ID
        resp1 = client.get(f"/api/reports/{report_id}")
        assert resp1.status_code == 200, f"Expected 200, got {resp1.status_code}: {resp1.text}"

        data = resp1.json()

        # Executive summary
        assert "Negotia AI autonomous orchestration" in data.get("executiveSummary", "")

        # Settled clauses
        clauses = data.get("settledClauses", [])
        assert len(clauses) >= 1
        assert "clause_11_2" in (clauses[0].get("clauseId") or clauses[0].get("clause_id"))
        assert clauses[0].get("status") == "agreed"

        # Verdicts
        verdicts = data.get("verdicts", [])
        assert len(verdicts) >= 1
        assert "Liability exposure capped" in verdicts[0].get("legalVerdict", "")
        assert "$4.2M ARR" in verdicts[0].get("commercialVerdict", "")

        # Metrics
        metrics = data.get("metrics", {})
        assert metrics.get("counselCostSaved") == 28500.0 or metrics.get("counsel_cost_saved") == 28500.0
        assert metrics.get("turnaroundTimeMinutes") == 18.0 or metrics.get("turnaround_time_minutes") == 18.0

        # Review status
        assert data.get("reviewStatus") == "pending_review" or data.get("review_status") == "pending_review"

        # Audit digest
        assert data.get("auditDigest") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

        # Safeguard: not sealed yet
        assert data.get("isSealed") is False
        assert data.get("eligibleForSealing") is False

        # 2. Fetch by matter ID
        resp2 = client.get(f"/api/reports/{matter_id}")
        assert resp2.status_code == 200
        assert resp2.json().get("reportId") == report_id

    print("PASS: test_get_report_by_report_id_and_matter_id")


def test_get_report_not_found():
    """Verify 404 when report or matter is not found."""
    with TestClient(app) as client:
        resp = client.get("/api/reports/NON-EXISTENT-REPORT-ID")
        assert resp.status_code == 404
        assert "not found" in resp.text.lower()

    print("PASS: test_get_report_not_found")


def test_review_action_approve():
    """
    Verify POST /api/reports/{id}/review with action='approve':
    - review_status becomes 'approved'
    - matter.status becomes 'approved'
    - eligible_for_sealing becomes True
    - is_sealed remains False (do NOT seal before approve)
    - ReviewActionDB record persisted
    """
    matter_id = f"TEST-MATTER-APP-{int(time.time())}"
    report_id = f"rep_{matter_id}"
    _seed_report_test_data(matter_id, report_id)

    with TestClient(app) as client:
        resp = client.post(
            f"/api/reports/{report_id}/review",
            json={
                "action": "approve",
                "counselName": "General Counsel Marcus Vance",
                "comments": "Commercial and legal compromises are acceptable. Ready for sealing.",
            },
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        data = resp.json()
        assert data.get("reviewStatus") == "approved" or data.get("review_status") == "approved"
        assert data.get("matterStatus") == "approved" or data.get("matter_status") == "approved"
        assert data.get("eligibleForSealing") is True or data.get("eligible_for_sealing") is True

        # CRITICAL CONSTRAINT: Must NOT be sealed yet!
        assert data.get("isSealed") is False or data.get("is_sealed") is False

        # Check in DB
        with SessionLocal() as db:
            rep = db.query(ReportDB).filter(ReportDB.id == report_id).first()
            assert rep.review_status == "approved"
            assert rep.attestation_hash is None
            assert rep.block_digest is None

            mat = db.query(MatterDB).filter(MatterDB.id == matter_id).first()
            assert mat.status == "approved"
            assert mat.lead_counsel == "General Counsel Marcus Vance"

            revs = db.query(ReviewActionDB).filter(ReviewActionDB.report_id == report_id).all()
            assert len(revs) == 1
            assert revs[0].action == "approve"
            assert revs[0].counsel_name == "General Counsel Marcus Vance"

    print("PASS: test_review_action_approve")


def test_review_action_request_revision():
    """
    Verify POST /api/reports/{id}/review with action='request_revision':
    - review_status becomes 'revision_requested'
    - matter.status becomes 'revision_requested'
    - eligible_for_sealing is False
    """
    matter_id = f"TEST-MATTER-REV-{int(time.time())}"
    report_id = f"rep_{matter_id}"
    _seed_report_test_data(matter_id, report_id)

    with TestClient(app) as client:
        resp = client.post(
            f"/api/reports/{report_id}/review",
            json={
                "action": "request_revision",
                "counselName": "Senior Counsel Sarah Jenkins",
                "comments": "Liability cap must not exceed 1.25x annual fees.",
            },
        )
        assert resp.status_code == 200

        data = resp.json()
        assert data.get("reviewStatus") == "revision_requested" or data.get("review_status") == "revision_requested"
        assert data.get("matterStatus") == "revision_requested" or data.get("matter_status") == "revision_requested"
        assert data.get("eligibleForSealing") is False or data.get("eligible_for_sealing") is False
        assert data.get("isSealed") is False

        with SessionLocal() as db:
            rep = db.query(ReportDB).filter(ReportDB.id == report_id).first()
            assert rep.review_status == "revision_requested"

    print("PASS: test_review_action_request_revision")


def test_review_action_escalate():
    """
    Verify POST /api/reports/{id}/review with action='escalate':
    - review_status becomes 'escalated'
    - matter.status becomes 'escalated'
    - eligible_for_sealing is False
    """
    matter_id = f"TEST-MATTER-ESC-{int(time.time())}"
    report_id = f"rep_{matter_id}"
    _seed_report_test_data(matter_id, report_id)

    with TestClient(app) as client:
        resp = client.post(
            f"/api/reports/{report_id}/review",
            json={
                "action": "escalate",
                "counselName": "Associate Counsel David Ross",
                "comments": "Counterparty insists on unlimited consequential damages. Escalating to CFO.",
            },
        )
        assert resp.status_code == 200

        data = resp.json()
        assert data.get("reviewStatus") == "escalated" or data.get("review_status") == "escalated"
        assert data.get("matterStatus") == "escalated" or data.get("matter_status") == "escalated"
        assert data.get("eligibleForSealing") is False
        assert data.get("isSealed") is False

        with SessionLocal() as db:
            rep = db.query(ReportDB).filter(ReportDB.id == report_id).first()
            assert rep.review_status == "escalated"

    print("PASS: test_review_action_escalate")


def test_review_validation_errors():
    """Verify validation on missing counsel name, invalid action, and non-existent report."""
    matter_id = f"TEST-MATTER-ERR-{int(time.time())}"
    report_id = f"rep_{matter_id}"
    _seed_report_test_data(matter_id, report_id)

    with TestClient(app) as client:
        # Invalid action
        resp1 = client.post(
            f"/api/reports/{report_id}/review",
            json={"action": "sign_and_seal", "counselName": "Lawyer"},
        )
        assert resp1.status_code == 400
        assert "Invalid review action" in resp1.text

        # Missing counsel name
        resp2 = client.post(
            f"/api/reports/{report_id}/review",
            json={"action": "approve", "counselName": "   "},
        )
        assert resp2.status_code == 400

        # Non-existent report
        resp3 = client.post(
            "/api/reports/NON-EXISTENT-REPORT/review",
            json={"action": "approve", "counselName": "Lawyer"},
        )
        assert resp3.status_code == 404

    print("PASS: test_review_validation_errors")


if __name__ == "__main__":
    test_get_report_by_report_id_and_matter_id()
    test_get_report_not_found()
    test_review_action_approve()
    test_review_action_request_revision()
    test_review_action_escalate()
    test_review_validation_errors()
    print("ALL REPORT API TESTS PASSED SUCCESSFULLY!")
