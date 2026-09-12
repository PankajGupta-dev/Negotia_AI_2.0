"""
Comprehensive Unit & Integration Tests for GET /api/pipeline/stream/{matter_id} SSE Endpoint.
"""

import asyncio
from datetime import datetime
import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from fastapi.testclient import TestClient
from app.main import app
from app.routers.pipeline import (
    HEARTBEAT_INTERVAL_SECONDS,
    router,
    stream_pipeline_events,
)
from app.services.event_manager import MatterEvent, event_manager


def test_stream_response_headers_and_status():
    """Verify endpoint returns 200 and standard W3C SSE headers."""
    async def _run():
        matter_id = "MATTER-HDR-001"
        mock_req = MagicMock()
        mock_req.is_disconnected = AsyncMock(return_value=False)

        resp = await stream_pipeline_events(matter_id=matter_id, request=mock_req)
        assert resp.status_code == 200
        assert resp.media_type == "text/event-stream"
        assert resp.headers.get("content-type") == "text/event-stream"
        assert "no-cache" in resp.headers.get("cache-control", "")
        assert resp.headers.get("connection") == "keep-alive"
        assert resp.headers.get("x-accel-buffering") == "no"

        # Verify initial connection acknowledgment
        gen = resp.body_iterator
        first_chunk = await anext(gen)
        assert first_chunk == ": connected\n\n"

    asyncio.run(_run())
    print("PASS: test_stream_response_headers_and_status")


def test_stream_all_required_event_types():
    """
    Verify streaming and formatting of:
    - agent_update
    - merge_status
    - pipeline_complete
    - pipeline_error
    """
    async def _run():
        matter_id = "MATTER-EVT-002"
        event_manager.clear(matter_id)

        # Seed the 4 required events in event_manager
        event_manager.publish(
            matter_id=matter_id,
            event_type="agent_update",
            agent="a1",
            status="running",
            thought="Classifying baseline clauses...",
            message="Agent 1 started",
        )
        event_manager.publish(
            matter_id=matter_id,
            event_type="merge_status",
            agent="orchestrator",
            status="agreed",
            message="Compromise candidate reconciled",
        )
        event_manager.publish(
            matter_id=matter_id,
            event_type="pipeline_complete",
            agent="orchestrator",
            status="pending_review",
            thought="Dossier awaiting GC signoff",
            message="Pipeline concluded successfully",
            payload={"report_id": f"rep_{matter_id}"},
        )
        event_manager.publish(
            matter_id=matter_id,
            event_type="pipeline_error",
            agent="system",
            status="failed",
            message="Anomalous condition detected",
        )

        mock_req = MagicMock()
        mock_req.is_disconnected = AsyncMock(return_value=False)

        resp = await stream_pipeline_events(matter_id=matter_id, request=mock_req)
        gen = resp.body_iterator

        # 1. Initial comment
        conn_chunk = await anext(gen)
        assert conn_chunk == ": connected\n\n"

        # 2. Collect streamed events
        chunks = []
        for _ in range(4):
            chunk = await anext(gen)
            chunks.append(chunk)

        combined = "".join(chunks)
        assert "event: agent_update" in combined
        assert "event: merge_status" in combined
        assert "event: pipeline_complete" in combined
        assert "event: pipeline_error" in combined

        # Verify parsed data structure
        for chunk in chunks:
            lines = chunk.strip().split("\n")
            event_line = next(l for l in lines if l.startswith("event: "))
            data_line = next(l for l in lines if l.startswith("data: "))

            event_name = event_line.replace("event: ", "").strip()
            assert event_name in {"agent_update", "merge_status", "pipeline_complete", "pipeline_error"}

            data = json.loads(data_line.replace("data: ", "").strip())
            assert data["matter_id"] == matter_id
            assert data["event"] == event_name
            assert "timestamp" in data

    asyncio.run(_run())
    print("PASS: test_stream_all_required_event_types")


def test_pure_observer_no_pipeline_execution():
    """
    Verify endpoint is strictly an observer and does NOT trigger pipeline execution.
    """
    async def _run():
        matter_id = "MATTER-OBS-003"
        event_manager.clear(matter_id)

        assert len(event_manager.replay(matter_id)) == 0

        mock_req = MagicMock()
        mock_req.is_disconnected = AsyncMock(return_value=False)

        resp = await stream_pipeline_events(matter_id=matter_id, request=mock_req)
        gen = resp.body_iterator

        # Read connection message
        first_chunk = await anext(gen)
        assert first_chunk == ": connected\n\n"

        # Verify no pipeline execution was triggered
        assert len(event_manager.replay(matter_id)) == 0
        assert not event_manager.is_completed(matter_id)

    asyncio.run(_run())
    print("PASS: test_pure_observer_no_pipeline_execution")


def test_heartbeat_emission_on_idle():
    """
    Verify periodic ': ping\\n\\n' comment is emitted when connection is idle.
    """
    async def _run():
        matter_id = "MATTER-HB-004"
        event_manager.clear(matter_id)

        mock_req = MagicMock()
        mock_req.is_disconnected = AsyncMock(return_value=False)

        import app.routers.pipeline as pipe_mod
        orig_interval = pipe_mod.HEARTBEAT_INTERVAL_SECONDS
        pipe_mod.HEARTBEAT_INTERVAL_SECONDS = 0.05  # Fast heartbeat for testing

        try:
            resp = await stream_pipeline_events(matter_id=matter_id, request=mock_req)
            gen = resp.body_iterator

            conn_chunk = await anext(gen)
            assert conn_chunk == ": connected\n\n"

            # No events published -> expect heartbeat ping
            ping_chunk = await asyncio.wait_for(anext(gen), timeout=1.0)
            assert ping_chunk == ": ping\n\n"
        finally:
            pipe_mod.HEARTBEAT_INTERVAL_SECONDS = orig_interval

    asyncio.run(_run())
    print("PASS: test_heartbeat_emission_on_idle")


def test_client_disconnection_cleanup():
    """
    Verify that when the client disconnects (request.is_disconnected() is True),
    the event generator terminates gracefully and unsubscribes.
    """
    async def _run():
        matter_id = "MATTER-DISC-005"
        event_manager.clear(matter_id)

        call_count = 0

        async def mock_is_disconnected():
            nonlocal call_count
            call_count += 1
            # Disconnect on second check
            return call_count > 1

        mock_req = MagicMock()
        mock_req.is_disconnected = mock_is_disconnected

        import app.routers.pipeline as pipe_mod
        orig_interval = pipe_mod.HEARTBEAT_INTERVAL_SECONDS
        pipe_mod.HEARTBEAT_INTERVAL_SECONDS = 0.05

        try:
            resp = await stream_pipeline_events(matter_id=matter_id, request=mock_req)
            gen = resp.body_iterator

            # First item: connected
            await anext(gen)

            # Next item triggers disconnect break -> StopAsyncIteration
            with_items = []
            async for item in gen:
                with_items.append(item)

            await gen.aclose()
            # Subscriber should be cleaned up
            assert event_manager.subscriber_count(matter_id) == 0
        finally:
            pipe_mod.HEARTBEAT_INTERVAL_SECONDS = orig_interval

    asyncio.run(_run())
    print("PASS: test_client_disconnection_cleanup")


def test_router_integration_and_validation():
    """Verify FastAPI router mounting and query parameter validation via TestClient."""
    with TestClient(app) as client:
        # Invalid / whitespace matter_id
        resp_bad = client.get("/api/pipeline/stream/%20")
        assert resp_bad.status_code == 400

        # Health endpoint
        resp_health = client.get("/health")
        assert resp_health.status_code == 200

    print("PASS: test_router_integration_and_validation")


if __name__ == "__main__":
    test_stream_response_headers_and_status()
    test_stream_all_required_event_types()
    test_pure_observer_no_pipeline_execution()
    test_heartbeat_emission_on_idle()
    test_client_disconnection_cleanup()
    test_router_integration_and_validation()
    print("ALL PIPELINE STREAM TESTS PASSED SUCCESSFULLY!")
