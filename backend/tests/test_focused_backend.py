"""
Comprehensive Focused Backend Test Suite for Negotia AI.

Covers:
  1. /health endpoint
  2. Matter creation (service layer & API ingestion)
  3. PDF / DOCX / TXT document extraction
  4. Clause segmentation & heading parsing
  5. Deterministic word-level redline diffing
  6. Risk scoring & multi-factor utility evaluation (LLMs mocked)
  7. Pipeline state transitions & event tracking
  8. Cryptographic SHA-256 hashing & canonical JSON determinism
  9. Human review rules (approve, request_revision, escalate, validation)
 10. Human approval strictly required before cryptographic sealing

Constraints:
  - Zero direct external LLM network calls (deterministic / mocked)
  - Blazing fast execution (~1-2 seconds total)
"""

from __future__ import annotations

from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict
from unittest.mock import MagicMock, patch
import uuid

# Ensure backend root is on sys.path
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
_REPO_ROOT = os.path.abspath(os.path.join(_BACKEND_DIR, ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

import docx
from fastapi.testclient import TestClient
from pypdf import PdfWriter
import pytest

from app.agents.agent2_ingestor_b import (
    Agent2LexIngestorB,
    _aggression_score,
    _classify_diff_category,
    _diff_magnitude_score,
    _keyword_hit_score,
)
from app.db.database import SessionLocal, init_db
from app.db.models import (
    AgentRunDB,
    AgentVerdictDB,
    AuditRecordDB,
    ContractClauseDB,
    MatterDB,
    ReportDB,
    ReviewActionDB,
)
from app.main import app
from app.models.agent import AgentStatus
from app.models.report import ReviewActionType, ReviewStatus
from app.parsers import extract_document, parse_clauses, parse_docx, parse_pdf, parse_txt
from app.parsers.clause_parser import _extract_heading_parts
from app.routers.negotiations import _compute_word_diff
from app.services.audit_service import (
    GENESIS_HASH,
    AuditService,
    calculate_sha256,
    serialize_canonical_json,
)
from app.services.matter_service import create_matter, get_matter
from app.services.negotiation_engine import (
    ClauseNegotiationInput,
    CompromiseStrategy,
    NegotiationConfig,
    score_negotiation,
)
from app.services.state_service import (
    get_pipeline_state,
    store_agent_run,
    store_agent_status,
    store_pipeline_event,
)


@pytest.fixture(autouse=True)
def init_test_database():
    """Ensure DB tables are initialized before each test session."""
    init_db()


# ═════════════════════════════════════════════════════════════════════════════
# 1. Test /health Endpoint
# ═════════════════════════════════════════════════════════════════════════════

def test_health_check_endpoint():
    """Verify GET /health returns 200 OK and healthy status structure."""
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "Negotia AI" in data["service"]
        assert "version" in data


# ═════════════════════════════════════════════════════════════════════════════
# 2. Test Matter Creation (Service Layer & API Ingestion)
# ═════════════════════════════════════════════════════════════════════════════

def test_matter_creation_service():
    """Verify matter creation via matter_service persists all required docket attributes."""
    unique_id = f"MATTER-SRV-{uuid.uuid4().hex[:6]}"
    with SessionLocal() as db:
        matter = create_matter(
            db=db,
            matter_id=unique_id,
            title="Enterprise Cloud Services Agreement",
            counterparty="Apex Dynamics Corp.",
            type="Enterprise MSA",
            arr_value="$4.2M ARR",
            variance_ceiling=18.5,
            lead_counsel="Elena Rostova",
        )
        assert matter.id == unique_id
        assert matter.docket_number == f"DOCKET #{unique_id}"
        assert matter.counterparty == "Apex Dynamics Corp."
        assert matter.status == "active"
        assert matter.arr_value == "$4.2M ARR"

        fetched = get_matter(db, unique_id)
        assert fetched is not None
        assert fetched.title == "Enterprise Cloud Services Agreement"


def test_matter_creation_via_api_ingest():
    """Verify POST /api/contracts/ingest initiates matter and schedules deliberation."""
    unique_id = f"MATTER-INGEST-{uuid.uuid4().hex[:6]}"
    with TestClient(app) as client:
        with patch("app.routers.contracts._execute_pipeline_in_background") as mock_pipeline:
            mock_pipeline.return_value = None
            response = client.post(
                "/api/contracts/ingest",
                data={
                    "matter_id": unique_id,
                    "title": "Master Services Agreement 2026",
                    "counterparty": "Veloce Systems",
                    "arr_value": "$2.5M",
                    "variance_ceiling": "20.0",
                },
                files={
                    "file_a": ("party_a.txt", b"Section 1. Baseline contract language.", "text/plain"),
                    "file_b": ("party_b.txt", b"Section 1. Counterparty redline language.", "text/plain"),
                },
            )
            assert response.status_code == 201
            data = response.json()
            assert data["matterId"] == unique_id
            assert data["status"] == "ingested"
            assert f"/api/pipeline/stream/{unique_id}" in data["pipelineUrl"]


# ═════════════════════════════════════════════════════════════════════════════
# 3. Test PDF/DOCX/TXT Document Extraction
# ═════════════════════════════════════════════════════════════════════════════

def test_docx_document_extraction(tmp_path: Path):
    """Verify parse_docx correctly extracts paragraphs and table text from DOCX files."""
    docx_file = tmp_path / "sample_contract.docx"
    doc = docx.Document()
    doc.add_heading("Master Services Agreement", level=1)
    doc.add_paragraph("Section 11.2 Limitation of Liability: Aggregate liability capped at 12 months fees.")
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Party A"
    table.rows[0].cells[1].text = "Party B"
    doc.save(docx_file)

    parsed = parse_docx(docx_file)
    assert parsed["file_type"] == "docx"
    assert parsed["filename"] == "sample_contract.docx"
    assert "Limitation of Liability" in parsed["text"]
    assert "Party A | Party B" in parsed["text"]
    assert len(parsed["paragraphs"]) >= 2
    assert parsed["metadata"]["char_count"] > 0


def test_pdf_document_extraction(tmp_path: Path):
    """Verify parse_pdf extracts pages and metadata from standard PDF files."""
    pdf_file = tmp_path / "sample_contract.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    with open(pdf_file, "wb") as f:
        writer.write(f)

    parsed = parse_pdf(pdf_file)
    assert parsed["file_type"] == "pdf"
    assert parsed["filename"] == "sample_contract.pdf"
    assert parsed["metadata"]["page_count"] == 1


def test_txt_document_extraction(tmp_path: Path):
    """Verify parse_txt and extract_document dispatch correctly on raw text files."""
    txt_file = tmp_path / "baseline.txt"
    txt_file.write_text("ARTICLE 1. DEFINITIONS\n\nSection 1.1 Scope of Services.", encoding="utf-8")

    parsed = extract_document(txt_file)
    assert parsed["file_type"] == "txt"
    assert "ARTICLE 1. DEFINITIONS" in parsed["text"]
    assert len(parsed["paragraphs"]) == 2


# ═════════════════════════════════════════════════════════════════════════════
# 4. Test Clause Segmentation & Heading Parsing
# ═════════════════════════════════════════════════════════════════════════════

def test_heading_extraction_patterns():
    """Verify _extract_heading_parts identifies varied legal clause heading structures."""
    # Pattern 1: Section / Article symbol
    h1 = _extract_heading_parts("§ 11.2 Limitation of Liability. Neither party shall be liable...")
    assert h1 is not None
    sec_num, title, body = h1
    assert "11.2" in sec_num
    assert "Limitation of Liability" in title

    # Pattern 2: Standard numbered section
    h2 = _extract_heading_parts("14.1 Intellectual Property Rights")
    assert h2 is not None
    assert h2[0] == "14.1"
    assert "Intellectual Property Rights" in h2[1]

    # Pattern 3: Subsections
    h3 = _extract_heading_parts("(a) Consequential Damages Carve-Out")
    assert h3 is not None
    assert h3[0] == "(a)"


def test_clause_segmentation_pipeline():
    """Verify parse_clauses segments contract text into distinct traceable clause entities."""
    contract_text = (
        "CONFIDENTIAL COMMERCIAL AGREEMENT\n\n"
        "Recitals: The parties hereby agree to enter into this MSA.\n\n"
        "§ 11.2 Limitation of Liability\n"
        "Each party's aggregate liability shall be strictly limited to 1.0x annual fees paid.\n\n"
        "§ 14.1 Intellectual Property Ownership\n"
        "Customer retains all right, title, and interest in Customer Data. Provider owns the Platform."
    )

    clauses = parse_clauses(contract_text)
    assert len(clauses) >= 2

    liability_clause = next((c for c in clauses if "11_2" in c["clause_id"] or "11.2" in c["section_number"]), None)
    assert liability_clause is not None
    assert "1.0x annual fees" in liability_clause["text"]
    assert liability_clause["source_location"]["paragraph_index"] is not None

    ip_clause = next((c for c in clauses if "14_1" in c["clause_id"] or "14.1" in c["section_number"]), None)
    assert ip_clause is not None
    assert "Customer Data" in ip_clause["text"]


# ═════════════════════════════════════════════════════════════════════════════
# 5. Test Deterministic Redline Diff
# ═════════════════════════════════════════════════════════════════════════════

def test_deterministic_word_redline_diff():
    """Verify _compute_word_diff calculates precise additions, deletions, and markup text."""
    original = "Liability shall be capped at twelve (12) months of fees paid."
    counterparty = "Liability shall be uncapped for data breaches and capped at twelve (12) months of fees."

    diff = _compute_word_diff(original, counterparty)

    assert "uncapped for data breaches" in " ".join(diff.insertions)
    assert "paid." in " ".join(diff.deletions)
    assert "+2 additions" in diff.summary or "additions" in diff.summary
    assert "[+uncapped+]" in diff.diff_text or "[+" in diff.diff_text
    assert "[-paid.-]" in diff.diff_text or "[-" in diff.diff_text


def test_identical_texts_redline_diff():
    """Verify identical original and counterparty texts yield zero additions/deletions."""
    text = "Undisputed invoices are payable net thirty (30) days from invoice date."
    diff = _compute_word_diff(text, text)
    assert len(diff.insertions) == 0
    assert len(diff.deletions) == 0
    assert diff.diff_text == text


# ═════════════════════════════════════════════════════════════════════════════
# 6. Test Risk Scoring & Utility Optimization (LLM Mocked)
# ═════════════════════════════════════════════════════════════════════════════

def test_deterministic_risk_scoring_heuristics():
    """Verify keyword and aggression heuristics properly flag high-risk clause shifts."""
    # 1. Keyword scoring
    uncapped_text = "Provider total aggregate liability shall be uncapped and subject to unlimited indemnification."
    score, hits = _keyword_hit_score(uncapped_text, ["uncapped", "unlimited indemnification"])
    assert score > 0
    assert "uncapped" in hits

    # 2. Aggression pattern scoring
    aggressive_text = "Notwithstanding anything to the contrary, Customer deletes entire section and claims sole discretion."
    agg_score, agg_hits = _aggression_score(aggressive_text)
    assert agg_score >= 2.0
    assert len(agg_hits) >= 1

    # 3. Diff magnitude score
    mag_score = _diff_magnitude_score(["added clause body"], ["deleted limitation cap"])
    assert mag_score > 0.0

    # 4. Category classification
    cat = _classify_diff_category("Liability Clause", "Each party's aggregate liability cap")
    assert cat == "liability"


def test_agent2_comparative_risk_scoring_without_llm():
    """Verify Agent 2 (Seller Redline Auditor) scores clause risks deterministically without external LLM."""
    agent = Agent2LexIngestorB()

    diffs = [
        {
            "clause_id": "clause_11_2",
            "section": "§ 11.2",
            "title": "Limitation of Liability",
            "baseline_text": "Liability is capped at 1.0x annual fees.",
            "markup_text": "Liability shall be uncapped and subject to unlimited consequential damages.",
            "insertions": ["uncapped", "unlimited consequential damages"],
            "deletions": ["capped at 1.0x annual fees"],
        }
    ]

    output = agent.run(
        diffs=diffs,
        party_a_clauses=[{"clause_id": "clause_11_2", "title": "Limitation of Liability"}],
        party_b_clauses=[{"clause_id": "clause_11_2", "title": "Limitation of Liability"}],
        matter_id="TEST-MATTER-RISK",
    )

    assert output.total_findings >= 1
    assert output.overall_risk_score > 0.0
    assert len(output.clause_risk_profiles) == 1
    profile = output.clause_risk_profiles[0]
    assert profile.composite_risk_score >= 3.0
    assert profile.is_aggressive_deviation is True
    assert profile.category == "liability"


def test_negotiation_engine_pareto_utility_scoring():
    """Verify negotiation engine calculates utility, Pareto frontier, and compromise scores."""
    clause_input = ClauseNegotiationInput(
        clause_id="clause_8_3",
        section_number="§ 8.3",
        title="Payment Terms",
        category="payment",
        party_a_text="Payment net 30 days.",
        party_b_text="Payment net 90 days with 50% withholding.",
        risk_score=6.5,
        is_party_a_non_negotiable=False,
    )

    engine_out = score_negotiation(
        clauses=[clause_input],
        config=NegotiationConfig(variance_ceiling=25.0),
    )

    assert len(engine_out.clause_results) == 1
    result = engine_out.clause_results[0]
    assert len(result.candidates) >= 3
    assert result.recommended is not None
    assert result.recommended.compromise_score > 0.0
    assert result.recommended.is_pareto_efficient is True
    assert len(result.pareto_frontier) >= 1


# ═════════════════════════════════════════════════════════════════════════════
# 7. Test Pipeline State Transitions
# ═════════════════════════════════════════════════════════════════════════════

def test_pipeline_state_transitions():
    """Verify agent runs and pipeline states transition cleanly through IDLE -> RUNNING -> COMPLETE."""
    matter_id = f"MATTER-STATE-{uuid.uuid4().hex[:6]}"

    with SessionLocal() as db:
        # Create baseline matter
        create_matter(
            db=db,
            title="State Transition Test MSA",
            counterparty="Party B Corp",
            matter_id=matter_id,
        )

        # 1. Create agent run in IDLE state
        run = store_agent_run(
            db=db,
            matter_id=matter_id,
            agent_id="a1",
            agent_name="Buyer Legal Analyst",
            technical_name="Lex-Ingestor A",
            status=AgentStatus.IDLE,
        )
        assert run.status == AgentStatus.IDLE.value
        assert run.started_at is None

        # 2. Transition to RUNNING
        updated_run = store_agent_status(
            db=db,
            matter_id=matter_id,
            agent_id="a1",
            status=AgentStatus.RUNNING,
            new_thought="Parsing baseline clauses...",
        )
        assert updated_run.status == AgentStatus.RUNNING.value
        assert updated_run.started_at is not None
        assert "Parsing baseline clauses..." in updated_run.thoughts

        # 3. Transition to COMPLETE with result payload
        final_run = store_agent_status(
            db=db,
            matter_id=matter_id,
            agent_id="a1",
            status=AgentStatus.COMPLETE,
            new_thought="Ingestion complete. Extracted 4 clauses.",
            result={"clauses_extracted": 4},
        )
        assert final_run.status == AgentStatus.COMPLETE.value
        assert final_run.completed_at is not None
        assert final_run.result["clauses_extracted"] == 4

        # 4. Check global pipeline snapshot
        state = get_pipeline_state(db=db, matter_id=matter_id)
        assert state["matterId"] == matter_id
        assert len(state["agentRuns"]) >= 1
        assert state["agentRuns"][0]["status"] == "complete"


# ═════════════════════════════════════════════════════════════════════════════
# 8. Test SHA-256 Hashing & Canonical JSON Determinism
# ═════════════════════════════════════════════════════════════════════════════

def test_canonical_json_determinism_and_hashing():
    """Verify serialize_canonical_json eliminates key order and formatting differences."""
    payload_a = {"title": "MSA", "risk": 7.5, "approved": True, "clauses": ["11.2", "14.1"]}
    payload_b = {"clauses": ["11.2", "14.1"], "approved": True, "risk": 7.5, "title": "MSA"}

    json_a = serialize_canonical_json(payload_a)
    json_b = serialize_canonical_json(payload_b)
    assert json_a == json_b

    hash_a = calculate_sha256(json_a)
    hash_b = calculate_sha256(json_b)
    assert hash_a == hash_b
    assert len(hash_a) == 64
    assert hash_a.islower()


def test_genesis_block_and_hash_chain_linkage():
    """Verify genesis block links to 64-zero GENESIS_HASH and subsequent block links correctly."""
    matter_id = f"MATTER-HASH-{uuid.uuid4().hex[:6]}"
    with SessionLocal() as db:
        create_matter(
            db=db,
            title="Cryptographic Hash Test MSA",
            counterparty="Party B Corp",
            matter_id=matter_id,
        )

        # 1. Genesis-linked block (links to 64-zero GENESIS_HASH)
        block_1 = AuditService.append_audit_block(
            db=db,
            matter_id=matter_id,
            report_id=None,
            actor="System",
            action="matter_ingested",
            canonical_payload={"parties": ["Party A", "Party B"], "docket_number": f"DOCKET #{matter_id}"},
        )
        assert block_1.previous_hash == GENESIS_HASH
        assert len(block_1.sha256_hash) == 64

        # 2. Sequential block
        block_2 = AuditService.append_audit_block(
            db=db,
            matter_id=matter_id,
            report_id=None,
            actor="Lex-Ingestor B",
            action="redline_audited",
            canonical_payload={"risk_score": 6.8},
        )
        assert block_2.previous_hash == block_1.sha256_hash
        assert block_2.sha256_hash != block_1.sha256_hash

        # 3. Chain verification
        verification = AuditService.verify_audit_chain(db, matter_id)
        assert verification["valid"] is True
        assert verification["chain_length"] == 2
        assert verification["tip_hash"] == block_2.sha256_hash


# ═════════════════════════════════════════════════════════════════════════════
# 9. Test Human Review Rules (Approve, Request Revision, Escalate)
# ═════════════════════════════════════════════════════════════════════════

def _seed_report_for_review_tests(matter_id: str, report_id: str):
    """Seed matter and draft executive report for review testing."""
    with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        matter = MatterDB(
            id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            title="SaaS Enterprise Agreement",
            counterparty="Apex Dynamics",
            type="Enterprise MSA",
            stage="Stage 4 Sign-off",
            status="pending_review",
            arr_value="$4.2M",
            lead_counsel="Elena Rostova",
            created_at=now,
            updated_at=now,
        )
        db.add(matter)

        report = ReportDB(
            id=report_id,
            matter_id=matter_id,
            docket_number=f"DOCKET #{matter_id}",
            executive_summary="All 4 clauses converged at Nash equilibrium.",
            review_status="pending_review",
            created_at=now,
            updated_at=now,
        )
        db.add(report)
        db.commit()


def test_human_review_actions_and_validation():
    """Verify POST /api/reports/{id}/review handles approve, request_revision, escalate, and enforces validation."""
    matter_id = f"MATTER-REV-{uuid.uuid4().hex[:6]}"
    report_id = f"rep_{matter_id}"
    _seed_report_for_review_tests(matter_id, report_id)

    with TestClient(app) as client:
        # 1. Action: request_revision
        res_rev = client.post(
            f"/api/reports/{report_id}/review",
            json={"action": "request_revision", "counselName": "Elena Rostova", "comments": "Tighten indemnity cap."},
        )
        assert res_rev.status_code == 200
        assert res_rev.json()["reviewStatus"] == "revision_requested"
        assert res_rev.json()["eligibleForSealing"] is False

        # 2. Action: escalate
        res_esc = client.post(
            f"/api/reports/{report_id}/review",
            json={"action": "escalate", "counselName": "Elena Rostova", "comments": "Escalate liability terms."},
        )
        assert res_esc.status_code == 200
        assert res_esc.json()["reviewStatus"] == "escalated"
        assert res_esc.json()["eligibleForSealing"] is False

        # 3. Action: approve
        res_app = client.post(
            f"/api/reports/{report_id}/review",
            json={"action": "approve", "counselName": "Elena Rostova", "comments": "Approved for execution."},
        )
        assert res_app.status_code == 200
        assert res_app.json()["reviewStatus"] == "approved"
        assert res_app.json()["eligibleForSealing"] is True
        assert res_app.json()["isSealed"] is False  # MUST NOT seal on approval

        # 4. Validation errors: invalid action
        res_bad = client.post(
            f"/api/reports/{report_id}/review",
            json={"action": "unauthorized_action", "counselName": "Elena Rostova"},
        )
        assert res_bad.status_code == 400
        assert "Invalid review action" in res_bad.text

        # 5. Validation errors: missing counsel name
        res_no_counsel = client.post(
            f"/api/reports/{report_id}/review",
            json={"action": "approve"},
        )
        assert res_no_counsel.status_code == 400


# ═════════════════════════════════════════════════════════════════════════════
# 10. Test Approval Strictly Required Before Seal
# ═════════════════════════════════════════════════════════════════════════════

def test_approval_strictly_required_before_cryptographic_seal():
    """
    CRITICAL SECURITY & GOVERNANCE INVARIANT:
    Sealing MUST fail if human counsel has not explicitly approved the report first.
    Once approved, sealing succeeds and produces immutable SHA-256 block digests.
    """
    matter_id = f"MATTER-SEAL-{uuid.uuid4().hex[:6]}"
    report_id = f"rep_{matter_id}"
    _seed_report_for_review_tests(matter_id, report_id)

    with TestClient(app) as client:
        # 1. Attempt seal while review_status is 'pending_review' -> MUST FAIL with 400
        res_premature = client.post(
            f"/api/reports/{report_id}/seal",
            json={"counselName": "Elena Rostova"},
        )
        assert res_premature.status_code == 400
        assert "has not been approved by human counsel" in res_premature.text

        # 2. Verify in DB that report remains unsealed
        with SessionLocal() as db:
            rep = db.query(ReportDB).filter(ReportDB.id == report_id).first()
            assert rep.block_digest is None
            assert rep.attestation_hash is None

        # 3. Explicitly approve report
        res_approve = client.post(
            f"/api/reports/{report_id}/review",
            json={"action": "approve", "counselName": "Elena Rostova"},
        )
        assert res_approve.status_code == 200
        assert res_approve.json()["reviewStatus"] == "approved"

        # 4. Now execute seal -> MUST SUCCEED with 200
        res_seal = client.post(
            f"/api/reports/{report_id}/seal",
            json={"counselName": "Elena Rostova", "comments": "Hardware FIDO2 token verified."},
        )
        assert res_seal.status_code == 200
        seal_data = res_seal.json()
        assert seal_data["isSealed"] is True
        assert len(seal_data["blockDigest"]) == 64
        assert len(seal_data["attestationHash"]) == 64

        # 5. Verify DB record reflects sealed state
        with SessionLocal() as db:
            rep_sealed = db.query(ReportDB).filter(ReportDB.id == report_id).first()
            assert rep_sealed.block_digest == seal_data["blockDigest"]
            assert rep_sealed.attestation_hash == seal_data["attestationHash"]

            mat_sealed = db.query(MatterDB).filter(MatterDB.id == matter_id).first()
            assert mat_sealed.status == "sealed"
            assert mat_sealed.stage == "Cryptographically Sealed & Ratified"

        # 6. Verify audit chain verification endpoint passes
        res_chain = client.get(f"/api/reports/{report_id}/audit-chain")
        assert res_chain.status_code == 200
        assert res_chain.json()["valid"] is True
        assert res_chain.json()["tip_hash"] == seal_data["blockDigest"]

        # 7. Attempting to seal AGAIN must fail
        res_reseal = client.post(
            f"/api/reports/{report_id}/seal",
            json={"counselName": "Elena Rostova"},
        )
        assert res_reseal.status_code == 400
        assert "already cryptographically sealed" in res_reseal.text
