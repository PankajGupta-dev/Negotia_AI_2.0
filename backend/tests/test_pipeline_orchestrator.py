"""
Unit test suite for Negotia AI Pipeline Orchestrator.
"""

import asyncio
import os
import sys
from pathlib import Path
import uuid

# Add backend and root to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db import init_db
from app.db.database import SessionLocal
from app.db.models import (
    AgentRunDB,
    AgentVerdictDB,
    AuditRecordDB,
    ContractClauseDB,
    MatterDB,
    ReportDB,
)
from app.models.agent import AgentStatus
from app.models.matter import MatterStatus
from app.models.pipeline import PipelineEventType
from app.models.report import ReviewStatus
from app.services.matter_service import create_matter
from app.services.pipeline_orchestrator import (
    PipelineOrchestrator,
    PipelineResult,
    PipelineStage,
    event_broker,
)


def setup_module():
    """Ensure database tables exist."""
    init_db()


def test_full_pipeline_orchestration():
    """Test full 9-stage asynchronous pipeline execution and database persistence."""
    orchestrator = PipelineOrchestrator()
    session = SessionLocal()
    test_id = f"TEST-MATTER-{uuid.uuid4().hex[:6].upper()}"

    # 1. Create a test matter
    matter = create_matter(
        db=session,
        title="Apex Dynamics Enterprise MSA",
        counterparty="Veloce Systems Inc.",
        matter_id=test_id,
        docket_number=f"DOCKET #{test_id}",
        arr_value="$4.2M",
        variance_ceiling=0.15,
        lead_counsel="Elena Rostova",
    )
    assert matter.id == test_id

    from app.models.matter import DocumentParty
    from app.services.matter_service import store_document_metadata
    store_document_metadata(
        db=session, matter_id=test_id, party=DocumentParty.PARTY_A,
        filename="Apex_Dynamics_MSA.pdf", file_path="/tmp/Apex_Dynamics_MSA.pdf", file_type="pdf"
    )
    store_document_metadata(
        db=session, matter_id=test_id, party=DocumentParty.PARTY_B,
        filename="Veloce_Systems_Redline.pdf", file_path="/tmp/Veloce_Systems_Redline.pdf", file_type="pdf"
    )

    # 2. Run the pipeline asynchronously
    result: PipelineResult = asyncio.run(
        orchestrator.run_pipeline(matter_id=test_id, db=session)
    )


    # 3. Verify PipelineResult (Stops at Agent 2)
    assert result.success is True, f"Pipeline failed with error: {result.error}"
    assert result.clauses_count > 0
    assert result.agent1_output is not None
    assert result.agent2_output is not None
    assert result.negotiation_output is not None
    assert result.agent3_output is None
    assert result.agent4_output is None

    # 4. Verify MatterDB persistence (Stage 2 Concluded)
    updated_matter = session.query(MatterDB).filter(MatterDB.id == test_id).first()
    assert updated_matter is not None
    assert "Stage 2 Concluded" in updated_matter.stage

    # 5. Verify AgentRunDB persistence for Agent 1 and Agent 2
    runs = session.query(AgentRunDB).filter(AgentRunDB.matter_id == test_id).all()
    agent_ids = {r.agent_id for r in runs}
    assert {"a1", "a2"}.issubset(agent_ids)

    for r in runs:
        assert r.status == AgentStatus.COMPLETE.value
        assert len(r.thoughts or []) > 0
        assert r.result is not None

    # 6. Verify ContractClauseDB persistence
    clauses = session.query(ContractClauseDB).filter(ContractClauseDB.matter_id == test_id).all()
    assert len(clauses) >= 1

    # 7. Verify Event Broker has buffered events
    history = orchestrator.event_broker.get_history(test_id)
    assert len(history) >= 3
    complete_events = [e for e in history if e.event == PipelineEventType.PIPELINE_COMPLETE]
    assert len(complete_events) == 1

    session.close()
    print("PASS: test_full_pipeline_orchestration")


def test_party_name_mismatch_pdf_disagree():
    """Test that missing buyer or seller name in PDF filename forces status to DISAGREE."""
    orchestrator = PipelineOrchestrator()
    session = SessionLocal()
    mismatch_id = f"TEST-MISMATCH-{uuid.uuid4().hex[:6].upper()}"

    create_matter(
        db=session,
        title="Apex Dynamics Corp.",
        counterparty="Veloce Systems Inc.",
        matter_id=mismatch_id,
        docket_number=f"DOCKET #{mismatch_id}",
    )
    # Mock document metadata with filenames missing party names (e.g. LOGIC_FORGE.pdf)
    from app.models.matter import DocumentParty
    from app.services.matter_service import store_document_metadata
    store_document_metadata(
        db=session, matter_id=mismatch_id, party=DocumentParty.PARTY_A,
        filename="LOGIC_FORGE.pdf", file_path="/tmp/LOGIC_FORGE.pdf", file_type="pdf"
    )
    store_document_metadata(
        db=session, matter_id=mismatch_id, party=DocumentParty.PARTY_B,
        filename="LOGIC_FORGE_MARKUP.pdf", file_path="/tmp/LOGIC_FORGE_MARKUP.pdf", file_type="pdf"
    )

    result: PipelineResult = asyncio.run(
        orchestrator.run_pipeline(matter_id=mismatch_id, db=session)
    )

    assert result.success is True
    assert result.status == "disagree"

    updated_matter = session.query(MatterDB).filter(MatterDB.id == mismatch_id).first()
    assert updated_matter.status == "disagree"

    session.close()
    print("PASS: test_party_name_mismatch_pdf_disagree")


def test_event_broker_subscription():
    """Test that event broker streams both past and incoming events independently of SSE."""
    broker = event_broker

    async def run_subscriber_test():
        matter_id = "TEST-EVENT-MATTER"
        orchestrator = PipelineOrchestrator(event_broker_instance=broker)
        session = SessionLocal()

        # Emit an event prior to subscription
        orchestrator.emit_event(
            db=session,
            matter_id=matter_id,
            event_type=PipelineEventType.AGENT_UPDATE,
            thought="Pre-subscription event",
        )

        # Start consumer
        events_collected = []

        async def consumer():
            async for ev in broker.subscribe(matter_id):
                events_collected.append(ev)
                if len(events_collected) >= 2:
                    break

        consumer_task = asyncio.create_task(consumer())
        await asyncio.sleep(0.05)

        # Emit an event after subscription
        orchestrator.emit_event(
            db=session,
            matter_id=matter_id,
            event_type=PipelineEventType.PIPELINE_COMPLETE,
            thought="Post-subscription event",
        )

        await asyncio.wait_for(consumer_task, timeout=2.0)
        assert len(events_collected) == 2
        assert events_collected[0].thought == "Pre-subscription event"
        assert events_collected[1].thought == "Post-subscription event"

        session.close()

    asyncio.run(run_subscriber_test())
    print("PASS: test_event_broker_subscription")


if __name__ == "__main__":
    setup_module()
    test_full_pipeline_orchestration()
    test_party_name_mismatch_pdf_disagree()
    test_event_broker_subscription()
    print("ALL ORCHESTRATOR TESTS PASSED SUCCESSFULLY!")
