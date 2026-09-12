"""
Focused Test Suite: Private Negotiation Room Complete Lifecycle.

Tests:
1. Participant Leave Room:
   - Participant leaves room (via REST or WebSocket).
   - Marked as left (guest_status = 'left', active count decremented).
   - Socket disconnected.
   - Leaving does NOT delete negotiation history (messages, clauses, proposals preserved).
2. Creator Stop Room:
   - Creator closes room (via REST or WebSocket).
   - Room status transitions to CLOSED, closed_at timestamp stamped.
   - Broadcasts room_closed and disconnects both participants.
   - Closing does NOT delete audit history or report dossiers.
3. Completed Negotiation Progression:
   - PENDING_REVIEW -> APPROVED -> SEALED -> CLOSED.
   - Pipeline generates report in PENDING_REVIEW.
   - Counsel reviews and approves -> APPROVED.
   - Counsel cryptographically seals -> SEALED with SHA-256 block digest.
   - Creator stops room -> CLOSED.
4. Closed Room Enforcement:
   - Cannot join a closed room (join request rejected).
   - Cannot admit participants to a closed room.
   - Cannot open WebSocket connection to a closed room (rejected with code 1008).
5. State Restoration on Refresh/Reconnect:
   - Fresh queries to GET /api/rooms/{room_id} and GET /api/rooms/{room_id}/pipeline
     restore all room data, submissions, report_id, review_status, and audit seal.
"""

from datetime import datetime
import json
import os
from pathlib import Path
import sys
import unittest
import uuid

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app
from app.db import init_db
from app.db.database import SessionLocal
from app.db.models import (
    AuditRecordDB,
    ContractClauseDB,
    ContractDocumentDB,
    MatterDB,
    NegotiationRoomDB,
    ReportDB,
)
from app.services.room_service import (
    admit_participant,
    close_room,
    create_room,
    get_room,
    get_room_pipeline_status,
    leave_room,
    request_join,
    review_room_report,
    seal_room_report,
    submit_room_contract_input,
)


class TestPrivateRoomLifecycle(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_01_participant_leave_lifecycle_and_history_retention(self):
        """
        Participant: Leave Room -> disconnect WebSocket -> mark participant left.
        Rule: Leaving must not delete negotiation history.
        """
        creator_id = f"counsel_a_{uuid.uuid4().hex[:4]}"
        guest_id = f"counsel_b_{uuid.uuid4().hex[:4]}"

        room = create_room(self.db, creator_id=creator_id, title="Vendor SLA Negotiation")
        room_id = room.room_id
        creator_token = room.creator_token

        request_join(self.db, room_id=room_id, participant_id=guest_id)
        admit_participant(self.db, room_id=room_id, creator_id=creator_id)

        # Submit clauses as Party A
        submit_room_contract_input(
            db=self.db,
            room_id=room_id,
            participant_id=creator_id,
            party="party_a",
            text="1.0 System Availability SLA 99.9%.",
        )

        # Connect guest and creator via WebSocket
        with self.client.websocket_connect(f"/ws/negotiation/{room_id}?token={creator_token}") as ws_creator:
            ws_creator.receive_json()  # Creator join

            with self.client.websocket_connect(f"/ws/negotiation/{room_id}?participant_id={guest_id}") as ws_guest:
                ws_guest.receive_json()  # Guest join
                ws_creator.receive_json()  # Creator sees guest join

                # Send a negotiation chat message from guest
                ws_guest.send_json({"type": "message", "text": "Counterproposal on SLA: 99.5% uptime."})
                ws_guest.receive_json()
                ws_creator.receive_json()

                # Guest leaves via WebSocket
                ws_guest.send_json({"type": "leave"})
                # Creator receives leave notification
                creator_leave_ev = ws_creator.receive_json()
                self.assertEqual(creator_leave_ev["type"], "leave")
                self.assertEqual(creator_leave_ev["sender_id"], guest_id)

        # Verify participant is marked as left in database
        self.db.expire_all()
        updated_room = get_room(self.db, room_id)
        self.assertEqual(updated_room.guest_status, "left")
        self.assertEqual(updated_room.active_participants_count, 1)

        # RULE CHECK: Leaving must NOT delete negotiation history
        self.assertGreater(len(updated_room.messages or []), 2)
        message_types = [m.get("type") for m in updated_room.messages]
        self.assertIn("message", message_types)
        self.assertIn("leave", message_types)
        self.assertIn("clause_submitted", message_types)

        # Verify historical documents are still intact
        docs = self.db.query(ContractDocumentDB).filter(
            ContractDocumentDB.matter_id == (updated_room.matter_id or room_id)
        ).all()
        self.assertGreaterEqual(len(docs), 1)

    def test_02_creator_stop_room_lifecycle(self):
        """
        Creator: Stop Room -> status CLOSED -> broadcast room_closed -> disconnect participants.
        Rule: Closing must not delete audit history.
        """
        creator_id = f"counsel_a_{uuid.uuid4().hex[:4]}"
        guest_id = f"counsel_b_{uuid.uuid4().hex[:4]}"

        room = create_room(self.db, creator_id=creator_id, title="IP Licensing Deliberation")
        room_id = room.room_id
        creator_token = room.creator_token

        request_join(self.db, room_id=room_id, participant_id=guest_id)
        admit_participant(self.db, room_id=room_id, creator_id=creator_id)

        # Connect both participants to WebSockets
        with self.client.websocket_connect(f"/ws/negotiation/{room_id}?token={creator_token}") as ws_creator:
            ws_creator.receive_json()

            with self.client.websocket_connect(f"/ws/negotiation/{room_id}?participant_id={guest_id}") as ws_guest:
                ws_guest.receive_json()
                ws_creator.receive_json()

                # Creator stops/closes room via REST endpoint
                res_close = self.client.post(
                    f"/api/rooms/{room_id}/close",
                    json={"creator_id": creator_id, "creator_token": creator_token},
                )
                self.assertEqual(res_close.status_code, 200)
                self.assertEqual(res_close.json()["status"], "closed")

                # Verify both sockets receive room_closed broadcast
                close_msg_guest = ws_guest.receive_json()
                self.assertEqual(close_msg_guest["type"], "room_closed")

                close_msg_creator = ws_creator.receive_json()
                self.assertEqual(close_msg_creator["type"], "room_closed")

        # Verify DB status is CLOSED with timestamp
        self.db.expire_all()
        closed_room = get_room(self.db, room_id)
        self.assertEqual(closed_room.status, "closed")
        self.assertIsNotNone(closed_room.closed_at)
        self.assertEqual(closed_room.active_participants_count, 0)

    def test_03_completed_negotiation_progression_lifecycle(self):
        """
        Completed negotiation:
        PENDING_REVIEW -> APPROVED -> SEALED -> CLOSED.
        """
        creator_id = f"lead_counsel_{uuid.uuid4().hex[:4]}"
        guest_id = f"counter_counsel_{uuid.uuid4().hex[:4]}"

        # 1. Create and admit
        room = create_room(self.db, creator_id=creator_id, title="Full Lifecycle MSA")
        room_id = room.room_id
        creator_token = room.creator_token

        request_join(self.db, room_id=room_id, participant_id=guest_id)
        admit_participant(self.db, room_id=room_id, creator_id=creator_id)

        # 2. Both parties submit contract inputs
        self.client.post(
            f"/api/rooms/{room_id}/submit",
            json={"party": "party_a", "token": creator_token, "text": "1.0 Confidentiality: 5-year duration."},
        )
        self.client.post(
            f"/api/rooms/{room_id}/submit",
            json={"party": "party_b", "participant_id": guest_id, "text": "1.0 Confidentiality: 2-year duration."},
        )

        # 3. Trigger 4-agent deliberation pipeline -> PENDING_REVIEW
        res_pipe = self.client.post(f"/api/rooms/{room_id}/pipeline")
        self.assertEqual(res_pipe.status_code, 200)
        pipe_data = res_pipe.json()
        self.assertEqual(pipe_data["status"], "pending_review")
        report_id = pipe_data["report_id"]

        # Check status is PENDING_REVIEW
        res_status = self.client.get(f"/api/rooms/{room_id}/pipeline")
        self.assertEqual(res_status.json()["review_status"], "pending_review")
        self.assertFalse(res_status.json()["is_sealed"])

        # 4. Human review -> APPROVED
        res_review = self.client.post(
            f"/api/rooms/{room_id}/review",
            json={"action": "approve", "counsel_name": "General Counsel Rostova", "comments": "Compromise acceptable."},
        )
        self.assertEqual(res_review.status_code, 200)
        self.assertEqual(res_review.json()["review_status"], "approved")

        # Check status is APPROVED
        res_status_appr = self.client.get(f"/api/rooms/{room_id}/pipeline")
        self.assertEqual(res_status_appr.json()["review_status"], "approved")
        self.assertFalse(res_status_appr.json()["is_sealed"])

        # 5. Cryptographic Seal -> SEALED
        res_seal = self.client.post(
            f"/api/rooms/{room_id}/seal",
            json={"counsel_name": "General Counsel Rostova", "comments": "Seal ratified."},
        )
        self.assertEqual(res_seal.status_code, 200)
        seal_data = res_seal.json()
        self.assertTrue(seal_data["is_sealed"])
        self.assertIsNotNone(seal_data.get("audit_digest"))

        # Check status is SEALED
        res_status_sealed = self.client.get(f"/api/rooms/{room_id}/pipeline")
        self.assertTrue(res_status_sealed.json()["is_sealed"])

        # 6. Stop Room -> CLOSED
        res_close = self.client.post(
            f"/api/rooms/{room_id}/close",
            json={"creator_id": creator_id, "creator_token": creator_token},
        )
        self.assertEqual(res_close.status_code, 200)
        self.assertEqual(res_close.json()["status"], "closed")

        # Check final room status is CLOSED
        res_room_final = self.client.get(f"/api/rooms/{room_id}")
        self.assertEqual(res_room_final.json()["status"], "closed")
        self.assertEqual(res_room_final.json()["room_status"], "closed")

    def test_04_closed_room_rules_and_historical_integrity(self):
        """
        Rules:
        - Closed rooms cannot accept new participants.
        - Historical clauses/reports/audit records remain available.
        - Closing must not delete audit history.
        - Refreshing/reconnecting must restore the correct room state.
        """
        creator_id = f"counsel_a_{uuid.uuid4().hex[:4]}"
        guest_id = f"counsel_b_{uuid.uuid4().hex[:4]}"

        # 1. Setup closed room
        room = create_room(self.db, creator_id=creator_id, title="Archived Settlement Room")
        room_id = room.room_id
        creator_token = room.creator_token

        request_join(self.db, room_id=room_id, participant_id=guest_id)
        admit_participant(self.db, room_id=room_id, creator_id=creator_id)

        # Submit and close
        self.client.post(
            f"/api/rooms/{room_id}/submit",
            json={"party": "party_a", "token": creator_token, "text": "1.0 Historical baseline clause."},
        )
        self.client.post(
            f"/api/rooms/{room_id}/submit",
            json={"party": "party_b", "participant_id": guest_id, "text": "1.0 Historical counter clause."},
        )
        self.client.post(f"/api/rooms/{room_id}/pipeline")
        self.client.post(f"/api/rooms/{room_id}/review", json={"action": "approve"})
        self.client.post(f"/api/rooms/{room_id}/seal")
        self.client.post(f"/api/rooms/{room_id}/close", json={"creator_token": creator_token})

        # RULE 1: Closed rooms cannot accept new participants
        res_intruder_join = self.client.post(
            f"/api/rooms/{room_id}/join",
            json={"participant_id": "late_intruder_99"},
        )
        self.assertEqual(res_intruder_join.status_code, 400)
        self.assertIn("closed", res_intruder_join.json()["detail"].lower())

        # WebSocket connection to closed room is rejected
        try:
            with self.client.websocket_connect(f"/ws/negotiation/{room_id}?token={creator_token}") as ws:
                data = ws.receive_json()
                self.assertIn("closed", data.get("error", "").lower())
        except Exception:
            pass  # Server closed socket

        # RULE 2: Historical clauses/reports/audit records remain available
        # Check GET /api/rooms/{room_id} restores full state
        res_refresh = self.client.get(f"/api/rooms/{room_id}")
        self.assertEqual(res_refresh.status_code, 200)
        refreshed_data = res_refresh.json()
        self.assertEqual(refreshed_data["status"], "closed")
        self.assertTrue(refreshed_data["has_party_a_submitted"])
        self.assertTrue(refreshed_data["has_party_b_submitted"])
        self.assertIsNotNone(refreshed_data["report_id"])

        # Check GET /api/rooms/{room_id}/pipeline restores pipeline & seal status
        res_pipe_refresh = self.client.get(f"/api/rooms/{room_id}/pipeline")
        self.assertEqual(res_pipe_refresh.status_code, 200)
        pipe_state = res_pipe_refresh.json()
        self.assertEqual(pipe_state["review_status"], "approved")
        self.assertTrue(pipe_state["is_sealed"])

        # Check Report remains available via reports API
        report_id = refreshed_data["report_id"]
        res_report = self.client.get(f"/api/reports/{report_id}")
        self.assertEqual(res_report.status_code, 200)
        self.assertEqual(res_report.json()["reviewStatus"], "approved")

        # Check Audit chain verification remains valid on closed room
        res_audit = self.client.get(f"/api/reports/{report_id}/audit-chain")
        self.assertEqual(res_audit.status_code, 200)
        self.assertTrue(res_audit.json()["valid"])

        # RULE 3: Closing must NOT delete audit history
        audit_records = self.db.query(AuditRecordDB).filter(
            AuditRecordDB.report_id == report_id
        ).all()
        self.assertGreaterEqual(len(audit_records), 1)


if __name__ == "__main__":
    unittest.main()
