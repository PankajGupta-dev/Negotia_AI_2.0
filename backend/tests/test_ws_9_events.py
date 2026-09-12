import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.services.room_service import (
    create_room,
    request_join,
    admit_participant,
    reject_participant,
    get_room,
)

client = TestClient(app)

def test_all_9_websocket_events_flow():
    """
    Test the 9 events explicitly required by the private room specification:
    1. join_requested
    2. participant_admitted
    3. participant_rejected
    4. participant_connected
    5. participant_disconnected
    6. clause_updated
    7. message
    8. room_closed
    9. room_error
    """
    creator_id = "creator_counsel_buyer"
    guest_id = "guest_counsel_seller"
    rejected_guest_id = "rejected_applicant"

    # Step 1: Create room
    with SessionLocal() as db:
        room = create_room(
            db=db,
            creator_id=creator_id,
            matter_id="2025-INT-809",
            title="9-Events WebSocket Deliberation Chamber",
            creator_name="Elena Rostova (Buyer)",
            creator_role="buyer",
        )
        room_id = room.room_id
        creator_token = room.creator_token

    # Step 2: Test 9: room_error on unauthorized attempt
    with client.websocket_connect(f"/ws/negotiation/{room_id}?token=invalid_token") as ws_unauth:
        err_event = ws_unauth.receive_json()
        assert err_event["type"] == "room_error"
        assert err_event["code"] == "unauthorized"

    # Step 3: Creator connects -> Event 4: participant_connected
    with client.websocket_connect(f"/ws/negotiation/{room_id}?token={creator_token}") as ws_creator:
        connect_c = ws_creator.receive_json()
        assert connect_c["type"] == "participant_connected"
        assert connect_c["sender_id"] == creator_id

        # Step 4: Event 1: join_requested
        # Counterparty requests join via REST API
        join_resp = client.post(
            f"/api/rooms/{room_id}/join",
            json={
                "participant_id": guest_id,
                "participant_name": "Marcus Vance",
                "participant_role": "seller",
            }
        )
        assert join_resp.status_code == 200
        knock_event = ws_creator.receive_json()
        assert knock_event["type"] == "join_requested"
        assert knock_event["guest_id"] == guest_id

        # Step 5: Event 3: participant_rejected test
        # Send a join request for rejected applicant, then reject it
        client.post(
            f"/api/rooms/{room_id}/join",
            json={
                "participant_id": rejected_guest_id,
                "participant_name": "Applicant To Reject",
                "participant_role": "seller",
            }
        )
        # Drain the join_requested for second applicant
        ws_creator.receive_json()

        reject_resp = client.post(
            f"/api/rooms/{room_id}/reject",
            json={"participant_id": rejected_guest_id},
            headers={"X-Creator-Token": creator_token}
        )
        assert reject_resp.status_code == 200
        reject_event = ws_creator.receive_json()
        assert reject_event["type"] == "participant_rejected"
        assert reject_event["guest_id"] == rejected_guest_id

        # Counterparty requests join to become the pending applicant
        join2_resp = client.post(
            f"/api/rooms/{room_id}/join",
            json={
                "participant_id": guest_id,
                "participant_name": "Marcus Vance",
                "participant_role": "seller",
            }
        )
        assert join2_resp.status_code == 200
        guest_token = join2_resp.json()["guest_token"]
        ws_creator.receive_json()  # Drain join_requested

        # Step 6: Event 2: participant_admitted test
        admit_resp = client.post(
            f"/api/rooms/{room_id}/admit",
            json={"participant_id": guest_id},
            headers={"X-Creator-Token": creator_token}
        )
        assert admit_resp.status_code == 200
        admit_event = ws_creator.receive_json()
        assert admit_event["type"] == "participant_admitted"
        assert admit_event["guest_id"] == guest_id

        # Step 7: Admitted guest connects -> Event 4: participant_connected
        with client.websocket_connect(f"/ws/negotiation/{room_id}?token={guest_token}") as ws_guest:
            g_connect = ws_guest.receive_json()
            assert g_connect["type"] == "participant_connected"
            assert g_connect["sender_id"] == guest_id

            # Creator also receives the participant_connected notification
            c_got_g_connect = ws_creator.receive_json()
            assert c_got_g_connect["type"] == "participant_connected"
            assert c_got_g_connect["sender_id"] == guest_id

            # Step 8: Event 7: message test
            ws_creator.send_json({
                "type": "message",
                "text": "Hello Marcus, let us negotiate the SLA terms."
            })
            msg_c = ws_creator.receive_json()
            msg_g = ws_guest.receive_json()
            assert msg_c["type"] == "message"
            assert msg_g["type"] == "message"
            assert msg_g["text"] == "Hello Marcus, let us negotiate the SLA terms."

            # Step 9: Event 6: clause_updated test
            ws_guest.send_json({
                "type": "clause_updated",
                "clause_id": "clause-sla-1",
                "section": "§ 4.1",
                "status": "agreed",
                "text": "Service uptime availability commitment conformed to 99.9%."
            })
            cl_g = ws_guest.receive_json()
            cl_c = ws_creator.receive_json()
            assert cl_g["type"] == "clause_updated"
            assert cl_c["type"] == "clause_updated"
            assert cl_c["clause_id"] == "clause-sla-1"
            assert cl_c["status"] == "agreed"

            # Step 10: Event 9: room_error test (guest cannot close room)
            ws_guest.send_json({"type": "room_closed", "reason": "Guest unauthorized close attempt"})
            err_notice = ws_guest.receive_json()
            assert err_notice["type"] == "room_error"
            assert err_notice["code"] == "forbidden"

            # Step 11: Event 5: participant_disconnected test
            # Guest leaves voluntarily
            ws_guest.send_json({"type": "participant_disconnected"})
            c_got_g_disc = ws_creator.receive_json()
            assert c_got_g_disc["type"] == "participant_disconnected"
            assert c_got_g_disc["sender_id"] == guest_id

        # Step 12: Event 8: room_closed by Creator
        ws_creator.send_json({
            "type": "room_closed",
            "reason": "Negotiation concluded successfully."
        })
        c_closed = ws_creator.receive_json()
        if c_closed.get("type") == "presence_update":
            c_closed = ws_creator.receive_json()
        assert c_closed["type"] == "room_closed"
        assert "Negotiation concluded" in c_closed["reason"]

    # Verify room is closed in database
    with SessionLocal() as db:
        final_room = get_room(db, room_id)
        assert final_room.status == "closed"
