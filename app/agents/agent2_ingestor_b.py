import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from app.agents.base_agent import BaseAgent, EventCallback
from app.config import settings

logger = logging.getLogger(__name__)


# ── Risk Category Constants ──────────────────────────────────────────────────
CATEGORY_LIABILITY = "liability"
CATEGORY_INDEMNIFICATION = "indemnification"
CATEGORY_PAYMENT = "payment"
CATEGORY_VENUE_JURISDICTION = "venue_jurisdiction"
CATEGORY_IP = "ip"
CATEGORY_TERMINATION = "termination"
CATEGORY_AGGRESSIVE_DEVIATION = "aggressive_deviation"
CATEGORY_GENERAL = "general"

ALL_RISK_CATEGORIES = [
    CATEGORY_LIABILITY,
    CATEGORY_INDEMNIFICATION,
    CATEGORY_PAYMENT,
    CATEGORY_VENUE_JURISDICTION,
    CATEGORY_IP,
    CATEGORY_TERMINATION,
    CATEGORY_AGGRESSIVE_DEVIATION,
]


# ── Pydantic Output Models ──────────────────────────────────────────────────

class RiskFinding(BaseModel):
    """An individual risk finding tied to a specific clause."""
    clause_id: str
    category: str  # One of ALL_RISK_CATEGORIES
    severity: str  # low | moderate | high | critical
    title: str
    description: str
    party_a_position: str = ""
    party_b_position: str = ""
    deterministic_flags: List[str] = Field(default_factory=list)
    llm_analysis: str = ""
    risk_score: float = Field(default=0.0, ge=0.0, le=10.0)


class ClauseRiskProfile(BaseModel):
    """Aggregated risk profile for a single clause."""
    clause_id: str
    section_number: str = ""
    title: str = ""
    category: str = CATEGORY_GENERAL
    findings: List[RiskFinding] = Field(default_factory=list)
    composite_risk_score: float = Field(default=0.0, ge=0.0, le=10.0)
    is_aggressive_deviation: bool = False
    deviation_summary: str = ""


class LexIngestorBOutput(BaseModel):
    """Structured output of Agent 2: Lex-Ingestor B."""
    matter_id: Optional[str] = None
    clause_risk_profiles: List[ClauseRiskProfile] = Field(default_factory=list)
    liability_findings: List[RiskFinding] = Field(default_factory=list)
    indemnification_findings: List[RiskFinding] = Field(default_factory=list)
    payment_findings: List[RiskFinding] = Field(default_factory=list)
    venue_jurisdiction_findings: List[RiskFinding] = Field(default_factory=list)
    ip_findings: List[RiskFinding] = Field(default_factory=list)
    termination_findings: List[RiskFinding] = Field(default_factory=list)
    aggressive_deviations: List[RiskFinding] = Field(default_factory=list)
    overall_risk_score: float = Field(default=0.0, ge=0.0, le=10.0)
    risk_summary: str = ""
    total_findings: int = 0
    high_risk_clause_ids: List[str] = Field(default_factory=list)


# ── Deterministic Keyword Dictionaries ───────────────────────────────────────

_LIABILITY_KEYWORDS = [
    "unlimited liability", "sole liability", "exclusively liable",
    "all damages", "consequential", "indirect damage", "punitive",
    "waive", "waiver of liability", "no cap", "uncapped",
    "remove cap", "remove limitation", "delete limitation",
    "full liability", "jointly and severally",
]

_INDEMNIFICATION_KEYWORDS = [
    "indemnif", "hold harmless", "defend and indemnify",
    "sole indemnification", "unlimited indemnification",
    "first-party claim", "third-party claim",
    "gross negligence", "willful misconduct",
    "survival period", "indemnity cap", "indemnity obligation",
    "broadened indemnification", "expanded indemnity",
]

_PAYMENT_KEYWORDS = [
    "net 15", "net 10", "net 7", "immediate payment", "upon receipt",
    "penalty", "late fee", "interest rate", "acceleration",
    "price increase", "annual escalat", "auto-renew",
    "most favored", "mfn", "prepaid", "advance payment",
    "reduced payment", "shortened payment",
]

_VENUE_KEYWORDS = [
    "exclusive jurisdiction", "exclusive venue",
    "arbitration", "binding arbitration", "mandatory arbitration",
    "governing law", "choice of law", "forum selection",
    "waive jury", "jury trial waiver",
]

_IP_KEYWORDS = [
    "assign", "assignment of ip", "work for hire", "work-for-hire",
    "joint ownership", "sole ownership", "ip transfer",
    "background ip", "foreground ip", "derivative work",
    "license-back", "license back", "perpetual license",
    "irrevocable", "royalty-free",
]

_TERMINATION_KEYWORDS = [
    "terminat", "immediate termination", "termination for convenience",
    "termination without cause", "shortened notice",
    "automatic termination", "unilateral terminat",
    "cure period", "no cure", "waive cure",
    "survival", "post-termination",
]

# Patterns that signal aggressive deviation regardless of category
_AGGRESSION_PATTERNS = [
    r"delete[ds]?\s+(entire|all|section|clause)",
    r"strik(?:e|ing)\s+through",
    r"remov(?:e[ds]?|ing)\s+(all|entire|limitation|cap|protection)",
    r"replac(?:e[ds]?|ing)\s+(entire|all)",
    r"unlimited",
    r"uncapped",
    r"sole\s+(?:discretion|option|liability|responsibility)",
    r"notwithstanding\s+anything\s+to\s+the\s+contrary",
    r"irrevocabl[ey]",
    r"perpetual(?:ly)?",
    r"waive[ds]?\s+(?:all|any|every)",
]


def _severity_from_score(score: float) -> str:
    """Map a numeric risk score to a severity label."""
    if score >= 8.0:
        return "critical"
    elif score >= 6.0:
        return "high"
    elif score >= 3.5:
        return "moderate"
    return "low"


def _keyword_hit_score(text: str, keywords: List[str]) -> Tuple[float, List[str]]:
    """
    Score text against a keyword list.
    Returns (score_contribution, list_of_matched_keywords).
    Each keyword hit contributes 1.5 up to a cap of 7.0.
    """
    text_lower = text.lower()
    hits = [kw for kw in keywords if kw in text_lower]
    raw = len(hits) * 1.5
    return min(raw, 7.0), hits


def _aggression_score(text: str) -> Tuple[float, List[str]]:
    """
    Score text against aggressive-deviation regex patterns.
    Each pattern hit contributes 2.0 up to a cap of 8.0.
    """
    text_lower = text.lower()
    hits: List[str] = []
    for pattern in _AGGRESSION_PATTERNS:
        if re.search(pattern, text_lower):
            hits.append(pattern)
    raw = len(hits) * 2.0
    return min(raw, 8.0), hits


def _diff_magnitude_score(insertions: List[str], deletions: List[str]) -> float:
    """
    Score based on raw volume of textual change.
    Heavy deletion = higher risk; heavy insertion = moderate risk.
    """
    del_chars = sum(len(d) for d in deletions)
    ins_chars = sum(len(i) for i in insertions)
    total_change = del_chars + ins_chars
    # Deletions are weighted 1.5x because removing protections is riskier
    weighted = (del_chars * 1.5 + ins_chars) / max(total_change, 1)
    if total_change > 500:
        return min(weighted * 3.0, 5.0)
    elif total_change > 200:
        return min(weighted * 2.0, 3.5)
    elif total_change > 50:
        return min(weighted * 1.0, 2.0)
    return 0.5


def _classify_diff_category(title: str, text: str) -> str:
    """Classify a clause diff into a risk category based on title and text keywords."""
    combined = (title + " " + text).lower()

    if any(k in combined for k in ["indemn", "hold harmless"]):
        return CATEGORY_INDEMNIFICATION
    if any(k in combined for k in ["liabilit", "damage", "cap", "limitation of"]):
        return CATEGORY_LIABILITY
    if any(k in combined for k in ["payment", "fee", "invoic", "billing", "arr", "price"]):
        return CATEGORY_PAYMENT
    if any(k in combined for k in ["venue", "jurisdict", "governing law", "arbitrat", "forum", "jury"]):
        return CATEGORY_VENUE_JURISDICTION
    if any(k in combined for k in ["intellect", "patent", "copyright", "ip ", "ownership", "work for hire"]):
        return CATEGORY_IP
    if any(k in combined for k in ["terminat", "expir", "cancell", "notice period", "cure period"]):
        return CATEGORY_TERMINATION
    return CATEGORY_GENERAL


# ── Agent Implementation ─────────────────────────────────────────────────────

class Agent2LexIngestorB(BaseAgent):
    """
    Agent 2: Lex-Ingestor B — Seller Redline Auditor.

    Role: Comparative risk analyst for Party B's markup against Party A's baseline.

    Responsibilities:
    - Analyze semantic changes between Party A and Party B clauses
    - Identify aggressive deviations from baseline
    - Classify and score liability, indemnification, payment,
      venue/jurisdiction, and IP/termination changes
    - Assign a composite risk score (0–10) combining deterministic
      heuristic flags with LLM semantic analysis
    - Provide deterministic fallback when no LLM API key is available

    Every finding references a clause_id for full traceability.
    """

    def __init__(self, event_callback: Optional[EventCallback] = None):
        super().__init__(
            agent_id="a2",
            name="Seller Redline Auditor",
            technical_name="Lex-Ingestor B",
            event_callback=event_callback,
        )

    def _execute(
        self,
        party_a_clauses: Optional[List[Dict[str, Any]]] = None,
        party_b_clauses: Optional[List[Dict[str, Any]]] = None,
        diffs: Optional[List[Dict[str, Any]]] = None,
        matter_id: Optional[str] = None,
        **kwargs: Any,
    ) -> LexIngestorBOutput:
        self.emit_event(
            thought="Ingesting Party B redline markup for comparative risk analysis...",
            matter_id=matter_id,
        )

        # ── Validate inputs ──────────────────────────────────────────────
        if not diffs:
            raise ValueError(
                "Agent 2 requires deterministic diffs (party_a vs party_b clause diffs)."
            )
        if not party_a_clauses:
            party_a_clauses = []
        if not party_b_clauses:
            party_b_clauses = []

        # Build lookup maps keyed by clause_id for fast cross-referencing
        a_map: Dict[str, Dict[str, Any]] = {
            c.get("clause_id", ""): c for c in party_a_clauses if c.get("clause_id")
        }
        b_map: Dict[str, Dict[str, Any]] = {
            c.get("clause_id", ""): c for c in party_b_clauses if c.get("clause_id")
        }

        self.emit_event(
            thought=(
                f"Cross-referencing {len(diffs)} diffs against "
                f"{len(a_map)} Party A and {len(b_map)} Party B clauses..."
            ),
            matter_id=matter_id,
        )

        # ── Attempt LLM-enhanced analysis ────────────────────────────────
        if settings.GEMINI_API_KEY:
            try:
                self.emit_event(
                    thought="Invoking Google Gemini for semantic deviation analysis...",
                    matter_id=matter_id,
                )
                return self._analyze_with_gemini(
                    party_a_clauses, party_b_clauses, diffs, a_map, b_map, matter_id,
                )
            except Exception as err:
                logger.warning(
                    f"Gemini API call failed, falling back to deterministic: {err}"
                )
        elif settings.OPENAI_API_KEY:
            try:
                self.emit_event(
                    thought="Invoking OpenAI for semantic deviation analysis...",
                    matter_id=matter_id,
                )
                return self._analyze_with_openai(
                    party_a_clauses, party_b_clauses, diffs, a_map, b_map, matter_id,
                )
            except Exception as err:
                logger.warning(
                    f"OpenAI API call failed, falling back to deterministic: {err}"
                )

        # ── Deterministic Fallback ───────────────────────────────────────
        self.emit_event(
            thought="Executing deterministic redline risk analysis pipeline...",
            matter_id=matter_id,
        )
        return self._deterministic_analysis(diffs, a_map, b_map, matter_id)

    # ═════════════════════════════════════════════════════════════════════════
    # Deterministic Analysis Pipeline
    # ═════════════════════════════════════════════════════════════════════════

    def _deterministic_analysis(
        self,
        diffs: List[Dict[str, Any]],
        a_map: Dict[str, Dict[str, Any]],
        b_map: Dict[str, Dict[str, Any]],
        matter_id: Optional[str],
    ) -> LexIngestorBOutput:
        all_findings: List[RiskFinding] = []
        clause_profiles: List[ClauseRiskProfile] = []
        risk_scores: List[float] = []

        for diff in diffs:
            c_id = diff.get("clause_id", "clause_unknown")
            section = diff.get("section", "")
            baseline = diff.get("baseline_text", "")
            markup = diff.get("markup_text", "")
            insertions = diff.get("insertions", [])
            deletions = diff.get("deletions", [])
            title = diff.get("title", "") or section

            # Resolve title from party maps if not on diff itself
            if not title:
                a_clause = a_map.get(c_id, {})
                title = a_clause.get("title", section)

            combined_text = f"{baseline} {markup} {' '.join(insertions)} {' '.join(deletions)}"

            # ── Classify the clause category ─────────────────────────────
            category = _classify_diff_category(title, combined_text)

            # ── Score deterministic risk flags ───────────────────────────
            clause_findings: List[RiskFinding] = []

            # 1. Category-specific keyword analysis
            keyword_map = {
                CATEGORY_LIABILITY: _LIABILITY_KEYWORDS,
                CATEGORY_INDEMNIFICATION: _INDEMNIFICATION_KEYWORDS,
                CATEGORY_PAYMENT: _PAYMENT_KEYWORDS,
                CATEGORY_VENUE_JURISDICTION: _VENUE_KEYWORDS,
                CATEGORY_IP: _IP_KEYWORDS,
                CATEGORY_TERMINATION: _TERMINATION_KEYWORDS,
            }

            # Run primary category keywords
            if category in keyword_map:
                kw_score, kw_hits = _keyword_hit_score(combined_text, keyword_map[category])
                if kw_hits:
                    finding = RiskFinding(
                        clause_id=c_id,
                        category=category,
                        severity=_severity_from_score(kw_score),
                        title=f"{category.replace('_', ' ').title()} Risk in {title or section}",
                        description=(
                            f"Detected {len(kw_hits)} risk keyword(s) in Party B markup: "
                            f"{', '.join(kw_hits[:5])}."
                        ),
                        party_a_position=baseline[:200] if baseline else "",
                        party_b_position=markup[:200] if markup else "",
                        deterministic_flags=kw_hits,
                        risk_score=kw_score,
                    )
                    clause_findings.append(finding)

            # 2. Cross-category scan (catch risks outside primary category)
            for cat, keywords in keyword_map.items():
                if cat == category:
                    continue  # Already scanned above
                cross_score, cross_hits = _keyword_hit_score(combined_text, keywords)
                if cross_hits:
                    finding = RiskFinding(
                        clause_id=c_id,
                        category=cat,
                        severity=_severity_from_score(cross_score * 0.8),
                        title=f"Cross-category {cat.replace('_', ' ').title()} Risk in {title or section}",
                        description=(
                            f"Secondary risk: {len(cross_hits)} {cat} keyword(s) found in a "
                            f"{category} clause: {', '.join(cross_hits[:3])}."
                        ),
                        party_a_position=baseline[:200] if baseline else "",
                        party_b_position=markup[:200] if markup else "",
                        deterministic_flags=cross_hits,
                        risk_score=round(cross_score * 0.8, 2),
                    )
                    clause_findings.append(finding)

            # 3. Aggressive deviation patterns
            agg_score, agg_hits = _aggression_score(combined_text)
            is_aggressive = agg_score >= 2.0
            if agg_hits:
                finding = RiskFinding(
                    clause_id=c_id,
                    category=CATEGORY_AGGRESSIVE_DEVIATION,
                    severity=_severity_from_score(agg_score),
                    title=f"Aggressive Deviation in {title or section}",
                    description=(
                        f"Detected {len(agg_hits)} aggressive language pattern(s) "
                        f"indicating substantial departure from baseline terms."
                    ),
                    party_a_position=baseline[:200] if baseline else "",
                    party_b_position=markup[:200] if markup else "",
                    deterministic_flags=[p[:50] for p in agg_hits],
                    risk_score=agg_score,
                )
                clause_findings.append(finding)

            # 4. Diff magnitude scoring
            diff_score = _diff_magnitude_score(insertions, deletions)

            # ── Composite clause risk score ──────────────────────────────
            # Weighted combination: max finding score (60%) + diff magnitude (25%) + aggression (15%)
            finding_scores = [f.risk_score for f in clause_findings] if clause_findings else [0.0]
            max_finding = max(finding_scores)
            composite = round(
                min(
                    max_finding * 0.60 + diff_score * 0.25 + agg_score * 0.15,
                    10.0,
                ),
                2,
            )

            # If no keyword findings but there are actual diffs, assign a baseline score
            if not clause_findings and (insertions or deletions):
                composite = round(min(diff_score, 3.0), 2)
                clause_findings.append(
                    RiskFinding(
                        clause_id=c_id,
                        category=category if category != CATEGORY_GENERAL else "general",
                        severity=_severity_from_score(composite),
                        title=f"Textual Modification in {title or section}",
                        description=(
                            f"Party B modified this clause with {len(insertions)} insertion(s) "
                            f"and {len(deletions)} deletion(s). No high-risk keywords detected."
                        ),
                        party_a_position=baseline[:200] if baseline else "",
                        party_b_position=markup[:200] if markup else "",
                        deterministic_flags=[],
                        risk_score=composite,
                    )
                )

            deviation_summary = ""
            if is_aggressive:
                deviation_summary = (
                    f"Aggressive deviation detected: {len(agg_hits)} pattern(s) matched. "
                    f"Composite risk score: {composite}/10."
                )

            profile = ClauseRiskProfile(
                clause_id=c_id,
                section_number=section,
                title=title,
                category=category,
                findings=clause_findings,
                composite_risk_score=composite,
                is_aggressive_deviation=is_aggressive,
                deviation_summary=deviation_summary,
            )
            clause_profiles.append(profile)
            all_findings.extend(clause_findings)
            risk_scores.append(composite)

        # ── Bucket findings by category ──────────────────────────────────
        liability = [f for f in all_findings if f.category == CATEGORY_LIABILITY]
        indemnification = [f for f in all_findings if f.category == CATEGORY_INDEMNIFICATION]
        payment = [f for f in all_findings if f.category == CATEGORY_PAYMENT]
        venue = [f for f in all_findings if f.category == CATEGORY_VENUE_JURISDICTION]
        ip_f = [f for f in all_findings if f.category == CATEGORY_IP]
        termination = [f for f in all_findings if f.category == CATEGORY_TERMINATION]
        aggressive = [f for f in all_findings if f.category == CATEGORY_AGGRESSIVE_DEVIATION]

        # ── Overall risk score: weighted avg biased toward worst clauses ─
        if risk_scores:
            sorted_scores = sorted(risk_scores, reverse=True)
            # Top 30% of clauses carry 70% weight
            top_n = max(1, len(sorted_scores) // 3)
            top_avg = sum(sorted_scores[:top_n]) / top_n
            full_avg = sum(sorted_scores) / len(sorted_scores)
            overall = round(min(top_avg * 0.70 + full_avg * 0.30, 10.0), 2)
        else:
            overall = 0.0

        high_risk_ids = [
            p.clause_id for p in clause_profiles if p.composite_risk_score >= 6.0
        ]

        risk_summary = (
            f"Analyzed {len(diffs)} clause diffs. "
            f"Found {len(all_findings)} risk finding(s) across {len(clause_profiles)} clauses. "
            f"{len(high_risk_ids)} clause(s) flagged as high-risk (score ≥ 6.0). "
            f"Overall risk score: {overall}/10."
        )

        self.emit_event(
            thought=risk_summary,
            matter_id=matter_id,
        )

        return LexIngestorBOutput(
            matter_id=matter_id,
            clause_risk_profiles=clause_profiles,
            liability_findings=liability,
            indemnification_findings=indemnification,
            payment_findings=payment,
            venue_jurisdiction_findings=venue,
            ip_findings=ip_f,
            termination_findings=termination,
            aggressive_deviations=aggressive,
            overall_risk_score=overall,
            risk_summary=risk_summary,
            total_findings=len(all_findings),
            high_risk_clause_ids=high_risk_ids,
        )

    # ═════════════════════════════════════════════════════════════════════════
    # LLM-Enhanced Analysis: Gemini
    # ═════════════════════════════════════════════════════════════════════════

    def _analyze_with_gemini(
        self,
        party_a_clauses: List[Dict[str, Any]],
        party_b_clauses: List[Dict[str, Any]],
        diffs: List[Dict[str, Any]],
        a_map: Dict[str, Dict[str, Any]],
        b_map: Dict[str, Dict[str, Any]],
        matter_id: Optional[str],
    ) -> LexIngestorBOutput:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")

        # First, run deterministic analysis to get baseline scores
        deterministic_result = self._deterministic_analysis(diffs, a_map, b_map, matter_id)

        # Ask LLM to enrich findings with semantic analysis
        prompt = self._build_llm_prompt(party_a_clauses, party_b_clauses, diffs)

        response = model.generate_content(prompt)
        raw_text = response.text

        return self._merge_llm_with_deterministic(
            raw_text, deterministic_result, matter_id,
        )

    # ═════════════════════════════════════════════════════════════════════════
    # LLM-Enhanced Analysis: OpenAI
    # ═════════════════════════════════════════════════════════════════════════

    def _analyze_with_openai(
        self,
        party_a_clauses: List[Dict[str, Any]],
        party_b_clauses: List[Dict[str, Any]],
        diffs: List[Dict[str, Any]],
        a_map: Dict[str, Dict[str, Any]],
        b_map: Dict[str, Dict[str, Any]],
        matter_id: Optional[str],
    ) -> LexIngestorBOutput:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        # First, run deterministic analysis to get baseline scores
        deterministic_result = self._deterministic_analysis(diffs, a_map, b_map, matter_id)

        # Ask LLM to enrich findings with semantic analysis
        prompt = self._build_llm_prompt(party_a_clauses, party_b_clauses, diffs)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        raw_text = response.choices[0].message.content or "{}"

        return self._merge_llm_with_deterministic(
            raw_text, deterministic_result, matter_id,
        )

    # ═════════════════════════════════════════════════════════════════════════
    # LLM Prompt & Merge Helpers
    # ═════════════════════════════════════════════════════════════════════════

    def _build_llm_prompt(
        self,
        party_a_clauses: List[Dict[str, Any]],
        party_b_clauses: List[Dict[str, Any]],
        diffs: List[Dict[str, Any]],
    ) -> str:
        return f"""
You are Agent 2 (Lex-Ingestor B), the Seller Redline Auditor.

You are given:
1. Party A baseline clauses
2. Party B redline clauses
3. Deterministic diffs between them

For EACH diff, analyze the semantic impact and output ONLY valid JSON matching this schema:
{{
  "clause_analyses": [
    {{
      "clause_id": "string (MUST match a clause_id from the diffs)",
      "semantic_summary": "string (what changed semantically, not textually)",
      "risk_categories_detected": ["liability"|"indemnification"|"payment"|"venue_jurisdiction"|"ip"|"termination"|"aggressive_deviation"],
      "aggressive_deviation": boolean,
      "aggressive_reasoning": "string (why this is or isn't an aggressive deviation)",
      "liability_impact": "string (how liability allocation changed, empty if N/A)",
      "indemnification_impact": "string (how indemnification scope changed, empty if N/A)",
      "payment_impact": "string (how payment terms changed, empty if N/A)",
      "venue_jurisdiction_impact": "string (how venue/jurisdiction changed, empty if N/A)",
      "ip_impact": "string (how IP ownership/licensing changed, empty if N/A)",
      "termination_impact": "string (how termination rights changed, empty if N/A)",
      "llm_risk_score": float (0.0 to 10.0, your semantic risk assessment)
    }}
  ],
  "overall_semantic_risk": float (0.0 to 10.0),
  "executive_summary": "string (2-3 sentence high-level risk summary)"
}}

Rules:
- DO NOT invent clause_ids. Use ONLY clause_ids from the diffs below.
- Focus on SEMANTIC meaning, not just textual differences.
- Score aggressive deviations higher (7-10).
- Score minor formatting or clarification changes lower (0-2).

PARTY A CLAUSES:
{json.dumps(party_a_clauses[:30], indent=2)}

PARTY B CLAUSES:
{json.dumps(party_b_clauses[:30], indent=2)}

DIFFS:
{json.dumps(diffs[:30], indent=2)}
"""

    def _merge_llm_with_deterministic(
        self,
        llm_raw_text: str,
        deterministic_result: LexIngestorBOutput,
        matter_id: Optional[str],
    ) -> LexIngestorBOutput:
        """
        Merge LLM semantic analysis into deterministic findings.
        Final risk score = 0.55 * deterministic + 0.45 * LLM semantic score.
        """
        llm_data = self.parse_structured_output(llm_raw_text)

        clause_analyses: Dict[str, Dict[str, Any]] = {}
        if isinstance(llm_data, dict):
            for analysis in llm_data.get("clause_analyses", []):
                cid = analysis.get("clause_id", "")
                if cid:
                    clause_analyses[cid] = analysis

        # Enrich each clause profile with LLM analysis
        for profile in deterministic_result.clause_risk_profiles:
            llm_analysis = clause_analyses.get(profile.clause_id)
            if not llm_analysis:
                continue

            llm_score = float(llm_analysis.get("llm_risk_score", 0.0))
            llm_score = max(0.0, min(llm_score, 10.0))

            # Merge scores: 55% deterministic, 45% LLM
            merged_score = round(
                profile.composite_risk_score * 0.55 + llm_score * 0.45,
                2,
            )
            profile.composite_risk_score = min(merged_score, 10.0)

            # Update aggression flags if LLM detects it
            if llm_analysis.get("aggressive_deviation", False):
                profile.is_aggressive_deviation = True
                profile.deviation_summary = (
                    llm_analysis.get("aggressive_reasoning", profile.deviation_summary)
                )

            # Enrich individual findings with LLM context
            semantic_summary = llm_analysis.get("semantic_summary", "")
            for finding in profile.findings:
                finding.llm_analysis = semantic_summary
                # Blend finding-level scores too
                finding.risk_score = round(
                    finding.risk_score * 0.55 + llm_score * 0.45,
                    2,
                )
                finding.severity = _severity_from_score(finding.risk_score)

        # Recalculate overall score with LLM enrichment
        all_scores = [p.composite_risk_score for p in deterministic_result.clause_risk_profiles]
        if all_scores:
            sorted_scores = sorted(all_scores, reverse=True)
            top_n = max(1, len(sorted_scores) // 3)
            top_avg = sum(sorted_scores[:top_n]) / top_n
            full_avg = sum(sorted_scores) / len(sorted_scores)

            llm_overall = float(llm_data.get("overall_semantic_risk", 0.0)) if isinstance(llm_data, dict) else 0.0
            det_overall = top_avg * 0.70 + full_avg * 0.30
            # Blend overall: 55% deterministic, 45% LLM
            deterministic_result.overall_risk_score = round(
                min(det_overall * 0.55 + llm_overall * 0.45, 10.0), 2,
            )

        # Update high-risk IDs and summary
        deterministic_result.high_risk_clause_ids = [
            p.clause_id
            for p in deterministic_result.clause_risk_profiles
            if p.composite_risk_score >= 6.0
        ]

        # Re-bucket findings (scores may have changed)
        all_findings = []
        for p in deterministic_result.clause_risk_profiles:
            all_findings.extend(p.findings)

        deterministic_result.liability_findings = [
            f for f in all_findings if f.category == CATEGORY_LIABILITY
        ]
        deterministic_result.indemnification_findings = [
            f for f in all_findings if f.category == CATEGORY_INDEMNIFICATION
        ]
        deterministic_result.payment_findings = [
            f for f in all_findings if f.category == CATEGORY_PAYMENT
        ]
        deterministic_result.venue_jurisdiction_findings = [
            f for f in all_findings if f.category == CATEGORY_VENUE_JURISDICTION
        ]
        deterministic_result.ip_findings = [
            f for f in all_findings if f.category == CATEGORY_IP
        ]
        deterministic_result.termination_findings = [
            f for f in all_findings if f.category == CATEGORY_TERMINATION
        ]
        deterministic_result.aggressive_deviations = [
            f for f in all_findings if f.category == CATEGORY_AGGRESSIVE_DEVIATION
        ]
        deterministic_result.total_findings = len(all_findings)

        exec_summary = ""
        if isinstance(llm_data, dict):
            exec_summary = llm_data.get("executive_summary", "")

        deterministic_result.risk_summary = (
            f"{exec_summary} " if exec_summary else ""
        ) + (
            f"Analyzed {len(deterministic_result.clause_risk_profiles)} clauses with LLM enrichment. "
            f"{len(deterministic_result.high_risk_clause_ids)} high-risk clause(s). "
            f"Overall risk: {deterministic_result.overall_risk_score}/10."
        )

        deterministic_result.matter_id = matter_id

        self.emit_event(
            thought=deterministic_result.risk_summary,
            matter_id=matter_id,
        )

        return deterministic_result
