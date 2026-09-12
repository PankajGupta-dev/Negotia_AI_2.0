# Negotia AI — Frontend to Backend Integration Architecture Guide

This guide is written specifically for the **Backend Engineer** building the FastAPI backend for **Negotia AI**. It provides the complete integration blueprint to connect all backend models, endpoints, streaming events, and cryptographic verification pipelines to the React + Vite + TypeScript frontend.

---

## Table of Contents
1. [Architecture & Protocol Overview](#1-architecture--protocol-overview)
2. [Environment Configuration & Local Proxying](#2-environment-configuration--local-proxying)
3. [TypeScript ⇄ Pydantic Data Contract](#3-typescript--pydantic-data-contract)
4. [Complete REST API Endpoint Specification](#4-complete-rest-api-endpoint-specification)
5. [Real-time Streaming: Agent Deliberation & Processing Queue (SSE)](#5-real-time-streaming-agent-deliberation--processing-queue-sse)
6. [Bilateral Document Ingestion (`multipart/form-data`)](#6-bilateral-document-ingestion-multipartform-data)
7. [Authentication & Hardware MFA Headers](#7-authentication--hardware-mfa-headers)
8. [Connecting Frontend Components (Step-by-Step Implementation)](#8-connecting-frontend-components-step-by-step-implementation)

---

## 1. Architecture & Protocol Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND CLIENT                        │
│             React 18 + Vite + TypeScript (SPA)              │
│                Default Port: localhost:5173                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            │                                     │
   REST JSON Requests                    Server-Sent Events (SSE)
   & Multipart File Uploads              & WebSockets
   (Axios / Native Fetch)                (Live Deliberation & Queue)
            │                                     │
            ▼                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   FASTAPI BACKEND SERVICE                   │
│             Python 3.11+ / Uvicorn (REST + SSE)             │
│                Default Port: localhost:8000                 │
└───────┬──────────────────────┬──────────────────────┬───────┘
        │                      │                      │
        ▼                      ▼                      ▼
┌──────────────┐      ┌─────────────────┐    ┌─────────────────┐
│ Vector Store │      │ Nash Equilibrium│    │  Cryptographic  │
│ Qdrant/Chroma│      │     Solver      │    │ Provenance Hash │
│ (SEC EDGAR)  │      │ (Pareto Engine) │    │    (SHA-256)    │
└──────────────┘      └─────────────────┘    └─────────────────┘
```

### Communication Protocols:
- **Standard Operations (CRUD, Queries, Updates)**: Asynchronous REST API over HTTPS returning JSON payloads conforming to Pydantic schemas.
- **Contract Uploads**: `multipart/form-data` for raw `.docx` and `.pdf` files.
- **Agent Reasoning & Processing Stream**: Server-Sent Events (`text/event-stream`) for streaming tokens and pipeline step completions.

---

## 2. Environment Configuration & Local Proxying

### 2.1 Backend CORS Middleware (FastAPI)
In `backend/main.py`, configure FastAPI's `CORSMiddleware` to accept requests from the Vite development server and production domains:

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Negotia AI Autonomous Legal API",
    version="4.8.0",
    description="Backend engine for multi-agent contract negotiation and precedent grounding",
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # Add production domain when deployed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 2.2 Frontend Vite Proxy (`frontend/vite.config.ts`)
To eliminate CORS issues during development, update `frontend/vite.config.ts` to proxy all `/api` requests to port `8000`:

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/events': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
```

---

## 3. TypeScript ⇄ Pydantic Data Contract

The frontend's [`frontend/src/data/mock.ts`](file:///c:/Users/rupan/OneDrive/Attachments/Desktop/Coding%20With%20RS/Hackathon%20Projects/Negotia%20AI/frontend/src/data/mock.ts) establishes the exact schema. Mirror these interfaces in Python using Pydantic models:

### 3.1 Matter Model (`Matter`)
```python
# backend/schemas/matter.py
from pydantic import BaseModel, Field
from typing import Optional, Literal

class MatterBase(BaseModel):
    id: str
    docket_number: str = Field(..., alias="docketNumber")
    title: str
    counterparty: str
    type: str
    stage: str
    round: int
    total_rounds: int = Field(..., alias="totalRounds")
    status: Literal['active', 'review', 'concluded', 'escalated']
    risk_level: Literal['low', 'moderate', 'high', 'critical'] = Field(..., alias="riskLevel")
    risk_score: float = Field(..., alias="riskScore")
    precedent_match: int = Field(..., alias="precedentMatch")
    last_updated: str = Field(..., alias="lastUpdated")
    arr_value: Optional[str] = Field(None, alias="arrValue")
    lead_counsel: str = Field(..., alias="leadCounsel")
    pending_redlines_count: int = Field(..., alias="pendingRedlinesCount")

    class Config:
        populate_by_name = True
```

### 3.2 Contested Clause Model (`ContractClause`)
```python
# backend/schemas/clause.py
from pydantic import BaseModel, Field
from typing import Literal

class ContractClause(BaseModel):
    id: str
    section: str  # e.g. "§ 11.2"
    title: str
    original_text: str = Field(..., alias="originalText")
    counterparty_text: str = Field(..., alias="counterpartyText")
    conformed_proposal: str = Field(..., alias="conformedProposal")
    risk_level: Literal['low', 'moderate', 'high'] = Field(..., alias="riskLevel")
    risk_score: float = Field(..., alias="riskScore")
    precedent_alignment: int = Field(..., alias="precedentAlignment")
    status: Literal['agreed', 'pending', 'flagged', 'conceded']
    rationale: str
    sec_edgar_citation: str = Field(..., alias="secEdgarCitation")

    class Config:
        populate_by_name = True
```

### 3.3 AI Configuration Model (`AISettingsConfig`)
```python
# backend/schemas/settings.py
from pydantic import BaseModel, Field
from typing import Literal

class AISettingsConfig(BaseModel):
    foundation_model: str = Field(..., alias="foundationModel")
    temperature_mode: str = Field(..., alias="temperatureMode")
    variance_ceiling: float = Field(..., alias="varianceCeiling")  # 0.0 to 50.0
    auto_counter_redlines: bool = Field(..., alias="autoCounterRedlines")
    partner_super_cap_escalation: bool = Field(..., alias="partnerSuperCapEscalation")
    conformed_consensus_push: bool = Field(..., alias="conformedConsensusPush")
    autonomous_dispatch: bool = Field(..., alias="autonomousDispatch")
    adversarial_strategy_detection: bool = Field(..., alias="adversarialStrategyDetection")
    display_mode: Literal['parchment', 'dark_ink'] = Field(..., alias="displayMode")

    class Config:
        populate_by_name = True
```

---

## 4. Complete REST API Endpoint Specification

Here is the exact API map required to support all 10 frontend screens:

| Frontend Screen | HTTP Method | Endpoint Path | Description |
| :--- | :--- | :--- | :--- |
| **Dashboard** | `GET` | `/api/dashboard/stats` | Returns portfolio KPI counters (matters, redlines, precedent %, turnaround). |
| **Dashboard** | `GET` | `/api/matters` | Returns the list of active docket matters for `LedgerTable`. |
| **Dashboard** | `GET` | `/api/queue` | Returns active processing queue items with progress (0–100). |
| **Dashboard** | `GET` | `/api/activity` | Returns recent chronological audit feed items. |
| **Intake** | `POST` | `/api/contracts/ingest` | Multi-part upload of Doc A & Doc B with variance settings. |
| **Workspace** | `GET` | `/api/matters/{id}` | Returns metadata for a specific docket. |
| **Workspace** | `GET` | `/api/matters/{id}/clauses` | Returns list of all contested clauses with redline diffs. |
| **Workspace** | `POST` | `/api/matters/{id}/clauses/{clause_id}/conform` | Accepts and stages conformed compromise text. |
| **Sandbox** | `POST` | `/api/sandbox/simulate` | Computes Nash equilibrium fairness score and acceptance probability. |
| **Sandbox** | `POST` | `/api/sandbox/commit` | Commits calibrated sandbox parameters into the active matter room. |
| **Reports** | `GET` | `/api/reports/{id}` | Returns executive brief data, precedent citations, and verdict. |
| **Reports** | `POST` | `/api/reports/{id}/sign` | Executes digital signature and stamps SHA-256 Merkle block digest. |
| **Reports** | `GET` | `/api/reports/{id}/pdf` | Streams downloadable clean conformed PDF document. |
| **Analytics** | `GET` | `/api/analytics/telemetry` | Returns turn distribution histogram and clause friction frequencies. |
| **Analytics** | `GET` | `/api/analytics/counterparties` | Returns counterparty velocity ledger. |
| **Team** | `GET` | `/api/team` | Returns team counsel roster and authority levels. |
| **Team** | `POST` | `/api/team/invite` | Dispatches invitation with signing authority thresholds. |
| **Settings** | `GET` | `/api/settings` | Returns active AI deliberative configuration. |
| **Settings** | `PUT` | `/api/settings` | Updates and cryptographically seals model and variance settings. |
| **Governance** | `GET` | `/api/governance/{id}` | Returns 4-step decision lineage timeline, confidence, and Merkle root. |

---

## 5. Real-time Streaming: Agent Deliberation & Processing Queue (SSE)

During bilateral negotiation and intake processing, the frontend receives real-time agent thoughts and pipeline progress without polling.

### 5.1 Backend Implementation (FastAPI SSE)
```python
# backend/routers/stream.py
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import asyncio
import json

router = APIRouter(prefix="/api/stream", tags=["Streaming"])

async def deliberation_event_generator(matter_id: str):
    steps = [
        {"type": "status", "message": "Decomposing counterparty AST syntax..."},
        {"type": "citation", "citation": "SEC EDGAR Exhibit 10.42 (CrowdStrike 10-K)"},
        {"type": "deliberation", "token": "Evaluating "},
        {"type": "deliberation", "token": "bilateral "},
        {"type": "deliberation", "token": "Pareto "},
        {"type": "deliberation", "token": "concession..."},
        {"type": "compromise", "clause_id": "clause-11-2", "status": "staged"},
    ]
    for step in steps:
        yield f"data: {json.dumps(step)}\n\n"
        await asyncio.sleep(0.3)

@router.get("/deliberation/{matter_id}")
async def stream_deliberation(matter_id: str):
    return StreamingResponse(
        deliberation_event_generator(matter_id),
        media_type="text/event-stream"
    )
```

### 5.2 Frontend Consumption Hook
In `frontend/src/hooks/useAgentStream.ts`:
```typescript
import { useEffect, useState } from 'react';

export function useAgentStream(matterId: string) {
  const [tokens, setTokens] = useState<string>('');
  const [status, setStatus] = useState<string>('Idle');

  useEffect(() => {
    const eventSource = new EventSource(`/api/stream/deliberation/${matterId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'token') {
        setTokens((prev) => prev + data.token);
      } else if (data.type === 'status') {
        setStatus(data.message);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [matterId]);

  return { tokens, status };
}
```

---

## 6. Bilateral Document Ingestion (`multipart/form-data`)

The Intake screen [`frontend/src/pages/Intake.tsx`](file:///c:/Users/rupan/OneDrive/Attachments/Desktop/Coding%20With%20RS/Hackathon%20Projects/Negotia%20AI/frontend/src/pages/Intake.tsx) accepts two files simultaneously:
- **Contract A**: Baseline firm standard agreement.
- **Contract B**: Counterparty redline / inbound execution draft.

### FastAPI Endpoint:
```python
# backend/routers/ingest.py
from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel

router = APIRouter(prefix="/api/contracts", tags=["Ingestion"])

@router.post("/ingest")
async def ingest_bilateral_contract(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
    matter_title: str = Form(...),
    contract_value: str = Form(...),
    counterparty: str = Form(...),
    jurisdiction: str = Form(...),
    variance_ceiling: float = Form(...)
):
    # 1. Read files into memory or S3/disk
    content_a = await file_a.read()
    content_b = await file_b.read()
    
    # 2. Invoke Forensic Ingestion Agent (AST semantic parser)
    # 3. Initialize Docket record & generate Docket ID
    docket_id = "2025-INT-809"
    
    return {
        "status": "success",
        "docketId": docket_id,
        "message": "Bilateral ingestion started. Precedents clustering underway."
    }
```

---

## 7. Authentication & Hardware MFA Headers

To satisfy the enterprise security requirements established in Negotia AI's Architecture Document:
- Requests should supply a standard JWT bearer token in the `Authorization` header:
  `Authorization: Bearer <jwt_token>`
- Sensitive operations (such as Level 4 Uncapped ARR sign-offs on the Executive Report or Autonomous Dispatch toggles in Settings) require **Hardware MFA FIDO2 Attestation**:
  `X-Negotia-MFA-Attestation: FIDO2_<yubikey_signature_hash>`

FastAPI Dependency for verification:
```python
# backend/auth/security.py
from fastapi import Header, HTTPException, status

async def verify_hardware_mfa(
    x_negotia_mfa_attestation: str = Header(None)
):
    if not x_negotia_mfa_attestation or not x_negotia_mfa_attestation.startswith("FIDO2_"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation requires General Counsel Hardware MFA Key attestation."
        )
    return True
```

---

## 8. Connecting Frontend Components (Step-by-Step Implementation)

To transition from the provided mock data to live backend API calls:

### Step 1: Create the API Client (`frontend/src/api/client.ts`)
Create a central fetch or Axios wrapper:
```typescript
// frontend/src/api/client.ts
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('negotia_auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
```

### Step 2: Swap Mocks in Pages
For example, in `frontend/src/pages/Dashboard.tsx`:
```typescript
// Replace:
// import { MOCK_MATTERS } from '../data/mock';

// With:
import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { Matter } from '../data/mock';

export const Dashboard: React.FC = () => {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient<Matter[]>('/matters')
      .then((data) => setMatters(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  // Use matters in LedgerTable
  // ...
};
```

---

## Summary Checklist for Backend Engineers

- [ ] Run FastAPI on `http://localhost:8000` with CORS enabled for `http://localhost:5173`.
- [ ] Implement Pydantic models matching `frontend/src/data/mock.ts` with camelCase aliases.
- [ ] Implement `POST /api/contracts/ingest` handling `file_a` and `file_b` (`multipart/form-data`).
- [ ] Implement `POST /api/sandbox/simulate` computing Nash equilibrium fairness scores.
- [ ] Implement SSE endpoint `/api/stream/deliberation/{id}` for live agent thinking output.
- [ ] Generate SHA-256 block digests for executive reports and the cryptographic governance dossier.
