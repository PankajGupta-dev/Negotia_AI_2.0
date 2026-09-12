"""
Contract Ingestion Router for Negotia AI.

Provides the multipart upload endpoint:
    POST /api/contracts/ingest

Accepts:
    - file_a: UploadFile (Party A baseline contract)
    - file_b: UploadFile (Party B counterparty redline contract)
    - matter_id: Optional[str]
    - arr_value: Optional[str]
    - variance_ceiling: Optional[float]
    - title: Optional[str]
    - counterparty: Optional[str]

Validates:
    • Presence of both file_a and file_b
    • Allowed extensions (.pdf, .docx, .doc, .txt, .md)
    • Reasonable file size (non-empty and <= 25MB)

Actions:
    1. Saves both files securely with sanitized names under settings.UPLOAD_DIR
    2. Creates and persists MatterDB record
    3. Stores ContractDocumentDB metadata for Party A and Party B
    4. Triggers autonomous 9-stage pipeline asynchronously in background (non-blocking)
    5. Returns immediately with matterId, status='ingested', and pipelineUrl
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import logging
from pathlib import Path
import re
from typing import Any, Dict, Optional
import uuid

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models.matter import DocumentParty
from app.services.matter_service import create_matter, get_matter, store_document_metadata
from app.services.pipeline_orchestrator import PipelineOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contracts", tags=["Contracts"])

# Maximum file size: 25 MB
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

# Supported document extensions matching parser capabilities
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md"}


class IngestResponse(BaseModel):
    """Response returned upon successful contract upload and pipeline dispatch."""
    model_config = ConfigDict(populate_by_name=True)

    matter_id: str = Field(..., serialization_alias="matterId")
    status: str = "ingested"
    pipeline_url: str = Field(..., serialization_alias="pipelineUrl")


def _sanitize_filename(filename: str) -> str:
    """Sanitize file basename to prevent path traversal attacks."""
    clean_name = Path(filename).name
    # Retain alphanumeric characters, dots, dashes, and underscores
    clean_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", clean_name)
    return clean_name or "document"


def _validate_uploaded_file(file: UploadFile, field_name: str) -> str:
    """
    Validate presence, extension, and size of an uploaded contract file.
    Returns the file extension in lower case.
    """
    if not file or not file.filename or not file.filename.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} is required.",
        )

    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file extension '{ext}' for {field_name}. "
                f"Supported extensions: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
            ),
        )

    # Check file size without loading entire file into memory
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} is empty (0 bytes).",
        )

    if file_size > MAX_FILE_SIZE_BYTES:
        max_mb = MAX_FILE_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} exceeds maximum allowed size of {max_mb} MB.",
        )

    return ext


async def _save_upload_file_securely(file: UploadFile, destination: Path) -> None:
    """Stream uploaded file contents to disk in chunks."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with open(destination, "wb") as f_out:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            f_out.write(chunk)
    # Reset read cursor for any potential re-reads
    await file.seek(0)


async def _execute_pipeline_in_background(matter_id: str) -> None:
    """Asynchronous background worker to execute the Negotia pipeline."""
    logger.info(f"Starting background pipeline orchestration for matter: {matter_id}")
    try:
        orchestrator = PipelineOrchestrator()
        result = await orchestrator.run_pipeline(matter_id=matter_id)
        logger.info(
            f"Background pipeline for matter {matter_id} finished: success={result.success}, "
            f"status={result.status}, report_id={result.report_id}"
        )
    except Exception as ex:
        logger.error(f"Unhandled error in background pipeline for matter {matter_id}: {ex}", exc_info=True)


@router.post(
    "/ingest",
    status_code=status.HTTP_201_CREATED,
    summary="Ingest Party A and Party B contract documents",
    description=(
        "Accepts multipart/form-data containing Party A baseline and Party B markup contracts. "
        "Validates formats and sizes, creates Matter record, saves documents, and asynchronously "
        "launches the 9-stage negotiation pipeline in the background without blocking the HTTP response."
    ),
    response_model=None,
)
async def ingest_contracts(
    background_tasks: BackgroundTasks,
    file_a: UploadFile = File(..., description="Party A baseline contract document (.pdf, .docx, .doc, .txt, .md)"),
    file_b: UploadFile = File(..., description="Party B counterparty redline contract document"),
    matter_id: Optional[str] = Form(None, description="Optional custom matter identifier"),
    arr_value: Optional[str] = Form(None, description="Annual Recurring Revenue value, e.g. '$4.2M'"),
    variance_ceiling: Optional[float] = Form(None, description="Maximum acceptable variance ceiling, e.g. 0.15"),
    title: Optional[str] = Form(None, description="Optional matter title"),
    counterparty: Optional[str] = Form(None, description="Counterparty enterprise name"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Ingest bilateral contract documents, register matter, and trigger background pipeline.
    """
    # 1. Validate files
    ext_a = _validate_uploaded_file(file_a, "file_a")
    ext_b = _validate_uploaded_file(file_b, "file_b")

    # 2. Determine or generate matter ID
    resolved_matter_id = (matter_id.strip() if matter_id and matter_id.strip() else f"MATTER-{uuid.uuid4().hex[:6].upper()}")

    # Check if matter ID is already taken
    existing_matter = get_matter(db, resolved_matter_id)
    if existing_matter:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A matter with ID '{resolved_matter_id}' already exists.",
        )

    # 3. Securely save files to upload directory
    safe_name_a = _sanitize_filename(file_a.filename)
    safe_name_b = _sanitize_filename(file_b.filename)

    matter_upload_dir = Path(settings.UPLOAD_DIR) / resolved_matter_id
    target_path_a = matter_upload_dir / f"party_a_{safe_name_a}"
    target_path_b = matter_upload_dir / f"party_b_{safe_name_b}"

    try:
        await _save_upload_file_securely(file_a, target_path_a)
        await _save_upload_file_securely(file_b, target_path_b)
    except Exception as ex:
        logger.error(f"Failed to save uploaded files for matter {resolved_matter_id}: {ex}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to securely save uploaded documents: {str(ex)}",
        )

    # 4. Create and persist Matter record
    resolved_title = title or f"Negotiation Matter #{resolved_matter_id}"
    resolved_counterparty = counterparty or "Party B Counterparty"
    resolved_arr = arr_value or "$4.2M"
    resolved_variance = variance_ceiling if variance_ceiling is not None else 0.15

    try:
        create_matter(
            db=db,
            title=resolved_title,
            counterparty=resolved_counterparty,
            matter_id=resolved_matter_id,
            docket_number=f"DOCKET #{resolved_matter_id}",
            arr_value=resolved_arr,
            variance_ceiling=resolved_variance,
            stage="Round 1 Ingestion",
        )

        # 5. Store document metadata for Party A and Party B
        store_document_metadata(
            db=db,
            matter_id=resolved_matter_id,
            party=DocumentParty.PARTY_A,
            filename=safe_name_a,
            file_path=str(target_path_a.resolve()),
            file_type=ext_a.lstrip("."),
        )
        store_document_metadata(
            db=db,
            matter_id=resolved_matter_id,
            party=DocumentParty.PARTY_B,
            filename=safe_name_b,
            file_path=str(target_path_b.resolve()),
            file_type=ext_b.lstrip("."),
        )
    except Exception as ex:
        logger.error(f"Failed to persist matter {resolved_matter_id} to database: {ex}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error registering matter: {str(ex)}",
        )

    # 6. Start the pipeline asynchronously in the background (NON-BLOCKING)
    # Using asyncio.create_task ensures it immediately starts on the running event loop
    asyncio.create_task(_execute_pipeline_in_background(resolved_matter_id))

    pipeline_url = f"/api/pipeline/stream/{resolved_matter_id}"

    logger.info(f"Matter {resolved_matter_id} ingested successfully. Pipeline dispatched to background.")

    # 7. Return required response
    return {
        "matterId": resolved_matter_id,
        "matter_id": resolved_matter_id,
        "status": "ingested",
        "pipelineUrl": pipeline_url,
        "pipeline_url": pipeline_url,
    }
