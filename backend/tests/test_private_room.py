"""
Focused Test Suite for 2-Party Private Negotiation Room.
Tests:
1. Room creation with generated Room ID, passcode, and creator token.
2. Passcode security credential validation (Room ID alone cannot grant admission).
3. Second participant join request (pending_approval status).
4. Creator approval flow (admitting second participant).
5. Strict maximum 2 admitted participants constraint (3rd participant rejected).
6. WebSocket bilateral communication between both admitted parties.
7. Participant leave flow.
8. Creator room close flow.
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.db import init_db

init_db()
client = TestClient(app)


def test_private_room_full_lifecycle():
    # 1. Create Private Room
    res_create = client.post(
        "/api/rooms",
        json={
            "title": "Cloud SaaS Enterprise Agreement Negotiation",
            "creator_name": "Elena Rostova",
            "creator_role": "buyer",
        },
    )
    assert res_create.status_code == 201, res_create.text
    room_data = res_create.json()

    room_id = room_data["room_id"]
    passcode = room_data["passcode"]
    creator_token = room_data["creator_token"]

    assert room_id.startswith("NEG-") or room_id.startswith("ROOM-")
    assert passcode.startswith("SEC-")
    assert creator_token.startswith("ctok_")
    assert room_data["status"] == "waiting"

    # 2. Reject Join with Wrong Passcode (Room ID is not sole security credential)
    res_wrong_pass = client.post(
        f"/api/rooms/{room_id}/join-request",
        json={
            "guest_name": "Marcus Vance",
            "guest_role": "seller",
            "passcode": "WRONG-CODE",
        },
    )
    assert res_wrong_pass.status_code == 403
    assert "Invalid room passcode" in res_wrong_pass.json()["detail"]

    # 3. Second Participant Knocks with Correct Passcode
    res_join = client.post(
        f"/api/rooms/{room_id}/join-request",
        json={
            "guest_name": "Marcus Vance",
            "guest_role": "seller",
            "passcode": passcode,
        },
    )
    assert res_join.status_code == 200, res_join.text
    guest_data = res_join.json()
    assert guest_data["guest_status"] == "pending_approval"
    guest_token = guest_data["guest_token"]
    guest_id = guest_data["guest_id"]
    assert guest_token.startswith("gtok_")

    # Verify Room Public State reflects pending guest
    res_state = client.get(f"/api/rooms/{room_id}")
    assert res_state.status_code == 200
    state = res_state.json()
    assert state["guest_name"] == "Marcus Vance"
    assert state["guest_status"] == "pending_approval"

    # 4. Creator Approves Second Participant
    res_approve = client.post(
        f"/api/rooms/{room_id}/approve",
        headers={"X-Creator-Token": creator_token},
        json={"decision": "approve"},
    )
    assert res_approve.status_code == 200, res_approve.text
    appr_data = res_approve.json()
    assert appr_data["guest_status"] == "admitted"
    assert appr_data["active_participants_count"] == 2
    assert appr_data["room_status"] == "active"

    # 5. Strict Maximum 2 Admitted Participants Constraint:
    # A 3rd party tries to join the already-full room
    res_third_join = client.post(
        f"/api/rooms/{room_id}/join-request",
        json={
            "guest_name": "Third Party Intruder",
            "guest_role": "observer",
            "passcode": passcode,
        },
    )
    assert res_third_join.status_code == 409
    assert "maximum 2" in res_third_join.json()["detail"]

    # 6. WebSocket Live Communication Between Creator and Guest
    with client.websocket_connect(f"/api/rooms/ws/{room_id}?token={creator_token}") as ws_creator:
        welcome_creator = ws_creator.receive_json()
        assert welcome_creator["type"] == "welcome"
        assert welcome_creator["is_creator"] is True

        with client.websocket_connect(f"/api/rooms/ws/{room_id}?token={guest_token}") as ws_guest:
            welcome_guest = ws_guest.receive_json()
            assert welcome_guest["type"] == "welcome"
            assert welcome_guest["is_creator"] is False

            # Guest sends a clause compromise proposal
            ws_guest.send_json({
                "type": "clause_proposal",
                "clause_id": "clause-11-2",
                "proposal": "Liability cap raised to 2.5x 12-month trailing fees.",
                "text": "Proposed modified limitation of liability."
            })

            # Creator receives the proposal broadcast
            msg_received = ws_creator.receive_json()
            # If presence event arrived first, drain until proposal
            while msg_received.get("type") == "presence":
                msg_received = ws_creator.receive_json()

            assert msg_received["type"] == "clause_proposal"
            assert "2.5x" in msg_received["proposal"]
            assert msg_received["sender_name"] == "Marcus Vance"

            # Creator replies via bilateral chat
            ws_creator.send_json({
                "type": "chat_message",
                "text": "Acceptable if data privacy indemnification remains uncapped."
            })

            guest_got_chat = ws_guest.receive_json()
            while guest_got_chat.get("type") in ("presence", "clause_proposal"):
                guest_got_chat = ws_guest.receive_json()

            assert guest_got_chat["type"] == "chat_message"
            assert "Acceptable" in guest_got_chat["text"]

    # Verify messages were persisted to DB
    res_msgs = client.get(f"/api/rooms/{room_id}/messages")
    assert res_msgs.status_code == 200
    history = res_msgs.json()["messages"]
    assert len(history) >= 2

    # 7. Either Participant Can Leave (Guest leaves)
    res_leave = client.post(
        f"/api/rooms/{room_id}/leave",
        json={"token": guest_token},
    )
    assert res_leave.status_code == 200
    assert res_leave.json()["active_participants_count"] == 1

    res_state_after_leave = client.get(f"/api/rooms/{room_id}")
    assert res_state_after_leave.json()["guest_status"] == "left"

    # 8. Creator Stops/Closes Room
    res_close = client.post(
        f"/api/rooms/{room_id}/close",
        json={"creator_token": creator_token},
    )
    assert res_close.status_code == 200
    assert res_close.json()["room_status"] == "closed"

    # Verify closed room rejects new joins
    res_join_closed = client.post(
        f"/api/rooms/{room_id}/join-request",
        json={
            "guest_name": "Marcus Vance",
            "guest_role": "seller",
            "passcode": passcode,
        },
    )
    assert res_join_closed.status_code == 400
    assert "permanently closed" in res_join_closed.json()["detail"]

    print("ALL 8 FOCUSED TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_private_room_full_lifecycle()
