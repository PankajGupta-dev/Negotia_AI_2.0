from abc import ABC, abstractmethod
from datetime import datetime
import json
import logging
from typing import Any, Callable, Dict, List, Optional, Type, Union

from pydantic import BaseModel

from app.models.agent import AgentStatus
from app.models.pipeline import AgentEvent, PipelineEventType

logger = logging.getLogger(__name__)

# Callback function type signature for streaming agent events
EventCallback = Callable[[AgentEvent], None]


class BaseAgent(ABC):
    """
    Abstract Base Class for Negotia AI Agents.
    Provides agent identification, state management, event callback streaming,
    structured output parsing, and error-wrapped execution handling.
    """

    def __init__(
        self,
        agent_id: str,
        name: str,
        technical_name: str,
        event_callback: Optional[EventCallback] = None,
    ):
        self.agent_id = agent_id
        self.name = name
        self.technical_name = technical_name
        self.status = AgentStatus.IDLE
        self.thoughts: List[str] = []
        self.event_callback = event_callback
        self.last_error: Optional[str] = None

    def emit_event(
        self,
        event_type: Union[str, PipelineEventType] = PipelineEventType.AGENT_UPDATE,
        thought: Optional[str] = None,
        message: Optional[str] = None,
        matter_id: Optional[str] = None,
        report_id: Optional[str] = None,
    ) -> AgentEvent:
        """Emit pipeline event, record thought, and trigger event callback if registered."""
        if thought:
            self.thoughts.append(thought)

        event_enum = (
            PipelineEventType(event_type) if isinstance(event_type, str) else event_type
        )

        event = AgentEvent(
            event=event_enum,
            agent=self.agent_id,
            status=self.status.value if isinstance(self.status, AgentStatus) else str(self.status),
            thought=thought,
            message=message,
            matter_id=matter_id,
            report_id=report_id,
            timestamp=datetime.utcnow(),
        )

        if self.event_callback:
            try:
                self.event_callback(event)
            except Exception as callback_err:
                logger.error(f"Event callback error in agent {self.agent_id}: {callback_err}")

        return event

    def parse_structured_output(
        self,
        raw_output: Union[str, Dict[str, Any]],
        schema: Optional[Type[BaseModel]] = None,
    ) -> Any:
        """Parse raw LLM output or dict into a structured dictionary or Pydantic model."""
        data: Dict[str, Any] = {}

        if isinstance(raw_output, str):
            clean_str = raw_output.strip()
            # Strip markdown json code block fences if present
            if clean_str.startswith("```"):
                lines = clean_str.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                clean_str = "\n".join(lines).strip()

            try:
                data = json.loads(clean_str)
            except json.JSONDecodeError as err:
                logger.warning(f"Failed to parse JSON for agent {self.agent_id}: {err}")
                data = {"raw_content": raw_output}
        elif isinstance(raw_output, dict):
            data = raw_output
        else:
            data = {"content": str(raw_output)}

        if schema:
            return schema.model_validate(data)

        return data

    @abstractmethod
    def _execute(self, *args: Any, **kwargs: Any) -> Any:
        """Subclasses must implement core agent deliberation logic here."""
        pass

    def run(self, *args: Any, **kwargs: Any) -> Any:
        """
        Execute agent with automatic status updates, error handling, and event notification.
        """
        self.status = AgentStatus.RUNNING
        self.last_error = None
        matter_id = kwargs.get("matter_id")

        self.emit_event(
            event_type=PipelineEventType.AGENT_UPDATE,
            thought=f"Starting agent {self.name} ({self.technical_name})...",
            matter_id=matter_id,
        )

        try:
            result = self._execute(*args, **kwargs)

            self.status = AgentStatus.COMPLETE
            self.emit_event(
                event_type=PipelineEventType.AGENT_UPDATE,
                thought=f"Agent {self.name} completed successfully.",
                matter_id=matter_id,
            )
            return result

        except Exception as err:
            self.status = AgentStatus.FAILED
            self.last_error = str(err)
            logger.exception(f"Agent {self.agent_id} failed: {err}")

            self.emit_event(
                event_type=PipelineEventType.PIPELINE_ERROR,
                thought=f"Agent error: {err}",
                message=str(err),
                matter_id=matter_id,
            )
            raise err
