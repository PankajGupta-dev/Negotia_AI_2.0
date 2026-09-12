from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class AgentStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class AgentRole(str, Enum):
    LEX_INGESTOR_A = "a1"
    LEX_INGESTOR_B = "a2"
    ARBITER_3 = "a3"
    SCRIVENER_4 = "a4"


class AgentVerdict(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    clause_id: str
    legal_lens: str
    marketing_lens: str
    nash_equilibrium_clause: str
    compromise_score: float = Field(default=0.0, ge=0.0, le=100.0)
    sec_citations: List[str] = Field(default_factory=list)


class AgentRun(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    matter_id: str
    agent_id: str
    agent_name: str
    technical_name: str
    status: AgentStatus = AgentStatus.IDLE
    thoughts: List[str] = Field(default_factory=list)
    result: Optional[Dict[str, Any]] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
