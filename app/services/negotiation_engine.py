"""
Negotiation Engine — Deterministic scoring layer for Agent 3 (Arbiter-3).

Provides multi-factor utility scoring for both parties, Pareto-oriented
candidate filtering, and compromise ranking.

Terminology note:
    This engine produces "Pareto-efficient compromise candidates" — solutions
    where neither party can gain without the other losing.  It does NOT claim
    to compute a formal Nash equilibrium (which would require full strategy-set
    enumeration and best-response verification).  The ranking heuristic
    maximises *joint surplus* while penalising imbalance, which approximates
    cooperative bargaining outcomes without over-claiming mathematical rigour.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════════════
# Constants & Enums
# ═════════════════════════════════════════════════════════════════════════════

class CompromiseStrategy(str, Enum):
    """High-level strategy applied to generate the candidate."""
    ACCEPT_PARTY_A = "accept_party_a"          # Keep Party A baseline
    ACCEPT_PARTY_B = "accept_party_b"          # Accept Party B markup
    SPLIT_MIDPOINT = "split_midpoint"          # Textual midpoint
    CONCEDE_WITH_GUARD = "concede_with_guard"  # Accept B with protective guardrail
    TRADE_OFF = "trade_off"                    # Accept on one axis, resist on another
    NARROW_SCOPE = "narrow_scope"              # Accept B's intent, narrow the scope
    ESCALATE = "escalate"                      # Flag for human counsel


# ── Weight presets for utility dimensions ────────────────────────────────────
# Each weight set sums to 1.0.
# Callers can override via DimensionWeights.

DEFAULT_PARTY_A_WEIGHTS = {
    "risk": 0.30,
    "commercial": 0.25,
    "relationship": 0.15,
    "legal_precedent": 0.20,
    "operational": 0.10,
}

DEFAULT_PARTY_B_WEIGHTS = {
    "risk": 0.25,
    "commercial": 0.30,
    "relationship": 0.20,
    "legal_precedent": 0.10,
    "operational": 0.15,
}


# ═════════════════════════════════════════════════════════════════════════════
# Pydantic Models — Inputs
# ═════════════════════════════════════════════════════════════════════════════

class DimensionWeights(BaseModel):
    """Per-party weighting of the five utility dimensions.  Must sum to 1.0."""
    risk: float = 0.30
    commercial: float = 0.25
    relationship: float = 0.15
    legal_precedent: float = 0.20
    operational: float = 0.10


class ClauseNegotiationInput(BaseModel):
    """
    Everything the engine needs for one clause to score candidates.

    Populated by Agent 1 (Party A analysis) + Agent 2 (risk analysis).
    """
    clause_id: str
    section_number: str = ""
    title: str = ""
    category: str = "general"

    # Party positions (baseline text vs. redline text)
    party_a_text: str = ""
    party_b_text: str = ""

    # Agent 2 risk score for Party B's markup (0–10)
    risk_score: float = Field(default=0.0, ge=0.0, le=10.0)

    # Did Agent 1 mark this clause as non-negotiable for Party A?
    is_party_a_non_negotiable: bool = False

    # Party A preferred position summary from Agent 1
    party_a_preferred_position: str = ""

    # Agent 2 deterministic risk flags (keyword hits, aggression patterns)
    risk_flags: List[str] = Field(default_factory=list)

    # Is this clause an aggressive deviation per Agent 2?
    is_aggressive_deviation: bool = False

    # Diff statistics
    insertion_count: int = 0
    deletion_count: int = 0

    # Optional: variance ceiling from the matter (max acceptable deviation %)
    variance_ceiling: Optional[float] = None


class NegotiationConfig(BaseModel):
    """Global parameters for a negotiation scoring run."""
    matter_id: str = ""
    variance_ceiling: float = Field(
        default=25.0, ge=0.0, le=100.0,
        description="Maximum acceptable deviation from Party A baseline, as a percentage.",
    )
    party_a_weights: DimensionWeights = Field(default_factory=DimensionWeights)
    party_b_weights: DimensionWeights = Field(
        default_factory=lambda: DimensionWeights(
            risk=0.25, commercial=0.30, relationship=0.20,
            legal_precedent=0.10, operational=0.15,
        ),
    )
    # When true, non-negotiable clauses auto-resolve to Party A position
    enforce_non_negotiables: bool = True


# ═════════════════════════════════════════════════════════════════════════════
# Pydantic Models — Outputs
# ═════════════════════════════════════════════════════════════════════════════

class UtilityScores(BaseModel):
    """Breakdown of utility across dimensions for one party."""
    risk: float = 0.0
    commercial: float = 0.0
    relationship: float = 0.0
    legal_precedent: float = 0.0
    operational: float = 0.0
    weighted_total: float = Field(
        default=0.0,
        description="Weighted composite utility on 0–100 scale.",
    )


class CompromiseCandidate(BaseModel):
    """A single scored compromise candidate for one clause."""
    clause_id: str
    strategy: CompromiseStrategy
    label: str
    proposed_text: str
    rationale: str

    # Utility for each party (0–100, higher = more favourable)
    party_a_utility: UtilityScores = Field(default_factory=UtilityScores)
    party_b_utility: UtilityScores = Field(default_factory=UtilityScores)

    # Aggregate metrics
    joint_surplus: float = Field(
        default=0.0,
        description="party_a_utility.weighted_total + party_b_utility.weighted_total",
    )
    balance: float = Field(
        default=0.0,
        description=(
            "Closeness of utilities.  100 = perfectly balanced, "
            "0 = maximally one-sided."
        ),
    )
    compromise_score: float = Field(
        default=0.0, ge=0.0, le=100.0,
        description="Final ranking score: 0.60 × joint_surplus + 0.40 × balance.",
    )
    is_pareto_efficient: bool = False
    exceeds_variance_ceiling: bool = False
    risk_delta: float = Field(
        default=0.0,
        description="Change in risk relative to Party A baseline (negative = safer).",
    )


class ClauseNegotiationResult(BaseModel):
    """All scored and ranked candidates for one clause."""
    clause_id: str
    section_number: str = ""
    title: str = ""
    category: str = "general"
    is_non_negotiable: bool = False

    candidates: List[CompromiseCandidate] = Field(default_factory=list)
    recommended: Optional[CompromiseCandidate] = None
    pareto_frontier: List[CompromiseCandidate] = Field(default_factory=list)


class NegotiationEngineOutput(BaseModel):
    """Complete output of the negotiation engine for all clauses."""
    matter_id: str = ""
    clause_results: List[ClauseNegotiationResult] = Field(default_factory=list)
    aggregate_compromise_score: float = Field(
        default=0.0, ge=0.0, le=100.0,
        description="Average compromise score of all recommended candidates.",
    )
    total_clauses: int = 0
    escalated_clause_ids: List[str] = Field(default_factory=list)
    non_negotiable_clause_ids: List[str] = Field(default_factory=list)


# ═════════════════════════════════════════════════════════════════════════════
# Core Engine
# ═════════════════════════════════════════════════════════════════════════════

def score_negotiation(
    clauses: List[ClauseNegotiationInput],
    config: Optional[NegotiationConfig] = None,
) -> NegotiationEngineOutput:
    """
    Main entry point.  Scores every clause and returns ranked compromise
    candidates with Pareto-efficient recommendations.

    Pipeline per clause:
        1. Generate candidate proposals (strategies)
        2. Score each candidate on five utility dimensions for both parties
        3. Compute joint surplus and balance
        4. Filter Pareto-dominated candidates
        5. Rank remaining candidates by compromise_score
        6. Select recommendation (top-ranked Pareto-efficient candidate)
    """
    if config is None:
        config = NegotiationConfig()

    results: List[ClauseNegotiationResult] = []
    escalated: List[str] = []
    non_negotiable_ids: List[str] = []

    for clause in clauses:
        vc = clause.variance_ceiling if clause.variance_ceiling is not None else config.variance_ceiling

        # ── Fast path: non-negotiable clauses ────────────────────────
        if config.enforce_non_negotiables and clause.is_party_a_non_negotiable:
            non_negotiable_ids.append(clause.clause_id)
            candidate = _make_non_negotiable_candidate(clause)
            results.append(
                ClauseNegotiationResult(
                    clause_id=clause.clause_id,
                    section_number=clause.section_number,
                    title=clause.title,
                    category=clause.category,
                    is_non_negotiable=True,
                    candidates=[candidate],
                    recommended=candidate,
                    pareto_frontier=[candidate],
                )
            )
            continue

        # ── 1. Generate candidates ───────────────────────────────────
        candidates = _generate_candidates(clause)

        # ── 2. Score each candidate ──────────────────────────────────
        scored: List[CompromiseCandidate] = []
        for c in candidates:
            scored_candidate = _score_candidate(c, clause, config, vc)
            scored.append(scored_candidate)

        # ── 3. Filter Pareto frontier ────────────────────────────────
        frontier = _pareto_filter(scored)

        # ── 4. Rank by compromise_score ──────────────────────────────
        frontier.sort(key=lambda x: x.compromise_score, reverse=True)
        scored.sort(key=lambda x: x.compromise_score, reverse=True)

        # ── 5. Select recommendation ────────────────────────────────
        recommended = frontier[0] if frontier else (scored[0] if scored else None)

        # ── 6. Escalation check ─────────────────────────────────────
        if recommended and recommended.strategy == CompromiseStrategy.ESCALATE:
            escalated.append(clause.clause_id)

        results.append(
            ClauseNegotiationResult(
                clause_id=clause.clause_id,
                section_number=clause.section_number,
                title=clause.title,
                category=clause.category,
                is_non_negotiable=False,
                candidates=scored,
                recommended=recommended,
                pareto_frontier=frontier,
            )
        )

    # ── Aggregate score ──────────────────────────────────────────────
    rec_scores = [
        r.recommended.compromise_score
        for r in results
        if r.recommended is not None
    ]
    agg = round(sum(rec_scores) / len(rec_scores), 2) if rec_scores else 0.0

    return NegotiationEngineOutput(
        matter_id=config.matter_id,
        clause_results=results,
        aggregate_compromise_score=agg,
        total_clauses=len(clauses),
        escalated_clause_ids=escalated,
        non_negotiable_clause_ids=non_negotiable_ids,
    )


# ═════════════════════════════════════════════════════════════════════════════
# Candidate Generation
# ═════════════════════════════════════════════════════════════════════════════

def _make_non_negotiable_candidate(clause: ClauseNegotiationInput) -> CompromiseCandidate:
    """For non-negotiable clauses: Party A position accepted, max A utility."""
    return CompromiseCandidate(
        clause_id=clause.clause_id,
        strategy=CompromiseStrategy.ACCEPT_PARTY_A,
        label="Non-Negotiable — Party A Position",
        proposed_text=clause.party_a_text,
        rationale=(
            f"Clause {clause.clause_id} ({clause.title}) is flagged as non-negotiable "
            f"by Party A.  Party A baseline is enforced without modification."
        ),
        party_a_utility=UtilityScores(
            risk=95.0, commercial=90.0, relationship=60.0,
            legal_precedent=95.0, operational=90.0, weighted_total=88.0,
        ),
        party_b_utility=UtilityScores(
            risk=40.0, commercial=35.0, relationship=30.0,
            legal_precedent=40.0, operational=40.0, weighted_total=37.0,
        ),
        joint_surplus=125.0,
        balance=_balance_score(88.0, 37.0),
        compromise_score=_compromise_score(125.0, _balance_score(88.0, 37.0)),
        is_pareto_efficient=True,
        exceeds_variance_ceiling=False,
        risk_delta=0.0,
    )


def _generate_candidates(
    clause: ClauseNegotiationInput,
) -> List[CompromiseCandidate]:
    """
    Generate 4–6 candidate proposals covering the strategy spectrum.

    Every clause always gets at least:
        • Accept Party A (baseline)
        • Accept Party B (markup)
        • Midpoint
        • Concede-with-guard (if risk is moderate+)
    High-risk / aggressive clauses also get:
        • Narrow-scope
        • Escalate
    """
    candidates: List[CompromiseCandidate] = []
    c_id = clause.clause_id
    title = clause.title or clause.section_number or c_id

    # ── Candidate 1: Accept Party A ──────────────────────────────────
    candidates.append(CompromiseCandidate(
        clause_id=c_id,
        strategy=CompromiseStrategy.ACCEPT_PARTY_A,
        label=f"Retain Party A Baseline — {title}",
        proposed_text=clause.party_a_text,
        rationale=(
            f"Preserve Party A's original position on {title}.  "
            f"Zero deviation from baseline; lowest risk for Party A."
        ),
    ))

    # ── Candidate 2: Accept Party B ──────────────────────────────────
    candidates.append(CompromiseCandidate(
        clause_id=c_id,
        strategy=CompromiseStrategy.ACCEPT_PARTY_B,
        label=f"Accept Party B Markup — {title}",
        proposed_text=clause.party_b_text,
        rationale=(
            f"Accept Party B's proposed redline on {title}.  "
            f"Maximises relationship goodwill but increases risk for Party A."
        ),
    ))

    # ── Candidate 3: Midpoint ────────────────────────────────────────
    midpoint_text = _generate_midpoint_text(clause)
    candidates.append(CompromiseCandidate(
        clause_id=c_id,
        strategy=CompromiseStrategy.SPLIT_MIDPOINT,
        label=f"Midpoint Compromise — {title}",
        proposed_text=midpoint_text,
        rationale=(
            f"Balanced position incorporating elements of both parties on {title}.  "
            f"Partial concession from each side."
        ),
    ))

    # ── Candidate 4: Concede with guard (if risk ≥ 3.0) ─────────────
    if clause.risk_score >= 3.0:
        guard_text = _generate_guarded_text(clause)
        candidates.append(CompromiseCandidate(
            clause_id=c_id,
            strategy=CompromiseStrategy.CONCEDE_WITH_GUARD,
            label=f"Concede with Protective Guardrail — {title}",
            proposed_text=guard_text,
            rationale=(
                f"Accepts Party B's core intent on {title} but adds protective "
                f"guardrails (caps, mutual obligations, or sunset clauses) to "
                f"limit Party A's downside exposure."
            ),
        ))

    # ── Candidate 5: Narrow scope (if aggressive deviation) ──────────
    if clause.is_aggressive_deviation or clause.risk_score >= 6.0:
        narrow_text = _generate_narrow_scope_text(clause)
        candidates.append(CompromiseCandidate(
            clause_id=c_id,
            strategy=CompromiseStrategy.NARROW_SCOPE,
            label=f"Narrow Scope — {title}",
            proposed_text=narrow_text,
            rationale=(
                f"Acknowledges Party B's concern on {title} but narrows the "
                f"operational scope to reduce risk exposure.  Limits breadth "
                f"while preserving commercial intent."
            ),
        ))

    # ── Candidate 6: Escalate (if risk ≥ 8.0 or aggressive) ─────────
    if clause.risk_score >= 8.0 or (
        clause.is_aggressive_deviation and clause.risk_score >= 5.0
    ):
        candidates.append(CompromiseCandidate(
            clause_id=c_id,
            strategy=CompromiseStrategy.ESCALATE,
            label=f"Escalate to Counsel — {title}",
            proposed_text=clause.party_a_text,
            rationale=(
                f"Risk score {clause.risk_score}/10 with aggressive deviation "
                f"detected on {title}.  Automated resolution is not advisable; "
                f"recommend escalation to human counsel."
            ),
        ))

    return candidates


# ═════════════════════════════════════════════════════════════════════════════
# Candidate Text Generators (deterministic heuristics)
# ═════════════════════════════════════════════════════════════════════════════

def _generate_midpoint_text(clause: ClauseNegotiationInput) -> str:
    """
    Deterministic midpoint: keeps Party A's structure, acknowledges B's change.

    In a real LLM-enhanced pipeline, Agent 3 would rewrite this using the LLM.
    Here we produce a formulaic but traceable proposal.
    """
    a = clause.party_a_text.strip()
    b = clause.party_b_text.strip()
    if not a and not b:
        return ""
    if not b:
        return a
    if not a:
        return b
    return (
        f"{a}  [Midpoint amendment: The parties agree to incorporate the following "
        f"modification subject to mutual review: {b}]"
    )


def _generate_guarded_text(clause: ClauseNegotiationInput) -> str:
    """Accept B's text with a protective carve-out appended."""
    b = clause.party_b_text.strip()
    guard_clauses = {
        "liability": (
            "Notwithstanding the foregoing, aggregate liability under this section "
            "shall not exceed 1.0× the annual contract value, and neither party "
            "shall be liable for indirect, consequential, or punitive damages."
        ),
        "indemnification": (
            "Indemnification obligations under this section are subject to a cap "
            "equal to the total fees paid in the preceding 12-month period and "
            "require prompt written notice of any claim."
        ),
        "payment": (
            "Payment terms are subject to a Net-30 minimum floor.  Late fees "
            "shall not exceed 1.5% per month on outstanding balances."
        ),
        "venue_jurisdiction": (
            "The parties consent to the designated jurisdiction; provided, however, "
            "that either party may seek injunctive relief in any court of "
            "competent jurisdiction."
        ),
        "ip": (
            "All pre-existing intellectual property remains the sole property of "
            "its original owner.  Any jointly developed IP shall be jointly owned "
            "with each party retaining an unrestricted right to use."
        ),
        "termination": (
            "Notwithstanding the above, either party shall have no fewer than "
            "30 calendar days written notice prior to termination, and a minimum "
            "15-day cure period for remediable breaches."
        ),
    }
    guard = guard_clauses.get(clause.category, (
        "This provision is subject to mutual good-faith negotiation and shall "
        "not be construed to create obligations beyond the scope of this agreement."
    ))
    return f"{b}  [Guardrail: {guard}]"


def _generate_narrow_scope_text(clause: ClauseNegotiationInput) -> str:
    """Accept B's intent but explicitly narrow the scope."""
    b = clause.party_b_text.strip()
    return (
        f"{b}  [Scope limitation: This provision applies solely to obligations "
        f"arising directly under this agreement and shall not extend to "
        f"affiliates, subcontractors, or third-party beneficiaries unless "
        f"expressly stated.]"
    )


# ═════════════════════════════════════════════════════════════════════════════
# Utility Scoring
# ═════════════════════════════════════════════════════════════════════════════

def _score_candidate(
    candidate: CompromiseCandidate,
    clause: ClauseNegotiationInput,
    config: NegotiationConfig,
    variance_ceiling: float,
) -> CompromiseCandidate:
    """
    Score a candidate across five dimensions for both parties.

    Dimension scoring formulas (all on 0–100 scale):
    ─────────────────────────────────────────────────
    RISK
        Party A:  100 − (risk_score × 10)           # lower clause risk → higher A utility
                  + strategy_bonus
        Party B:  40 + (risk_score × 5)              # B benefits from shifted risk
                  + strategy_bonus

    COMMERCIAL
        Measures how well each party's commercial interests are served.
        Party A:  baseline 80 − (risk_score × 4), adjusted by strategy
        Party B:  baseline 50 + (risk_score × 3), adjusted by strategy

    RELATIONSHIP
        Rewards balanced, collaborative proposals.
        Both parties: baseline 50, boosted by midpoint/guard strategies,
                      penalised by accept-own / escalate.

    LEGAL PRECEDENT
        Party A:  higher when closer to baseline (fewer deviations)
        Party B:  moderate flat score (B has less precedent leverage)

    OPERATIONAL
        Measures implementability.
        Both:  baseline 70, penalised by complexity (high diff counts).
    """
    rs = clause.risk_score  # 0–10

    # ── Strategy-dependent adjustments ───────────────────────────────
    strat = candidate.strategy

    # ── RISK dimension ───────────────────────────────────────────────
    a_risk = _clamp(100.0 - rs * 10.0 + _strategy_bonus_a_risk(strat, rs))
    b_risk = _clamp(40.0 + rs * 5.0 + _strategy_bonus_b_risk(strat, rs))

    # ── COMMERCIAL dimension ─────────────────────────────────────────
    a_commercial = _clamp(80.0 - rs * 4.0 + _strategy_bonus_a_commercial(strat))
    b_commercial = _clamp(50.0 + rs * 3.0 + _strategy_bonus_b_commercial(strat))

    # ── RELATIONSHIP dimension ───────────────────────────────────────
    a_relationship = _clamp(50.0 + _strategy_bonus_relationship(strat, is_a=True))
    b_relationship = _clamp(50.0 + _strategy_bonus_relationship(strat, is_a=False))

    # ── LEGAL PRECEDENT dimension ────────────────────────────────────
    diff_volume = clause.insertion_count + clause.deletion_count
    a_precedent = _clamp(90.0 - diff_volume * 2.0 + _strategy_bonus_a_precedent(strat))
    b_precedent = _clamp(45.0 + _strategy_bonus_b_precedent(strat))

    # ── OPERATIONAL dimension ────────────────────────────────────────
    complexity_penalty = min(diff_volume * 1.5, 30.0)
    a_operational = _clamp(70.0 - complexity_penalty + _strategy_bonus_operational(strat))
    b_operational = _clamp(70.0 - complexity_penalty + _strategy_bonus_operational(strat))

    # ── Weighted totals ──────────────────────────────────────────────
    aw = config.party_a_weights
    bw = config.party_b_weights

    a_total = round(
        a_risk * aw.risk
        + a_commercial * aw.commercial
        + a_relationship * aw.relationship
        + a_precedent * aw.legal_precedent
        + a_operational * aw.operational,
        2,
    )
    b_total = round(
        b_risk * bw.risk
        + b_commercial * bw.commercial
        + b_relationship * bw.relationship
        + b_precedent * bw.legal_precedent
        + b_operational * bw.operational,
        2,
    )

    a_util = UtilityScores(
        risk=round(a_risk, 2),
        commercial=round(a_commercial, 2),
        relationship=round(a_relationship, 2),
        legal_precedent=round(a_precedent, 2),
        operational=round(a_operational, 2),
        weighted_total=a_total,
    )
    b_util = UtilityScores(
        risk=round(b_risk, 2),
        commercial=round(b_commercial, 2),
        relationship=round(b_relationship, 2),
        legal_precedent=round(b_precedent, 2),
        operational=round(b_operational, 2),
        weighted_total=b_total,
    )

    # ── Aggregate metrics ────────────────────────────────────────────
    joint = round(a_total + b_total, 2)
    bal = _balance_score(a_total, b_total)
    comp = _compromise_score(joint, bal)

    # ── Variance ceiling check ───────────────────────────────────────
    # Deviation % = how far the candidate is from Party A baseline
    # For "accept A" it's 0%; for "accept B" it's proportional to risk
    deviation_pct = _estimate_deviation_pct(strat, rs)
    exceeds = deviation_pct > variance_ceiling

    # ── Risk delta ───────────────────────────────────────────────────
    risk_delta = round(_estimate_risk_delta(strat, rs), 2)

    # ── Assemble scored candidate ────────────────────────────────────
    candidate.party_a_utility = a_util
    candidate.party_b_utility = b_util
    candidate.joint_surplus = joint
    candidate.balance = bal
    candidate.compromise_score = comp
    candidate.exceeds_variance_ceiling = exceeds
    candidate.risk_delta = risk_delta

    return candidate


# ═════════════════════════════════════════════════════════════════════════════
# Strategy Bonus Tables
# ═════════════════════════════════════════════════════════════════════════════
# These small additive adjustments model the intuition that different
# strategies favour different dimensions.  All values are on the 0–100 scale.

def _strategy_bonus_a_risk(strat: CompromiseStrategy, rs: float) -> float:
    return {
        CompromiseStrategy.ACCEPT_PARTY_A:      15.0,
        CompromiseStrategy.ACCEPT_PARTY_B:     -20.0,
        CompromiseStrategy.SPLIT_MIDPOINT:       0.0,
        CompromiseStrategy.CONCEDE_WITH_GUARD:   5.0,
        CompromiseStrategy.NARROW_SCOPE:        10.0,
        CompromiseStrategy.TRADE_OFF:            0.0,
        CompromiseStrategy.ESCALATE:             5.0,
    }.get(strat, 0.0)


def _strategy_bonus_b_risk(strat: CompromiseStrategy, rs: float) -> float:
    return {
        CompromiseStrategy.ACCEPT_PARTY_A:     -10.0,
        CompromiseStrategy.ACCEPT_PARTY_B:      15.0,
        CompromiseStrategy.SPLIT_MIDPOINT:       5.0,
        CompromiseStrategy.CONCEDE_WITH_GUARD:  -5.0,
        CompromiseStrategy.NARROW_SCOPE:        -8.0,
        CompromiseStrategy.TRADE_OFF:            0.0,
        CompromiseStrategy.ESCALATE:           -15.0,
    }.get(strat, 0.0)


def _strategy_bonus_a_commercial(strat: CompromiseStrategy) -> float:
    return {
        CompromiseStrategy.ACCEPT_PARTY_A:      10.0,
        CompromiseStrategy.ACCEPT_PARTY_B:     -15.0,
        CompromiseStrategy.SPLIT_MIDPOINT:       0.0,
        CompromiseStrategy.CONCEDE_WITH_GUARD:  -5.0,
        CompromiseStrategy.NARROW_SCOPE:         5.0,
        CompromiseStrategy.TRADE_OFF:            5.0,
        CompromiseStrategy.ESCALATE:             0.0,
    }.get(strat, 0.0)


def _strategy_bonus_b_commercial(strat: CompromiseStrategy) -> float:
    return {
        CompromiseStrategy.ACCEPT_PARTY_A:     -15.0,
        CompromiseStrategy.ACCEPT_PARTY_B:      15.0,
        CompromiseStrategy.SPLIT_MIDPOINT:       5.0,
        CompromiseStrategy.CONCEDE_WITH_GUARD:  10.0,
        CompromiseStrategy.NARROW_SCOPE:        -5.0,
        CompromiseStrategy.TRADE_OFF:            5.0,
        CompromiseStrategy.ESCALATE:           -10.0,
    }.get(strat, 0.0)


def _strategy_bonus_relationship(strat: CompromiseStrategy, is_a: bool) -> float:
    """Relationship is symmetric for collaborative strategies."""
    table = {
        CompromiseStrategy.ACCEPT_PARTY_A:     (-5.0, -15.0),   # (A, B)
        CompromiseStrategy.ACCEPT_PARTY_B:     (-15.0, -5.0),
        CompromiseStrategy.SPLIT_MIDPOINT:     (20.0, 20.0),
        CompromiseStrategy.CONCEDE_WITH_GUARD: (10.0, 15.0),
        CompromiseStrategy.NARROW_SCOPE:       (5.0, 5.0),
        CompromiseStrategy.TRADE_OFF:          (15.0, 15.0),
        CompromiseStrategy.ESCALATE:           (-20.0, -20.0),
    }
    pair = table.get(strat, (0.0, 0.0))
    return pair[0] if is_a else pair[1]


def _strategy_bonus_a_precedent(strat: CompromiseStrategy) -> float:
    return {
        CompromiseStrategy.ACCEPT_PARTY_A:      10.0,
        CompromiseStrategy.ACCEPT_PARTY_B:     -20.0,
        CompromiseStrategy.SPLIT_MIDPOINT:      -5.0,
        CompromiseStrategy.CONCEDE_WITH_GUARD:   0.0,
        CompromiseStrategy.NARROW_SCOPE:         5.0,
        CompromiseStrategy.TRADE_OFF:           -5.0,
        CompromiseStrategy.ESCALATE:             5.0,
    }.get(strat, 0.0)


def _strategy_bonus_b_precedent(strat: CompromiseStrategy) -> float:
    return {
        CompromiseStrategy.ACCEPT_PARTY_A:      -5.0,
        CompromiseStrategy.ACCEPT_PARTY_B:      10.0,
        CompromiseStrategy.SPLIT_MIDPOINT:       5.0,
        CompromiseStrategy.CONCEDE_WITH_GUARD:   5.0,
        CompromiseStrategy.NARROW_SCOPE:         0.0,
        CompromiseStrategy.TRADE_OFF:            5.0,
        CompromiseStrategy.ESCALATE:            -5.0,
    }.get(strat, 0.0)


def _strategy_bonus_operational(strat: CompromiseStrategy) -> float:
    return {
        CompromiseStrategy.ACCEPT_PARTY_A:      10.0,
        CompromiseStrategy.ACCEPT_PARTY_B:       5.0,
        CompromiseStrategy.SPLIT_MIDPOINT:       0.0,
        CompromiseStrategy.CONCEDE_WITH_GUARD:  -5.0,
        CompromiseStrategy.NARROW_SCOPE:        -5.0,
        CompromiseStrategy.TRADE_OFF:           -5.0,
        CompromiseStrategy.ESCALATE:           -10.0,
    }.get(strat, 0.0)


# ═════════════════════════════════════════════════════════════════════════════
# Pareto Filter
# ═════════════════════════════════════════════════════════════════════════════

def _pareto_filter(
    candidates: List[CompromiseCandidate],
) -> List[CompromiseCandidate]:
    """
    Return the Pareto frontier: candidates where no other candidate is
    strictly better for BOTH parties simultaneously.

    A candidate X is Pareto-dominated if there exists another candidate Y
    such that:
        Y.party_a_utility.weighted_total ≥ X.party_a_utility.weighted_total
        AND
        Y.party_b_utility.weighted_total ≥ X.party_b_utility.weighted_total
        AND at least one inequality is strict.
    """
    frontier: List[CompromiseCandidate] = []

    for i, x in enumerate(candidates):
        dominated = False
        for j, y in enumerate(candidates):
            if i == j:
                continue
            a_ge = y.party_a_utility.weighted_total >= x.party_a_utility.weighted_total
            b_ge = y.party_b_utility.weighted_total >= x.party_b_utility.weighted_total
            a_gt = y.party_a_utility.weighted_total > x.party_a_utility.weighted_total
            b_gt = y.party_b_utility.weighted_total > x.party_b_utility.weighted_total
            if a_ge and b_ge and (a_gt or b_gt):
                dominated = True
                break
        if not dominated:
            x.is_pareto_efficient = True
            frontier.append(x)

    # If filter is too aggressive (e.g., all dominated), fall back to all
    if not frontier:
        return list(candidates)

    return frontier


# ═════════════════════════════════════════════════════════════════════════════
# Aggregate Metrics
# ═════════════════════════════════════════════════════════════════════════════

def _balance_score(a_total: float, b_total: float) -> float:
    """
    How balanced is the outcome between the two parties?

    Formula:
        balance = 100 − |a_total − b_total|

    Returns 100 when perfectly equal, 0 when maximally one-sided.
    Clamped to [0, 100].
    """
    return round(_clamp(100.0 - abs(a_total - b_total)), 2)


def _compromise_score(joint_surplus: float, balance: float) -> float:
    """
    Final ranking score.

    Formula:
        compromise = 0.60 × (joint_surplus / 2.0) + 0.40 × balance

    joint_surplus is on 0–200 (sum of two 0–100 utilities), so we normalise
    to 0–100 before weighting.  This rewards candidates that are both
    high-value AND balanced.
    """
    normalised_surplus = joint_surplus / 2.0  # → 0–100
    raw = 0.60 * normalised_surplus + 0.40 * balance
    return round(_clamp(raw), 2)


def _estimate_deviation_pct(strat: CompromiseStrategy, risk_score: float) -> float:
    """
    Estimate how far a strategy deviates from Party A's baseline (0–100%).

    Heuristic:
        accept_a = 0%, accept_b = risk_score × 10,
        midpoint ≈ half that, guard ≈ 60% of accept_b, etc.
    """
    base = risk_score * 10.0  # 0–100%
    return {
        CompromiseStrategy.ACCEPT_PARTY_A:      0.0,
        CompromiseStrategy.ACCEPT_PARTY_B:      base,
        CompromiseStrategy.SPLIT_MIDPOINT:      base * 0.50,
        CompromiseStrategy.CONCEDE_WITH_GUARD:  base * 0.60,
        CompromiseStrategy.NARROW_SCOPE:        base * 0.40,
        CompromiseStrategy.TRADE_OFF:           base * 0.50,
        CompromiseStrategy.ESCALATE:            0.0,  # No change proposed
    }.get(strat, base * 0.50)


def _estimate_risk_delta(strat: CompromiseStrategy, risk_score: float) -> float:
    """
    Estimated change in risk vs. Party A baseline.

    Negative = safer than baseline, Positive = riskier.
    """
    return {
        CompromiseStrategy.ACCEPT_PARTY_A:      0.0,
        CompromiseStrategy.ACCEPT_PARTY_B:      risk_score,
        CompromiseStrategy.SPLIT_MIDPOINT:      risk_score * 0.45,
        CompromiseStrategy.CONCEDE_WITH_GUARD:  risk_score * 0.30,
        CompromiseStrategy.NARROW_SCOPE:        risk_score * 0.25,
        CompromiseStrategy.TRADE_OFF:           risk_score * 0.40,
        CompromiseStrategy.ESCALATE:            0.0,
    }.get(strat, risk_score * 0.50)


# ═════════════════════════════════════════════════════════════════════════════
# Utilities
# ═════════════════════════════════════════════════════════════════════════════

def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    """Clamp a value to [lo, hi]."""
    return max(lo, min(hi, value))
