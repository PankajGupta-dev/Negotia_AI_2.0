"""
Unit & Integration Tests for Negotiation Workspace Endpoints:
    GET  /api/matters/{id}/clauses
    POST /api/matters/{id}/clauses/{clause_id}/conform
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
from app.db.models import AgentVerdictDB, ContractClauseDB, MatterDB
from app.main import app


def setup_module():
    """Initialize test DB."""
    init_db()


def _seed_test_matter_and_clauses(matter_id: str):
    """Seed matter, clause, and verdict records for testing."""
    with SessionLocal() as db:
        # 1. Create Matter
        matter = MatterDB(
            id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            title="Enterprise Cloud Agreement",
            counterparty="SaaS Dynamics Corp",
            type="Enterprise MSA",
            stage="Stage 3 Deliberation",
            status="pending_review",
            arr_value="$4.2M",
            variance_ceiling=0.15,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(matter)

        # 2. Create Clause
        clause_id = f"{matter_id}_clause_11_2"
        clause = ContractClauseDB(
            id=clause_id,
            matter_id=matter_id,
            section="§ 11.2",
            title="Aggregate Liability Cap",
            original_text="Each party aggregate liability shall be limited to 1.0x annual fees.",
            counterparty_text="Party B seeks unlimited liability and uncapped consequential damages.",
            conformed_proposal="Aggregate liability capped at 1.5x annual fees with mutual carve-outs.",
            risk_level="high",
            risk_score=7.8,
            precedent_alignment=92.5,
            status="pending",
            rationale="Bilateral compromise based on Fortune 500 SaaS precedent.",
        )
        db.add(clause)

        # 3. Create Verdict
        verdict = AgentVerdictDB(
            id=f"v_{clause_id}",
            clause_id=clause_id,
            legal_lens="Exceeds standard 1.0x threshold. Risk mitigated via mutual IP carve-out.",
            marketing_lens="Preserves deal velocity on $4.2M ARR. ARR at risk is negligible.",
            nash_equilibrium_clause="Neither party liability shall exceed 1.5x aggregate fees paid.",
            compromise_score=88.0,
            sec_citations=["SEC 10-K Precedent 2024"],
        )
        db.add(verdict)
        db.commit()


def test_get_matter_clauses():
    """Verify GET /api/matters/{id}/clauses returns all required attributes."""
    matter_id = f"TEST-MATTER-GET-{int(time.time())}"
    _seed_test_matter_and_clauses(matter_id)

    with TestClient(app) as client:
        resp = client.get(f"/api/matters/{matter_id}/clauses")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        clauses = resp.json()
        assert len(clauses) >= 1
        c = clauses[0]

        # 1. Clause ID
        assert "clause_11_2" in (c.get("clauseId") or c.get("clause_id"))

        # 2. Original text
        assert "1.0x annual fees" in (c.get("originalText") or c.get("original_text"))

        # 3. Counterparty text
        assert "unlimited liability" in (c.get("counterpartyText") or c.get("counterparty_text"))

        # 4. Diff
        diff = c.get("diff", {})
        assert "insertions" in diff
        assert "deletions" in diff
        assert "summary" in diff
        assert len(diff["insertions"]) > 0

        # 5. Risk
        risk = c.get("risk", {})
        assert risk.get("score") == 7.8
        assert risk.get("level") == "high"

        # 6. Legal verdict
        legal_v = c.get("legalVerdict") or c.get("legal_verdict")
        assert "1.0x threshold" in legal_v

        # 7. Commercial verdict
        comm_v = c.get("commercialVerdict") or c.get("commercial_verdict")
        assert "$4.2M ARR" in comm_v

        # 8. Recommended language
        rec_lang = c.get("recommendedLanguage") or c.get("recommended_language")
        assert "1.5x" in rec_lang

        # 9. Status
        assert c.get("status") == "pending"

    print("PASS: test_get_matter_clauses")


def test_get_matter_clauses_not_found():
    """Verify 404 on non-existent matter."""
    with TestClient(app) as client:
        resp = client.get("/api/matters/NON-EXISTENT-MATTER-999/clauses")
        assert resp.status_code == 404
        assert "not found" in resp.text.lower()

    print("PASS: test_get_matter_clauses_not_found")


def test_conform_clause_persists_and_does_not_approve_matter():
    """
    Verify POST /api/matters/{id}/clauses/{clause_id}/conform:
    - Accepts conformed clause language
    - Persists it to database
    - Status updated to conformed
    - CRITICAL: Does NOT automatically approve or seal the matter (remains pending_review)
    """
    matter_id = f"TEST-MATTER-CONF-{int(time.time())}"
    _seed_test_matter_and_clauses(matter_id)

    conformed_text = "Mutually agreed: Aggregate liability is firmly capped at 1.25x annual contract value."

    with TestClient(app) as client:
        # Test using raw clause id (e.g. clause_11_2)
        resp = client.post(
            f"/api/matters/{matter_id}/clauses/clause_11_2/conform",
            json={
                "conformed_text": conformed_text,
                "rationale": "General Counsel approved compromise during bilateral call.",
            },
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        data = resp.json()
        assert data.get("status") == "conformed"
        assert data.get("conformedProposal") == conformed_text or data.get("conformed_proposal") == conformed_text

        # CRITICAL CONSTRAINT VERIFICATION
        assert data.get("matterStatus") == "pending_review" or data.get("matter_status") == "pending_review"
        assert data.get("isSealed") is False or data.get("is_sealed") is False

        # Verify in DB
        with SessionLocal() as db:
            clause = db.query(ContractClauseDB).filter(
                ContractClauseDB.matter_id == matter_id,
                ContractClauseDB.section == "§ 11.2",
            ).first()
            assert clause is not None
            assert clause.conformed_proposal == conformed_text
            assert clause.status == "conformed"
            assert "bilateral call" in clause.rationale

            # Verify Matter status remains pending_review (UNSEALED)
            matter = db.query(MatterDB).filter(MatterDB.id == matter_id).first()
            assert matter.status == "pending_review"
            assert matter.status != "approved"

    print("PASS: test_conform_clause_persists_and_does_not_approve_matter")


def test_conform_clause_validation_errors():
    """Verify validation on missing text, non-existent matter, and non-existent clause."""
    matter_id = f"TEST-MATTER-ERR-{int(time.time())}"
    _seed_test_matter_and_clauses(matter_id)

    with TestClient(app) as client:
        # Empty text
        resp_empty = client.post(
            f"/api/matters/{matter_id}/clauses/clause_11_2/conform",
            json={"conformed_text": "   "},
        )
        assert resp_empty.status_code == 400

        # Non-existent clause
        resp_bad_c = client.post(
            f"/api/matters/{matter_id}/clauses/clause_99_9/conform",
            json={"conformed_text": "Some text"},
        )
        assert resp_bad_c.status_code == 404

        # Non-existent matter
        resp_bad_m = client.post(
            "/api/matters/NON-EXISTENT-MATTER/clauses/clause_11_2/conform",
            json={"conformed_text": "Some text"},
        )
        assert resp_bad_m.status_code == 404

    print("PASS: test_conform_clause_validation_errors")


if __name__ == "__main__":
    test_get_matter_clauses()
    test_get_matter_clauses_not_found()
    test_conform_clause_persists_and_does_not_approve_matter()
    test_conform_clause_validation_errors()
    print("ALL NEGOTIATION WORKSPACE TESTS PASSED SUCCESSFULLY!")
