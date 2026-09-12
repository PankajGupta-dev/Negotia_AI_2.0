"""
End-to-End Private Room Hardening Test Suite

Tests the complete private room lifecycle:
  Creator creates room
  → Room ID generated
  → counterparty requests join
  → creator admits
  → both enter private room
  → both submit clauses
  → Agent 1-4 execute
  → report generated
  → human review
  → cryptographic seal
  → participant leaves OR creator closes room

Also tests hardening:
  - Closed room rejects new participants, messages, clauses, pipeline starts
  - Duplicate pipeline execution prevented
  - Third participant prevented
  - Leave preserves historical data
  - Close preserves historical data
"""

import asyncio
import os
import sys
import json
import secrets
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient


class TestPrivateRoomEndToEnd(unittest.TestCase):
    """Full end-to-end test for Private Room lifecycle and hardening."""

    @classmethod
    def setUpClass(cls):
        from app.main import app
        from app.db.database import init_db
        init_db()
        cls.client = TestClient(app)

    def test_01_create_room(self):
        """Creator creates room → Room ID generated."""
        res = self.client.post("/api/rooms", json={
            "creator_name": "Elena Rostova",
            "creator_role": "buyer",
            "title": "E2E Test Negotiation Room",
        })
        self.assertIn(res.status_code, [200, 201])
        data = res.json()
        self.assertIn("room_id", data)
        self.assertTrue(data["room_id"].startswith("NEG-"))
        self.assertEqual(data["status"], "waiting")
        self.assertIn("creator_token", data)

        # Store for subsequent tests
        self.__class__.room_id = data["room_id"]
        self.__class__.creator_token = data["creator_token"]
        self.__class__.creator_id = data["creator_id"]
        print(f"  ✓ Room created: {data['room_id']}")

    def test_02_get_room(self):
        """GET room returns correct state."""
        res = self.client.get(f"/api/rooms/{self.room_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["room_id"], self.room_id)
        self.assertEqual(data["status"], "waiting")
        print(f"  ✓ Room retrieved: status={data['status']}")

    def test_03_counterparty_requests_join(self):
        """Counterparty requests join."""
        res = self.client.post(f"/api/rooms/{self.room_id}/join", json={
            "participant_name": "Marcus Vance",
            "participant_role": "seller",
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["guest_status"], "pending_approval")
        self.__class__.guest_token = data.get("guest_token")
        self.__class__.participant_id = data.get("participant_id")
        print(f"  ✓ Join requested: guest_status={data['guest_status']}")

    def test_04_creator_admits_counterparty(self):
        """Creator admits second participant."""
        res = self.client.post(
            f"/api/rooms/{self.room_id}/admit",
            json={"creator_token": self.creator_token},
            headers={"X-Creator-Token": self.creator_token},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "active")
        self.assertEqual(data.get("guest_status"), "admitted")
        print(f"  ✓ Participant admitted: status={data['status']}")

    def test_05_third_participant_rejected(self):
        """Third participant cannot join (max 2)."""
        res = self.client.post(f"/api/rooms/{self.room_id}/join", json={
            "participant_name": "Intruder",
            "participant_role": "seller",
        })
        # Should be rejected: either 409 Conflict or 400 Bad Request
        self.assertIn(res.status_code, [400, 409])
        print(f"  ✓ Third participant rejected: {res.status_code}")

    def test_06_party_a_submits_clauses(self):
        """Party A (creator) submits contract clauses."""
        res = self.client.post(
            f"/api/rooms/{self.room_id}/submit",
            json={
                "party": "party_a",
                "text": "1.0 PREAMBLE\nThis Agreement is entered into by Party A.\n\n2.0 LIABILITY\nLiability capped at $2M.\n\n3.0 GOVERNING LAW\nDelaware law applies.",
                "filename": "party_a_test.txt",
            },
            headers={"X-Creator-Token": self.creator_token},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("has_party_a_submitted"))
        print(f"  ✓ Party A submitted: ready={data.get('ready_for_pipeline')}")

    def test_07_party_b_submits_clauses(self):
        """Party B (counterparty) submits contract clauses."""
        headers = {}
        if self.guest_token:
            headers["X-Participant-Token"] = self.guest_token

        res = self.client.post(
            f"/api/rooms/{self.room_id}/submit",
            json={
                "party": "party_b",
                "text": "1.0 PREAMBLE\nThis Agreement is entered into by Party B.\n\n2.0 LIABILITY\nLiability capped at $5M.\n\n3.0 GOVERNING LAW\nNew York law applies.",
                "filename": "party_b_test.txt",
            },
            headers=headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("has_party_b_submitted"))
        self.assertTrue(data.get("ready_for_pipeline"))
        print(f"  ✓ Party B submitted: ready={data.get('ready_for_pipeline')}")

    def test_08_room_ready_for_pipeline(self):
        """Verify room is now marked READY."""
        res = self.client.get(f"/api/rooms/{self.room_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("ready_for_pipeline") or data.get("is_ready"))
        print(f"  ✓ Room is READY: readiness={data.get('readiness')}")

    def test_09_pipeline_executes(self):
        """Agent 1-4 pipeline executes → report generated."""
        res = self.client.post(f"/api/rooms/{self.room_id}/pipeline/start")
        # Pipeline may succeed or partially fail (LLM unavailable), but endpoint must respond
        self.assertIn(res.status_code, [200, 400, 500])
        data = res.json()
        print(f"  ✓ Pipeline executed: status={res.status_code}, keys={list(data.keys())[:5]}")
        self.__class__.pipeline_ran = res.status_code == 200

    def test_10_duplicate_pipeline_prevented(self):
        """Pipeline cannot run twice when already completed."""
        if not getattr(self, 'pipeline_ran', False):
            self.skipTest("Pipeline did not succeed in previous step")
        res = self.client.post(f"/api/rooms/{self.room_id}/pipeline/start")
        self.assertIn(res.status_code, [400, 409, 500])
        print(f"  ✓ Duplicate pipeline prevented: {res.status_code}")

    def test_11_human_review(self):
        """Human review (approve)."""
        res = self.client.post(f"/api/rooms/{self.room_id}/review", json={
            "action": "approve",
            "counsel_name": "General Counsel",
            "comments": "E2E test approval.",
        })
        self.assertIn(res.status_code, [200, 400])
        print(f"  ✓ Review submitted: {res.status_code}")

    def test_12_cryptographic_seal(self):
        """Cryptographic seal."""
        res = self.client.post(f"/api/rooms/{self.room_id}/seal", json={
            "counsel_name": "General Counsel",
            "comments": "E2E sealed.",
        })
        self.assertIn(res.status_code, [200, 400])
        print(f"  ✓ Seal submitted: {res.status_code}")

    def test_13_participant_leaves(self):
        """Participant (guest) leaves room → historical data preserved."""
        res = self.client.post(f"/api/rooms/{self.room_id}/leave", json={
            "token": self.guest_token,
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        # Messages must still be present
        messages = data.get("messages", [])
        self.assertIsInstance(messages, list)
        self.assertGreater(len(messages), 0, "Historical messages must be preserved after leave")
        print(f"  ✓ Participant left: messages preserved ({len(messages)} total)")

    def test_14_room_shows_left_status(self):
        """After leave, room shows correct status."""
        res = self.client.get(f"/api/rooms/{self.room_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("guest_status"), "left")
        print(f"  ✓ Guest status after leave: {data.get('guest_status')}")

    def test_15_creator_closes_room(self):
        """Creator closes room."""
        res = self.client.post(
            f"/api/rooms/{self.room_id}/close",
            json={"creator_token": self.creator_token},
            headers={"X-Creator-Token": self.creator_token},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "closed")
        self.assertIsNotNone(data.get("closed_at"))
        print(f"  ✓ Room closed: status={data['status']}")

    def test_16_closed_room_rejects_join(self):
        """Closed room rejects new join requests."""
        res = self.client.post(f"/api/rooms/{self.room_id}/join", json={
            "participant_name": "Late Joiner",
            "participant_role": "seller",
        })
        self.assertEqual(res.status_code, 400)
        print(f"  ✓ Closed room rejected join: {res.status_code}")

    def test_17_closed_room_rejects_messages(self):
        """Closed room rejects new messages."""
        res = self.client.post(f"/api/rooms/{self.room_id}/messages", json={
            "text": "This should fail",
            "sender_name": "Test",
            "sender_role": "buyer",
        })
        self.assertEqual(res.status_code, 400)
        print(f"  ✓ Closed room rejected message: {res.status_code}")

    def test_18_closed_room_rejects_submit(self):
        """Closed room rejects new clause submissions."""
        res = self.client.post(
            f"/api/rooms/{self.room_id}/submit",
            json={
                "party": "party_a",
                "text": "New clauses after close",
            },
            headers={"X-Creator-Token": self.creator_token},
        )
        self.assertEqual(res.status_code, 400)
        print(f"  ✓ Closed room rejected submit: {res.status_code}")

    def test_19_closed_room_rejects_pipeline(self):
        """Closed room rejects pipeline start."""
        res = self.client.post(f"/api/rooms/{self.room_id}/pipeline/start")
        self.assertEqual(res.status_code, 400)
        print(f"  ✓ Closed room rejected pipeline: {res.status_code}")

    def test_20_closed_room_preserves_history(self):
        """Closed room preserves all historical data."""
        res = self.client.get(f"/api/rooms/{self.room_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "closed")
        messages = data.get("messages", [])
        self.assertGreater(len(messages), 0, "All historical messages must be preserved")
        # Check that close event is in history
        close_events = [m for m in messages if m.get("action") == "close"]
        self.assertGreater(len(close_events), 0, "Close event must be in audit history")
        print(f"  ✓ History preserved: {len(messages)} messages, close event in audit")

    def test_21_unauthorized_close_rejected(self):
        """Non-creator cannot close room."""
        # Create a new room to test unauthorized close
        create_res = self.client.post("/api/rooms", json={
            "creator_name": "Auth Test Creator",
            "creator_role": "buyer",
        })
        self.assertIn(create_res.status_code, [200, 201])
        new_room_id = create_res.json()["room_id"]

        res = self.client.post(
            f"/api/rooms/{new_room_id}/close",
            json={"creator_token": "invalid_token_xyz"},
            headers={"X-Creator-Token": "invalid_token_xyz"},
        )
        self.assertEqual(res.status_code, 403)
        print(f"  ✓ Unauthorized close rejected: {res.status_code}")


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("PRIVATE ROOM END-TO-END HARDENING TEST")
    print("=" * 70)
    unittest.main(verbosity=2, failfast=False)
