"""
Focused Test Suite for Room Service.

Verifies:
1. create_room():
   - Generates collision-safe Room ID matching format 'NEG-XXXXXX'
   - Creator is automatically assigned
   - Starts in 'waiting' status with participant_id nullable
2. get_room():
   - Retrieves room by room_id
3. request_join():
   - Cannot join closed or expired room
   - Creator cannot join as second participant
   - Enforces maximum 2 participants (only one additional participant allowed)
   - Handles passcode verification
4. admit_participant():
   - Creator authorization check
   - Transitions status to 'active'
5. reject_participant():
   - Creator authorization check
   - Resets participant slot to allow another applicant
6. leave_room():
   - Leaving does NOT delete room or historical data
7. close_room():
   - Creator authorization check
   - Sets status to 'closed' and records closed_at timestamp
"""

from datetime import datetime
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db import SessionLocal, init_db
from app.services.room_service import (
    admit_participant,
    close_room,
    create_room,
    generate_collision_safe_room_id,
    get_room,
    leave_room,
    reject_participant,
    request_join,
)


def test_room_service_lifecycle():
    init_db()

    creator_id = "user_general_counsel_001"
    guest_id = "user_commercial_counsel_002"
    third_party_id = "user_intruder_003"

    with SessionLocal() as db:
        # 1. Test collision-safe Room ID generation
        rid1 = generate_collision_safe_room_id(db)
        rid2 = generate_collision_safe_room_id(db)
        assert rid1.startswith("NEG-"), f"Unexpected prefix: {rid1}"
        assert len(rid1) == 10, f"Expected length 10: {rid1}"
        assert rid1 != rid2, "Generated IDs collided!"

        # 2. Test create_room(): Creator is automatically assigned
        room = create_room(
            db=db,
            creator_id=creator_id,
            matter_id="2025-INT-809",
            title="Enterprise MSA Bilateral Chamber",
            passcode="SEC-7734",
            creator_name="Elena Rostova",
            creator_role="buyer",
        )
        assert room.room_id.startswith("NEG-")
        assert room.creator_id == creator_id
        assert room.creator_name == "Elena Rostova"
        assert room.creator_role == "buyer"
        assert room.participant_id is None
        assert room.status == "waiting"
        assert room.closed_at is None
        assert room.passcode == "SEC-7734"

        room_id = room.room_id

        # 3. Test get_room()
        fetched = get_room(db, room_id)
        assert fetched is not None
        assert fetched.room_id == room_id
        assert fetched.creator_id == creator_id

        # 4. Test request_join() validation:
        # 4a. Creator cannot join as second participant
        try:
            request_join(db, room_id=room_id, participant_id=creator_id, passcode="SEC-7734")
            assert False, "Should have rejected creator joining as second participant"
        except ValueError as err:
            assert "Creator cannot join" in str(err)

        # 4b. Wrong passcode rejected
        try:
            request_join(db, room_id=room_id, participant_id=guest_id, passcode="WRONG-CODE")
            assert False, "Should have rejected wrong passcode"
        except ValueError as err:
            assert "Invalid room passcode" in str(err)

        # 4c. Valid request join
        joining_room = request_join(
            db,
            room_id=room_id,
            participant_id=guest_id,
            passcode="SEC-7734",
            participant_name="Marcus Vance",
            participant_role="seller",
        )
        assert joining_room.participant_id == guest_id
        assert joining_room.guest_name == "Marcus Vance"
        assert joining_room.guest_status == "pending_approval"
        assert joining_room.status == "waiting"

        # 5. Test reject_participant()
        # 5a. Non-creator cannot reject
        try:
            reject_participant(db, room_id=room_id, creator_id=guest_id)
            assert False, "Should have blocked non-creator from rejecting"
        except PermissionError:
            pass

        # 5b. Creator rejects applicant
        rejected_room = reject_participant(db, room_id=room_id, creator_id=creator_id)
        assert rejected_room.participant_id is None
        assert rejected_room.guest_status == "rejected"
        assert rejected_room.status == "waiting"

        # 6. Re-request join with valid applicant
        request_join(
            db,
            room_id=room_id,
            participant_id=guest_id,
            passcode="SEC-7734",
            participant_name="Marcus Vance",
            participant_role="seller",
        )

        # 7. Test admit_participant()
        # 7a. Non-creator cannot admit
        try:
            admit_participant(db, room_id=room_id, creator_id=guest_id)
            assert False, "Should have blocked non-creator from admitting"
        except PermissionError:
            pass

        # 7b. Creator admits second participant -> transitions to active
        admitted_room = admit_participant(db, room_id=room_id, creator_id=creator_id, participant_id=guest_id)
        assert admitted_room.status == "active"
        assert admitted_room.guest_status == "admitted"
        assert admitted_room.active_participants_count == 2

        # 8. Test Rule: Only one additional participant is allowed (strict 2-party limit)
        try:
            request_join(db, room_id=room_id, participant_id=third_party_id, passcode="SEC-7734")
            assert False, "Should have rejected 3rd participant attempt"
        except ValueError as err:
            assert "Only one additional participant is allowed" in str(err)

        # 9. Test leave_room(): Leaving must not delete historical data
        leaving_room = leave_room(db, room_id=room_id, participant_id=guest_id)
        assert leaving_room.guest_status == "left"
        assert leaving_room.active_participants_count == 1
        # Historical messages exist and were not wiped
        assert len(leaving_room.messages) >= 2
        assert any(msg.get("action") == "leave" for msg in leaving_room.messages)

        # Room record still exists in DB
        still_exists = get_room(db, room_id)
        assert still_exists is not None
        assert still_exists.creator_id == creator_id

        # 10. Test close_room(): Creator can close the room
        # 10a. Non-creator cannot close
        try:
            close_room(db, room_id=room_id, creator_id=guest_id)
            assert False, "Should have blocked non-creator from closing"
        except PermissionError:
            pass

        # 10b. Creator closes room
        closed_room = close_room(db, room_id=room_id, creator_id=creator_id)
        assert closed_room.status == "closed"
        assert closed_room.closed_at is not None
        assert any(msg.get("action") == "close" for msg in closed_room.messages)

        # 11. Test Rule: Cannot join a closed/expired room
        try:
            request_join(db, room_id=room_id, participant_id=guest_id, passcode="SEC-7734")
            assert False, "Should have rejected join attempt on closed room"
        except ValueError as err:
            assert "closed or expired" in str(err)

    print("ALL ROOM SERVICE LIFECYCLE TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_room_service_lifecycle()
