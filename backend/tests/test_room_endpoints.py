"""
Focused Test Suite for /api/rooms REST Endpoints.

Tests:
- POST /api/rooms
- GET /api/rooms/{room_id}
- POST /api/rooms/{room_id}/join
- POST /api/rooms/{room_id}/admit
- POST /api/rooms/{room_id}/reject
- POST /api/rooms/{room_id}/leave
- POST /api/rooms/{room_id}/close

Enforces:
- Clean JSON format containing room_id, status, creator, participant, and relevant state
- Only creator can admit/reject/close
- Maximum 2 participants
- Invalid/closed rooms rejected
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.db import init_db

init_db()
client = TestClient(app)


def test_rest_endpoints():
    creator_id = "user_counsel_001"
    guest_id = "user_counsel_002"
    intruder_id = "user_intruder_003"
    passcode = "SEC-8821"

    # 1. POST /api/rooms
    res_create = client.post(
        "/api/rooms",
        json={
            "creator_id": creator_id,
            "creator_name": "Elena Rostova",
            "creator_role": "buyer",
            "matter_id": "2025-INT-809",
            "title": "Bilateral Enterprise Agreement",
            "passcode": passcode,
        },
    )
    assert res_create.status_code == 201, res_create.text
    created = res_create.json()

    # Clean JSON format validation
    assert "room_id" in created
    assert created["room_id"].startswith("NEG-")
    assert created["status"] == "waiting"
    assert created["creator"]["id"] == creator_id
    assert created["creator_id"] == creator_id
    assert created["participant"] is None
    assert created["participant_id"] is None
    assert created["passcode"] == passcode

    room_id = created["room_id"]
    creator_token = created["creator_token"]

    # 2. GET /api/rooms/{room_id}
    res_get = client.get(f"/api/rooms/{room_id}")
    assert res_get.status_code == 200, res_get.text
    fetched = res_get.json()
    assert fetched["room_id"] == room_id
    assert fetched["status"] == "waiting"
    assert fetched["creator"]["name"] == "Elena Rostova"
    assert fetched["participant"] is None

    # Invalid room returns 404
    res_invalid_get = client.get("/api/rooms/NEG-NONEXISTENT")
    assert res_invalid_get.status_code == 404

    # 3. POST /api/rooms/{room_id}/join
    # 3a. Wrong passcode rejected
    res_wrong_pass = client.post(
        f"/api/rooms/{room_id}/join",
        json={
            "participant_id": guest_id,
            "passcode": "WRONG_PASS",
        },
    )
    assert res_wrong_pass.status_code == 403

    # 3b. Successful join request
    res_join = client.post(
        f"/api/rooms/{room_id}/join",
        json={
            "participant_id": guest_id,
            "participant_name": "Marcus Vance",
            "participant_role": "seller",
            "passcode": passcode,
        },
    )
    assert res_join.status_code == 200, res_join.text
    joined = res_join.json()
    assert joined["room_id"] == room_id
    assert joined["status"] == "waiting"
    assert joined["participant"]["id"] == guest_id
    assert joined["participant"]["name"] == "Marcus Vance"
    assert joined["participant"]["status"] == "pending_approval"

    # 4. POST /api/rooms/{room_id}/reject
    # 4a. Non-creator cannot reject (unauthorized)
    res_unauth_reject = client.post(
        f"/api/rooms/{room_id}/reject",
        json={"creator_id": "unauthorized_user"},
    )
    assert res_unauth_reject.status_code == 403

    # 4b. Creator rejects applicant
    res_reject = client.post(
        f"/api/rooms/{room_id}/reject",
        json={"creator_id": creator_id},
    )
    assert res_reject.status_code == 200, res_reject.text
    rejected_state = res_reject.json()
    assert rejected_state["participant"] is None
    assert rejected_state["participant_id"] is None

    # Re-join guest
    client.post(
        f"/api/rooms/{room_id}/join",
        json={
            "participant_id": guest_id,
            "participant_name": "Marcus Vance",
            "participant_role": "seller",
            "passcode": passcode,
        },
    )

    # 5. POST /api/rooms/{room_id}/admit
    # 5a. Non-creator cannot admit (unauthorized)
    res_unauth_admit = client.post(
        f"/api/rooms/{room_id}/admit",
        json={"creator_id": intruder_id},
    )
    assert res_unauth_admit.status_code == 403

    # 5b. Creator admits participant
    res_admit = client.post(
        f"/api/rooms/{room_id}/admit",
        headers={"X-Creator-Token": creator_token},
        json={"participant_id": guest_id},
    )
    assert res_admit.status_code == 200, res_admit.text
    admitted = res_admit.json()
    assert admitted["status"] == "active"
    assert admitted["participant"]["status"] == "admitted"
    assert admitted["active_participants_count"] == 2

    # 5c. Enforce Maximum 2 participants (3rd party attempt rejected)
    res_intruder = client.post(
        f"/api/rooms/{room_id}/join",
        json={
            "participant_id": intruder_id,
            "passcode": passcode,
        },
    )
    assert res_intruder.status_code == 409
    assert "Only one additional participant is allowed" in res_intruder.json()["detail"]

    # 6. POST /api/rooms/{room_id}/leave
    res_leave = client.post(
        f"/api/rooms/{room_id}/leave",
        json={"participant_id": guest_id},
    )
    assert res_leave.status_code == 200, res_leave.text
    left = res_leave.json()
    assert left["participant"]["status"] == "left"
    assert left["active_participants_count"] == 1

    # Historical data preserved
    get_after_leave = client.get(f"/api/rooms/{room_id}").json()
    assert get_after_leave["creator_id"] == creator_id

    # 7. POST /api/rooms/{room_id}/close
    # 7a. Non-creator cannot close
    res_unauth_close = client.post(
        f"/api/rooms/{room_id}/close",
        json={"creator_id": intruder_id},
    )
    assert res_unauth_close.status_code == 403

    # 7b. Creator closes room
    res_close = client.post(
        f"/api/rooms/{room_id}/close",
        json={"creator_id": creator_id},
    )
    assert res_close.status_code == 200, res_close.text
    closed = res_close.json()
    assert closed["status"] == "closed"
    assert closed["closed_at"] is not None

    # 7c. Closed room rejects join attempts
    res_closed_join = client.post(
        f"/api/rooms/{room_id}/join",
        json={
            "participant_id": guest_id,
            "passcode": passcode,
        },
    )
    assert res_closed_join.status_code == 400
    assert "closed or expired" in res_closed_join.json()["detail"]

    print("ALL REST ENDPOINT TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_rest_endpoints()
