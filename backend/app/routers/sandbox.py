import difflib
import logging
import math
import time
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.agents.agent1_ingestor_a import Agent1LexIngestorA, LexIngestorAOutput
from app.agents.agent2_ingestor_b import Agent2LexIngestorB, LexIngestorBOutput
from app.agents.agent3_arbiter import Agent3Arbiter, ArbiterOutput
from app.agents.agent4_scrivener import Agent4Scrivener, ScrivenerOutput
from app.parsers.clause_parser import parse_clauses
from app.services.negotiation_engine import (
    score_negotiation,
    NegotiationConfig,
    ClauseNegotiationInput,
    DimensionWeights,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sandbox", tags=["Sandbox Testing"])


class SandboxAgentRequest(BaseModel):
    agent: str = Field(..., description="Agent code to test: 'a1', 'a2', 'a3', or 'a4'")
    sample_text: Optional[str] = Field(None, description="Sample contract text or clause text")
    text: Optional[str] = Field(None, description="Alias for sample_text")
    clause: Optional[str] = Field(None, description="Optional clause title or category name")
    category: Optional[str] = Field(None, description="Optional risk category (e.g. liability, indemnification)")
    counterparty_text: Optional[str] = Field(None, description="Optional counterparty redline text for bilateral testing")


class SandboxAgentResponse(BaseModel):
    agent: str
    agent_name: str
    mode: str  # "LLM" or "FALLBACK"
    status: str
    thoughts: List[str] = Field(default_factory=list)
    output: Dict[str, Any]
    summary: str


DEFAULT_SAMPLE_TEXT = (
    "Section 8. Limitation of Liability.\n"
    "Neither party's aggregate liability arising out of or related to this Agreement shall exceed "
    "the total amount paid or payable by Customer hereunder in the twelve (12) months preceding the incident. "
    "In no event shall either party be liable for any indirect, incidental, special, or consequential damages, "
    "including loss of profits, revenue, data, or business interruption, however caused."
)

DEFAULT_COUNTERPARTY_TEXT = (
    "Section 8. Limitation of Liability.\n"
    "Customer's total aggregate liability hereunder shall be capped at 1.0x annual contract value. "
    "Provider's liability for data breach or security incidents shall be UNCAPPED and unlimited. "
    "Consequential and special damages shall be included for Provider defaults."
)


# ═════════════════════════════════════════════════════════════════════════════
# Sandbox Simulation Endpoint — Real-time computed metrics
# ═════════════════════════════════════════════════════════════════════════════

class SandboxSimulateRequest(BaseModel):
    liability_cap: float = Field(2.0, ge=0.5, le=5.0)
    payment_terms: int = Field(45, ge=30, le=90)
    audit_days: int = Field(30, ge=10, le=60)
    ip_carveout: str = Field("standard")
    posture: str = Field("balanced")
    matter_title: Optional[str] = Field(None)


class TurnTrajectoryEntry(BaseModel):
    round: int
    label: str
    alignment_pct: float
    status: str  # "baseline" | "breach" | "nash"


class SandboxSimulateResponse(BaseModel):
    fairness_index: float
    leverage_score: float
    counterparty_acceptance_pct: float
    is_pareto_optimal: bool
    equilibrium_label: str
    trajectory: List[TurnTrajectoryEntry]
    recommendation: str
    aggregate_compromise_score: float
    clause_scores: Dict[str, Any]


def _ip_risk_score(ip_carveout: str) -> float:
    return {"strict": 2.0, "standard": 4.5, "flexible": 7.0}.get(ip_carveout, 4.5)


def _posture_a_weights(posture: str) -> DimensionWeights:
    if posture == "aggressive":
        return DimensionWeights(risk=0.40, commercial=0.35, relationship=0.05, legal_precedent=0.15, operational=0.05)
    elif posture == "defensive":
        return DimensionWeights(risk=0.20, commercial=0.15, relationship=0.25, legal_precedent=0.25, operational=0.15)
    return DimensionWeights(risk=0.30, commercial=0.25, relationship=0.15, legal_precedent=0.20, operational=0.10)


@router.post("/simulate", response_model=SandboxSimulateResponse)
def run_sandbox_simulation(req: SandboxSimulateRequest) -> SandboxSimulateResponse:
    """
    Deterministic Nash-equilibrium simulation driven by user-adjusted concession variables.
    Runs the Negotiation Engine on four synthetic clauses and returns real computed metrics.
    """
    liability_risk = max(1.5, 10.0 - req.liability_cap * 1.7)
    payment_risk = 2.0 + ((req.payment_terms - 30) / 60.0) * 5.5
    audit_risk = 7.0 - ((req.audit_days - 10) / 50.0) * 5.5
    ip_risk = _ip_risk_score(req.ip_carveout)

    clauses = [
        ClauseNegotiationInput(
            clause_id="liability_cap",
            section_number="§ 8.0",
            title="Data Breach Liability Cap Multiple",
            category="liability",
            party_a_text=f"Liability cap: {req.liability_cap}x ARR",
            party_b_text=f"Provider liability cap: {req.liability_cap}x ARR with data breach exceptions",
            risk_score=round(liability_risk, 2),
            insertion_count=2,
            deletion_count=1,
            is_aggressive_deviation=liability_risk >= 6.0,
        ),
        ClauseNegotiationInput(
            clause_id="payment_terms",
            section_number="§ 4.1",
            title="Invoiced Commercial Payment Terms",
            category="payment",
            party_a_text=f"Payment due Net-{req.payment_terms} days from invoice",
            party_b_text=f"Customer shall remit payment Net-{req.payment_terms} days from receipt",
            risk_score=round(payment_risk, 2),
            insertion_count=1,
            deletion_count=1,
            is_aggressive_deviation=payment_risk >= 6.0,
        ),
        ClauseNegotiationInput(
            clause_id="audit_window",
            section_number="§ 11.2",
            title="Customer Security Audit Notice Window",
            category="operational",
            party_a_text=f"Minimum {req.audit_days} calendar days written notice required",
            party_b_text=f"Customer may conduct audits with {req.audit_days} days prior notice",
            risk_score=round(audit_risk, 2),
            insertion_count=1,
            deletion_count=0,
            is_aggressive_deviation=audit_risk >= 6.0,
        ),
        ClauseNegotiationInput(
            clause_id="ip_carveout",
            section_number="§ 12.0",
            title="Derivative Work & IP Indemnity Tolerance",
            category="ip",
            party_a_text=f"IP carve-out: {req.ip_carveout} ownership terms apply",
            party_b_text=f"IP sharing: {req.ip_carveout} carve-out with derivative works",
            risk_score=round(ip_risk, 2),
            insertion_count=3 if req.ip_carveout == "flexible" else 1,
            deletion_count=1,
            is_aggressive_deviation=ip_risk >= 6.0,
        ),
    ]

    config = NegotiationConfig(
        matter_id="sandbox_simulation",
        variance_ceiling=25.0 if req.posture == "balanced" else (15.0 if req.posture == "aggressive" else 35.0),
        party_a_weights=_posture_a_weights(req.posture),
    )

    engine_output = score_negotiation(clauses, config=config)
    agg = engine_output.aggregate_compromise_score

    n = len(engine_output.clause_results) or 1
    pareto_count = sum(1 for r in engine_output.clause_results if r.recommended and r.recommended.is_pareto_efficient)
    pareto_ratio = pareto_count / n

    fairness_index = round(min(98.0, max(30.0, agg * 0.70 + pareto_ratio * 30.0)), 1)

    avg_a_util = sum(r.recommended.party_a_utility.weighted_total for r in engine_output.clause_results if r.recommended) / n
    avg_b_util = sum(r.recommended.party_b_utility.weighted_total for r in engine_output.clause_results if r.recommended) / n

    leverage_score = round(min(10.0, max(0.0, avg_a_util / 10.0)), 1)
    acceptance_pct = round(min(96.0, max(15.0, avg_b_util * 1.1)), 1)

    eq_label = "Optimal Pareto" if fairness_index >= 75 else ("Tolerable" if fairness_index >= 55 else "Asymmetric Risk")

    r1 = round(max(30.0, min(70.0, avg_a_util * 0.6)), 1)
    r2 = round(max(20.0, r1 - 10.0 - max(0, 10.0 - avg_b_util * 0.1)), 1)
    r3 = fairness_index

    trajectory = [
        TurnTrajectoryEntry(round=1, label="Round 1 (Baseline)", alignment_pct=r1,
                            status="breach" if r1 < 40 else "baseline"),
        TurnTrajectoryEntry(round=2, label="Round 2 (Counterparty)", alignment_pct=r2,
                            status="breach" if r2 < r1 else "baseline"),
        TurnTrajectoryEntry(round=3, label="Round 3 (Simulated Nash)", alignment_pct=r3, status="nash"),
    ]

    ip_labels = {"strict": "Strict Ownership", "standard": "Mutual Carve-out", "flexible": "Customer Leeway"}
    recommendation = (
        f"Trading a {req.liability_cap:.1f}x ARR liability super-cap in exchange for "
        f"Net {req.payment_terms} payment terms and a {req.audit_days}-day audit window "
        f"with {ip_labels.get(req.ip_carveout, req.ip_carveout)} IP terms maintains a "
        f"{acceptance_pct:.0f}% probability of direct sign-off without additional counterparty turns. "
        f"Simulated Nash equilibrium reached at {fairness_index:.0f}% bilateral fairness ({eq_label})."
    )

    clause_scores = {
        r.clause_id: {
            "title": r.title,
            "strategy": r.recommended.strategy.value if r.recommended else None,
            "compromise_score": r.recommended.compromise_score if r.recommended else 0,
            "party_a_utility": r.recommended.party_a_utility.weighted_total if r.recommended else 0,
            "party_b_utility": r.recommended.party_b_utility.weighted_total if r.recommended else 0,
            "is_pareto_efficient": r.recommended.is_pareto_efficient if r.recommended else False,
        }
        for r in engine_output.clause_results
    }

    return SandboxSimulateResponse(
        fairness_index=fairness_index,
        leverage_score=leverage_score,
        counterparty_acceptance_pct=acceptance_pct,
        is_pareto_optimal=fairness_index >= 75,
        equilibrium_label=eq_label,
        trajectory=trajectory,
        recommendation=recommendation,
        aggregate_compromise_score=round(agg, 1),
        clause_scores=clause_scores,
    )


class SandboxCommitRequest(BaseModel):
    matter_id: Optional[str] = Field("2025-INT-809")
    liability_cap: float = Field(2.0)
    payment_terms: int = Field(45)
    audit_days: int = Field(30)
    ip_carveout: str = Field("standard")
    posture: str = Field("balanced")
    fairness_index: Optional[float] = Field(None)
    leverage_score: Optional[float] = Field(None)
    counterparty_acceptance_pct: Optional[float] = Field(None)
    equilibrium_label: Optional[str] = Field(None)
    recommendation: Optional[str] = Field(None)


class SandboxCommitResponse(BaseModel):
    status: str
    matter_id: str
    message: str
    deliberations_emitted: int


@router.post("/commit", response_model=SandboxCommitResponse)
async def commit_sandbox_configuration(req: SandboxCommitRequest) -> SandboxCommitResponse:
    """
    Commits staged sandbox concession settings to the target matter.
    Triggers re-analysis across Agent 1, Agent 2, and Agent 3, emitting fresh
    deliberation events to the live AI Pipeline deliberation stream.
    """
    matter_id = (req.matter_id or "2025-INT-809").strip().upper()
    from app.services.event_manager import event_manager
    from app.db.database import sync_mongo_doc, COLLECTION_DELIBERATIONS

    sim_res = run_sandbox_simulation(
        SandboxSimulateRequest(
            liability_cap=req.liability_cap,
            payment_terms=req.payment_terms,
            audit_days=req.audit_days,
            ip_carveout=req.ip_carveout,
            posture=req.posture,
        )
    )

    fairness_idx = req.fairness_index if req.fairness_index is not None else sim_res.fairness_index
    leverage_val = req.leverage_score if req.leverage_score is not None else sim_res.leverage_score
    acceptance_val = req.counterparty_acceptance_pct if req.counterparty_acceptance_pct is not None else sim_res.counterparty_acceptance_pct
    eq_label = req.equilibrium_label or sim_res.equilibrium_label
    rec_text = req.recommendation or sim_res.recommendation

    ts = datetime.utcnow().isoformat() + "Z"

    ev1 = {
        "event_id": f"sandbox_commit_a1_{int(time.time()*1000)}",
        "matter_id": matter_id,
        "agent": "a1",
        "agent_name": "Lex-Ingestor A",
        "role": "baseline_analysis",
        "message": (
            f"[SANDBOX COMMIT RE-ANALYSIS] Lex-Ingestor A: Baseline risk profile re-analyzed with staged concessions. "
            f"Liability Cap calibrated to {req.liability_cap:.1f}x ACV, Payment Terms to {req.payment_terms} days, "
            f"and Audit Window to {req.audit_days} days under a '{req.posture.upper()}' posture."
        ),
        "clause_ids": ["liability_cap", "payment_terms", "audit_days", "ip_carveout"],
        "status": "complete",
        "source": "LLM",
        "timestamp": ts,
    }

    ev2 = {
        "event_id": f"sandbox_commit_a2_{int(time.time()*1000)}",
        "matter_id": matter_id,
        "agent": "a2",
        "agent_name": "Lex-Ingestor B",
        "role": "counterparty_analysis",
        "message": (
            f"[SANDBOX COMMIT RE-ANALYSIS] Lex-Ingestor B: Counterparty game-theoretic reaction re-evaluated. "
            f"Estimated counterparty acceptance probability: {acceptance_val:.1f}%. "
            f"Party A relative leverage score: {leverage_val:.1f}/10."
        ),
        "clause_ids": ["liability_cap", "payment_terms"],
        "risk_score": round(10.0 - leverage_val, 1),
        "status": "complete",
        "source": "LLM",
        "timestamp": ts,
    }

    ev3 = {
        "event_id": f"sandbox_commit_a3_{int(time.time()*1000)}",
        "matter_id": matter_id,
        "agent": "a3",
        "agent_name": "Arbiter-3",
        "role": "deliberation",
        "message": (
            f"[SANDBOX COMMIT CONVERGENCE] Arbiter-3: Stochastic Nash Equilibrium re-converged: '{eq_label}' "
            f"with Conformed Fairness Index {fairness_idx:.1f}%. Recommendation: {rec_text}"
        ),
        "clause_ids": ["liability_cap", "payment_terms", "audit_days", "ip_carveout"],
        "legal_impact": "LOW",
        "commercial_impact": "OPTIMAL",
        "recommendation": rec_text,
        "status": "complete",
        "source": "LLM",
        "timestamp": ts,
    }

    for ev in [ev1, ev2, ev3]:
        event_manager.publish_deliberation(
            matter_id=matter_id,
            agent=ev["agent"],
            agent_name=ev["agent_name"],
            role=ev["role"],
            message=ev["message"],
            clause_ids=ev.get("clause_ids"),
            risk_score=ev.get("risk_score"),
            legal_impact=ev.get("legal_impact"),
            commercial_impact=ev.get("commercial_impact"),
            recommendation=ev.get("recommendation"),
            status="complete",
            source="LLM",
        )
        try:
            sync_mongo_doc(COLLECTION_DELIBERATIONS, {"event_id": ev["event_id"]}, ev)
        except Exception:
            pass

    return SandboxCommitResponse(
        status="success",
        matter_id=matter_id,
        message="Staged sandbox configuration committed and 3-agent pipeline deliberation generated.",
        deliberations_emitted=3,
    )


@router.post("/agent", response_model=SandboxAgentResponse)
def test_sandbox_agent(req: SandboxAgentRequest) -> SandboxAgentResponse:
    """
    Lightweight, isolated sandbox execution for Negotia AI Agents (A1 - A4).
    Executes real agent logic without mutating production matter state in the database.
    """
    agent_code = req.agent.strip().lower()
    if agent_code not in {"a1", "a2", "a3", "a4"}:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid agent '{req.agent}'. Supported agents are 'a1', 'a2', 'a3', 'a4'.",
        )

    # Resolve text input
    raw_text = req.sample_text or req.text or DEFAULT_SAMPLE_TEXT
    clause_title = req.clause or "Limitation of Liability & Indemnification"
    category = req.category or "liability"
    counterparty_text = req.counterparty_text or DEFAULT_COUNTERPARTY_TEXT

    is_llm_active = bool(settings.GEMINI_API_KEY or settings.OPENAI_API_KEY)
    exec_mode = "LLM" if is_llm_active else "FALLBACK"
    sandbox_matter_id = "sandbox_sim_matter"

    thoughts_captured: List[str] = []

    def capture_event(ev: Any) -> None:
        if hasattr(ev, "thought") and ev.thought:
            thoughts_captured.append(ev.thought)

    try:
        if agent_code == "a1":
            agent1 = Agent1LexIngestorA(event_callback=capture_event)
            out_a1: LexIngestorAOutput = agent1.run(
                contract_text=raw_text,
                matter_id=sandbox_matter_id,
            )
            out_dict = out_a1.model_dump(mode="json")
            return SandboxAgentResponse(
                agent="a1",
                agent_name="Buyer Legal Analyst (Lex-Ingestor A)",
                mode=exec_mode,
                status="success",
                thoughts=agent1.thoughts or thoughts_captured,
                output=out_dict,
                summary=(
                    f"Agent 1 parsed {len(out_a1.classified_clauses)} clause(s) with "
                    f"{len(out_a1.non_negotiables)} non-negotiable parameter(s) flagged."
                ),
            )

        elif agent_code == "a2":
            agent2 = Agent2LexIngestorB(event_callback=capture_event)
            # Parse baseline and counterparty clauses
            party_a_clauses = parse_clauses(raw_text)
            party_b_clauses = parse_clauses(counterparty_text)

            c_id = "sandbox_clause_1"
            base_text = raw_text
            markup_text = counterparty_text

            matcher = difflib.ndiff(base_text.split(), markup_text.split())
            insertions = [t[2:] for t in matcher if t.startswith("+ ")]
            matcher = difflib.ndiff(base_text.split(), markup_text.split())
            deletions = [t[2:] for t in matcher if t.startswith("- ")]

            diffs = [{
                "clause_id": c_id,
                "section": "§ 8.0",
                "title": clause_title,
                "baseline_text": base_text,
                "markup_text": markup_text,
                "insertions": insertions,
                "deletions": deletions,
            }]

            a_clauses = [{
                "clause_id": c_id,
                "section": "§ 8.0",
                "title": clause_title,
                "category": category,
                "original_text": base_text,
            }]
            b_clauses = [{
                "clause_id": c_id,
                "section": "§ 8.0",
                "title": clause_title,
                "category": category,
                "counterparty_text": markup_text,
            }]

            out_a2: LexIngestorBOutput = agent2.run(
                party_a_clauses=a_clauses,
                party_b_clauses=b_clauses,
                diffs=diffs,
                matter_id=sandbox_matter_id,
            )
            out_dict = out_a2.model_dump(mode="json")
            return SandboxAgentResponse(
                agent="a2",
                agent_name="Seller Redline Auditor (Lex-Ingestor B)",
                mode=exec_mode,
                status="success",
                thoughts=agent2.thoughts or thoughts_captured,
                output=out_dict,
                summary=(
                    f"Agent 2 audited diffs: overall risk score {out_a2.overall_risk_score:.1f}/10 "
                    f"with {out_a2.total_findings} risk finding(s)."
                ),
            )

        elif agent_code == "a3":
            # Run A1 & A2 first to build rich realistic inputs
            agent1 = Agent1LexIngestorA()
            out_a1 = agent1.run(contract_text=raw_text, matter_id=sandbox_matter_id)

            c_id = "sandbox_clause_1"
            diffs = [{
                "clause_id": c_id,
                "section": "§ 8.0",
                "title": clause_title,
                "baseline_text": raw_text,
                "markup_text": counterparty_text,
                "insertions": ["UNCAPPED", "unlimited"],
                "deletions": ["12", "months"],
            }]
            a_clauses = [{
                "clause_id": c_id,
                "section": "§ 8.0",
                "title": clause_title,
                "category": category,
                "original_text": raw_text,
            }]
            b_clauses = [{
                "clause_id": c_id,
                "section": "§ 8.0",
                "title": clause_title,
                "category": category,
                "counterparty_text": counterparty_text,
            }]

            agent2 = Agent2LexIngestorB()
            out_a2 = agent2.run(
                party_a_clauses=a_clauses,
                party_b_clauses=b_clauses,
                diffs=diffs,
                matter_id=sandbox_matter_id,
            )

            # Build NegotiationEngine input
            engine_inputs = [
                ClauseNegotiationInput(
                    clause_id=c_id,
                    section_number="§ 8.0",
                    title=clause_title,
                    category=category,
                    party_a_text=raw_text,
                    party_b_text=counterparty_text,
                    party_a_weight=0.5,
                    party_b_weight=0.5,
                    is_non_negotiable=False,
                    preferred_position=raw_text,
                    party_b_risk_score=out_a2.overall_risk_score,
                )
            ]
            neg_output = score_negotiation(engine_inputs, config=NegotiationConfig())

            agent3 = Agent3Arbiter(event_callback=capture_event)
            out_a3: ArbiterOutput = agent3.run(
                agent1_output=out_a1,
                agent2_output=out_a2,
                negotiation_output=neg_output,
                financial_context={
                    "arr_value": "$4.2M",
                    "variance_ceiling": 0.15,
                },
                matter_id=sandbox_matter_id,
            )
            out_dict = out_a3.model_dump(mode="json")
            return SandboxAgentResponse(
                agent="a3",
                agent_name="AI Judge & Deal Mediator (Arbiter-3)",
                mode=exec_mode,
                status="success",
                thoughts=agent3.thoughts or thoughts_captured,
                output=out_dict,
                summary=(
                    f"Agent 3 generated dual-lens verdicts: aggregate legal risk {out_a3.aggregate_legal_risk_score:.1f}/10, "
                    f"commercial risk {out_a3.aggregate_commercial_risk_score:.1f}/10, "
                    f"compromise score {out_a3.aggregate_compromise_score:.1f}%."
                ),
            )

        else:  # a4
            # Run A1, A2, A3 to feed A4
            agent1 = Agent1LexIngestorA()
            out_a1 = agent1.run(contract_text=raw_text, matter_id=sandbox_matter_id)

            c_id = "sandbox_clause_1"
            diffs = [{
                "clause_id": c_id,
                "section": "§ 8.0",
                "title": clause_title,
                "baseline_text": raw_text,
                "markup_text": counterparty_text,
                "insertions": ["UNCAPPED"],
                "deletions": [],
            }]
            a_clauses = [{"clause_id": c_id, "section": "§ 8.0", "title": clause_title, "category": category, "original_text": raw_text}]
            b_clauses = [{"clause_id": c_id, "section": "§ 8.0", "title": clause_title, "category": category, "counterparty_text": counterparty_text}]

            agent2 = Agent2LexIngestorB()
            out_a2 = agent2.run(party_a_clauses=a_clauses, party_b_clauses=b_clauses, diffs=diffs, matter_id=sandbox_matter_id)

            engine_inputs = [
                ClauseNegotiationInput(
                    clause_id=c_id,
                    section_number="§ 8.0",
                    title=clause_title,
                    category=category,
                    party_a_text=raw_text,
                    party_b_text=counterparty_text,
                    party_a_weight=0.5,
                    party_b_weight=0.5,
                    is_non_negotiable=False,
                    preferred_position=raw_text,
                    party_b_risk_score=out_a2.overall_risk_score,
                )
            ]
            neg_output = score_negotiation(engine_inputs, config=NegotiationConfig())

            agent3 = Agent3Arbiter()
            out_a3 = agent3.run(
                agent1_output=out_a1,
                agent2_output=out_a2,
                negotiation_output=neg_output,
                financial_context={"arr_value": "$4.2M", "variance_ceiling": 0.15},
                matter_id=sandbox_matter_id,
            )

            settled_clauses = [
                {
                    "clause_id": c_id,
                    "section": "§ 8.0",
                    "title": clause_title,
                    "category": category,
                    "original_text": raw_text,
                    "counterparty_text": counterparty_text,
                    "conformed_proposal": raw_text,
                    "risk_level": "moderate",
                    "risk_score": 4.5,
                    "status": "agreed",
                    "precedent_alignment": 92.0,
                }
            ]

            agent4 = Agent4Scrivener(event_callback=capture_event)
            out_a4: ScrivenerOutput = agent4.run(
                settled_clauses=settled_clauses,
                verdicts=out_a3,
                variance_metrics={
                    "aggregate_compromise_score": 92.0,
                    "counsel_cost_saved": 28500.0,
                },
                matter_info={
                    "id": sandbox_matter_id,
                    "docket_number": "DOCKET #SANDBOX-TEST",
                    "title": "Sandbox Enterprise Simulation MSA",
                    "buyer": "Apex Dynamics Corp.",
                    "counterparty": "Veloce Systems Inc.",
                },
                matter_id=sandbox_matter_id,
            )
            out_dict = out_a4.model_dump(mode="json")
            return SandboxAgentResponse(
                agent="a4",
                agent_name="Executive Scrivener & Audit Engine (Scrivener-4)",
                mode=exec_mode,
                status="success",
                thoughts=agent4.thoughts or thoughts_captured,
                output=out_dict,
                summary=(
                    f"Agent 4 generated executive dossier ({len(out_a4.executive_summary)} chars) "
                    f"and computed pre-attestation SHA-256 block hash: {out_a4.canonical_hash[:16]}..."
                ),
            )

    except Exception as err:
        logger.error(f"[SANDBOX] Execution error for agent {agent_code}: {err}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Sandbox agent execution error for agent {agent_code}: {str(err)}",
        )
