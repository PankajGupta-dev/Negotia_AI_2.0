"""
Pipeline SSE Streaming Router for Negotia AI.

Provides a real-time Server-Sent Events (SSE) stream endpoint:
    GET /api/pipeline/stream/{matter_id}

Key properties:
    • Pure Observer: strictly observes in-memory and persisted pipeline events;
      MUST NOT trigger, advance, or execute the pipeline itself.
    • Browser EventSource Compatible: text/event-stream with no-cache headers
      and standard W3C 'event: ...\\ndata: ...\\n\\n' framing.
    • Filtered Event Stream: streams agent_update, merge_status, pipeline_complete,
      and pipeline_error events.
    • Heartbeat Keep-Alive: sends periodic SSE comments (': ping\\n\\n') to ensure
      idle connections and proxy timeouts (Cloudflare, Nginx) do not sever the socket.
    • Replay Buffer: automatically sends recent cached matter events to newly connecting clients.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import json
import logging
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.services.event_manager import MatterEvent, event_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pipeline", tags=["Pipeline"])

# Heartbeat interval in seconds to keep idle SSE connections alive
HEARTBEAT_INTERVAL_SECONDS = 15.0

# Supported event types to stream
SUPPORTED_EVENT_TYPES = {
    "agent_update",
    "merge_status",
    "pipeline_complete",
    "pipeline_error",
}

# Mapping aliases to canonical event names
EVENT_TYPE_MAP = {
    "agent_update": "agent_update",
    "merge_status": "merge_status",
    "pipeline_complete": "pipeline_complete",
    "completion": "pipeline_complete",
    "pipeline_error": "pipeline_error",
    "error": "pipeline_error",
}


def _format_sse_message(event_type: str, data: Dict[str, Any], event_id: Optional[str] = None) -> str:
    """
    Format a message according to the W3C Server-Sent Events specification.
    Format:
        id: <event_id>
        event: <event_type>
        data: <json_string>

    """
    lines = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event_type}")
    payload = json.dumps(data)
    for line in payload.split("\n"):
        lines.append(f"data: {line}")
    lines.append("\n")
    return "\n".join(lines)


def _serialize_event_data(evt: MatterEvent, canonical_type: str) -> Dict[str, Any]:
    """
    Build structured JSON payload for browser EventSource consumer.
    """
    timestamp_str = (
        evt.timestamp.isoformat()
        if isinstance(evt.timestamp, datetime)
        else str(evt.timestamp)
    )
    return {
        "event": canonical_type,
        "matterId": evt.matter_id,
        "matter_id": evt.matter_id,
        "agent": evt.agent,
        "status": evt.status,
        "thought": evt.thought,
        "message": evt.message,
        "payload": evt.payload,
        "timestamp": timestamp_str,
    }


@router.get(
    "/stream/{matter_id}",
    summary="Real-time Server-Sent Events (SSE) stream for matter pipeline",
    description=(
        "Subscribes to live pipeline events for a specific matter docket. "
        "Strictly an observer; does NOT execute the pipeline. "
        "Streams agent_update, merge_status, pipeline_complete, and pipeline_error events."
    ),
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": "SSE stream of pipeline events and heartbeat pings.",
        }
    },
)
async def stream_pipeline_events(
    matter_id: str,
    request: Request,
):
    """
    Observe existing pipeline events for matter_id via Server-Sent Events (SSE).
    """
    if not matter_id or not matter_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="matter_id parameter is required.",
        )

    matter_id = matter_id.strip()

    async def event_generator() -> AsyncGenerator[str, None]:
        # Initial connection acknowledgment comment for browser EventSource
        yield ": connected\n\n"

        event_counter = 0

        # Subscribe to in-memory event manager with automatic history replay
        subscription = event_manager.subscribe(
            matter_id=matter_id,
            replay_recent=True,
            heartbeat_interval=HEARTBEAT_INTERVAL_SECONDS,
        )

        try:
            async for evt in subscription:
                # 1. Check if client closed the connection
                if await request.is_disconnected():
                    logger.info(f"SSE client disconnected for matter {matter_id}")
                    break

                # 2. Heartbeat tick (evt is None when timeout expired with no events)
                if evt is None:
                    yield ": ping\n\n"
                    continue

                # 3. Canonicalize and filter event type
                raw_type = evt.event_type.lower() if evt.event_type else ""
                canonical_type = EVENT_TYPE_MAP.get(raw_type)

                # Skip events not in the requested stream set (e.g. internal debug events)
                if not canonical_type or canonical_type not in SUPPORTED_EVENT_TYPES:
                    continue

                event_counter += 1
                data_payload = _serialize_event_data(evt, canonical_type)
                sse_chunk = _format_sse_message(
                    event_type=canonical_type,
                    data=data_payload,
                    event_id=str(event_counter),
                )
                yield sse_chunk

        except asyncio.CancelledError:
            logger.debug(f"SSE stream cancelled by client for matter {matter_id}")
        except Exception as ex:
            logger.error(f"Error in SSE stream generator for matter {matter_id}: {ex}")
            # Emit error event before closing if possible
            err_data = {
                "event": "pipeline_error",
                "matterId": matter_id,
                "matter_id": matter_id,
                "message": f"Streaming connection error: {str(ex)}",
                "timestamp": datetime.utcnow().isoformat(),
            }
            yield _format_sse_message("pipeline_error", err_data)
        finally:
            await subscription.aclose()

    # Standard headers for browser EventSource / reverse proxy compatibility
    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # Disables proxy response buffering in Nginx
    }

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=headers,
    )
