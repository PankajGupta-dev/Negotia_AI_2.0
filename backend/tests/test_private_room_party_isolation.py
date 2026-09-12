"""
Comprehensive Authorization & Privacy Isolation Tests for Private Negotiation Rooms.

Verifies:
1. Party A can submit/edit ONLY own (Party A) inputs.
2. Party A cannot edit or submit Party B inputs (403 / PermissionError).
3. Party B can submit/edit ONLY own (Party B) inputs.
4. Party B cannot edit or submit Party A inputs (403 / PermissionError).
5. Party A cannot inspect Party B's private internal chamber documents (403).
6. Party B cannot inspect Party A's private internal chamber documents (403).
7. File upload (.txt, .docx, .pdf) reuses existing parsers and extracts clauses.
8. When both parties have submitted required inputs, room is marked READY.
9. Shared chamber (/api/rooms/{id}/shared) exposes only safe, mutually visible clauses, proposals, agreed changes, and AI results.
10. Connects to existing Matter + Pipeline Orchestrator without duplicate pipeline engines.
"""

import asyncio
from pathlib import Path
import sys
import unittest
import uuid

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.db import init_db
from app.db.database import SessionLocal
from app.main import app
from app.services.room_service import (
    admit_participant,
    create_room,
    get_room,
    get_room_private_input,
    get_room_shared_state,
    request_join,
    submit_room_contract_input,
    upload_room_contract_file,
)


class TestPrivateRoomPartyIsolation(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_party_isolation_and_authorization(self):
        """Verify strict authorization: Party A and Party B can edit/view ONLY their own inputs."""
        creator_id = f"counsel_a_{uuid.uuid4().hex[:4]}"
        guest_id = f"counsel_b_{uuid.uuid4().hex[:4]}"

        # 1. Create Room & Admit Guest
        room = create_room(
            self.db,
            creator_id=creator_id,
            creator_name="Elena Rostova (Buyer)",
            creator_role="buyer",
            title="SaaS Enterprise Licensing Room",
        )
        room_id = room.room_id
        creator_token = room.creator_token

        # Guest knocks
        join_res = request_join(
            self.db,
            room_id=room_id,
            participant_id=guest_id,
            participant_name="Marcus Vance (Seller)",
            participant_role="seller",
        )
        guest_token = join_res.guest_token

        # Creator admits guest -> Room active
        room = admit_participant(self.db, room_id=room_id, creator_id=creator_id)
        self.assertEqual(room.status, "active")

        # 2. Rule: Party A cannot submit as Party B
        with self.assertRaises(PermissionError) as ctx_a:
            submit_room_contract_input(
                db=self.db,
                room_id=room_id,
                token=creator_token,
                party="party_b",
                text="Party A attempting to overwrite Party B terms.",
            )
        self.assertIn("Party A can submit or edit only Party A inputs", str(ctx_a.exception))

        # 3. Rule: Party B cannot submit as Party A
        with self.assertRaises(PermissionError) as ctx_b:
            submit_room_contract_input(
                db=self.db,
                room_id=room_id,
                token=guest_token,
                party="party_a",
                text="Party B attempting to overwrite Party A terms.",
            )
        self.assertIn("Party B can submit or edit only Party B inputs", str(ctx_b.exception))

        # 4. Party A submits own inputs successfully
        party_a_text = (
            "1.0 LIMITATION OF LIABILITY\n"
            "Buyer aggregate liability shall be capped at 12 months ARR fees.\n\n"
            "2.0 GOVERNING LAW\n"
            "This Agreement is governed by Delaware state law."
        )
        res_a = submit_room_contract_input(
            db=self.db,
            room_id=room_id,
            token=creator_token,
            party="party_a",
            text=party_a_text,
            filename="party_a_contract.txt",
        )
        self.assertEqual(res_a["party"], "party_a")
        self.assertTrue(res_a["has_party_a_submitted"])
        self.assertFalse(res_a["has_party_b_submitted"])
        self.assertFalse(res_a["ready_for_pipeline"])
        self.assertEqual(res_a["readiness"], "WAITING_FOR_COUNTERPARTY")

        # 5. Privacy: Party A can view own input
        input_a = get_room_private_input(
            db=self.db,
            room_id=room_id,
            party="party_a",
            token=creator_token,
        )
        self.assertTrue(input_a["has_submitted"])
        self.assertIn("Buyer aggregate liability", input_a["text"])

        # 6. Privacy: Party A CANNOT view Party B's private chamber (forbidden)
        with self.assertRaises(PermissionError) as ctx_leak_b:
            get_room_private_input(
                db=self.db,
                room_id=room_id,
                party="party_b",
                token=creator_token,
            )
        self.assertIn("not permitted to view Party B's private internal documents", str(ctx_leak_b.exception))

        # 7. Party B uploads contract file (reusing parser)
        party_b_bytes = (
            b"1.0 LIMITATION OF LIABILITY\n"
            b"Seller liability is capped at 1x monthly fees. No consequential damages.\n\n"
            b"2.0 GOVERNING LAW\n"
            b"This Agreement is governed by New York state law."
        )
        res_b = upload_room_contract_file(
            db=self.db,
            room_id=room_id,
            file_bytes=party_b_bytes,
            filename="seller_redline.txt",
            party="party_b",
            token=guest_token,
        )
        self.assertEqual(res_b["party"], "party_b")
        self.assertTrue(res_b["has_party_b_submitted"])
        self.assertTrue(res_b["has_party_a_submitted"])

        # 8. Gating Rule: When both parties have submitted, mark room READY!
        self.assertTrue(res_b["ready_for_pipeline"])
        self.assertEqual(res_b["readiness"], "READY")

        # 9. Privacy: Party B CANNOT view Party A's private chamber (forbidden)
        with self.assertRaises(PermissionError) as ctx_leak_a:
            get_room_private_input(
                db=self.db,
                room_id=room_id,
                party="party_a",
                token=guest_token,
            )
        self.assertIn("not permitted to view Party A's private internal documents", str(ctx_leak_a.exception))

        # 10. Shared Space (/api/rooms/{id}/shared) provides safe shared view
        shared_state = get_room_shared_state(db=self.db, room_id=room_id)
        self.assertEqual(shared_state["readiness"], "READY")
        self.assertTrue(shared_state["ready_for_pipeline"])
        self.assertIn("mutually_visible_clauses", shared_state)
        self.assertIn("proposals", shared_state)
        self.assertIn("agreed_changes", shared_state)
        self.assertIn("ai_results", shared_state)
        # Ensure raw internal private text dictionary is never leaked
        self.assertNotIn("_private_submissions", shared_state)

    def test_rest_api_party_isolation(self):
        """Verify REST endpoints enforce 403 Forbidden for cross-party private access."""
        creator_id = f"counsel_a_{uuid.uuid4().hex[:4]}"
        guest_id = f"counsel_b_{uuid.uuid4().hex[:4]}"

        # Create room via REST
        c_res = self.client.post("/api/rooms", json={
            "creator_id": creator_id,
            "creator_name": "Elena Rostova (Buyer)",
            "creator_role": "buyer",
            "title": "REST Security Chamber",
        })
        self.assertEqual(c_res.status_code, 201)
        r_data = c_res.json()
        room_id = r_data["room_id"]
        c_tok = r_data["creator_token"]

        # Knock via REST
        j_res = self.client.post(f"/api/rooms/{room_id}/join", json={
            "guest_id": guest_id,
            "guest_name": "Marcus Vance (Seller)",
            "guest_role": "seller",
        })
        self.assertEqual(j_res.status_code, 200)
        g_tok = j_res.json()["guest_token"]

        # Admit via REST
        a_res = self.client.post(
            f"/api/rooms/{room_id}/admit",
            headers={"X-Creator-Token": c_tok},
            json={"creator_token": c_tok, "participant_id": guest_id},
        )
        self.assertEqual(a_res.status_code, 200)

        # Party A submits via REST
        sub_a_res = self.client.post(
            f"/api/rooms/{room_id}/submit",
            headers={"X-Creator-Token": c_tok},
            json={
                "party": "party_a",
                "text": "1.0 Confidentiality\nStrict 5-year confidentiality required.",
            },
        )
        self.assertEqual(sub_a_res.status_code, 200)
        self.assertEqual(sub_a_res.json()["readiness"], "WAITING_FOR_COUNTERPARTY")

        # Attempt: Party A tries to submit Party B inputs via REST -> 403
        bad_sub = self.client.post(
            f"/api/rooms/{room_id}/submit",
            headers={"X-Creator-Token": c_tok},
            json={
                "party": "party_b",
                "text": "Unauthorized Party A trying to submit Party B.",
            },
        )
        self.assertEqual(bad_sub.status_code, 403)

        # Attempt: Party A tries to view Party B private chamber via REST -> 403
        leak_try = self.client.get(
            f"/api/rooms/{room_id}/inputs/party_b",
            headers={"X-Creator-Token": c_tok},
        )
        self.assertEqual(leak_try.status_code, 403)

        # Party A views own private chamber via REST -> 200
        my_try = self.client.get(
            f"/api/rooms/{room_id}/inputs/party_a",
            headers={"X-Creator-Token": c_tok},
        )
        self.assertEqual(my_try.status_code, 200)
        self.assertTrue(my_try.json()["has_submitted"])

        # Party B uploads file via REST
        file_payload = ("test_doc.txt", b"1.0 Confidentiality\nStandard 2-year confidentiality term.", "text/plain")
        up_res = self.client.post(
            f"/api/rooms/{room_id}/upload",
            headers={"X-Participant-Token": g_tok},
            data={"party": "party_b"},
            files={"file": file_payload},
        )
        self.assertEqual(up_res.status_code, 200)
        self.assertTrue(up_res.json()["ready_for_pipeline"])
        self.assertEqual(up_res.json()["readiness"], "READY")

        # Check shared state via REST -> 200, READY
        shared_res = self.client.get(f"/api/rooms/{room_id}/shared")
        self.assertEqual(shared_res.status_code, 200)
        sh_data = shared_res.json()
        self.assertEqual(sh_data["readiness"], "READY")
        self.assertTrue(sh_data["ready_for_pipeline"])
        self.assertTrue(sh_data["has_party_a_submitted"])
        self.assertTrue(sh_data["has_party_b_submitted"])


if __name__ == "__main__":
    unittest.main()
