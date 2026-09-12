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

    # 2. Run the pipeline asynchronously
    result: PipelineResult = asyncio.run(
        orchestrator.run_pipeline(matter_id=test_id, db=session)
    )


    # 3. Verify PipelineResult
    assert result.success is True, f"Pipeline failed with error: {result.error}"
    assert result.status == "pending_review"
    assert result.clauses_count > 0
    assert result.agent1_output is not None
    assert result.agent2_output is not None
    assert result.negotiation_output is not None
    assert result.agent3_output is not None
    assert result.agent4_output is not None
    assert result.report_id is not None

    # 4. Verify MatterDB persistence (Stage 9: status = pending_review)
    updated_matter = session.query(MatterDB).filter(MatterDB.id == test_id).first()
    assert updated_matter is not None
    assert updated_matter.status == "pending_review"
    assert "Pending Human Review" in updated_matter.stage
    assert updated_matter.pending_redlines_count > 0

    # 5. Verify AgentRunDB persistence for all 4 agents
    runs = session.query(AgentRunDB).filter(AgentRunDB.matter_id == test_id).all()
    agent_ids = {r.agent_id for r in runs}
    assert {"a1", "a2", "a3", "a4"}.issubset(agent_ids)

    for r in runs:
        assert r.status == AgentStatus.COMPLETE.value
        assert len(r.thoughts or []) > 0
        assert r.result is not None

    # 6. Verify ContractClauseDB persistence
    clauses = session.query(ContractClauseDB).filter(ContractClauseDB.matter_id == test_id).all()
    assert len(clauses) >= 5
    for c in clauses:
        assert c.conformed_proposal is not None
        assert len(c.conformed_proposal) > 0
        assert c.status == "agreed"

    # 7. Verify AgentVerdictDB persistence
    verdicts = session.query(AgentVerdictDB).all()
    assert len(verdicts) > 0

    # 8. Verify ReportDB persistence (strictly pending_review, unsealed)
    report = session.query(ReportDB).filter(ReportDB.matter_id == test_id).first()
    assert report is not None
    assert report.review_status == "pending_review"
    assert report.attestation_hash is None
    assert report.block_digest is None
    assert report.counsel_cost_saved > 0
    assert "EXECUTIVE NEGOTIATION BRIEF" in report.executive_summary

    # 9. Verify AuditRecordDB persistence
    audit = session.query(AuditRecordDB).filter(AuditRecordDB.matter_id == test_id).first()
    assert audit is not None
    assert audit.sha256_hash is not None
    assert len(audit.sha256_hash) == 64

    # 10. Verify Event Broker has buffered events (SSE independent)
    history = orchestrator.event_broker.get_history(test_id)
    assert len(history) >= 5
    complete_events = [e for e in history if e.event == PipelineEventType.PIPELINE_COMPLETE]
    assert len(complete_events) == 1

    session.close()
    print("PASS: test_full_pipeline_orchestration")


def test_retry_failed_agent():
    """Test retrying a specific agent (e.g. Agent 3) re-executing downstream without starting from scratch."""
    orchestrator = PipelineOrchestrator()
    session = SessionLocal()
    retry_id = f"TEST-RETRY-{uuid.uuid4().hex[:6].upper()}"

    # Setup matter and run pipeline once
    create_matter(
        db=session,
        title="Retry Test Matter",
        counterparty="Veloce Systems Inc.",
        matter_id=retry_id,
        docket_number=f"DOCKET #{retry_id}",
    )
    asyncio.run(orchestrator.run_pipeline(matter_id=retry_id, db=session))

    # Retry Agent 3 on the matter
    retry_result: PipelineResult = asyncio.run(
        orchestrator.retry_agent(matter_id=retry_id, agent_id="a3", db=session)
    )

    assert retry_result.success is True
    assert retry_result.status == "pending_review"
    assert retry_result.agent3_output is not None
    assert retry_result.agent4_output is not None

    session.close()
    print("PASS: test_retry_failed_agent")


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
    test_retry_failed_agent()
    test_event_broker_subscription()
    print("ALL ORCHESTRATOR TESTS PASSED SUCCESSFULLY!")
