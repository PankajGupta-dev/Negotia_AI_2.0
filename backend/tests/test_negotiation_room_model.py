"""
Focused Test for NegotiationRoom Model and Database Table.

Verifies:
1. NegotiationRoom Pydantic model instantiation & validation with RoomStatus enum.
2. NegotiationRoomDB table creation and session CRUD operations:
   - Insertion with generated room_id (e.g. NEG-8K4P7M), matter_id, creator_id,
     participant_id nullable, status, created_at, closed_at nullable.
   - Querying by room_id.
   - Updating participant_id and status transitions (waiting -> active -> closed -> expired).
   - Verifying closed_at nullable behavior.
"""

from datetime import datetime
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db import SessionLocal, init_db
from app.db.models import NegotiationRoomDB, NegotiationRoom as NegotiationRoomTable
from app.models.room import NegotiationRoom, RoomStatus, generate_room_id


def test_pydantic_negotiation_room_model():
    # Test generated ID
    room_default = NegotiationRoom(
        creator_id="user-buyer-101",
        matter_id="MATTER-2025-01",
    )
    assert room_default.room_id.startswith("NEG-"), f"Unexpected ID format: {room_default.room_id}"
    assert len(room_default.room_id) == 10  # "NEG-" + 6 chars = 10
    assert room_default.status == RoomStatus.WAITING
    assert room_default.participant_id is None
    assert room_default.closed_at is None
    assert isinstance(room_default.created_at, datetime)

    # Test custom values and statuses
    room_custom = NegotiationRoom(
        room_id="NEG-8K4P7M",
        matter_id="MATTER-2025-02",
        creator_id="counsel-elena",
        participant_id="counsel-marcus",
        status=RoomStatus.ACTIVE,
        closed_at=None,
    )
    assert room_custom.room_id == "NEG-8K4P7M"
    assert room_custom.participant_id == "counsel-marcus"
    assert room_custom.status == RoomStatus.ACTIVE
    assert room_custom.status.value in ["waiting", "active", "closed", "expired"]
    print("Pydantic NegotiationRoom model test: PASSED")


def test_db_table_creation_and_query():
    # 1. Initialize DB and apply table migration
    init_db()

    target_room_id = f"NEG-{generate_room_id().split('-')[1]}"
    target_matter_id = "2025-INT-809"
    target_creator = "creator-user-001"
    now = datetime.utcnow()

    # 2. Insert into database
    with SessionLocal() as db:
        room_db = NegotiationRoomTable(
            room_id=target_room_id,
            matter_id=target_matter_id,
            creator_id=target_creator,
            participant_id=None,
            status="waiting",
            created_at=now,
            closed_at=None,
        )
        db.add(room_db)
        db.commit()

    # 3. Query from database by room_id
    with SessionLocal() as db:
        queried = db.query(NegotiationRoomDB).filter(NegotiationRoomDB.room_id == target_room_id).first()
        assert queried is not None, f"Room {target_room_id} not found in database!"
        assert queried.room_id == target_room_id
        assert queried.matter_id == target_matter_id
        assert queried.creator_id == target_creator
        assert queried.participant_id is None
        assert queried.status == "waiting"
        assert queried.closed_at is None
        assert queried.created_at is not None

        # 4. Update participant_id and transition status to active
        queried.participant_id = "participant-user-002"
        queried.status = "active"
        db.commit()

    # 5. Verify update
    with SessionLocal() as db:
        updated = db.query(NegotiationRoomTable).filter(NegotiationRoomTable.room_id == target_room_id).first()
        assert updated.participant_id == "participant-user-002"
        assert updated.status == "active"

        # 6. Close room and set closed_at
        closed_time = datetime.utcnow()
        updated.status = "closed"
        updated.closed_at = closed_time
        db.commit()

    # 7. Verify closed state
    with SessionLocal() as db:
        final_state = db.query(NegotiationRoomDB).filter(NegotiationRoomDB.room_id == target_room_id).first()
        assert final_state.status == "closed"
        assert final_state.closed_at is not None

        # 8. Query status filtering
        closed_rooms = db.query(NegotiationRoomDB).filter(NegotiationRoomDB.status == "closed").all()
        assert any(r.room_id == target_room_id for r in closed_rooms)

    print("SQLAlchemy NegotiationRoom database CRUD and query test: PASSED")


if __name__ == "__main__":
    test_pydantic_negotiation_room_model()
    test_db_table_creation_and_query()
    print("ALL TESTS COMPLETED SUCCESSFULLY!")
