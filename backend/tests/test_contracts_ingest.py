"""
Unit & Integration Tests for POST /api/contracts/ingest Endpoint.
"""

import io
import os
from pathlib import Path
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
from app.config import settings
from app.db.database import SessionLocal, init_db
from app.db.models import ContractDocumentDB, MatterDB
from app.main import app


def setup_module():
    """Ensure DB tables are initialized."""
    init_db()


def test_successful_contract_ingest():
    """Verify multipart upload creates matter, saves files, returns required schema, and runs asynchronously."""
    matter_id = f"TEST-INGEST-{int(time.time())}"

    file_a_content = (
        b"11.2 Liability Cap\nEach party aggregate liability is limited to 1.0x annual fees.\n\n"
        b"4.3 Payment Terms\nPayment due Net 30 days from invoice."
    )
    file_b_content = (
        b"11.2 Liability Cap\nParty B disclaims all caps and seeks 3.0x fees.\n\n"
        b"4.3 Payment Terms\nPayment due Net 60 days from invoice."
    )

    with TestClient(app) as client:
        start_t = time.time()
        response = client.post(
            "/api/contracts/ingest",
            data={
                "matter_id": matter_id,
                "arr_value": "$5.5M",
                "variance_ceiling": "0.12",
                "title": "Cloud Services MSA",
                "counterparty": "Apex Global Inc.",
            },
            files={
                "file_a": ("baseline_msa.txt", io.BytesIO(file_a_content), "text/plain"),
                "file_b": ("markup_msa.docx", io.BytesIO(file_b_content), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            },
        )
        elapsed = time.time() - start_t

        # 1. Non-blocking check: Response returned fast
        assert elapsed < 3.0, f"Endpoint took too long ({elapsed:.2f}s); expected non-blocking execution"

        # 2. Check HTTP status code
        assert response.status_code == 201, f"Expected 201 Created, got {response.status_code}: {response.text}"

        # 3. Check JSON response structure
        data = response.json()
        assert data.get("matterId") == matter_id or data.get("matter_id") == matter_id
        assert data.get("status") == "ingested"
        assert data.get("pipelineUrl") == f"/api/pipeline/stream/{matter_id}"

        # 4. Check DB persistence
        with SessionLocal() as db:
            matter = db.query(MatterDB).filter(MatterDB.id == matter_id).first()
            assert matter is not None
            assert matter.arr_value == "$5.5M"
            assert matter.variance_ceiling == 0.12
            assert matter.counterparty == "Apex Global Inc."

            docs = db.query(ContractDocumentDB).filter(ContractDocumentDB.matter_id == matter_id).all()
            assert len(docs) == 2
            parties = {d.party for d in docs}
            assert "party_a" in parties
            assert "party_b" in parties

            # 5. Check secure file storage on disk
            for d in docs:
                assert d.file_path is not None
                assert Path(d.file_path).exists()
                assert Path(d.file_path).stat().st_size > 0

    print("PASS: test_successful_contract_ingest")


def test_file_validation_missing_files():
    """Verify validation fails when file_a or file_b is omitted."""
    with TestClient(app) as client:
        # Missing file_b
        resp1 = client.post(
            "/api/contracts/ingest",
            data={"matter_id": "TEST-VAL-1"},
            files={"file_a": ("doc.txt", io.BytesIO(b"content"), "text/plain")},
        )
        assert resp1.status_code == 422 or resp1.status_code == 400

        # Missing file_a
        resp2 = client.post(
            "/api/contracts/ingest",
            data={"matter_id": "TEST-VAL-2"},
            files={"file_b": ("doc.txt", io.BytesIO(b"content"), "text/plain")},
        )
        assert resp2.status_code == 422 or resp2.status_code == 400

    print("PASS: test_file_validation_missing_files")


def test_file_validation_unsupported_extension():
    """Verify validation rejects executable or unsupported extensions."""
    with TestClient(app) as client:
        resp = client.post(
            "/api/contracts/ingest",
            data={"matter_id": "TEST-VAL-EXT"},
            files={
                "file_a": ("danger.exe", io.BytesIO(b"binary"), "application/octet-stream"),
                "file_b": ("valid.txt", io.BytesIO(b"content"), "text/plain"),
            },
        )
        assert resp.status_code == 400
        assert "Unsupported file extension" in resp.text

    print("PASS: test_file_validation_unsupported_extension")


def test_file_validation_empty_file():
    """Verify validation rejects 0-byte files."""
    with TestClient(app) as client:
        resp = client.post(
            "/api/contracts/ingest",
            data={"matter_id": "TEST-VAL-EMPTY"},
            files={
                "file_a": ("empty.txt", io.BytesIO(b""), "text/plain"),
                "file_b": ("valid.txt", io.BytesIO(b"content"), "text/plain"),
            },
        )
        assert resp.status_code == 400
        assert "empty" in resp.text.lower()

    print("PASS: test_file_validation_empty_file")


def test_duplicate_matter_id_rejection():
    """Verify duplicate matter_id returns 409 Conflict."""
    dup_id = f"TEST-DUP-{int(time.time())}"
    with TestClient(app) as client:
        # First ingest
        resp1 = client.post(
            "/api/contracts/ingest",
            data={"matter_id": dup_id},
            files={
                "file_a": ("doc_a.txt", io.BytesIO(b"content A"), "text/plain"),
                "file_b": ("doc_b.txt", io.BytesIO(b"content B"), "text/plain"),
            },
        )
        assert resp1.status_code == 201

        # Second ingest with same ID
        resp2 = client.post(
            "/api/contracts/ingest",
            data={"matter_id": dup_id},
            files={
                "file_a": ("doc_a.txt", io.BytesIO(b"content A"), "text/plain"),
                "file_b": ("doc_b.txt", io.BytesIO(b"content B"), "text/plain"),
            },
        )
        assert resp2.status_code == 409
        assert "already exists" in resp2.text

    print("PASS: test_duplicate_matter_id_rejection")


if __name__ == "__main__":
    test_successful_contract_ingest()
    test_file_validation_missing_files()
    test_file_validation_unsupported_extension()
    test_file_validation_empty_file()
    test_duplicate_matter_id_rejection()
    print("ALL CONTRACT INGEST TESTS PASSED SUCCESSFULLY!")
