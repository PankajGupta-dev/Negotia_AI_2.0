# Negotia AI — Frontend Modification Instructions for LLM

## Context

This is a React + Vite + TypeScript frontend for **Negotia AI** — a 4-agent legal contract negotiation platform. The project already has a complete UI shell (10 pages, sidebar layout, design system). The goal is to add the missing pieces that make the hackathon demo work visually and functionally.

The 4-agent pipeline is the core product:
- **Agent 1 (Lex-Ingestor A)** → reads and parses Party A''s contract document
- **Agent 2 (Lex-Ingestor B)** → reads and parses Party B''s contract document
- **Agent 3 (Arbiter-3)** → compares both docs, issues a verdict in legal AND marketing terms
- **Agent 4 (Scrivener-4)** → generates the final report, waits for human manual approval

The project uses: React 18, TypeScript, Vite, React Router v6, Tailwind CSS.
All pages live in `frontend/src/pages/`. Components in `frontend/src/components/`. Layout in `frontend/src/layouts/SidebarLayout.tsx`. Routing in `frontend/src/App.tsx`.

Design system tokens (use these exact classes):
- Dark bg: `bg-background`, `bg-surface-container-lowest`, `bg-surface-container-low`
- Amber accent: `text-primary`, `bg-primary-container`, `border-primary`
- Green safe: `text-secondary`, `bg-secondary-container`
- Red risk: `text-error`, `bg-error-container`
- Typography: `font-headline-md` (serif), `font-body-md` (sans), `font-mono` (mono)

---

## STEP 1 — Create a new page: `AgentPipeline.tsx`

**File to create:** `frontend/src/pages/AgentPipeline.tsx`

**Purpose:** This is the most important new page. It shows judges the live, step-by-step visual of all 4 agents working in sequence. This is the "showstopper demo" screen.

**What this page must do:**
1. Show 4 agent cards in a vertical pipeline with connecting arrows between them
2. When the page loads (or user clicks "Start Pipeline"), animate each agent card activating one by one with a 1.5 second delay between each
3. Each agent card shows:
   - Agent number badge (e.g. "AGENT 01")
   - Agent name (Lex-Ingestor A, Lex-Ingestor B, Arbiter-3, Scrivener-4)
   - Agent role description
   - A status indicator: IDLE → RUNNING (pulsing amber dot) → COMPLETE (green checkmark)
   - A live "thought stream" — a scrolling log of 3-5 messages that appear one by one as the agent runs (simulate this with setTimeout)
4. After all 4 agents complete, show a "PIPELINE COMPLETE" banner at the bottom with a button to "View Executive Report"
5. Between Agent 2 and Agent 3, show a "merging documents" animation (just a horizontal line with animated dots traveling across it)
6. The page background should be dark (`bg-background`), making the amber agent cards pop visually

**Agent details to hardcode:**

Agent 1 — Lex-Ingestor A:
- Role: "Forensic Document Parser — Party A"
- Thought stream messages (show one every 800ms):
  1. "Ingesting Apex_Enterprise_MSA_2025.docx..."
  2. "AST parse complete — 42 contract nodes extracted"
  3. "Identified 6 contested clauses: section 11.2, 14.1, 8.3, 16.4, 9.1, 5.7"
  4. "Flagged section 11.2 — Uncapped consequential damages exposure (Critical)"
  5. "Party A analysis complete. Passing to Agent 2"

Agent 2 — Lex-Ingestor B:
- Role: "Forensic Document Parser — Party B"
- Thought stream messages:
  1. "Ingesting Apex_Dynamics_Inbound_Redline_Round3.docx..."
  2. "AST parse complete — counterparty markup detected on 6 clauses"
  3. "section 11.2: Counterparty demands unlimited indemnification — BREACH RISK 9.4/10"
  4. "section 8.3: Net 30 payment demand conflicts with firm Net 60 standard"
  5. "Party B analysis complete. Passing to Agent 3"

Agent 3 — Arbiter-3:
- Role: "Comparator + Verdict Engine (Legal and Marketing)"
- Thought stream messages:
  1. "Cross-referencing 48,000+ SEC EDGAR precedents..."
  2. "LEGAL LENS: section 11.2 — 2.0x ARR super-cap aligns with CrowdStrike and Snowflake standards"
  3. "MARKETING LENS: Conceding Net 45 payment terms preserves $4.2M ARR relationship"
  4. "Nash equilibrium identified — Pareto optimal settlement at 94% fairness index"
  5. "VERDICT ISSUED: Accept 2.0x ARR cap, concede Net 45 terms"

Agent 4 — Scrivener-4:
- Role: "Report Generator — Awaiting Human Approval"
- Thought stream messages:
  1. "Compiling executive negotiation report..."
  2. "Conformed language drafted for all 6 clauses"
  3. "SHA-256 cryptographic hash generated: 0x8f22e8d9a4b1..."
  4. "Report ready — $28,500 counsel cost savings documented"
  5. "PENDING HUMAN REVIEW — Manual approval required before finalizing"

**Styling notes:**
- Each agent card: dark card with 1px amber border when running, green border when complete
- Status IDLE: grey dot. RUNNING: pulsing amber dot + amber border glow. COMPLETE: green checkmark icon + green border
- Thought stream: small monospace text scrolling inside a dark terminal-style box inside each card
- Arrow connector between cards: a vertical dashed amber line with a downward chevron
- "PIPELINE COMPLETE" banner: full-width, dark green background, serif headline text

---

## STEP 2 — Add the new route to `App.tsx`

**File to modify:** `frontend/src/App.tsx`

**What to do:**
1. Import `AgentPipeline` from `./pages/AgentPipeline`
2. Add a new route inside the `<SidebarLayout>` route group: `<Route path="/pipeline/:id" element={<AgentPipeline />} />`

---

## STEP 3 — Add "Live Agent Pipeline" to the sidebar in `SidebarLayout.tsx`

**File to modify:** `frontend/src/layouts/SidebarLayout.tsx`

**What to do:**
Find the `NAV_ITEMS` array (around line 14). Add a new nav item after "Contract Intake" and before "Negotiation Room":

```
{
  name: 'Live Agent Pipeline',
  path: '/pipeline/2025-INT-809',
  icon: 'account_tree',
  badge: 'LIVE',
  badgeTone: 'amber',
},
```

---

## STEP 4 — Modify `Intake.tsx` to navigate to the pipeline page

**File to modify:** `frontend/src/pages/Intake.tsx`

**What to do:**
Find the `handleStartIngestion` function (around line 19). Currently after the fake progress bar completes, it navigates to `/negotiations/2025-INT-809`. Change that `navigate` call to `/pipeline/2025-INT-809` instead.

This makes the demo flow: Upload docs -> Start Ingestion -> Watch Live Pipeline.

---

## STEP 5 — Add Human-in-the-Loop Review UI to `Reports.tsx`

**File to modify:** `frontend/src/pages/Reports.tsx`

**What to do:**
Add a new state variable: `reviewStatus` with type `'pending' | 'approved' | 'revision_requested' | 'escalated'`, defaulting to `'pending'`.

Insert a visually prominent card titled "AGENT 4 — AWAITING HUMAN REVIEW" ABOVE the existing wax seal / signature section. This card must contain:

1. An amber pulsing badge reading "PENDING MANUAL APPROVAL" (shown only when reviewStatus is pending)
2. Three action buttons side by side:
   - "Approve Report" (green) — sets reviewStatus to 'approved'
   - "Request Agent Revision" (amber) — sets reviewStatus to 'revision_requested'
   - "Escalate to Human Counsel" (red) — sets reviewStatus to 'escalated'
3. When approved: show green "APPROVED BY GENERAL COUNSEL" badge
4. When revision_requested: show amber "REVISION REQUESTED — Agent 4 Re-generating..." badge with a progress bar that fills over 3 seconds, then resets back to pending
5. When escalated: show red "ESCALATED TO HUMAN COUNSEL — Elena Rostova notified" badge

Style this card with a thick 3px amber left border to make it visually stand out as the human checkpoint.

---

## STEP 6 — Add Agent Identity Strip to `NegotiationWorkspace.tsx`

**File to modify:** `frontend/src/pages/NegotiationWorkspace.tsx`

**What to do:**
Add a horizontal strip BELOW the top docket strip. This strip shows all 4 agent status chips in a single row so judges can see which agents are active at a glance.

Each chip shows: agent code (A1, A2, A3, A4), agent name, and a status dot.
- A1 Lex-Ingestor A: green dot, "COMPLETE"
- A2 Lex-Ingestor B: green dot, "COMPLETE"
- A3 Arbiter-3: amber pulsing dot, "ACTIVE"
- A4 Scrivener-4: grey dot, "QUEUED"

Use small monospace font. Separate chips with thin vertical dividers. Full-width strip with dark background.

Also in the right panel (Panel 3 / Negotiation Terminal), add a small label above the AgentCard: "Agent 3 · Arbiter-3 — Active Verdict" in amber monospace text.

---

## STEP 7 — Add "Agent 3 Dual Verdict" Tab to `NegotiationWorkspace.tsx`

**File to modify:** `frontend/src/pages/NegotiationWorkspace.tsx`

**What to do:**
The page already has tab state: `'redline' | 'compromise' | 'precedents'` (around line 14). Extend it to also allow `'verdict'`.

Add a 4th tab button labelled "Agent 3 Verdict" next to the existing 3 tab buttons.

When the verdict tab is active, render a two-column split inside the center parchment panel:

Left column — Legal Lens:
- Header: "LEGAL VERDICT"
- Body text: "section 11.2 presents a critical exposure under Delaware Chancery precedent. The counterparty demand for unlimited consequential damages exceeds Fortune 500 MSA standards by 340%. Recommended resolution: 2.0x ARR aggregate cap with mutual carve-outs for gross negligence, consistent with CrowdStrike 10-K Exhibit 23.4 and Snowflake SEC Filing Q3-2024."
- Show a risk badge going from CRITICAL to MITIGATED

Right column — Marketing Lens:
- Header: "COMMERCIAL VERDICT"
- Body text: "Apex Dynamics Corp. represents a $4.2M ARR strategic account. Conceding Net 45 payment terms is commercially rational — the 15-day delay costs ~$5,100 in float vs $4.2M in annual revenue retention. Recommend accepting to preserve relationship velocity."
- Show a deal value badge: "$4.2M ARR RETAINED"

Two columns side by side with a thin vertical divider between them, inside the existing parchment-styled center panel.

---

## STEP 8 — Add "Watch Live Pipeline" button to `Dashboard.tsx`

**File to modify:** `frontend/src/pages/Dashboard.tsx`

**What to do:**
In the Quick Action Ribbon (the row of shortcut action buttons), add a new prominent button:
- Label: "Watch Live Pipeline"
- Icon: `account_tree`
- On click: navigate to `/pipeline/2025-INT-809`
- Use the primary amber button style so it stands out

---

## STEP 9 — Update Agent cards on `Landing.tsx` to show all 4 agents

**File to modify:** `frontend/src/pages/Landing.tsx`

**What to do:**
Find the agent architecture cards section. Replace/update with these 4 agents:

1. **Lex-Ingestor A** — "Forensic AST document parser for Party A. Extracts 42+ contract nodes, flags contested clauses, and delivers structured analysis to the pipeline."

2. **Lex-Ingestor B** — "Counterparty redline forensics engine. Detects markup conflicts, quantifies breach risk score 0-10, and cross-references dispute history."

3. **Arbiter-3** — "Dual-lens verdict engine. Issues rulings from both legal precedent and commercial value perspectives. Powered by 48,000+ SEC EDGAR precedents and Nash equilibrium game theory."

4. **Scrivener-4** — "Executive report synthesizer. Drafts conformed language, calculates counsel cost savings, generates SHA-256 cryptographic proof, and gates final execution on human approval."

If currently 3 cards exist, add the 4th card for Scrivener-4 in the same visual style.

---

## Summary of Files to Create / Modify

| Step | Action | File |
|------|--------|------|
| 1 | CREATE | `frontend/src/pages/AgentPipeline.tsx` |
| 2 | MODIFY | `frontend/src/App.tsx` |
| 3 | MODIFY | `frontend/src/layouts/SidebarLayout.tsx` |
| 4 | MODIFY | `frontend/src/pages/Intake.tsx` |
| 5 | MODIFY | `frontend/src/pages/Reports.tsx` |
| 6 | MODIFY | `frontend/src/pages/NegotiationWorkspace.tsx` |
| 7 | MODIFY | `frontend/src/pages/NegotiationWorkspace.tsx` |
| 8 | MODIFY | `frontend/src/pages/Dashboard.tsx` |
| 9 | MODIFY | `frontend/src/pages/Landing.tsx` |

---

## Intended Demo Flow After These Changes

```
Step 1: Landing page -> sees 4 named agents explained
Step 2: "Launch Platform" -> Dashboard
Step 3: "Watch Live Pipeline" button -> OR go to Intake first
Step 4: Intake: upload 2 docs -> "Initiate Bilateral Synthesis"
Step 5: Auto-redirects to /pipeline/:id
Step 6: Watch all 4 agents activate live, one by one, with streaming thought logs
Step 7: Pipeline completes -> "View Executive Report" button
Step 8: Reports page: "PENDING HUMAN REVIEW" gate appears
Step 9: Click "Approve Report" -> green badge -> Execute Digital Seal
Step 10: Governance page -> full cryptographic audit trail
```

This 10-step demo is self-explanatory to judges and visually showcases the full 4-agent pipeline.
