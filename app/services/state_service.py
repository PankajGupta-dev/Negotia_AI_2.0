from datetime import datetime
from typing import Any, Dict, List, Optional, Union
import uuid
from sqlalchemy.orm import Session

from app.db.models import AgentRunDB, ContractClauseDB, ContractDocumentDB, MatterDB
from app.models.agent import AgentStatus
from app.models.pipeline import AgentEvent, PipelineEventType


def store_agent_run(
    db: Session,
    matter_id: str,
    agent_id: str,
    agent_name: str,
    technical_name: str,
    status: Union[str, AgentStatus] = AgentStatus.IDLE,
    thoughts: Optional[List[str]] = None,
    result: Optional[Dict[str, Any]] = None,
    run_id: Optional[str] = None,
) -> AgentRunDB:
    """Create and store a new agent execution run."""
    if not run_id:
        run_id = f"run_{agent_id}_{uuid.uuid4().hex[:6]}"

    status_str = status.value if isinstance(status, AgentStatus) else status

    run = AgentRunDB(
        id=run_id,
        matter_id=matter_id,
        agent_id=agent_id,
        agent_name=agent_name,
        technical_name=technical_name,
        status=status_str,
        thoughts=thoughts or [],
        result=result,
        started_at=datetime.utcnow() if status_str == AgentStatus.RUNNING.value else None,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def store_agent_status(
    db: Session,
    matter_id: str,
    agent_id: str,
    status: Union[str, AgentStatus],
    new_thought: Optional[str] = None,
    result: Optional[Dict[str, Any]] = None,
) -> AgentRunDB:
    """Update status, append thoughts, or record results for an agent run."""
    status_str = status.value if isinstance(status, AgentStatus) else status

    run = (
        db.query(AgentRunDB)
        .filter(AgentRunDB.matter_id == matter_id, AgentRunDB.agent_id == agent_id)
        .order_by(AgentRunDB.id.desc())
        .first()
    )

    if not run:
        agent_names = {
            "a1": ("Buyer Legal Analyst", "Lex-Ingestor A"),
            "a2": ("Seller Redline Auditor", "Lex-Ingestor B"),
            "a3": ("AI Judge & Deal Mediator", "Arbiter-3"),
            "a4": ("Executive Scrivener & Audit Engine", "Scrivener-4"),
        }
        name, tech_name = agent_names.get(agent_id, (f"Agent {agent_id}", f"Agent-{agent_id}"))
        return store_agent_run(
            db=db,
            matter_id=matter_id,
            agent_id=agent_id,
            agent_name=name,
            technical_name=tech_name,
            status=status_str,
            thoughts=[new_thought] if new_thought else [],
            result=result,
        )

    run.status = status_str
    if status_str == AgentStatus.RUNNING.value and not run.started_at:
        run.started_at = datetime.utcnow()
    elif status_str in (AgentStatus.COMPLETE.value, AgentStatus.FAILED.value):
        run.completed_at = datetime.utcnow()

    if new_thought:
        current_thoughts = list(run.thoughts) if run.thoughts else []
        current_thoughts.append(new_thought)
        run.thoughts = current_thoughts

    if result is not None:
        run.result = result

    db.commit()
    db.refresh(run)
    return run


def get_agent_run(db: Session, run_id: str) -> Optional[AgentRunDB]:
    """Retrieve an agent run by ID."""
    return db.query(AgentRunDB).filter(AgentRunDB.id == run_id).first()


def get_matter_agent_runs(db: Session, matter_id: str) -> List[AgentRunDB]:
    """Retrieve all agent execution runs associated with a matter."""
    return db.query(AgentRunDB).filter(AgentRunDB.matter_id == matter_id).all()


def store_pipeline_event(
    db: Session,
    matter_id: str,
    event: Union[str, PipelineEventType],
    agent: Optional[str] = None,
    status: Optional[str] = None,
    thought: Optional[str] = None,
    message: Optional[str] = None,
    report_id: Optional[str] = None,
) -> AgentEvent:
    """Record an agent/pipeline event and persist corresponding agent state."""
    event_enum = PipelineEventType(event) if isinstance(event, str) else event

    if agent and status:
        store_agent_status(
            db=db,
            matter_id=matter_id,
            agent_id=agent,
            status=status,
            new_thought=thought,
        )

    return AgentEvent(
        event=event_enum,
        agent=agent,
        status=status,
        thought=thought,
        message=message,
        matter_id=matter_id,
        report_id=report_id,
        timestamp=datetime.utcnow(),
    )


def get_pipeline_state(db: Session, matter_id: str) -> Dict[str, Any]:
    """Retrieve complete pipeline state snapshot for a matter."""
    matter = db.query(MatterDB).filter(MatterDB.id == matter_id).first()
    if not matter:
        return {"matterId": matter_id, "status": "not_found", "agentRuns": []}

    runs = db.query(AgentRunDB).filter(AgentRunDB.matter_id == matter_id).all()
    docs = db.query(ContractDocumentDB).filter(ContractDocumentDB.matter_id == matter_id).all()
    clauses_count = (
        db.query(ContractClauseDB).filter(ContractClauseDB.matter_id == matter_id).count()
    )

    return {
        "matterId": matter.id,
        "docketNumber": matter.docket_number,
        "title": matter.title,
        "counterparty": matter.counterparty,
        "status": matter.status,
        "stage": matter.stage,
        "round": matter.round,
        "riskScore": matter.risk_score,
        "documentsCount": len(docs),
        "clausesCount": clauses_count,
        "agentRuns": [
            {
                "id": r.id,
                "agentId": r.agent_id,
                "agentName": r.agent_name,
                "technicalName": r.technical_name,
                "status": r.status,
                "thoughts": r.thoughts or [],
                "startedAt": r.started_at.isoformat() if r.started_at else None,
                "completedAt": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in runs
        ],
        "lastUpdated": matter.updated_at.isoformat() if matter.updated_at else None,
    }
