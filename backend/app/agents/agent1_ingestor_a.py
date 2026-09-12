import json
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.agents.base_agent import BaseAgent, EventCallback
from app.config import settings
from app.parsers import extract_document, parse_clauses

logger = logging.getLogger(__name__)


class ClassifiedClause(BaseModel):
    clause_id: str
    section_number: str
    title: str
    category: str  # liability, payment, termination, ip, confidentiality, governing_law, general
    summary: str
    is_non_negotiable: bool = False
    preferred_position: str


class LexIngestorAOutput(BaseModel):
    matter_id: Optional[str] = None
    classified_clauses: List[ClassifiedClause] = Field(default_factory=list)
    obligations: List[Dict[str, str]] = Field(default_factory=list)
    liability_boundaries: List[Dict[str, str]] = Field(default_factory=list)
    payment_terms: List[Dict[str, str]] = Field(default_factory=list)
    termination_terms: List[Dict[str, str]] = Field(default_factory=list)
    non_negotiables: List[str] = Field(default_factory=list)
    preferred_positions: List[Dict[str, str]] = Field(default_factory=list)


class Agent1LexIngestorA(BaseAgent):
    """
    Agent 1: Lex-Ingestor A
    Role: Party A Forensic Document Parser & Baseline Contract Classifier.
    Responsibilities:
    - Classify clauses into functional categories
    - Identify obligations & preferred positions
    - Extract liability boundaries, payment terms, termination terms
    - Flag non-negotiable clauses
    """

    def __init__(self, event_callback: Optional[EventCallback] = None):
        super().__init__(
            agent_id="a1",
            name="Buyer Legal Analyst",
            technical_name="Lex-Ingestor A",
            event_callback=event_callback,
        )

    def _execute(
        self,
        file_path: Optional[str] = None,
        contract_text: Optional[str] = None,
        clauses: Optional[List[Dict[str, Any]]] = None,
        matter_id: Optional[str] = None,
        **kwargs: Any,
    ) -> LexIngestorAOutput:
        self.emit_event(
            thought="Ingesting Party A baseline contract document...",
            matter_id=matter_id,
        )

        # 1. Parse document or contract text if clauses not pre-provided
        if not clauses:
            if file_path:
                self.emit_event(
                    thought=f"Extracting normalized text from {file_path}...",
                    matter_id=matter_id,
                )
                doc = extract_document(file_path)
                clauses = parse_clauses(doc)
            elif contract_text:
                self.emit_event(
                    thought="Segmenting raw baseline contract text into clauses...",
                    matter_id=matter_id,
                )
                clauses = parse_clauses(contract_text)
            else:
                raise ValueError("Agent 1 requires file_path, contract_text, or clauses input.")

        self.emit_event(
            thought=f"AST parse complete — {len(clauses)} contract clause nodes extracted.",
            matter_id=matter_id,
        )

        # 2. Attempt LLM analysis if API key is configured
        if settings.GEMINI_API_KEY:
            try:
                self.emit_event(
                    thought="[Mode: LLM] Invoking Google Gemini LLM for forensic position mapping...",
                    matter_id=matter_id,
                )
                logger.info("[AGENT 1] Mode: LLM | Attempting semantic extraction via Gemini.")
                result = self._analyze_with_gemini(clauses, matter_id)
                validated = self._validate_and_reconcile_output(result, clauses, matter_id)
                logger.info("[AGENT 1] Mode: LLM | Successfully extracted positions via Gemini with deterministic validation.")
                return validated
            except Exception as err:
                logger.warning(f"[AGENT 1] Gemini API call failed: {err}. Falling back to deterministic extraction.")
        elif settings.OPENAI_API_KEY:
            try:
                self.emit_event(
                    thought="[Mode: LLM] Invoking OpenAI LLM for forensic position mapping...",
                    matter_id=matter_id,
                )
                logger.info("[AGENT 1] Mode: LLM | Attempting semantic extraction via OpenAI.")
                result = self._analyze_with_openai(clauses, matter_id)
                validated = self._validate_and_reconcile_output(result, clauses, matter_id)
                logger.info("[AGENT 1] Mode: LLM | Successfully extracted positions via OpenAI with deterministic validation.")
                return validated
            except Exception as err:
                logger.warning(f"[AGENT 1] OpenAI API call failed: {err}. Falling back to deterministic extraction.")

        # 3. Deterministic Fallback Parser
        logger.info("[AGENT 1] Mode: FALLBACK | Using deterministic extraction fallback.")
        self.emit_event(
            thought="[Mode: FALLBACK] Mapping Party A legal parameters using deterministic baseline classifier...",
            matter_id=matter_id,
        )
        return self._deterministic_analysis(clauses, matter_id)

    def _deterministic_analysis(
        self, clauses: List[Dict[str, Any]], matter_id: Optional[str]
    ) -> LexIngestorAOutput:
        classified: List[ClassifiedClause] = []
        obligations: List[Dict[str, str]] = []
        liability_boundaries: List[Dict[str, str]] = []
        payment_terms: List[Dict[str, str]] = []
        termination_terms: List[Dict[str, str]] = []
        non_negotiables: List[str] = []
        preferred_positions: List[Dict[str, str]] = []

        for c in clauses:
            c_id = c.get("clause_id", "clause_unknown")
            sec = c.get("section_number", "")
            title = c.get("title", "")
            text = c.get("text", "")
            text_lower = text.lower()
            title_lower = title.lower()

            category = "general"
            is_non_neg = False
            pref_pos = f"Standard Party A terms for {title or sec}"

            if any(k in title_lower or k in text_lower for k in ["liability", "indemn", "damage", "loss", "cap"]):
                category = "liability"
                is_non_neg = True if ("1x" in text_lower or "mutual" in text_lower or "cap" in text_lower) else False
                pref_pos = "Strict mutual liability cap equal to 1.0x ARR with waiver of consequential damages."
                liability_boundaries.append({
                    "clause_id": c_id,
                    "cap_description": f"Boundary [{sec}]: {title} - Mutual 1.0x ARR Liability Cap",
                })
            elif any(k in title_lower or k in text_lower for k in ["payment", "fee", "invoic", "net ", "arr", "billing"]):
                category = "payment"
                pref_pos = "Net 60 payment terms upon invoice receipt."
                payment_terms.append({
                    "clause_id": c_id,
                    "terms": f"Payment Terms [{sec}]: {title} - Firm Net 60 policy",
                })
            elif any(k in title_lower or k in text_lower for k in ["terminat", "expir", "cancell", "notice"]):
                category = "termination"
                pref_pos = "30 days written notice for cause; immediate termination for material breach."
                termination_terms.append({
                    "clause_id": c_id,
                    "notice_period": f"Termination [{sec}]: {title} - 30 days notice",
                })
            elif any(k in title_lower or k in text_lower for k in ["intellect", "patent", "copyright", "ownership", "ip"]):
                category = "ip"
                is_non_neg = True
                pref_pos = "Party A retains exclusive ownership of all pre-existing IP and platform improvements."
            elif any(k in title_lower or k in text_lower for k in ["confident", "nondisclos", "secret"]):
                category = "confidentiality"
                pref_pos = "Mutual 3-year confidentiality non-disclosure obligation."
            elif any(k in title_lower or k in text_lower for k in ["law", "venue", "jurisdict", "court", "govern"]):
                category = "governing_law"
                pref_pos = "Exclusive venue and governing law under Delaware courts."

            classified_clause = ClassifiedClause(
                clause_id=c_id,
                section_number=sec,
                title=title,
                category=category,
                summary=text[:150] + ("..." if len(text) > 150 else ""),
                is_non_negotiable=is_non_neg,
                preferred_position=pref_pos,
            )
            classified.append(classified_clause)

            if is_non_neg:
                non_negotiables.append(c_id)

            obligations.append({
                "clause_id": c_id,
                "description": f"Obligation [{sec}]: Compliance with {title}",
            })
            preferred_positions.append({
                "clause_id": c_id,
                "position": pref_pos,
            })

        self.emit_event(
            thought=f"Party A parameters mapped: {len(non_negotiables)} non-negotiable clauses flagged.",
            matter_id=matter_id,
        )

        return LexIngestorAOutput(
            matter_id=matter_id,
            classified_clauses=classified,
            obligations=obligations,
            liability_boundaries=liability_boundaries,
            payment_terms=payment_terms,
            termination_terms=termination_terms,
            non_negotiables=non_negotiables,
            preferred_positions=preferred_positions,
        )

    def _analyze_with_gemini(
        self, clauses: List[Dict[str, Any]], matter_id: Optional[str]
    ) -> LexIngestorAOutput:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = f"""
You are Agent 1 (Lex-Ingestor A), forensic document analyst for Party A baseline contract.
Analyze the provided clauses and output ONLY valid JSON matching this schema:
{{
  "classified_clauses": [
    {{
      "clause_id": "string",
      "section_number": "string",
      "title": "string",
      "category": "liability|payment|termination|ip|confidentiality|governing_law|general",
      "summary": "string",
      "is_non_negotiable": boolean,
      "preferred_position": "string"
    }}
  ],
  "obligations": [{{"clause_id": "string", "description": "string"}}],
  "liability_boundaries": [{{"clause_id": "string", "cap_description": "string"}}],
  "payment_terms": [{{"clause_id": "string", "terms": "string"}}],
  "termination_terms": [{{"clause_id": "string", "notice_period": "string"}}],
  "non_negotiables": ["clause_id"],
  "preferred_positions": [{{"clause_id": "string", "position": "string"}}]
}}

Rules:
- DO NOT invent clause_ids. Use ONLY clause_ids present in the clauses below.

CLAUSES:
{json.dumps(clauses, indent=2)}
"""
        response = model.generate_content(prompt)
        raw_text = response.text
        parsed = self.parse_structured_output(raw_text, schema=LexIngestorAOutput)
        parsed.matter_id = matter_id
        return parsed

    def _analyze_with_openai(
        self, clauses: List[Dict[str, Any]], matter_id: Optional[str]
    ) -> LexIngestorAOutput:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        prompt = f"""
You are Agent 1 (Lex-Ingestor A), forensic document analyst for Party A baseline contract.
Analyze the provided clauses and output ONLY valid JSON matching this schema:
{{
  "classified_clauses": [
    {{
      "clause_id": "string",
      "section_number": "string",
      "title": "string",
      "category": "liability|payment|termination|ip|confidentiality|governing_law|general",
      "summary": "string",
      "is_non_negotiable": boolean,
      "preferred_position": "string"
    }}
  ],
  "obligations": [{{"clause_id": "string", "description": "string"}}],
  "liability_boundaries": [{{"clause_id": "string", "cap_description": "string"}}],
  "payment_terms": [{{"clause_id": "string", "terms": "string"}}],
  "termination_terms": [{{"clause_id": "string", "notice_period": "string"}}],
  "non_negotiables": ["clause_id"],
  "preferred_positions": [{{"clause_id": "string", "position": "string"}}]
}}

Rules:
- DO NOT invent clause_ids. Use ONLY clause_ids present in the clauses below.

CLAUSES:
{json.dumps(clauses, indent=2)}
"""
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        raw_text = response.choices[0].message.content or "{}"
        parsed = self.parse_structured_output(raw_text, schema=LexIngestorAOutput)
        parsed.matter_id = matter_id
        return parsed

    def _validate_and_reconcile_output(
        self,
        llm_output: LexIngestorAOutput,
        clauses: List[Dict[str, Any]],
        matter_id: Optional[str],
    ) -> LexIngestorAOutput:
        """
        Retain deterministic validation over LLM output:
        - Ensure every ingested clause is represented in classified_clauses
        - Guarantee matter_id consistency
        - Backfill any clauses omitted by LLM hallucinations or drops
        """
        llm_cids = {c.clause_id for c in llm_output.classified_clauses if c.clause_id}
        det_fallback = self._deterministic_analysis(clauses, matter_id)
        det_map = {c.clause_id: c for c in det_fallback.classified_clauses}

        reconciled_clauses: List[ClassifiedClause] = list(llm_output.classified_clauses)
        for expected_cid, fallback_clause in det_map.items():
            if expected_cid not in llm_cids:
                logger.info(f"[AGENT 1] Reconciling clause '{expected_cid}' via deterministic validation backfill.")
                reconciled_clauses.append(fallback_clause)

        llm_output.classified_clauses = reconciled_clauses
        llm_output.matter_id = matter_id or llm_output.matter_id
        return llm_output

