"""
Unit Tests for In-Memory EventManager (app/services/event_manager.py).
"""

import asyncio
from datetime import datetime
import os
import sys
from typing import List

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.services.event_manager import EventManager, MatterEvent, event_manager


def test_publish_and_replay():
    """Verify publishing events and replaying recent events from in-memory ring-buffer."""
    mgr = EventManager(history_limit=10)
    matter_id = "MATTER-EVENT-001"

    # Publish 5 events
    for i in range(5):
        evt = mgr.publish(
            matter_id=matter_id,
            event_type="agent_update" if i < 4 else "merge_status",
            agent=f"a{i+1}" if i < 4 else None,
            status="running" if i < 4 else "agreed",
            message=f"Event step #{i+1}",
            thought=f"Deliberating on clause {i+1}..." if i < 4 else None,
        )
        assert evt.matter_id == matter_id
        assert evt.message == f"Event step #{i+1}"
        assert isinstance(evt.timestamp, datetime)

    # Replay all events
    history = mgr.replay(matter_id)
    assert len(history) == 5
    assert history[0].agent == "a1"
    assert history[0].thought == "Deliberating on clause 1..."
    assert history[4].event_type == "merge_status"

    # Replay with limit
    recent_3 = mgr.replay(matter_id, limit=3)
    assert len(recent_3) == 3
    assert recent_3[0].message == "Event step #3"
    assert recent_3[2].message == "Event step #5"

    print("PASS: test_publish_and_replay")


def test_async_subscription():
    """Verify subscribing to events with history replay and real-time dispatch."""
    async def _run():
        mgr = EventManager()
        matter_id = "MATTER-SUB-002"

        # Publish 2 historical events
        mgr.publish(
            matter_id=matter_id,
            event_type="stage_start",
            agent="orchestrator",
            status="running",
            message="Pipeline initialising",
        )
        mgr.publish(
            matter_id=matter_id,
            event_type="agent_update",
            agent="a1",
            status="running",
            thought="Classifying baseline clauses",
        )

        received_events: List[MatterEvent] = []

        async def subscriber_task():
            async for evt in mgr.subscribe(matter_id, replay_recent=True):
                received_events.append(evt)
                if evt.event_type == "completion":
                    break

        sub_fut = asyncio.create_task(subscriber_task())
        # Let subscriber start and drain historical events
        await asyncio.sleep(0.05)

        # Publish live events
        mgr.publish(
            matter_id=matter_id,
            event_type="agent_update",
            agent="a2",
            status="running",
            thought="Analyzing redline risks",
        )
        mgr.publish_completion(
            matter_id=matter_id,
            message="Pipeline concluded",
            status="pending_review",
            thought="Dossier ready for GC signoff",
        )

        await asyncio.wait_for(sub_fut, timeout=2.0)
        await asyncio.sleep(0.05)

        assert len(received_events) == 4
        assert received_events[0].message == "Pipeline initialising"
        assert received_events[1].agent == "a1"
        assert received_events[2].agent == "a2"
        assert received_events[3].event_type == "completion"
        assert received_events[3].status == "pending_review"

        # Verify subscriber disconnected cleanly
        assert mgr.subscriber_count(matter_id) == 0

    asyncio.run(_run())
    print("PASS: test_async_subscription")


def test_completion_event_and_waiter():
    """Verify explicit completion event publishing and wait_for_completion mechanism."""
    async def _run():
        mgr = EventManager()
        matter_id = "MATTER-COMP-003"

        assert not mgr.is_completed(matter_id)

        # Test wait_for_completion with background publisher
        async def publisher():
            await asyncio.sleep(0.1)
            mgr.publish_completion(
                matter_id=matter_id,
                message="Settlement reached at Nash equilibrium",
                status="pending_review",
                payload={"compromise_index": 88.5},
            )

        asyncio.create_task(publisher())

        comp_evt = await mgr.wait_for_completion(matter_id, timeout=2.0)
        assert comp_evt is not None
        assert comp_evt.event_type == "completion"
        assert comp_evt.status == "pending_review"
        assert comp_evt.payload["compromise_index"] == 88.5
        assert mgr.is_completed(matter_id)

        # Immediate return when already completed
        cached_comp = await mgr.wait_for_completion(matter_id, timeout=0.1)
        assert cached_comp == comp_evt
        assert mgr.get_completion_event(matter_id) == comp_evt

    asyncio.run(_run())
    print("PASS: test_completion_event_and_waiter")


def test_matter_isolation_and_clear():
    """Verify events are properly partitioned per matter and clear works."""
    mgr = EventManager()
    m1 = "MATTER-ISO-A"
    m2 = "MATTER-ISO-B"

    mgr.publish(matter_id=m1, event_type="agent_update", agent="a1", message="Matter 1 event")
    mgr.publish(matter_id=m2, event_type="agent_update", agent="a2", message="Matter 2 event")

    h1 = mgr.replay(m1)
    h2 = mgr.replay(m2)

    assert len(h1) == 1
    assert h1[0].message == "Matter 1 event"
    assert len(h2) == 1
    assert h2[0].message == "Matter 2 event"

    mgr.clear(m1)
    assert len(mgr.replay(m1)) == 0
    assert len(mgr.replay(m2)) == 1

    mgr.clear()
    assert len(mgr.replay(m2)) == 0
    print("PASS: test_matter_isolation_and_clear")


if __name__ == "__main__":
    test_publish_and_replay()
    test_async_subscription()
    test_completion_event_and_waiter()
    test_matter_isolation_and_clear()
    print("ALL EVENT MANAGER TESTS PASSED SUCCESSFULLY!")
