# Negotia AI — Backend Engineering Specification & Implementation Guide

This guide outlines the complete blueprint to build and launch the **FastAPI Python Backend** powering Negotia AI's 4-Agent contract deliberation pipeline.

---

## 1. System Vision & Architecture

The backend coordinates **4 autonomous AI agents** to replace multi-week legal and business counsel bottlenecks with an automated, auditable, and game-theoretically grounded process:

```text
               ┌──────────────────────────────────────────────┐
               │              CONTRACT INGESTION              │
               │   (Upload Party A Baseline + Party B Markup) │
               └──────────────┬────────────────┬──────────────┘
                              │                │
                              ▼                ▼
                     ┌─────────────────┐ ┌─────────────────┐
                     │     AGENT 1     │ │     AGENT 2     │
                     │ Lex-Ingestor A  │ │ Lex-Ingestor B  │
                     │ (Party A AST)   │ │ (Party B AST)   │
                     └────────┬────────┘ └────────┬────────┘
                              │                   │
                              └─────────┬─────────┘
                                        ▼
                              ┌───────────────────┐
                              │      AGENT 3      │
                              │     Arbiter-3     │
                              │ (Dual Verdict:    │
                              │  Legal + Business)│
                              └─────────┬─────────┘
                                        ▼
                              ┌───────────────────┐
                              │      AGENT 4      │
                              │    Scrivener-4    │
                              │ (Executive Report)│
                              └─────────┬─────────┘
                                        ▼
                              ┌───────────────────┐
                              │ HUMAN REVIEW GATE │
                              │ (General Counsel) │
                              └─────────┬─────────┘
                                        ▼
                              ┌───────────────────┐
                              │ CRYPTOGRAPHIC     │
                              │ AUDIT / SEAL      │
                              └───────────────────┘
```

---

## 2. Fast-Track Setup for Hackathon

### 2.1 Prerequisites
- Python 3.10+ (Recommended: 3.11 or 3.12)
- Virtual environment (`venv`)

### 2.2 Initialize Project
```bash
cd backend
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies:
pip install fastapi uvicorn pydantic python-multipart httpx google-generativeai openai python-dotenv
```

### 2.3 Proposed Directory Structure
```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI app entry point & CORS
│   ├── config.py                # Environment & API keys
│   ├── models/                  # Pydantic data models
│   │   ├── clause.py            # ContractClause schema
│   │   ├── matter.py            # Matter docket schema
│   │   └── pipeline.py          # Agent thought & state schemas
│   ├── routers/                 # API route handlers
│   │   ├── contracts.py         # Ingest & file upload
│   │   ├── pipeline.py          # SSE live streaming & agent execution
│   │   ├── negotiations.py      # Clause reconciliation & verdict
│   │   └── reports.py           # Report generation & human sign-off
│   └── agents/                  # The 4 Agent logic modules
│       ├── agent1_ingestor_a.py # Parses Party A documents
│       ├── agent2_ingestor_b.py # Parses Party B documents & redlines
│       ├── agent3_arbiter.py    # Cross-compares & issues dual verdict
│       └── agent4_scrivener.py  # Synthesizes executive report & hash
├── requirements.txt
├── .env.example
└── README.md
```

---

## 3. The 4 Agents: Responsibilities & Prompts

### Agent 1: Lex-Ingestor A
- **Role:** Forensic Document Parser (Party A Baseline)
- **Input:** Baseline contract (.docx / .pdf / text).
- **Output:** Structured AST tree of sections, standard clauses, liability boundaries, and payment terms.
- **LLM Task:** Extract sections (`§ 11.2`, `§ 14.1`, etc.), extract standard positions, and list non-negotiables.

### Agent 2: Lex-Ingestor B
- **Role:** Forensic Document Parser (Party B Redline)
- **Input:** Counterparty marked-up agreement.
- **Output:** Diff extraction, breach risk scoring (0–10), and detection of aggressive deviations (e.g. unlimited indemnification, venue shifts).
- **LLM Task:** Compare markup against standard norms, identify exact insertions/deletions, and compute risk flags.

### Agent 3: Arbiter-3
- **Role:** Comparator + Dual-Lens Verdict Engine
- **Input:** Outputs of Agent 1 and Agent 2 + SEC EDGAR precedent context.
- **Output:**
  1. **Legal Lens:** Statutory precedent (e.g., Delaware Title 6 § 2-719), liability cap analysis, recommended compromise (e.g., 2.0x ARR super-cap).
  2. **Marketing/Commercial Lens:** Strategic account value ($4.2M ARR), cost of float (Net 45 vs Net 30 = ~$5,100), relationship preservation score.
  3. **Nash Equilibrium Compromise:** Single synthesized clause language that achieves Pareto optimality.

### Agent 4: Scrivener-4
- **Role:** Executive Report Synthesizer & Cryptographic Provenance
- **Input:** Settled clauses, Agent 3 verdicts, and variance metrics.
- **Output:**
  - Executive brief summary.
  - Calculation of counsel cost savings (e.g., $28,500 saved, 18 min cycle).
  - SHA-256 block hash digest over all agreed clauses.
  - Human review status flag (`pending_review`).

---

## 4. Key Endpoints Specification

### 4.1 Document Ingestion & Pipeline Launch
- **`POST /api/contracts/ingest`**
  - **Payload:** `multipart/form-data` with `file_a`, `file_b`, `matter_id`, `arr_value`, `variance_ceiling`.
  - **Response:**
    ```json
    {
      "matterId": "2025-INT-809",
      "status": "ingested",
      "pipelineUrl": "/api/pipeline/stream/2025-INT-809"
    }
    ```

### 4.2 Live Agent Pipeline Streaming (SSE)
- **`GET /api/pipeline/stream/{matter_id}`**
  - **Protocol:** Server-Sent Events (`text/event-stream`).
  - **Stream Format:**
    ```json
    event: agent_update
    data: {"agent": "a1", "status": "running", "thought": "AST parse complete — 42 nodes extracted"}

    event: agent_update
    data: {"agent": "a1", "status": "complete"}

    event: merge_status
    data: {"status": "merging", "message": "Merging AST Clause Trees"}

    event: agent_update
    data: {"agent": "a3", "status": "running", "thought": "LEGAL: 2.0x ARR super-cap aligns with Snowflake/CrowdStrike"}

    event: pipeline_complete
    data: {"matterId": "2025-INT-809", "reportId": "2025-INT-809"}
    ```

### 4.3 Negotiation Workspace Data
- **`GET /api/matters/{id}/clauses`**
  - Returns list of contested clauses with original text, counterparty markup, Agent 3 dual verdict, and precedent citations.
- **`POST /api/matters/{id}/clauses/{clause_id}/conform`**
  - Accepts conformed language into docket consensus.

### 4.4 Executive Report & Human Sign-off
- **`GET /api/reports/{id}`**
  - Returns complete synthesized report, settled ledger, and review status.
- **`POST /api/reports/{id}/review`**
  - **Body:** `{"action": "approve" | "request_revision" | "escalate", "counselName": "Elena Rostova"}`
  - **Response:** Updated attestation status and cryptographic block digest.

---

## 5. Step-by-Step Implementation Roadmap

### Step 1: Base FastAPI Server (`app/main.py`)
Set up CORS to allow `http://localhost:5173` and Vite dev server.

### Step 2: Agent Deliberation Service (`app/agents/`)
Integrate an LLM provider (Google Gemini via `google-generativeai` or Anthropic/OpenAI) to generate realistic redline reasoning and commercial/legal trade-offs.

### Step 3: SSE Streaming Route (`app/routers/pipeline.py`)
Implement `StreamingResponse` yielding asynchronous generator events so the frontend's [`/pipeline/:id`](http://localhost:5173/pipeline/2025-INT-809) page receives live agent logs.

### Step 4: Hook Up Frontend Ingestion
In `frontend/src/pages/Intake.tsx`, replace the simulated timer with an actual `fetch('/api/contracts/ingest', { method: 'POST', body: formData })`.

---

## 6. Verification & Testing

```bash
# Start backend server
uvicorn app.main:app --reload --port 8000

# Health check
curl http://localhost:8000/health

# Test SSE streaming in terminal
curl -N http://localhost:8000/api/pipeline/stream/2025-INT-809
```
