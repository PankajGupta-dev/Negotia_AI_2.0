"""
End-to-end verification script for Negotia AI.
Tests live backend on http://127.0.0.1:8000 covering items 1 to 12.
"""

import asyncio
import json
import time
import uuid
import httpx

BASE_URL = "http://127.0.0.1:8000"

async def run_verification():
    print("=" * 70)
    print("STARTING NEGOTIA AI END-TO-END VERIFICATION")
    print("=" * 70)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 0: Health Check
        print("\n[0] Verifying GET /health...")
        res = await client.get(f"{BASE_URL}/health")
        assert res.status_code == 200, f"Health check failed: {res.status_code}"
        print(f"    [PASS] Health check passed: {res.json()}")

        # Step 1: Prepare Ingestion Data
        matter_id = f"2026-E2E-{uuid.uuid4().hex[:6].upper()}"
        file_a_content = (
            "MASTER SERVICES AGREEMENT\n"
            "§ 1. Definitions & Scope: Enterprise cloud platform agreement.\n"
            "§ 4. Invoicing & Payment: Invoices payable Net 30.\n"
            "§ 11.2 Limitation of Liability: Aggregate liability capped at 1.0x ARR.\n"
            "§ 14.1 Indemnification: Vendor indemnifies Customer for IP infringement.\n"
            "§ 18. Governing Law: Delaware Chancery Court exclusive jurisdiction.\n"
        ).encode("utf-8")

        file_b_content = (
            "MASTER SERVICES AGREEMENT (COUNTERPARTY MARKUP)\n"
            "§ 1. Definitions & Scope: Enterprise cloud platform agreement with 99.99% uptime.\n"
            "§ 4. Invoicing & Payment: Invoices payable Net 60 days.\n"
            "§ 11.2 Limitation of Liability: Liability shall be uncapped and unlimited for data breach.\n"
            "§ 14.1 Indemnification: Vendor indemnifies Customer worldwide with no cap.\n"
            "§ 18. Governing Law: Delaware Chancery Court exclusive jurisdiction.\n"
        ).encode("utf-8")

        print(f"\n[1 & 2] Calling POST /api/contracts/ingest for matter {matter_id}...")
        files = {
            "file_a": ("baseline_msa.txt", file_a_content, "text/plain"),
            "file_b": ("counterparty_redline.txt", file_b_content, "text/plain"),
        }
        data = {
            "matter_id": matter_id,
            "title": "Cloud Services Master Agreement 2026",
            "counterparty": "Apex Dynamics Corp.",
            "arr_value": "$4,200,000 ARR",
            "variance_ceiling": "18.5",
        }

        # Start SSE listener concurrently to receive streaming events
        events_received = []

        async def listen_sse():
            try:
                async with httpx.AsyncClient(timeout=30.0) as sse_client:
                    async with sse_client.stream("GET", f"{BASE_URL}/api/pipeline/stream/{matter_id}") as stream:
                        async for line in stream.aiter_lines():
                            if line.startswith("data: "):
                                payload = line[6:].strip()
                                try:
                                    parsed = json.loads(payload)
                                    events_received.append(parsed)
                                    agent = parsed.get("agent")
                                    thought = parsed.get("thought") or parsed.get("message") or parsed.get("event")
                                    print(f"    [SSE Event] agent={agent} thought={str(thought)[:65]}...")
                                    if parsed.get("event") == "pipeline_complete":
                                        break
                                except json.JSONDecodeError:
                                    pass
            except Exception as e:
                print(f"    [SSE Info] Stream closed or ended: {e}")

        # Ingest contracts
        ingest_res = await client.post(f"{BASE_URL}/api/contracts/ingest", data=data, files=files)
        assert ingest_res.status_code == 201, f"Ingest failed: {ingest_res.status_code} {ingest_res.text}"
        ingest_data = ingest_res.json()
        print(f"    [PASS] Ingest successful: status={ingest_data['status']}, matterId={ingest_data['matterId']}")

        # Start SSE listener task
        sse_task = asyncio.create_task(listen_sse())

        # Wait for background pipeline to complete (agents 1-4 execute)
        print("\n[3, 4, 5, 6, 7] Awaiting pipeline completion (Agents 1-4 & SSE events)...")
        pipeline_done = False
        for _ in range(25):
            await asyncio.sleep(1.0)
            matter_check = await client.get(f"{BASE_URL}/api/matters/{matter_id}")
            if matter_check.status_code == 200:
                m_info = matter_check.json()
                if m_info.get("status") in ["pending_review", "approved", "sealed"]:
                    pipeline_done = True
                    break

        await asyncio.sleep(1.0)
        try:
            sse_task.cancel()
        except:
            pass

        assert pipeline_done, "Pipeline did not reach pending_review status within timeout!"
        print(f"    [PASS] Pipeline completed! Total SSE events received: {len(events_received)}")

        # Step 8: Verify Report becomes pending_review
        print(f"\n[8] Verifying GET /api/reports/{matter_id}...")
        rep_res = await client.get(f"{BASE_URL}/api/reports/{matter_id}")
        assert rep_res.status_code == 200, f"Get report failed: {rep_res.status_code}"
        report_data = rep_res.json()
        report_id = report_data.get("id") or report_data.get("reportId")
        print(f"    [PASS] Report ID: {report_id}")
        print(f"    [PASS] Review status: {report_data.get('reviewStatus') or report_data.get('review_status')}")
        print(f"    [PASS] Executive Summary length: {len(report_data.get('executiveSummary', ''))} chars")
        assert (report_data.get("reviewStatus") or report_data.get("review_status")) == "pending_review"

        # Step 9: Verify Clause API returns results
        print(f"\n[9] Verifying GET /api/matters/{matter_id}/clauses...")
        clauses_res = await client.get(f"{BASE_URL}/api/matters/{matter_id}/clauses")
        assert clauses_res.status_code == 200, f"Get clauses failed: {clauses_res.status_code}"
        clauses_data = clauses_res.json()
        clause_list = clauses_data if isinstance(clauses_data, list) else clauses_data.get("clauses", [])
        print(f"    [PASS] Total clauses returned: {len(clause_list)}")
        assert len(clause_list) > 0, "Expected at least one clause in matter"
        sample_clause = clause_list[0]
        sample_clause_id = sample_clause["id"]
        print(f"    [PASS] Sample clause '{sample_clause.get('title')}' status: {sample_clause.get('status')}")

        # Verify Clause Conforming action
        print(f"    Testing POST /api/matters/{matter_id}/clauses/{sample_clause_id}/conform...")
        conform_res = await client.post(
            f"{BASE_URL}/api/matters/{matter_id}/clauses/{sample_clause_id}/conform",
            json={
                "conformedText": "Vendor aggregate liability shall be capped at 2.0x ARR super-cap for data protection.",
                "counselNotes": "Conformed in accordance with Arbiter-3 compromise.",
            },
        )
        assert conform_res.status_code == 200, f"Conform failed: {conform_res.status_code}"
        print("    [PASS] Clause conforming persisted successfully!")

        # Step 10: Human Approval Works
        print(f"\n[10] Testing POST /api/reports/{report_id}/review (Human Approval)...")
        review_res = await client.post(
            f"{BASE_URL}/api/reports/{report_id}/review",
            json={
                "action": "approve",
                "counselName": "Elena Rostova, General Counsel",
                "comments": "Approved conformed agreement following multi-agent Nash consensus.",
            },
        )
        assert review_res.status_code == 200, f"Review failed: {review_res.status_code}"
        rev_data = review_res.json()
        rev_status = rev_data.get("reviewStatus") or rev_data.get("review_status")
        print(f"    [PASS] Approval recorded: review_status={rev_status}")
        assert rev_status == "approved"

        # Step 11: Cryptographic Sealing & SHA-256 Block Creation
        print(f"\n[11] Testing POST /api/reports/{report_id}/seal (Cryptographic Seal)...")
        seal_res = await client.post(
            f"{BASE_URL}/api/reports/{report_id}/seal",
            json={
                "counselName": "Elena Rostova, General Counsel",
                "comments": "FIDO2 Hardware Key Authenticated. Cryptographic Seal Applied.",
            },
        )
        assert seal_res.status_code == 200, f"Seal failed: {seal_res.status_code} {seal_res.text}"
        seal_data = seal_res.json()
        print(f"    [PASS] Sealed successfully!")
        print(f"    [PASS] Attestation Hash: {seal_data.get('attestationHash')}")
        print(f"    [PASS] Block Digest:     {seal_data.get('blockDigest')}")
        print(f"    [PASS] Chain Length:     {seal_data.get('chainLength')}")
        assert seal_data.get("isSealed") is True
        assert len(seal_data.get("blockDigest", "")) == 64

        # Step 12: Governance API returns audit chain
        print(f"\n[12] Testing GET /api/matters/{matter_id}/audit (Governance Provenance Chain)...")
        gov_res = await client.get(f"{BASE_URL}/api/matters/{matter_id}/audit")
        assert gov_res.status_code == 200, f"Governance audit failed: {gov_res.status_code}"
        gov_data = gov_res.json()
        chain_valid = gov_data.get("isValid") if gov_data.get("isValid") is not None else gov_data.get("chainValid")
        blocks = gov_data.get("blocks") or gov_data.get("records") or []
        print(f"    [PASS] Governance API Response:")
        print(f"        Matter ID:        {gov_data.get('matterId') or gov_data.get('matter_id')}")
        print(f"        Chain Valid:      {chain_valid}")
        print(f"        Integrity Status: {gov_data.get('verificationMessage') or gov_data.get('integrityStatus')}")
        print(f"        Tip Hash:         {gov_data.get('tipHash') or gov_data.get('tip_hash')}")
        print(f"        Audit Records:    {len(blocks)} blocks")
        for i, rec in enumerate(blocks):
            h = rec.get('currentHash') or rec.get('sha256Hash') or ''
            p = rec.get('previousHash') or ''
            print(f"          Block {i+1}: event='{rec.get('event')}' reviewer='{rec.get('humanReviewer')}' hash={h[:16]}... prev={p[:16]}...")
        assert chain_valid is True
        assert len(blocks) >= 2

    print("\n" + "=" * 70)
    print("ALL 12 BACKEND VERIFICATION CHECKS COMPLETED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_verification())
