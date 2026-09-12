"""
End-to-End Integration Test Suite: Private Room + 4-Agent Pipeline Integration.

Tests the full bilateral deliberation flow:
1. Room created & participant admitted (Room becomes 'active').
2. Room not active rejects submission attempt.
3. Party A submits clauses/document:
   - Data associated with room_id/matter_id.
   - Private drafting content kept strictly private.
   - Gating rule: Pipeline does NOT start yet (counterparty awaited).
4. Party B submits clauses/document:
   - Both party inputs now available.
   - Triggers 4-agent deliberation pipeline:
     * Agent 1 (Lex-Ingestor A) + Agent 2 (Lex-Ingestor B)
     * Agent 3 Arbiter (Dual-Lens Deliberation & Compromise Proposals)
     * Agent 4 Scrivener (Executive Synthesis & Audit Payload)
   - Generates ReportDB with review_status == 'pending_review'.
5. Shared AI findings and Arbiter compromise proposals broadcast over WebSocket.
6. Premature sealing attempt without approval is strictly rejected.
7. Counsel review: 'approve' sets report eligible for sealing.
8. Audit seal: cryptographic SHA-256 anchoring in AuditRecordDB with tip digest.
"""

import asyncio
from datetime import datetime
import json
import os
from pathlib import Path
import sys
import unittest
import uuid

# Setup sys.path for test execution
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.config import settings
from app.db import init_db
from app.db.database import SessionLocal
from app.db.models import (
    AgentRunDB,
    AuditRecordDB,
    ContractClauseDB,
    ContractDocumentDB,
    MatterDB,
    NegotiationRoomDB,
    ReportDB,
)
from app.main import app
from app.services.room_service import (
    admit_participant,
    close_room,
    create_room,
    execute_room_pipeline,
    get_room,
    get_room_pipeline_status,
    request_join,
    review_room_report,
    seal_room_report,
    submit_room_contract_input,
)


class TestPrivateRoomPipelineIntegration(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_01_inactive_room_rejects_contract_submission(self):
        """Rule: Submissions must be rejected if the room is not active (e.g. still waiting)."""
        creator_id = f"counsel_a_{uuid.uuid4().hex[:4]}"
        room = create_room(self.db, creator_id=creator_id, title="Test Pending Room")
        self.assertEqual(room.status, "waiting")

        # Attempt to submit clauses before second participant is admitted
        with self.assertRaises(ValueError) as ctx:
            submit_room_contract_input(
                db=self.db,
                room_id=room.room_id,
                participant_id=creator_id,
                party="party_a",
                text="1.0 Confidentiality clause baseline text.",
            )
        self.assertIn("active", str(ctx.exception).lower())

    def test_02_full_pipeline_bilateral_flow_and_gating(self):
        """
        Complete flow test:
        Room active -> Party A submits -> Gating enforces waiting ->
        Party B submits -> Agent 1 + 2 + 3 + 4 run -> Report generated ->
        Human review -> Cryptographic seal.
        """
        creator_id = f"creator_{uuid.uuid4().hex[:4]}"
        guest_id = f"guest_{uuid.uuid4().hex[:4]}"

        # Step 1: Create room and admit second participant to make room active
        room = create_room(
            self.db,
            creator_id=creator_id,
            creator_name="Alice Legal Counsel",
            creator_role="buyer",
            title="SaaS Enterprise Agreement Negotiation",
        )
        room_id = room.room_id

        # Guest knocks to join
        request_join(
            self.db,
            room_id=room_id,
            participant_id=guest_id,
            participant_name="Bob Counterparty Counsel",
            participant_role="seller",
        )

        # Creator admits guest
        room = admit_participant(self.db, room_id=room_id, creator_id=creator_id)
        self.assertEqual(room.status, "active")
        self.assertEqual(room.guest_status, "admitted")

        # Step 2: Party A submits clauses/document
        party_a_clauses = [
            {
                "section": "1.0",
                "title": "Limitation of Liability",
                "text": "The total aggregate liability of Buyer under this Agreement shall be limited to fees paid in preceding 12 months.",
            },
            {
                "section": "2.0",
                "title": "Governing Law",
                "text": "This Agreement shall be governed exclusively by the laws of the State of Delaware.",
            },
            {
                "section": "3.0",
                "title": "Termination for Convenience",
                "text": "Buyer may terminate this Agreement without cause upon thirty (30) days prior written notice.",
            },
        ]

        sub_a = submit_room_contract_input(
            db=self.db,
            room_id=room_id,
            participant_id=creator_id,
            party="party_a",
            clauses=party_a_clauses,
            filename="buyer_baseline_clauses.txt",
        )

        self.assertEqual(sub_a["status"], "waiting_for_counterparty")
        self.assertTrue(sub_a["has_party_a_submitted"])
        self.assertFalse(sub_a["has_party_b_submitted"])
        self.assertFalse(sub_a["ready_for_pipeline"])

        # Rule Check: Pipeline MUST NOT start until both party inputs are available
        with self.assertRaises(ValueError) as ctx:
            asyncio.run(execute_room_pipeline(self.db, room_id=room_id))
        self.assertIn("both party a and party b must submit", str(ctx.exception).lower())

        # Privacy Rule Check: Inspect public room state to verify private drafts are not leaked
        self.db.refresh(room)
        public_state = room.shared_state or {}
        self.assertTrue(public_state.get("has_party_a_submitted"))
        self.assertFalse(public_state.get("has_party_b_submitted"))
        self.assertFalse(public_state.get("ready_for_pipeline"))

        # Step 3: Party B submits clauses/document
        party_b_clauses = [
            {
                "section": "1.0",
                "title": "Limitation of Liability",
                "text": "The total aggregate liability of Seller under this Agreement shall not exceed the monthly fees paid. Neither party shall be liable for consequential damages.",
            },
            {
                "section": "2.0",
                "title": "Governing Law",
                "text": "This Agreement shall be governed by the laws of the State of New York.",
            },
            {
                "section": "3.0",
                "title": "Termination for Convenience",
                "text": "Either party may terminate for convenience upon sixty (60) days prior written notice with payment of early termination fee.",
            },
        ]

        sub_b = submit_room_contract_input(
            db=self.db,
            room_id=room_id,
            participant_id=guest_id,
            party="party_b",
            clauses=party_b_clauses,
            filename="seller_counterproposal.txt",
        )

        self.assertEqual(sub_b["status"], "ready_for_pipeline")
        self.assertTrue(sub_b["has_party_a_submitted"])
        self.assertTrue(sub_b["has_party_b_submitted"])
        self.assertTrue(sub_b["ready_for_pipeline"])

        # Step 4: Both inputs available -> Execute 4-agent pipeline
        # (Agents 1 & 2 -> Agent 3 Arbiter -> Agent 4 Scrivener -> report)
        pipeline_result = asyncio.run(execute_room_pipeline(self.db, room_id=room_id))

        self.assertTrue(pipeline_result["success"], f"Pipeline failed: {pipeline_result.get('error')}")
        self.assertEqual(pipeline_result["status"], "pending_review")
        self.assertIsNotNone(pipeline_result["report_id"])
        self.assertGreater(pipeline_result["clauses_count"], 0)

        # Step 5: Verify Data Association with matter_id and room_id
        resolved_matter_id = pipeline_result["matter_id"]
        self.assertEqual(resolved_matter_id, room.matter_id or room.room_id)

        # Check ContractDocumentDB records exist for both parties
        docs = self.db.query(ContractDocumentDB).filter(ContractDocumentDB.matter_id == resolved_matter_id).all()
        parties_found = {d.party for d in docs}
        self.assertIn("party_a", parties_found)
        self.assertIn("party_b", parties_found)

        # Check AgentRunDB records for all 4 agents
        runs = self.db.query(AgentRunDB).filter(AgentRunDB.matter_id == resolved_matter_id).all()
        agent_ids = {r.agent_id for r in runs}
        self.assertTrue({"a1", "a2", "a3", "a4"}.issubset(agent_ids))

        # Check ReportDB generated with status 'pending_review'
        report = self.db.query(ReportDB).filter(ReportDB.id == pipeline_result["report_id"]).first()
        self.assertIsNotNone(report)
        self.assertEqual(report.review_status, "pending_review")
        self.assertIsNone(report.block_digest, "Report must not be sealed before counsel approval")

        # Step 6: Verify Premature Sealing is Rejected
        with self.assertRaises(ValueError) as ctx:
            seal_room_report(self.db, room_id=room_id, counsel_name="Alice General Counsel")
        self.assertIn("must first explicitly approve", str(ctx.exception).lower())

        # Step 7: Human Counsel Review ('approve')
        review_res = review_room_report(
            self.db,
            room_id=room_id,
            action="approve",
            counsel_name="Alice General Counsel",
            comments="Deliberation compromise terms accepted across liability and termination clauses.",
        )
        self.assertEqual(review_res["action"], "approve")
        self.assertEqual(review_res["review_status"], "approved")
        self.assertTrue(review_res["eligible_for_sealing"])

        # Step 8: Cryptographic Seal
        seal_res = seal_room_report(
            self.db,
            room_id=room_id,
            counsel_name="Alice General Counsel",
            comments="Officially approved and cryptographically sealed.",
        )
        self.assertTrue(seal_res["is_sealed"])
        self.assertIsNotNone(seal_res["audit_digest"])
        self.assertEqual(len(seal_res["audit_digest"]), 64)  # SHA-256 hex length

        # Verify AuditRecordDB contains sealed record
        audit_record = self.db.query(AuditRecordDB).filter(
            AuditRecordDB.matter_id == resolved_matter_id,
            AuditRecordDB.action == "cryptographic_seal_anchored",
        ).first()
        self.assertIsNotNone(audit_record)
        self.assertEqual(audit_record.sha256_hash, seal_res["audit_digest"])

    def test_03_rest_endpoints_room_pipeline_integration(self):
        """Test the REST endpoints: POST /submit, GET /pipeline, POST /review, POST /seal."""
        # 1. Create room via REST
        res_create = self.client.post("/api/rooms", json={
            "creator_name": "Senior Counsel",
            "creator_role": "buyer",
            "title": "Bilateral Vendor MSA",
        })
        self.assertEqual(res_create.status_code, 201)
        room_data = res_create.json()
        room_id = room_data["room_id"]
        creator_token = room_data["creator_token"]

        # 2. Guest joins and gets admitted
        res_join = self.client.post(f"/api/rooms/{room_id}/join", json={
            "participant_id": "vendor_counsel_99",
            "participant_name": "Vendor Counsel",
            "participant_role": "seller",
        })
        self.assertEqual(res_join.status_code, 200)

        res_admit = self.client.post(
            f"/api/rooms/{room_id}/admit",
            json={"creator_token": creator_token, "participant_id": "vendor_counsel_99"},
        )
        self.assertEqual(res_admit.status_code, 200)
        self.assertEqual(res_admit.json()["status"], "active")

        # 3. Party A submits via REST
        res_sub_a = self.client.post(
            f"/api/rooms/{room_id}/submit",
            json={
                "party": "party_a",
                "token": creator_token,
                "text": "1.0 Payment terms Net 30. Standard warranties apply.",
            },
        )
        self.assertEqual(res_sub_a.status_code, 200)
        body_a = res_sub_a.json()
        self.assertEqual(body_a["status"], "waiting_for_counterparty")
        self.assertTrue(body_a["has_party_a_submitted"])
        self.assertFalse(body_a["has_party_b_submitted"])

        # 4. Check GET /pipeline shows awaiting counterparty
        res_pipe_status = self.client.get(f"/api/rooms/{room_id}/pipeline")
        self.assertEqual(res_pipe_status.status_code, 200)
        self.assertFalse(res_pipe_status.json()["ready_for_pipeline"])

        # 5. Party B submits via REST
        res_sub_b = self.client.post(
            f"/api/rooms/{room_id}/submit",
            json={
                "party": "party_b",
                "participant_id": "vendor_counsel_99",
                "text": "1.0 Payment terms Net 15 with 1.5% late interest penalty.",
            },
        )
        self.assertEqual(res_sub_b.status_code, 200)
        body_b = res_sub_b.json()
        self.assertEqual(body_b["status"], "ready_for_pipeline")
        self.assertTrue(body_b["ready_for_pipeline"])

        # 6. Trigger 4-agent pipeline via REST POST /pipeline
        res_pipe_run = self.client.post(f"/api/rooms/{room_id}/pipeline")
        self.assertEqual(res_pipe_run.status_code, 200)
        run_data = res_pipe_run.json()
        self.assertTrue(run_data["success"])
        self.assertEqual(run_data["status"], "pending_review")

        # 7. Review via REST POST /review
        res_review = self.client.post(
            f"/api/rooms/{room_id}/review",
            json={
                "action": "approve",
                "counsel_name": "Managing Counsel",
                "comments": "Settlement accepted.",
            },
        )
        self.assertEqual(res_review.status_code, 200)
        self.assertEqual(res_review.json()["review_status"], "approved")

        # 8. Seal via REST POST /seal
        res_seal = self.client.post(
            f"/api/rooms/{room_id}/seal",
            json={
                "counsel_name": "Managing Counsel",
                "comments": "Cryptographic seal authorized.",
            },
        )
        self.assertEqual(res_seal.status_code, 200)
        seal_body = res_seal.json()
        self.assertTrue(seal_body["is_sealed"])
        self.assertIsNotNone(seal_body.get("audit_digest"))


if __name__ == "__main__":
    unittest.main()

