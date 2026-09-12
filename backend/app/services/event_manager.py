"""
In-Memory Event Manager for the Negotia AI Hackathon Pipeline.

Provides a lightweight, non-blocking pub/sub event bus with:
    • Event publishing (agent updates, stage changes, thought emissions)
    • Async subscription for clients/SSE without coupling to pipeline execution
    • Replay buffer of recent events for newly connected listeners
    • Explicit completion event handling & completion waiting
"""

from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from datetime import datetime
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════════════
# Matter Event Model
# ═════════════════════════════════════════════════════════════════════════════

class MatterEvent(BaseModel):
    """
    Standard event emitted throughout the Negotia pipeline lifecycle.
    """
    model_config = ConfigDict(populate_by_name=True)

    event_type: str = Field(
        ...,
        description="Event category: agent_update, stage_start, merge_status, completion, error, etc.",
    )
    matter_id: str = Field(..., description="Unique matter docket or ID")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="UTC timestamp when event was produced",
    )
    agent: Optional[str] = Field(
        default=None,
        description="Agent identifier: a1, a2, a3, a4, system, orchestrator",
    )
    status: Optional[str] = Field(
        default=None,
        description="Operational status: running, complete, pending_review, failed, etc.",
    )
    message: Optional[str] = Field(
        default=None,
        description="Human-readable event message or description",
    )
    thought: Optional[str] = Field(
        default=None,
        description="Agent internal deliberative reasoning or scratchpad thought",
    )
    payload: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional structured metadata or metrics",
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert event to serializable dictionary."""
        return {
            "event_type": self.event_type,
            "matter_id": self.matter_id,
            "timestamp": self.timestamp.isoformat(),
            "agent": self.agent,
            "status": self.status,
            "message": self.message,
            "thought": self.thought,
            "payload": self.payload,
        }


# ═════════════════════════════════════════════════════════════════════════════
# In-Memory Event Manager
# ═════════════════════════════════════════════════════════════════════════════

class EventManager:
    """
    In-memory pub/sub broker with ring-buffer replay.
    Decouples pipeline execution completely from SSE / HTTP transports.
    """

    def __init__(self, history_limit: int = 500):
        self.history_limit = history_limit
        self._history: Dict[str, deque[MatterEvent]] = defaultdict(
            lambda: deque(maxlen=self.history_limit)
        )
        self._subscribers: Dict[str, Set[asyncio.Queue[MatterEvent]]] = defaultdict(set)
        self._completion_events: Dict[str, asyncio.Event] = defaultdict(asyncio.Event)
        self._completion_records: Dict[str, MatterEvent] = {}

    def publish_event(self, event: MatterEvent) -> MatterEvent:
        """
        Publish a MatterEvent instance to the in-memory bus.
        Appends to ring buffer and broadcasts to all active subscribers.
        """
        matter_id = event.matter_id

        # 1. Store in replay history ring-buffer
        self._history[matter_id].append(event)

        # 2. Check if this is a completion event
        if event.event_type in ("completion", "pipeline_complete") or event.status in ("completed", "pending_review"):
            self._completion_records[matter_id] = event
            # Signal any listeners awaiting completion
            comp_evt = self._completion_events.get(matter_id)
            if comp_evt is not None:
                comp_evt.set()

        # 3. Broadcast to all active subscriber queues
        subs = list(self._subscribers.get(matter_id, []))
        for q in subs:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(f"Subscriber queue full for matter {matter_id}; dropping event.")
            except Exception as ex:
                logger.debug(f"Failed to dispatch event to subscriber: {ex}")

        return event

    def publish(
        self,
        matter_id: str,
        event_type: str,
        agent: Optional[str] = None,
        status: Optional[str] = None,
        message: Optional[str] = None,
        thought: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None,
    ) -> MatterEvent:
        """
        Convenience method to construct and publish a MatterEvent.
        """
        evt = MatterEvent(
            event_type=event_type,
            matter_id=matter_id,
            timestamp=timestamp or datetime.utcnow(),
            agent=agent,
            status=status,
            message=message,
            thought=thought,
            payload=payload,
        )
        return self.publish_event(evt)

    def publish_completion(
        self,
        matter_id: str,
        message: str = "Pipeline completed",
        agent: Optional[str] = "orchestrator",
        status: str = "pending_review",
        thought: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> MatterEvent:
        """
        Explicitly publish a completion event and signal completion waiters.
        """
        return self.publish(
            matter_id=matter_id,
            event_type="completion",
            agent=agent,
            status=status,
            message=message,
            thought=thought,
            payload=payload,
        )

    def publish_deliberation(
        self,
        matter_id: str,
        agent: str,
        agent_name: str,
        role: str,
        message: str,
        clause_ids: Optional[List[str]] = None,
        risk_score: Optional[float] = None,
        legal_impact: Optional[str] = None,
        commercial_impact: Optional[str] = None,
        recommendation: Optional[str] = None,
        status: Optional[str] = "complete",
        source: Optional[str] = "LLM",
        event_id: Optional[str] = None,
    ) -> MatterEvent:
        """
        Publish a real-time, file-grounded agent deliberation event.
        Persists event in MongoDB Atlas and broadcasts on SSE pub/sub bus.
        """
        import uuid
        resolved_event_id = event_id or f"delib_{matter_id}_{uuid.uuid4().hex[:8]}"
        ts = datetime.utcnow()
        payload = {
            "eventId": resolved_event_id,
            "event_id": resolved_event_id,
            "matterId": matter_id,
            "matter_id": matter_id,
            "agent": agent,
            "agentName": agent_name,
            "agent_name": agent_name,
            "role": role,
            "message": message,
            "clauseIds": clause_ids or [],
            "clause_ids": clause_ids or [],
            "riskScore": risk_score,
            "risk_score": risk_score,
            "legalImpact": legal_impact,
            "legal_impact": legal_impact,
            "commercialImpact": commercial_impact,
            "commercial_impact": commercial_impact,
            "recommendation": recommendation,
            "status": status,
            "source": source or "LLM",
            "timestamp": ts.isoformat(),
        }

        # Persist to MongoDBAtlas synchronously/asynchronously
        try:
            from app.db.database import sync_mongo_doc, COLLECTION_DELIBERATIONS
            sync_mongo_doc(COLLECTION_DELIBERATIONS, {"event_id": resolved_event_id}, payload)
        except Exception as err:
            logger.debug(f"Deliberation MongoDB persistence notice: {err}")

        return self.publish(
            matter_id=matter_id,
            event_type="deliberation",
            agent=agent,
            status=status,
            message=message,
            thought=None,
            payload=payload,
            timestamp=ts,
        )

    def replay(
        self,
        matter_id: str,
        limit: Optional[int] = None,
    ) -> List[MatterEvent]:
        """
        Replay recent events for a matter from the in-memory ring-buffer.
        """
        events = list(self._history.get(matter_id, []))
        if limit is not None and limit > 0:
            return events[-limit:]
        return events

    async def subscribe(
        self,
        matter_id: str,
        replay_recent: bool = True,
        max_queue_size: int = 200,
        heartbeat_interval: Optional[float] = None,
    ) -> AsyncGenerator[Optional[MatterEvent], None]:
        """
        Subscribe to events for a given matter.
        Yields all replayed history first (if replay_recent=True),
        then yields new events as they arrive.
        If heartbeat_interval is set, yields None when no event arrives within that interval.
        """
        q: asyncio.Queue[MatterEvent] = asyncio.Queue(maxsize=max_queue_size)

        # 1. Yield historical replay events
        if replay_recent:
            history = self.replay(matter_id)
            for evt in history:
                yield evt

        # 2. Register subscriber queue
        self._subscribers[matter_id].add(q)
        try:
            while True:
                if heartbeat_interval is not None and heartbeat_interval > 0:
                    try:
                        evt = await asyncio.wait_for(q.get(), timeout=heartbeat_interval)
                    except asyncio.TimeoutError:
                        yield None
                        continue
                else:
                    evt = await q.get()
                yield evt
        finally:
            self._subscribers[matter_id].discard(q)

    async def wait_for_completion(
        self,
        matter_id: str,
        timeout: Optional[float] = None,
    ) -> Optional[MatterEvent]:
        """
        Asynchronously wait until a completion event is published for the matter.
        """
        # If already completed, return immediately
        if matter_id in self._completion_records:
            return self._completion_records[matter_id]

        comp_evt = self._completion_events[matter_id]
        try:
            if timeout is not None:
                await asyncio.wait_for(comp_evt.wait(), timeout=timeout)
            else:
                await comp_evt.wait()
            return self._completion_records.get(matter_id)
        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for completion of matter {matter_id}")
            return None

    def is_completed(self, matter_id: str) -> bool:
        """Check if matter pipeline has emitted completion."""
        return matter_id in self._completion_records

    def get_completion_event(self, matter_id: str) -> Optional[MatterEvent]:
        """Get the stored completion event for a matter if available."""
        return self._completion_records.get(matter_id)

    def subscriber_count(self, matter_id: str) -> int:
        """Return the count of active subscribers for a matter."""
        return len(self._subscribers.get(matter_id, set()))

    def clear(self, matter_id: Optional[str] = None) -> None:
        """Clear event history and completion state for a matter, or globally."""
        if matter_id:
            self._history.pop(matter_id, None)
            self._subscribers.pop(matter_id, None)
            self._completion_events.pop(matter_id, None)
            self._completion_records.pop(matter_id, None)
        else:
            self._history.clear()
            self._subscribers.clear()
            self._completion_events.clear()
            self._completion_records.clear()


# Global in-memory singleton
event_manager = EventManager()
