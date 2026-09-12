"""
Negotiation Controller — Multi-Round Termination & Checkpoint System.

Enforces strict termination bounds and compact state checkpoints for Buyer and Seller AI agents:
1. Reaches AGREE when all clauses reach consensus.
2. Hard limits: Max 6 rounds OR Max 90 seconds (whichever first).
3. Deadlock/Stalemate guard: Stops with DISAGREE if no progress for 2 consecutive rounds.
4. Token budget guard: Halts safely before context/token exhaustion without relying on API errors.
5. Compact state serialization: Saves compact checkpoints after every round.
6. Resumes from the last checkpoint without restarting from Round 1.
"""

from __future__ import annotations

from datetime import datetime
import difflib
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple
import uuid

from sqlalchemy.orm import Session

from app.db.models import MatterDB, NegotiationCheckpointDB, ContractClauseDB
from app.models.checkpoint import (
    AgreedClause,
    Concession,
    NegotiationCheckpoint,
    NegotiationStatus,
    TerminationReason,
    UnresolvedClause,
)

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════════════
# Controller Constraints
# ═════════════════════════════════════════════════════════════════════════════

MAX_ROUNDS: int = 6
MAX_TIME_SECONDS: float = 90.0
MAX_TOKEN_BUDGET: int = 12000  # Safe compact context threshold
STALEMATE_CONSECUTIVE_ROUNDS: int = 2


def estimate_tokens(data: Any) -> int:
    """Fast, lightweight token estimate (~4 chars per token for JSON payload)."""
    try:
        s = json.dumps(data, default=str)
        return max(1, len(s) // 4)
    except Exception:
        return 500


class NegotiationController:
    """
    Stateful controller governing bilateral negotiation rounds between
    Buyer (Agent 1) and Seller (Agent 2), scored via Arbiter/Negotiation Engine.
    """

    def __init__(
        self,
        matter_id: str,
        start_time: Optional[float] = None,
        max_rounds: int = MAX_ROUNDS,
        max_time_seconds: float = MAX_TIME_SECONDS,
        max_token_budget: int = MAX_TOKEN_BUDGET,
    ):
        self.matter_id = matter_id
        self.start_time = start_time if start_time is not None else time.time()
        self.max_rounds = max_rounds
        self.max_time_seconds = max_time_seconds
        self.max_token_budget = max_token_budget
        self.consecutive_no_progress: int = 0
        self.total_tokens_accumulated: int = 0

    def get_elapsed_seconds(self) -> float:
        return round(time.time() - self.start_time, 2)

    # ═════════════════════════════════════════════════════════════════════════
    # Checkpoint Persistence & Loading
    # ═════════════════════════════════════════════════════════════════════════

    @staticmethod
    def load_latest_checkpoint(db: Session, matter_id: str) -> Optional[NegotiationCheckpoint]:
        """Load the most recent compact negotiation checkpoint for a matter."""
        row = (
            db.query(NegotiationCheckpointDB)
            .filter(NegotiationCheckpointDB.matter_id == matter_id)
            .order_by(NegotiationCheckpointDB.round_number.desc())
            .first()
        )
        if not row:
            return None

        return NegotiationCheckpoint(
            matter_id=row.matter_id,
            round_number=row.round_number,
            buyer_offer=row.buyer_offer or {},
            seller_offer=row.seller_offer or {},
            agreed_clauses=row.agreed_clauses or [],
            unresolved_clauses=row.unresolved_clauses or [],
            concessions_made=row.concessions_made or [],
            buyer_non_negotiables=row.buyer_non_negotiables or [],
            seller_non_negotiables=row.seller_non_negotiables or [],
            status=row.status,
            termination_reason=row.termination_reason,
            elapsed_seconds=row.elapsed_seconds,
            token_usage_estimate=row.token_usage_estimate,
            created_at=row.created_at,
        )

    def save_checkpoint(
        self,
        db: Session,
        checkpoint: NegotiationCheckpoint,
    ) -> NegotiationCheckpointDB:
        """Persist compact checkpoint to DB and update MatterDB round/status."""
        chk_id = f"chk_{self.matter_id}_r{checkpoint.round_number}_{uuid.uuid4().hex[:4]}"

        row = NegotiationCheckpointDB(
            id=chk_id,
            matter_id=self.matter_id,
            round_number=checkpoint.round_number,
            buyer_offer=checkpoint.buyer_offer,
            seller_offer=checkpoint.seller_offer,
            agreed_clauses=checkpoint.agreed_clauses,
            unresolved_clauses=checkpoint.unresolved_clauses,
            concessions_made=checkpoint.concessions_made,
            buyer_non_negotiables=checkpoint.buyer_non_negotiables,
            seller_non_negotiables=checkpoint.seller_non_negotiables,
            status=checkpoint.status,
            termination_reason=checkpoint.termination_reason,
            elapsed_seconds=checkpoint.elapsed_seconds,
            token_usage_estimate=checkpoint.token_usage_estimate,
            created_at=datetime.utcnow(),
        )
        db.add(row)

        # Synchronize with Matter record
        matter = db.query(MatterDB).filter(MatterDB.id == self.matter_id).first()
        if matter:
            matter.round = checkpoint.round_number
            if checkpoint.status == NegotiationStatus.AGREE.value:
                matter.stage = "Bilateral Agreement Ratified"
            elif checkpoint.status == NegotiationStatus.DISAGREE.value:
                matter.status = "disagree"
                matter.stage = "Negotiation Deadlock — Awaiting GC Direction"
            else:
                matter.stage = f"Round {checkpoint.round_number} Negotiation"

        db.commit()
        db.refresh(row)

        # Sync checkpoint to MongoDB Atlas collection 'checkpoints'
        try:
            from app.db.database import get_collection, COLLECTION_CHECKPOINTS
            coll = get_collection(COLLECTION_CHECKPOINTS)
            import asyncio
            chk_doc = {
                "id": chk_id,
                "matter_id": self.matter_id,
                "round_number": checkpoint.round_number,
                "buyer_offer": checkpoint.buyer_offer or {},
                "seller_offer": checkpoint.seller_offer or {},
                "agreed_clauses": checkpoint.agreed_clauses or [],
                "unresolved_clauses": checkpoint.unresolved_clauses or [],
                "concessions_made": checkpoint.concessions_made or [],
                "buyer_non_negotiables": checkpoint.buyer_non_negotiables or [],
                "seller_non_negotiables": checkpoint.seller_non_negotiables or [],
                "status": checkpoint.status,
                "termination_reason": checkpoint.termination_reason,
                "elapsed_seconds": checkpoint.elapsed_seconds,
                "token_usage_estimate": checkpoint.token_usage_estimate,
                "created_at": datetime.utcnow().isoformat(),
            }
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(coll.replace_one({"id": chk_id}, chk_doc, upsert=True))
            except RuntimeError:
                asyncio.run(coll.replace_one({"id": chk_id}, chk_doc, upsert=True))
        except Exception:
            pass

        logger.info(
            f"[CHECKPOINT] Saved Round {checkpoint.round_number} for matter {self.matter_id} | "
            f"Status: {checkpoint.status} | Agreed: {len(checkpoint.agreed_clauses)} | "
            f"Unresolved: {len(checkpoint.unresolved_clauses)}"
        )
        return row

    # ═════════════════════════════════════════════════════════════════════════
    # Round Evolution & Concession Engine
    # ═════════════════════════════════════════════════════════════════════════

    def step_round(
        self,
        current_round: int,
        previous_checkpoint: Optional[NegotiationCheckpoint],
        base_clauses: List[Dict[str, Any]],
        buyer_non_negotiables: List[str],
        seller_non_negotiables: List[str],
    ) -> NegotiationCheckpoint:
        """
        Execute a single negotiation round between Buyer and Seller.
        Consumes ONLY the compact state from previous_checkpoint or base_clauses.
        """
        elapsed = self.get_elapsed_seconds()

        # Initialize from previous checkpoint or fresh round
        agreed_clauses: List[Dict[str, Any]] = (
            list(previous_checkpoint.agreed_clauses) if previous_checkpoint else []
        )
        concessions_made: List[Dict[str, Any]] = (
            list(previous_checkpoint.concessions_made) if previous_checkpoint else []
        )
        buyer_offer: Dict[str, Any] = {}
        seller_offer: Dict[str, Any] = {}
        unresolved_clauses: List[Dict[str, Any]] = []

        # Determine which clauses are already settled
        agreed_ids = {c["clause_id"] for c in agreed_clauses}

        # Filter contested clauses from previous state or base
        clauses_to_negotiate: List[Dict[str, Any]] = []
        if previous_checkpoint and previous_checkpoint.unresolved_clauses:
            for u in previous_checkpoint.unresolved_clauses:
                matched_base = next((c for c in base_clauses if (c.get("clause_id") or c.get("id")) == u["clause_id"]), None)
                clauses_to_negotiate.append({
                    "clause_id": u["clause_id"],
                    "section": u["section"],
                    "title": u["title"],
                    "buyer_position": u["buyer_position"],
                    "seller_position": u["seller_position"],
                    "is_buyer_non_negotiable": u.get("is_buyer_non_negotiable", False),
                    "is_seller_non_negotiable": u.get("is_seller_non_negotiable", False),
                    "category": matched_base.get("category", "general") if matched_base else "general",
                })
        else:
            for i, c in enumerate(base_clauses):
                cid = c.get("clause_id") or c.get("id") or f"clause_{i+1}"
                if cid in agreed_ids:
                    continue
                sec = c.get("section", f"§ {i+1}.0")
                title = c.get("title", f"Clause {i+1}")
                orig = c.get("original_text", c.get("text", ""))
                counter = c.get("counterparty_text", orig)

                is_b_nn = any(nn.lower() in title.lower() or nn.lower() in sec.lower() for nn in buyer_non_negotiables)
                is_s_nn = any(nn.lower() in title.lower() or nn.lower() in sec.lower() for nn in seller_non_negotiables)

                clauses_to_negotiate.append({
                    "clause_id": cid,
                    "section": sec,
                    "title": title,
                    "buyer_position": orig,
                    "seller_position": counter,
                    "is_buyer_non_negotiable": is_b_nn,
                    "is_seller_non_negotiable": is_s_nn,
                    "category": c.get("category", "general"),
                })

        new_agreements_this_round = 0
        new_concessions_this_round = 0

        # Simulate bilateral round deliberation on remaining contested clauses
        for item in clauses_to_negotiate:
            cid = item["clause_id"]
            sec = item["section"]
            title = item["title"]
            b_pos = item["buyer_position"]
            s_pos = item["seller_position"]
            b_nn = item["is_buyer_non_negotiable"]
            s_nn = item["is_seller_non_negotiable"]

            # Quick similarity check
            matcher = difflib.SequenceMatcher(None, b_pos.strip(), s_pos.strip())
            similarity = matcher.ratio()

            # Rule A: Exact or near-identical text (>= 98% match) -> Immediate agreement
            if similarity >= 0.98 or b_pos.strip() == s_pos.strip():
                agreed_clauses.append({
                    "clause_id": cid,
                    "section": sec,
                    "title": title,
                    "agreed_text": b_pos.strip(),
                    "round_agreed": current_round,
                    "compromise_score": 100.0,
                    "rationale": "Full textual alignment achieved between baseline and redline.",
                })
                new_agreements_this_round += 1
                buyer_offer[cid] = b_pos
                seller_offer[cid] = s_pos
                continue

            # Check for bilateral Non-Negotiable Hard Conflict:
            # If BOTH Buyer and Seller mark the same clause non-negotiable and positions diverge,
            # neither party will concede, creating a true impasse.
            if b_nn and s_nn and similarity < 0.85:
                buyer_offer[cid] = b_pos
                seller_offer[cid] = s_pos
                unresolved_clauses.append({
                    "clause_id": cid,
                    "section": sec,
                    "title": title,
                    "buyer_position": b_pos,
                    "seller_position": s_pos,
                    "gap_summary": "Mutual Non-Negotiable Deadlock — both parties maintain immutable positions.",
                    "is_buyer_non_negotiable": True,
                    "is_seller_non_negotiable": True,
                    "compromise_score": 25.0,
                })
                continue

            # Party A (Buyer) Concession Logic
            # If not non-negotiable for Buyer, Buyer can make moderate concessions in later rounds
            buyer_current_pos = b_pos
            if not b_nn and current_round >= 2:
                # Progressive concession towards Pareto balance
                concession_desc = f"Buyer conceded commercial flexibility on {title} (Round {current_round})."
                concessions_made.append({
                    "round_number": current_round,
                    "party": "Buyer",
                    "clause_id": cid,
                    "section": sec,
                    "description": concession_desc,
                })
                new_concessions_this_round += 1
                # Move buyer position towards seller proposal
                buyer_current_pos = self._generate_compromise_text(b_pos, s_pos, bias=0.6)

            # Party B (Seller) Concession Logic
            # If not non-negotiable for Seller, Seller can concede on excessive markup
            seller_current_pos = s_pos
            if not s_nn and current_round >= 2:
                concession_desc = f"Seller moderated redline aggression on {title} (Round {current_round})."
                concessions_made.append({
                    "round_number": current_round,
                    "party": "Seller",
                    "clause_id": cid,
                    "section": sec,
                    "description": concession_desc,
                })
                new_concessions_this_round += 1
                seller_current_pos = self._generate_compromise_text(b_pos, s_pos, bias=0.4)

            buyer_offer[cid] = buyer_current_pos
            seller_offer[cid] = seller_current_pos

            # Evaluate if concessions bridged the gap in this round
            updated_matcher = difflib.SequenceMatcher(None, buyer_current_pos.strip(), seller_current_pos.strip())
            updated_sim = updated_matcher.ratio()

            # If converged (similarity high enough or round >= 3 with concessions)
            # and neither party is rigidly blocking:
            can_converge = (not b_nn or not s_nn) and (
                updated_sim >= 0.88 or (current_round >= 3 and (new_concessions_this_round > 0))
            )

            # If Buyer is non-negotiable, Seller must fully accept Buyer baseline to agree
            if b_nn and not s_nn:
                if current_round >= 3:
                    # Seller accepts Buyer's non-negotiable position
                    agreed_clauses.append({
                        "clause_id": cid,
                        "section": sec,
                        "title": title,
                        "agreed_text": b_pos,
                        "round_agreed": current_round,
                        "compromise_score": 90.0,
                        "rationale": f"Seller accepted Buyer non-negotiable requirement for {title}.",
                    })
                    new_agreements_this_round += 1
                    continue
                else:
                    unresolved_clauses.append({
                        "clause_id": cid,
                        "section": sec,
                        "title": title,
                        "buyer_position": b_pos,
                        "seller_position": seller_current_pos,
                        "gap_summary": f"Buyer holds firm on non-negotiable baseline. Seller reviewing concession.",
                        "is_buyer_non_negotiable": True,
                        "is_seller_non_negotiable": False,
                        "compromise_score": 50.0,
                    })
                    continue

            # If Seller is non-negotiable, Buyer can evaluate acceptance
            if s_nn and not b_nn:
                if current_round >= 3:
                    # Buyer accepts Seller's non-negotiable position
                    agreed_clauses.append({
                        "clause_id": cid,
                        "section": sec,
                        "title": title,
                        "agreed_text": s_pos,
                        "round_agreed": current_round,
                        "compromise_score": 90.0,
                        "rationale": f"Buyer accepted Seller commercial non-negotiable requirement for {title}.",
                    })
                    new_agreements_this_round += 1
                    continue
                else:
                    unresolved_clauses.append({
                        "clause_id": cid,
                        "section": sec,
                        "title": title,
                        "buyer_position": buyer_current_pos,
                        "seller_position": s_pos,
                        "gap_summary": f"Seller holds firm on non-negotiable markup. Buyer reviewing concession.",
                        "is_buyer_non_negotiable": False,
                        "is_seller_non_negotiable": True,
                        "compromise_score": 50.0,
                    })
                    continue

            # Mutual negotiable clause convergence
            if can_converge:
                consensus_text = self._generate_compromise_text(buyer_current_pos, seller_current_pos, bias=0.5)
                agreed_clauses.append({
                    "clause_id": cid,
                    "section": sec,
                    "title": title,
                    "agreed_text": consensus_text,
                    "round_agreed": current_round,
                    "compromise_score": round(updated_sim * 100, 1),
                    "rationale": f"Pareto-efficient compromise achieved on {title} after Round {current_round}.",
                })
                new_agreements_this_round += 1
            else:
                unresolved_clauses.append({
                    "clause_id": cid,
                    "section": sec,
                    "title": title,
                    "buyer_position": buyer_current_pos,
                    "seller_position": seller_current_pos,
                    "gap_summary": f"Positions diverge by {round((1.0 - updated_sim)*100)}%. Deliberation active.",
                    "is_buyer_non_negotiable": b_nn,
                    "is_seller_non_negotiable": s_nn,
                    "compromise_score": round(updated_sim * 100, 1),
                })

        # Calculate progress delta
        prev_unresolved_count = len(previous_checkpoint.unresolved_clauses) if previous_checkpoint else len(clauses_to_negotiate)
        curr_unresolved_count = len(unresolved_clauses)

        made_meaningful_progress = (
            curr_unresolved_count < prev_unresolved_count or
            new_agreements_this_round > 0 or
            new_concessions_this_round > 0
        )

        if not made_meaningful_progress:
            self.consecutive_no_progress += 1
        else:
            self.consecutive_no_progress = 0

        # Estimate compact context tokens
        compact_payload = {
            "round": current_round,
            "agreed": agreed_clauses,
            "unresolved": unresolved_clauses,
            "concessions": concessions_made[-4:],  # Only keep recent concessions to keep compact
        }
        tokens_round = estimate_tokens(compact_payload)
        self.total_tokens_accumulated += tokens_round

        # Build checkpoint before termination evaluation
        checkpoint = NegotiationCheckpoint(
            matter_id=self.matter_id,
            round_number=current_round,
            buyer_offer=buyer_offer,
            seller_offer=seller_offer,
            agreed_clauses=agreed_clauses,
            unresolved_clauses=unresolved_clauses,
            concessions_made=concessions_made,
            buyer_non_negotiables=buyer_non_negotiables,
            seller_non_negotiables=seller_non_negotiables,
            status=NegotiationStatus.NEGOTIATING.value,
            termination_reason=None,
            elapsed_seconds=elapsed,
            token_usage_estimate=tokens_round,
        )

        # ═════════════════════════════════════════════════════════════════════
        # TERMINATION RULES EVALUATION
        # ═════════════════════════════════════════════════════════════════════

        status, reason = self.evaluate_termination(
            round_number=current_round,
            unresolved_clauses_count=len(unresolved_clauses),
            elapsed_seconds=elapsed,
            consecutive_no_progress=self.consecutive_no_progress,
            token_usage=tokens_round,
        )

        checkpoint.status = status.value
        checkpoint.termination_reason = reason
        return checkpoint

    def evaluate_termination(
        self,
        round_number: int,
        unresolved_clauses_count: int,
        elapsed_seconds: float,
        consecutive_no_progress: int,
        token_usage: int,
    ) -> Tuple[NegotiationStatus, Optional[str]]:
        """
        Pure rule-based termination decision:
        1. All agreed -> AGREE
        2. No progress for 2 consecutive rounds -> DISAGREE (Stalemate)
        3. Round limit (6) reached -> DISAGREE
        4. Time limit (90s) reached -> DISAGREE
        5. Token budget exceeded -> DISAGREE (Safe Token Limit Guard)
        6. Otherwise -> NEGOTIATING
        """
        # RULE 1: Agreement
        if unresolved_clauses_count == 0:
            return NegotiationStatus.AGREE, TerminationReason.AGREEMENT_REACHED.value

        # RULE 3: Stalemate / No progress for 2 consecutive rounds
        if consecutive_no_progress >= STALEMATE_CONSECUTIVE_ROUNDS:
            return NegotiationStatus.DISAGREE, TerminationReason.STALEMATE.value

        # RULE 2A: Time limit (90s)
        if elapsed_seconds >= self.max_time_seconds:
            return NegotiationStatus.DISAGREE, TerminationReason.TIMEOUT.value

        # RULE 2B: Round limit (6 rounds)
        if round_number >= self.max_rounds:
            return NegotiationStatus.DISAGREE, TerminationReason.MAX_ROUNDS_REACHED.value

        # RULE 4: Safe token budget threshold guard
        if token_usage >= self.max_token_budget:
            return NegotiationStatus.DISAGREE, TerminationReason.TOKEN_BUDGET_GUARD.value

        return NegotiationStatus.NEGOTIATING, None

    # ═════════════════════════════════════════════════════════════════════════
    # Helper: Textual Midpoint Synthesis
    # ═════════════════════════════════════════════════════════════════════════

    def _generate_compromise_text(self, text_a: str, text_b: str, bias: float = 0.5) -> str:
        """
        Synthesize a deterministic balanced midpoint between baseline and redline.
        Does not call LLM; ensures 100% reliability, speed, and zero extra token cost.
        """
        words_a = text_a.split()
        words_b = text_b.split()

        matcher = difflib.SequenceMatcher(None, words_a, words_b)
        result_words: List[str] = []

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "equal":
                result_words.extend(words_a[i1:i2])
            elif tag in ("replace", "insert", "delete"):
                chunk_a = " ".join(words_a[i1:i2])
                chunk_b = " ".join(words_b[j1:j2])

                # Heuristic keyword balancing
                if "uncapped" in chunk_b.lower() or "unlimited" in chunk_b.lower():
                    result_words.append("capped at 2.0x annual contract value (mutual aggregate cap)")
                elif "net 30" in chunk_b.lower() and "net 60" in chunk_a.lower():
                    result_words.append("Net forty-five (45) days from invoice date")
                elif "delaware" in chunk_a.lower() and "california" in chunk_b.lower():
                    result_words.append("State of Delaware, with neutral AAA arbitration venue")
                elif bias > 0.5:
                    result_words.extend(words_a[i1:i2] or words_b[j1:j2])
                else:
                    result_words.extend(words_b[j1:j2] or words_a[i1:i2])

        return " ".join(result_words) if result_words else text_a
