import difflib
import logging
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
                    "arr_value": 4200000.0,
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
                financial_context={"arr_value": 4200000.0, "variance_ceiling": 0.15},
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
