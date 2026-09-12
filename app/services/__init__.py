from app.services.matter_service import (
    create_matter,
    get_matter,
    get_matter_documents,
    list_matters,
    store_document_metadata,
    update_matter_status,
)
from app.services.negotiation_engine import (
    ClauseNegotiationInput,
    ClauseNegotiationResult,
    CompromiseCandidate,
    NegotiationConfig,
    NegotiationEngineOutput,
    score_negotiation,
)
from app.services.event_manager import (
    EventManager,
    MatterEvent,
    event_manager,
)
from app.services.pipeline_orchestrator import (
    PipelineEventBroker,
    PipelineOrchestrator,
    PipelineResult,
    PipelineStage,
    event_broker,
)
from app.services.state_service import (
    get_agent_run,
    get_matter_agent_runs,
    get_pipeline_state,
    store_agent_run,
    store_agent_status,
    store_pipeline_event,
)
from app.services.audit_service import (
    AuditService,
    GENESIS_HASH,
    SealResult,
    assemble_canonical_payload,
    calculate_sha256,
    serialize_canonical_json,
)

__all__ = [
    # Matter Service
    "create_matter",
    "get_matter",
    "list_matters",
    "update_matter_status",
    "store_document_metadata",
    "get_matter_documents",
    # Negotiation Engine
    "score_negotiation",
    "ClauseNegotiationInput",
    "NegotiationConfig",
    "NegotiationEngineOutput",
    "ClauseNegotiationResult",
    "CompromiseCandidate",
    # State Service
    "store_agent_run",
    "store_agent_status",
    "get_agent_run",
    "get_matter_agent_runs",
    "store_pipeline_event",
    "get_pipeline_state",
    # Event Manager
    "EventManager",
    "MatterEvent",
    "event_manager",
    # Pipeline Orchestrator
    "PipelineOrchestrator",
    "PipelineStage",
    "PipelineResult",
    "PipelineEventBroker",
    "event_broker",
    # Audit Service (Cryptographic Provenance)
    "AuditService",
    "SealResult",
    "GENESIS_HASH",
    "serialize_canonical_json",
    "assemble_canonical_payload",
    "calculate_sha256",
]


