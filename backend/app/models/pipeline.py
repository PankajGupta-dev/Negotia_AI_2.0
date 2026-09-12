from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class PipelineEventType(str, Enum):
    AGENT_UPDATE = "agent_update"
    MERGE_STATUS = "merge_status"
    PIPELINE_COMPLETE = "pipeline_complete"
    PIPELINE_ERROR = "pipeline_error"


class AgentEvent(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    event: PipelineEventType = PipelineEventType.AGENT_UPDATE
    agent: Optional[str] = None
    status: Optional[str] = None
    thought: Optional[str] = None
    message: Optional[str] = None
    matter_id: Optional[str] = None
    report_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
