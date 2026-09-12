"""
Unit and Integration Tests for Negotiation Termination & Checkpoint System.

Test Cases:
A. Agreement reached before limit.
B. 6 rounds completed without agreement (Max rounds limit -> DISAGREE).
C. No progress for 2 consecutive rounds (Stalemate -> DISAGREE).
D. Resume after DISAGREE (Starts from next round, does NOT restart from Round 1).
E. Token/context usage does not require the complete previous conversation (compact state verification).
"""

from datetime import datetime
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.db.models import MatterDB, NegotiationCheckpointDB
from app.models.checkpoint import NegotiationCheckpoint, NegotiationStatus, TerminationReason
from app.services.negotiation_controller import (
    NegotiationController,
    MAX_ROUNDS,
    MAX_TIME_SECONDS,
    MAX_TOKEN_BUDGET,
    estimate_tokens,
)


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        # Create a test matter
        matter = MatterDB(
            id="test_matter_term_1",
            docket_number="DOCKET #TEST-TERM-1",
            title="Termination Engine Test MSA",
            counterparty="VendorCorp",
            status="active",
            round=1,
            total_rounds=6,
        )
        db.add(matter)
        db.commit()
        yield db
    finally:
        db.close()


def test_case_a_agreement_reached_before_limit(test_db):
    """CASE A: Agreement reached before round/time limit -> status = AGREE -> stop."""
    matter_id = "test_matter_term_1"
    controller = NegotiationController(matter_id=matter_id)

    # Contested clauses with negotiable terms that can converge
    base_clauses = [
        {
            "clause_id": "c1",
            "section": "§ 8.0",
            "title": "Payment Terms",
            "original_text": "Payment shall be due within Net 60 days of invoice.",
            "counterparty_text": "Payment shall be due within Net 45 days of invoice.",
            "category": "payment",
        },
        {
            "clause_id": "c2",
            "section": "§ 11.2",
            "title": "Limitation of Liability",
            "original_text": "Total liability shall be capped at 1.0x annual contract value.",
            "counterparty_text": "Total liability shall be capped at 2.0x annual contract value.",
            "category": "liability",
        },
    ]

    # Run rounds until convergence
    checkpoint = None
    for r in range(1, 4):
        checkpoint = controller.step_round(
            current_round=r,
            previous_checkpoint=checkpoint,
            base_clauses=base_clauses,
            buyer_non_negotiables=[],
            seller_non_negotiables=[],
        )
        controller.save_checkpoint(test_db, checkpoint)
        if checkpoint.status in (NegotiationStatus.AGREE.value, NegotiationStatus.DISAGREE.value):
            break

    assert checkpoint is not None
    assert checkpoint.status == NegotiationStatus.AGREE.value
    assert checkpoint.round_number < MAX_ROUNDS
    assert len(checkpoint.unresolved_clauses) == 0
    assert len(checkpoint.agreed_clauses) == 2
    assert "AGREEMENT_REACHED" in (checkpoint.termination_reason or "")


def test_case_b_max_rounds_completed_without_agreement(test_db):
    """CASE B: 6 rounds completed without agreement -> status = DISAGREE -> stop."""
    matter_id = "test_matter_term_1"
    controller = NegotiationController(matter_id=matter_id, max_rounds=6)

    # Force unyielding disagreement across all 6 rounds with tiny shifting progress
    # to avoid the 2-round stalemate rule from firing early
    status, reason = controller.evaluate_termination(
        round_number=6,
        unresolved_clauses_count=2,
        elapsed_seconds=10.0,
        consecutive_no_progress=0,  # simulate continuous attempt until round cap
        token_usage=1500,
    )

    assert status == NegotiationStatus.DISAGREE
    assert reason == TerminationReason.MAX_ROUNDS_REACHED.value


def test_case_c_no_progress_for_two_consecutive_rounds(test_db):
    """CASE C: No progress for 2 consecutive rounds -> status = DISAGREE (Stalemate)."""
    matter_id = "test_matter_term_1"
    controller = NegotiationController(matter_id=matter_id)

    # Clauses with mutual, unyielding non-negotiable deadlock
    base_clauses = [
        {
            "clause_id": "deadlock_1",
            "section": "§ 11.2",
            "title": "Limitation of Liability",
            "original_text": "Strict 1.0x ARR mutual liability cap. No exceptions.",
            "counterparty_text": "Provider liability for data breach is completely UNCAPPED.",
            "category": "liability",
        }
    ]

    # Both parties hold immutable non-negotiables
    buyer_non_negotiables = ["Limitation of Liability"]
    seller_non_negotiables = ["Limitation of Liability"]

    # Round 1
    chk1 = controller.step_round(
        current_round=1,
        previous_checkpoint=None,
        base_clauses=base_clauses,
        buyer_non_negotiables=buyer_non_negotiables,
        seller_non_negotiables=seller_non_negotiables,
    )
    controller.save_checkpoint(test_db, chk1)
    assert chk1.status == NegotiationStatus.NEGOTIATING.value

    # Round 2: Still zero concessions or movement
    chk2 = controller.step_round(
        current_round=2,
        previous_checkpoint=chk1,
        base_clauses=base_clauses,
        buyer_non_negotiables=buyer_non_negotiables,
        seller_non_negotiables=seller_non_negotiables,
    )
    controller.save_checkpoint(test_db, chk2)

    assert chk2.status == NegotiationStatus.DISAGREE.value
    assert "STALEMATE" in (chk2.termination_reason or "")
    assert len(chk2.unresolved_clauses) == 1


def test_case_d_resume_after_disagree(test_db):
    """CASE D: Resume after DISAGREE -> loads latest checkpoint, starts at next round (not Round 1!)."""
    matter_id = "test_matter_term_1"
    controller = NegotiationController(matter_id=matter_id)

    # Save a deadlocked checkpoint at Round 3 with 1 agreed clause and 1 unresolved clause
    deadlocked_checkpoint = NegotiationCheckpointDB(
        id="chk_deadlock_test_r3",
        matter_id=matter_id,
        round_number=3,
        buyer_offer={"c1": "Agreed text for c1", "c2": "Buyer firm pos"},
        seller_offer={"c1": "Agreed text for c1", "c2": "Seller firm pos"},
        agreed_clauses=[
            {
                "clause_id": "c1",
                "section": "§ 8.0",
                "title": "Payment",
                "agreed_text": "Net 45 days",
                "round_agreed": 2,
            }
        ],
        unresolved_clauses=[
            {
                "clause_id": "c2",
                "section": "§ 11.2",
                "title": "Liability",
                "buyer_position": "Buyer firm pos",
                "seller_position": "Seller firm pos",
                "gap_summary": "Dispute remains",
                "is_buyer_non_negotiable": False,
                "is_seller_non_negotiable": False,
            }
        ],
        concessions_made=[],
        buyer_non_negotiables=[],
        seller_non_negotiables=[],
        status="DISAGREE",
        termination_reason=TerminationReason.STALEMATE.value,
        token_usage_estimate=450,
        elapsed_seconds=15.0,
    )
    test_db.add(deadlocked_checkpoint)
    test_db.commit()

    # Verify latest checkpoint loaded
    latest = controller.load_latest_checkpoint(test_db, matter_id)
    assert latest is not None
    assert latest.round_number == 3
    assert latest.status == "DISAGREE"

    # Resuming negotiation: start_round MUST be 4, NOT 1
    next_round = latest.round_number + 1
    assert next_round == 4

    # Execute round 4 from compact state
    resumed_chk = controller.step_round(
        current_round=next_round,
        previous_checkpoint=latest,
        base_clauses=[],
        buyer_non_negotiables=[],
        seller_non_negotiables=[],
    )

    # Verify continuity
    assert resumed_chk.round_number == 4
    # The previously agreed clause c1 MUST still be in agreed_clauses!
    agreed_cids = {c["clause_id"] for c in resumed_chk.agreed_clauses}
    assert "c1" in agreed_cids


def test_case_e_token_context_compact_payload(test_db):
    """CASE E: Token/context usage does not require complete previous conversation."""
    controller = NegotiationController(matter_id="test_compact_tokens")

    compact_state = {
        "round": 4,
        "agreed": [
            {"clause_id": f"c{i}", "title": f"Clause {i}", "agreed_text": "Agreed terms."}
            for i in range(10)
        ],
        "unresolved": [
            {"clause_id": "c11", "title": "IP Clause", "buyer_pos": "Buyer owns IP", "seller_pos": "Joint IP"}
        ],
        "concessions": [
            {"round": 2, "party": "Buyer", "desc": "Conceded payment terms"}
        ],
    }

    tokens = estimate_tokens(compact_state)
    # 10 clauses + 1 unresolved + 1 concession in compact format should be well under 1000 tokens!
    assert tokens < 1000, f"Expected compact tokens < 1000, got {tokens}"

    # Verify that if token limit is approached, the safety guard terminates
    status, reason = controller.evaluate_termination(
        round_number=3,
        unresolved_clauses_count=1,
        elapsed_seconds=20.0,
        consecutive_no_progress=0,
        token_usage=MAX_TOKEN_BUDGET + 10,
    )
    assert status == NegotiationStatus.DISAGREE
    assert reason == TerminationReason.TOKEN_BUDGET_GUARD.value


def test_check_4_ninety_second_timeout():
    """Requirement 4: Exactly 90-second timeout evaluation."""
    controller = NegotiationController(matter_id="test_timeout", max_time_seconds=90.0)

    # 89.9 seconds -> still negotiating if other conditions met
    status, reason = controller.evaluate_termination(
        round_number=2,
        unresolved_clauses_count=2,
        elapsed_seconds=89.9,
        consecutive_no_progress=0,
        token_usage=1200,
    )
    assert status == NegotiationStatus.NEGOTIATING
    assert reason is None

    # 90.0+ seconds -> DISAGREE with TIMEOUT
    status, reason = controller.evaluate_termination(
        round_number=2,
        unresolved_clauses_count=2,
        elapsed_seconds=90.1,
        consecutive_no_progress=0,
        token_usage=1200,
    )
    assert status == NegotiationStatus.DISAGREE
    assert reason == TerminationReason.TIMEOUT.value


def test_check_5_checkpoint_creation_and_fields(test_db):
    """Requirement 5: Checkpoint creation with all mandatory compact fields."""
    matter_id = "test_matter_term_1"
    controller = NegotiationController(matter_id=matter_id)

    chk = controller.step_round(
        current_round=1,
        previous_checkpoint=None,
        base_clauses=[{
            "clause_id": "c_audit",
            "section": "§ 5.1",
            "title": "Audit Rights",
            "original_text": "Annual audit on 30 days notice.",
            "counterparty_text": "Quarterly unannounced audits.",
        }],
        buyer_non_negotiables=["Audit Rights"],
        seller_non_negotiables=[],
    )
    saved = controller.save_checkpoint(test_db, chk)

    # Verify all checkpoint fields are persisted properly
    assert saved.round_number == 1
    assert "c_audit" in saved.buyer_offer
    assert "c_audit" in saved.seller_offer
    assert isinstance(saved.agreed_clauses, list)
    assert isinstance(saved.unresolved_clauses, list)
    assert isinstance(saved.concessions_made, list)
    assert saved.buyer_non_negotiables == ["Audit Rights"]
    assert saved.seller_non_negotiables == []
    assert saved.status == "NEGOTIATING"
    assert saved.elapsed_seconds is not None
    assert saved.token_usage_estimate is not None


def test_check_7_preservation_of_buyer_seller_non_negotiables(test_db):
    """Requirement 7: Preservation of Buyer/Seller non-negotiables through rounds."""
    matter_id = "test_matter_term_1"
    controller = NegotiationController(matter_id=matter_id)

    b_nn = ["Limitation of Liability", "Governing Law"]
    s_nn = ["Indemnification", "IP Ownership"]

    chk1 = controller.step_round(
        current_round=1,
        previous_checkpoint=None,
        base_clauses=[
            {
                "clause_id": "c_nn1",
                "section": "§ 11.2",
                "title": "Limitation of Liability",
                "original_text": "1x cap.",
                "counterparty_text": "Uncapped.",
            },
            {
                "clause_id": "c_nn2",
                "section": "§ 14.1",
                "title": "Indemnification",
                "original_text": "Mutual indemnity.",
                "counterparty_text": "Buyer sole indemnity.",
            },
        ],
        buyer_non_negotiables=b_nn,
        seller_non_negotiables=s_nn,
    )
    controller.save_checkpoint(test_db, chk1)

    assert chk1.buyer_non_negotiables == b_nn
    assert chk1.seller_non_negotiables == s_nn

    # Check that in unresolved clauses, the flags were properly set and preserved
    unresolved_map = {u["clause_id"]: u for u in chk1.unresolved_clauses}
    assert unresolved_map["c_nn1"]["is_buyer_non_negotiable"] is True
    assert unresolved_map["c_nn2"]["is_seller_non_negotiable"] is True

    # Round 2 using chk1
    chk2 = controller.step_round(
        current_round=2,
        previous_checkpoint=chk1,
        base_clauses=[],
        buyer_non_negotiables=b_nn,
        seller_non_negotiables=s_nn,
    )

    assert chk2.buyer_non_negotiables == b_nn
    assert chk2.seller_non_negotiables == s_nn
    unresolved_map_r2 = {u["clause_id"]: u for u in chk2.unresolved_clauses}
    assert unresolved_map_r2["c_nn1"]["is_buyer_non_negotiable"] is True
    assert unresolved_map_r2["c_nn2"]["is_seller_non_negotiable"] is True


def test_check_8_no_full_conversation_replay_on_resume(test_db):
    """Requirement 8: No full conversation replay on resume (only compact checkpoint passed)."""
    matter_id = "test_matter_term_1"
    controller = NegotiationController(matter_id=matter_id)

    # Prior checkpoint has 1 agreed and 1 unresolved clause
    prior_chk = NegotiationCheckpoint(
        matter_id=matter_id,
        round_number=2,
        buyer_offer={"c1": "Agreed text"},
        seller_offer={"c1": "Agreed text"},
        agreed_clauses=[{
            "clause_id": "c1",
            "section": "§ 1.0",
            "title": "Term",
            "agreed_text": "24 months",
            "round_agreed": 1,
        }],
        unresolved_clauses=[{
            "clause_id": "c2",
            "section": "§ 2.0",
            "title": "Fees",
            "buyer_position": "$100k",
            "seller_position": "$120k",
            "gap_summary": "$20k gap",
            "is_buyer_non_negotiable": False,
            "is_seller_non_negotiable": False,
        }],
        concessions_made=[],
        buyer_non_negotiables=[],
        seller_non_negotiables=[],
        status="NEGOTIATING",
        termination_reason=None,
    )

    # Next round consumes strictly prior_chk without any raw transcript / message list
    next_chk = controller.step_round(
        current_round=3,
        previous_checkpoint=prior_chk,
        base_clauses=[],  # No base doc needed, purely compact state
        buyer_non_negotiables=[],
        seller_non_negotiables=[],
    )

    assert next_chk.round_number == 3
    # Checkpoint contains only compact state
    assert len(next_chk.agreed_clauses) >= 1
    # Checkpoint does NOT store transcript or history arrays
    checkpoint_dict = next_chk.model_dump()
    assert "messages" not in checkpoint_dict
    assert "conversation" not in checkpoint_dict
    assert "transcript" not in checkpoint_dict

