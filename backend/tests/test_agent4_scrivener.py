"""
Unit test suite for Agent 4: Scrivener-4.
"""

import os
import sys
from pathlib import Path

# Add backend and root to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import hashlib
import json
from app.agents.agent3_arbiter import (
    ArbiterOutput,
    ClauseVerdict,
    CommercialLens,
    LegalLens,
)
from app.agents.agent4_scrivener import (
    Agent4Scrivener,
    CommercialImpact,
    CounselTimeCostEstimate,
    KeyNegotiatedChange,
    LegalRiskSummary,
    ScrivenerOutput,
    compute_canonical_sha256,
    generate_canonical_audit_payload,
    serialize_canonical_json,
)
from app.models.agent import AgentStatus
from app.models.clause import ClauseRiskLevel, ClauseStatus, ContractClause
from app.models.matter import Matter, MatterStatus, RiskLevel
from app.models.report import Report, ReviewStatus


def test_agent4_initialization():
    scrivener = Agent4Scrivener()
    assert scrivener.agent_id == "a4"
    assert scrivener.technical_name == "Scrivener-4"
    assert scrivener.name == "Executive Scrivener & Audit Engine"
    assert scrivener.status == AgentStatus.IDLE


def test_agent4_full_deliberation():
    scrivener = Agent4Scrivener()

    clauses = [
        ContractClause(
            id="clause_11_2",
            matter_id="2025-INT-809",
            section="§ 11.2",
            title="Aggregate Liability Cap & Consequential Damages",
            original_text="Party A standard liability cap at 1.0x annual contract value.",
            counterparty_text="Party B removed all liability caps and expanded consequential damages.",
            conformed_proposal="Liability capped at 1.0x ARR for general breach, with a 2.0x ARR super-cap for data protection breaches.",
            risk_level=ClauseRiskLevel.HIGH,
            risk_score=7.8,
            precedent_alignment=94.5,
            status=ClauseStatus.AGREED,
            rationale="Delaware Title 6 § 2-719 compromise.",
            sec_edgar_citation="SEC EDGAR Exhibit 10.4",
        ),
        ContractClause(
            id="clause_4_3",
            matter_id="2025-INT-809",
            section="§ 4.3",
            title="Invoicing & Payment Terms",
            original_text="Payment due Net 30 days from invoice date.",
            counterparty_text="Payment due Net 60 days with 5% disputed withhold.",
            conformed_proposal="Payment due Net 45 days, forfeiture of dispute withhold rights.",
            risk_level=ClauseRiskLevel.LOW,
            risk_score=2.5,
            precedent_alignment=91.0,
            status=ClauseStatus.AGREED,
            rationale="Commercial float concession.",
            sec_edgar_citation="Palo Alto Networks Form 10-K Commercial Exhibit 10.8",
        ),
    ]

    verdicts = [
        ClauseVerdict(
            clause_id="clause_11_2",
            section_number="§ 11.2",
            title="Aggregate Liability Cap & Consequential Damages",
            category="liability",
            legal_lens=LegalLens(clause_id="clause_11_2", legal_risk_score=7.5, legal_summary="2.0x super-cap standard"),
            commercial_lens=CommercialLens(clause_id="clause_11_2", commercial_risk_score=4.0, commercial_summary="ARR protected"),
            recommended_strategy="concede_with_guard",
            recommended_label="2.0x Super-Cap",
            proposed_clause_text="Liability capped at 1.0x ARR, super-cap at 2.0x ARR for data breach.",
            rationale="Pareto optimal compromise.",
            confidence=95.0,
            combined_risk_score=5.9,
            evidence_cited=["clause_11_2", "delaware_title_6_sec_2_719"],
        ),
        ClauseVerdict(
            clause_id="clause_4_3",
            section_number="§ 4.3",
            title="Invoicing & Payment Terms",
            category="payment",
            legal_lens=LegalLens(clause_id="clause_4_3", legal_risk_score=2.0, legal_summary="Standard payment"),
            commercial_lens=CommercialLens(clause_id="clause_4_3", commercial_risk_score=3.5, commercial_summary="15 days float cost"),
            recommended_strategy="split_midpoint",
            recommended_label="Net 45 Midpoint",
            proposed_clause_text="Payment due Net 45 days.",
            rationale="Cash flow compromise.",
            confidence=92.0,
            combined_risk_score=2.7,
            evidence_cited=["clause_4_3"],
        ),
    ]

    metrics = {
        "variance_ceiling": 0.15,
        "aggregate_compromise_score": 94.0,
        "turnaround_time_minutes": 18.0,
        "counsel_cost_saved": 28500.0,
        "agreed_clauses_count": 2,
        "contested_clauses_count": 0,
    }

    matter = Matter(
        id="2025-INT-809",
        docket_number="2025-INT-809",
        title="Enterprise Master Services Agreement",
        counterparty="Veloce Systems Inc.",
        arr_value="$4.2M",
        lead_counsel="Elena Rostova",
        status=MatterStatus.ACTIVE,
        risk_level=RiskLevel.MODERATE,
        risk_score=4.5,
    )

    events_received = []
    scrivener.event_callback = lambda ev: events_received.append(ev)

    output: ScrivenerOutput = scrivener.run(
        settled_clauses=clauses,
        verdicts=verdicts,
        variance_metrics=metrics,
        matter_info=matter,
        matter_id="2025-INT-809",
    )

    # 1. Verification of Initial Status and Safeguards
    assert output.review_status == ReviewStatus.PENDING_REVIEW
    assert output.review_status.value == "pending_review"
    assert output.is_sealed is False
    assert output.attestation_hash is None
    assert output.block_digest is None

    # 2. Verification of Executive Summary
    assert len(output.executive_summary) > 200
    assert "EXECUTIVE NEGOTIATION BRIEF" in output.executive_summary
    assert "2025-INT-809" in output.executive_summary
    assert "Veloce Systems Inc." in output.executive_summary
    assert "PENDING_REVIEW" in output.executive_summary

    # 3. Verification of Key Negotiated Changes
    assert len(output.key_negotiated_changes) == 2
    c1 = output.key_negotiated_changes[0]
    assert c1.clause_id == "clause_11_2"
    assert c1.section == "§ 11.2"
    assert c1.category == "liability"
    assert c1.risk_delta < 0
    assert "2.0x ARR" in c1.trade_off_summary

    c2 = output.key_negotiated_changes[1]
    assert c2.clause_id == "clause_4_3"
    assert "Net 45" in c2.trade_off_summary

    # 4. Verification of Legal Risk Summary
    assert output.legal_risk_summary.overall_legal_risk_score > 0
    assert output.legal_risk_summary.risk_tier in ("low", "moderate", "high", "critical")
    assert len(output.legal_risk_summary.statutory_precedents) >= 2
    assert len(output.legal_risk_summary.remaining_cautions) >= 2
    assert len(output.legal_risk_summary.human_counsel_action_items) >= 2

    # 5. Verification of Commercial Impact
    assert output.commercial_impact.arr_value == "$4.2M"
    assert output.commercial_impact.arr_value_numeric == 4200000.0
    assert output.commercial_impact.cost_of_float_numeric > 0
    assert "Net 45" in output.commercial_impact.payment_terms_settled
    assert output.commercial_impact.relationship_preservation_score == 94.0

    # 6. Verification of Counsel Time & Cost Estimate
    assert output.counsel_time_cost_estimate.cycle_time_minutes == 18.0
    assert output.counsel_time_cost_estimate.counsel_cost_saved == 28500.0
    assert output.counsel_time_cost_estimate.counsel_hours_saved > 0
    assert output.counsel_time_cost_estimate.blended_hourly_rate == 750.0
    assert output.counsel_time_cost_estimate.speedup_multiplier > 1.0

    # 7. Verification of Canonical Audit Payload and Hashing
    assert isinstance(output.audit_payload, dict)
    assert output.audit_payload["review_status"] == "pending_review"
    assert output.audit_payload["matter_id"] == "2025-INT-809"
    assert output.audit_payload["schema_version"] == "1.0.0"
    assert output.audit_payload["provenance"]["agent"] == "Scrivener-4"
    assert output.audit_payload["provenance"]["seal_status"] == "unsealed_pending_human_review"
    assert len(output.audit_payload["settled_clauses"]) == 2

    # Deterministic JSON and SHA-256 validation
    assert len(output.canonical_json) > 0
    calculated_hash = hashlib.sha256(output.canonical_json.encode("utf-8")).hexdigest()
    assert output.pre_attestation_hash == calculated_hash
    assert len(output.pre_attestation_hash) == 64

    # Idempotence: re-serializing the payload produces the exact same string and hash
    reserialized = serialize_canonical_json(output.audit_payload)
    assert reserialized == output.canonical_json
    assert compute_canonical_sha256(output.audit_payload) == output.pre_attestation_hash

    # 8. Verification of Embedded Report Model
    assert output.report is not None
    assert output.report.matter_id == "2025-INT-809"
    assert output.report.review_status == ReviewStatus.PENDING_REVIEW
    assert output.report.attestation_hash is None
    assert output.report.block_digest is None
    assert output.report.counsel_cost_saved == 28500.0
    assert output.report.turnaround_time_minutes == 18.0

    # 9. Verification of Events Emitted
    assert len(events_received) >= 3
    assert scrivener.status == AgentStatus.COMPLETE

    print("PASS: test_agent4_full_deliberation")


def test_agent4_empty_defaults():
    scrivener = Agent4Scrivener()
    output: ScrivenerOutput = scrivener.run()

    assert output.review_status == ReviewStatus.PENDING_REVIEW
    assert output.is_sealed is False
    assert output.attestation_hash is None
    assert output.block_digest is None
    assert output.canonical_json != ""
    assert len(output.pre_attestation_hash) == 64
    assert output.counsel_time_cost_estimate.counsel_cost_saved > 0

    print("PASS: test_agent4_empty_defaults")


if __name__ == "__main__":
    test_agent4_initialization()
    test_agent4_full_deliberation()
    test_agent4_empty_defaults()
    print("ALL TESTS PASSED SUCCESSFULLY!")
