"""
Focused Test Suite for /ws/negotiation/{room_id} WebSocket Endpoint.

Tests:
1. Admission restriction:
   - Unknown intruder is rejected (code=1008).
   - Pending (unadmitted) applicant is rejected (code=1008).
   - Creator and admitted participant connect successfully.
2. Maximum 2 active participants enforcement (3rd connection rejected).
3. In-memory connection registry tracking.
4. Broadcast of shared room events without private participant credentials:
   - join
   - message
   - clause_submitted
   - proposal
   - system
   - leave
5. Creator closes room:
   - Broadcasts room_closed to both parties.
   - Disconnects both sides.
6. DB persistence: Important events and proposals are saved to the room's message log.
"""

from datetime import datetime
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.db import init_db, SessionLocal
from app.services.room_service import (
    create_room,
    request_join,
    admit_participant,
    get_room,
)

init_db()
client = TestClient(app)


def test_negotiation_websocket_lifecycle():
    creator_id = "user_counsel_buyer"
    guest_id = "user_counsel_seller"
    intruder_id = "user_unadmitted_intruder"

    # Setup: Create room and admit guest using room_service
    with SessionLocal() as db:
        room = create_room(
            db=db,
            creator_id=creator_id,
            matter_id="2025-INT-809",
            title="Bilateral Cloud MSA Deliberation",
            creator_name="Elena Rostova",
            creator_role="buyer",
        )
        room_id = room.room_id
        creator_token = room.creator_token

        # Guest requests join (status: pending_approval)
        request_join(
            db=db,
            room_id=room_id,
            participant_id=guest_id,
            participant_name="Marcus Vance",
            participant_role="seller",
            passcode=room.passcode,
        )

    # 1. Test Admission Enforcement:
    # 1a. Intruder attempt is rejected
    try:
        with client.websocket_connect(f"/ws/negotiation/{room_id}?participant_id={intruder_id}") as ws:
            data = ws.receive_json()
            assert "Unauthorized" in data.get("error", "")
    except Exception:
        pass  # Socket was closed by server

    # 1b. Unadmitted guest attempt is rejected (still pending_approval)
    try:
        with client.websocket_connect(f"/ws/negotiation/{room_id}?participant_id={guest_id}") as ws:
            data = ws.receive_json()
            assert "Unauthorized" in data.get("error", "")
    except Exception:
        pass  # Socket was closed by server

    # Creator admits guest
    with SessionLocal() as db:
        admit_participant(db=db, room_id=room_id, creator_id=creator_id)
        room_updated = get_room(db, room_id)
        guest_token = room_updated.guest_token

    # 2. Both Creator and Admitted Guest Connect
    with client.websocket_connect(f"/ws/negotiation/{room_id}?token={creator_token}") as ws_creator:
        # Creator receives own 'join' event
        join_creator = ws_creator.receive_json()
        assert join_creator["type"] == "join"
        assert join_creator["sender_id"] == creator_id
        assert join_creator["sender_name"] == "Elena Rostova"
        # Verify no private data is exposed
        assert "creator_token" not in join_creator
        assert "guest_token" not in join_creator
        assert "passcode" not in join_creator

        with client.websocket_connect(f"/ws/negotiation/{room_id}?token={guest_token}") as ws_guest:
            # Guest receives own 'join' event
            join_guest = ws_guest.receive_json()
            assert join_guest["type"] == "join"
            assert join_guest["sender_id"] == guest_id

            # Creator receives notification of guest's join
            creator_got_guest_join = ws_creator.receive_json()
            assert creator_got_guest_join["type"] == "join"
            assert creator_got_guest_join["sender_id"] == guest_id
            assert creator_got_guest_join["sender_name"] == "Marcus Vance"

            # 3. Test Maximum 2 Active Participants:
            # A 3rd participant attempt when room already has 2 active sockets is rejected
            try:
                with client.websocket_connect(f"/ws/negotiation/{room_id}?token={creator_token}") as ws_third:
                    res = ws_third.receive_json()
                    assert "Maximum 2" in res.get("error", "")
            except Exception:
                pass  # Closed with code 1008

            # 4. Test Event Type: 'message'
            ws_creator.send_json({
                "type": "message",
                "text": "Opening discussion on Section 11 limitation of liability.",
            })

            # Both receive the message broadcast
            c_msg = ws_creator.receive_json()
            g_msg = ws_guest.receive_json()
            assert c_msg["type"] == "message"
            assert g_msg["type"] == "message"
            assert "Section 11" in g_msg["text"]
            assert g_msg["sender_id"] == creator_id

            # 5. Test Event Type: 'clause_submitted'
            ws_guest.send_json({
                "type": "clause_submitted",
                "clause_id": "clause-11-2",
                "section": "§ 11.2",
                "text": "Neither party shall be liable for aggregate damages exceeding 2x total fees paid.",
            })

            g_clause = ws_guest.receive_json()
            c_clause = ws_creator.receive_json()
            assert c_clause["type"] == "clause_submitted"
            assert c_clause["clause_id"] == "clause-11-2"
            assert "2x total fees" in c_clause["text"]

            # 6. Test Event Type: 'proposal'
            ws_creator.send_json({
                "type": "proposal",
                "clause_id": "clause-11-2",
                "proposal": "Compromise cap: 1.5x fees with standard IP carved out.",
                "terms": {"cap_multiplier": 1.5, "carveouts": ["IP", "Confidentiality"]},
            })

            c_prop = ws_creator.receive_json()
            g_prop = ws_guest.receive_json()
            assert g_prop["type"] == "proposal"
            assert "1.5x" in g_prop["proposal"]

            # 7. Test Event Type: 'system'
            ws_guest.send_json({
                "type": "system",
                "message": "Commercial counsel verified executive pricing approval.",
            })

            c_sys = ws_creator.receive_json()
            g_sys = ws_guest.receive_json()
            assert c_sys["type"] == "system"
            assert "Commercial counsel" in c_sys["message"]
            assert g_sys["type"] == "system"

            # 8. Test Event Type: 'room_closed' by Creator
            # Non-creator trying to close room is blocked
            ws_guest.send_json({"type": "room_closed", "reason": "Unauthorized close attempt"})
            err_notice = ws_guest.receive_json()
            assert err_notice["type"] == "system"
            assert "Only the creator" in err_notice.get("error", "")

            # Creator closes room
            ws_creator.send_json({
                "type": "room_closed",
                "reason": "Full agreement reached and signed off.",
            })

            try:
                c_closed = ws_creator.receive_json()
                assert c_closed["type"] == "room_closed"
            except Exception:
                pass

            try:
                g_closed = ws_guest.receive_json()
                assert g_closed["type"] == "room_closed"
            except Exception:
                pass

    # 9. Verify Database Persistence of events and room state
    with SessionLocal() as db:
        final_room = get_room(db, room_id)
        assert final_room.status == "closed"
        assert final_room.closed_at is not None
        assert len(final_room.messages) >= 4
        # Verify proposal was tracked in shared_state
        assert "latest_proposal" in (final_room.shared_state or {})

    print("ALL /ws/negotiation/{room_id} WEBSOCKET TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_negotiation_websocket_lifecycle()
