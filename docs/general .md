# Negotia AI — Frontend Workflow & Architecture Guide

A complete, end-to-end walkthrough of every screen, layout, and component in the **Negotia AI** enterprise legal negotiation platform. This document explains how legal counsel, contract managers, and executive teams navigate and utilize the system from initial intake to cryptographic execution.

---

## Table of Contents
1. [Platform Vision & "Ink & Amber" Design Philosophy](#1-platform-vision--ink--amber-design-philosophy)
2. [End-to-End Legal Workflow (User Journey)](#2-end-to-end-legal-workflow-user-journey)
3. [Shared Navigation Shell (`SidebarLayout.tsx`)](#3-shared-navigation-shell-sidebarlayouttsx)
4. [Section-by-Section Screen Guide](#4-section-by-section-screen-guide)
   - [4.1 Landing Page (`/`)](#41-landing-page-)
   - [4.2 Operations Command Dashboard (`/dashboard`)](#42-operations-command-dashboard-dashboard)
   - [4.3 Contract Intake & Bilateral Ingestion (`/intake`)](#43-contract-intake--bilateral-ingestion-intake)
   - [4.4 Active Negotiation Room (`/negotiations/:id`)](#44-active-negotiation-room-negotiationsid)
   - [4.5 Autonomous Negotiation Sandbox (`/sandbox`)](#45-autonomous-negotiation-sandbox-sandbox)
   - [4.6 Executive Negotiation Report (`/reports/:id`)](#46-executive-negotiation-report-reportsid)
   - [4.7 Deal Intelligence & Negotiation Analytics (`/analytics`)](#47-deal-intelligence--negotiation-analytics-analytics)
   - [4.8 Team Roster & Access Governance (`/team`)](#48-team-roster--access-governance-team)
   - [4.9 AI Model & Autonomous Configuration (`/settings`)](#49-ai-model--autonomous-configuration-settings)
   - [4.10 Algorithmic Governance & Verification Dossier (`/governance`)](#410-algorithmic-governance--verification-dossier-governance)
5. [Reusable Typed Component System](#5-reusable-typed-component-system)

---

## 1. Platform Vision & "Ink & Amber" Design Philosophy

**Negotia AI** is an enterprise autonomous multi-agent legal negotiation platform engineered for General Counsel (GC), Chief Legal Officers, and enterprise procurement operations. It replaces multi-week manual counterparty redline exchanges with multi-agent reasoning, game-theoretic Pareto concession balancing, and 48,000+ public SEC EDGAR precedent alignments.

### The "Ink & Amber" Visual System
- **Dark Ink Terminal Surfaces (`#161311`, `#1E1B19`, `#292524`)**: Used for persistent tool rails, navigation sidebars, and analytical telemetry. Evokes nocturnal legal review and computational rigor.
- **Parchment Folio Canvas (`#F5F1E8`, `#FAF7F2`, `#EDE7DC`)**: Used for document viewing, redline markup review, and executive dossiers. Replicates the tactile authority of heavy archival legal parchment.
- **Burnt Amber Accent (`#D97706`, `#B45309`, `#FEF3C7`)**: The digital wax-seal accent used for active deliberation badges, primary CTAs, and active indicators.
- **Forest Green (`#166534`, `#DCFCE7`)**: Signifies vetted precedents, settled clauses, and low-risk provisions.
- **Rust Red (`#991B1B`, `#FEE2E2`)**: Signifies counterparty breach demands, super-cap breaches, and critical exposures.
- **Hairline Geometry**: Zero blur or bloated drop-shadows. Elevation is achieved solely through contrast and 1px crisp architectural rules.
- **Editorial Typography**: Classical serif (`EB Garamond` / `Fraunces`) for authoritative headlines and contract clauses; geometric sans (`Plus Jakarta Sans` / `Inter`) for UI controls; terminal monospace (`JetBrains Mono`) for section symbols (`§ 11.2`), token metrics, and block hashes.

---

## 2. End-to-End Legal Workflow (User Journey)

```text
┌───────────────────────────┐
│ 1. Contract Intake        │  Upload firm baseline (Doc A) + counterparty markup (Doc B).
│    (/intake)              │  Configure playbook variance leeway (e.g. 18.5%).
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 2. Command Dashboard      │  Monitor matter docket, automated queue progress,
│    (/dashboard)           │  and high-risk pending redlines across enterprise matters.
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 3. Negotiation Room       │  Tri-panel review: Select contested clause (§ 11.2), inspect
│    (/negotiations/:id)    │  strike-through/underline redline diff, review agent rationale.
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 4. Negotiation Sandbox    │  (Optional) Stress-test concession variables (liability caps,
│    (/sandbox)             │  payment terms), simulate Nash equilibrium & acceptance probability.
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 5. Executive Report       │  Review conformed consensus brief, inspect fairness gauge (94%),
│    (/reports/:id)         │  and apply General Counsel digital attestation + wax seal.
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 6. Audit & Governance     │  Audit cryptographic step lineage (AST parse ➔ EDGAR cluster ➔
│    (/governance)          │  Nash concession ➔ SHA-256 Merkle root proof).
└───────────────────────────┘
```

---

## 3. Shared Navigation Shell (`SidebarLayout.tsx`)

Used on all authenticated pages (Dashboard, Intake, Workspace, Sandbox, Reports, Analytics, Team, Settings, Governance).

### Key Elements:
1. **Brand Masthead**: Features the vector Negotia AI Wax Seal emblem, brand name, and "Enterprise Legal" status badge.
2. **Enterprise Docket Navigation**:
   - Active route highlighted with a burnt amber 3px left border (`border-l-[3px] border-primary-container`), subtle background tint, and font weight increase.
   - Live badge counters (e.g., `"4 pending"` on the Negotiation Room).
3. **Agent Counsel Status Card**: Persistent readout showing `"Agent Counsel: Active · Trained on 48,000+ Master Services Agreements (SEC EDGAR)"`.
4. **General Counsel User Profile**: Profile avatar, name (`Elena Rostova`), role (`General Counsel`), and `"Enterprise"` tier tag.
5. **Sticky Top Context Bar**:
   - Shows active matter docket metadata (`Matter #2025-INT-809 | Cloud Services Agreement · Apex Dynamics Corp.`).
   - Quick action shortcuts: `Compare Diff`, `Export Clean Copy`, and `Draft Compromise`.
   - Responsive mobile hamburger menu with smooth drawer slide-out.

---

## 4. Section-by-Section Screen Guide

### 4.1 Landing Page (`/`)
*The public-facing showcase demonstrating Negotia AI's technological superiority over traditional outside counsel and generic LLM wrappers.*

- **Header**: Public navigation (Platform, Agent Architecture, Precedents & Risk, Security, Pricing), "Client Sign In", and "Launch Platform" CTA.
- **Hero Canvas**:
  - Overline badge: `"Autonomous Contract Reasoning for GC & Enterprise Legal"`.
  - Serif headline: *"Negotiate contracts in minutes, not weeks"*.
  - Dual action CTAs linking directly to the live platform.
- **Interactive Redline Preview Card**:
  - Simulates a live matter (`Section 11.2 - Limitation of Liability`).
  - **Left (Counterparty Draft)**: Shows redline deletion (`capped at 12 months`) and dangerous insertion (`uncapped and subject to unlimited indemnification`) with a high-risk breach score (9.4 / 10).
  - **Right (Negotia Fallback Compromise)**: Shows conformed synthesis (2x ARR super-cap) backed by CrowdStrike & Snowflake SEC exhibits.
  - Interactive `"Stage Concession"` button that toggles into a confirmed status.
- **Telemetry Counter**: 48,000+ SEC exhibits indexed, 78% cycle duration reduction, $1.4B+ contract volume guarded, 0% unvetted liability drift.
- **Tri-Agent Architecture Cards**:
  1. *Forensic Ingestion Agent*: AST syntax decomposition and clause extraction.
  2. *Nash Equilibrium Synthesizer*: Multi-variable concession optimization.
  3. *Cryptographic Provenance Auditor*: SHA-256 block digest attestation.
- **Capability Comparison Table**: Compares Traditional Outside Counsel vs Generic LLMs vs Negotia AI across latency, grounding, game theory, and auditability.
- **Enterprise CTA Footer**: Instant access into the live Command Dashboard.

---

### 4.2 Operations Command Dashboard (`/dashboard`)
*The daily operational hub for legal ops, partners, and contract managers.*

- **Executive Command Strip**: Displays active portfolio status, current date, full-text matter search with `⌘K` keyboard shortcut, and "+ Upload Contract" CTA.
- **Quick Action Ribbon**: 1-click jumps to Upload Contract, Start Negotiation, Open Sandbox, View Executive Reports, and Invite Team Member.
- **KPI Summary Cards**:
  1. *Active Docket Matters*: 14 active, "+3 this month" trend chip.
  2. *Pending Redlines*: 9 active, "4 high-risk" urgency alert.
  3. *Precedent Alignment*: 94.2% convergence with Fortune 500 tech contracts.
  4. *Avg. Turnaround Latency*: 4.2 minutes vs 11 days manual benchmark.
- **Active Matters Ledger Table**:
  - Lists in-flight dockets (`2025-INT-809`, `2025-MSA-409`, `2025-DPA-104`, etc.).
  - Shows counterparty entity, turn stage (Round 3 of 4), risk chip, and precedent match progress bar.
  - Filter pills allow filtering by `All`, `High`, `Moderate`, and `Low` risk profiles.
  - Clicking any row navigates directly into that matter's Negotiation Room.
- **Live Processing Queue**: Real-time progress bars showing active document parsing, AST redline diff generation, and EDGAR precedent matching.
- **Autonomous Activity Stream**: Chronological feed of AI agent deliberations, inbound counterparty redlines, and signed executive reports.

---

### 4.3 Contract Intake & Bilateral Ingestion (`/intake`)
*The dual-party document ingestion folio for initializing a new negotiation docket.*

- **Docket Header Ribbon**: Delaware Chancery & SEC EDGAR compliance banner with preset switchers (`Standard MSA`, `Data Protection (DPA)`, `IP License`, `Custom Bilateral`).
- **Dual Document Comparator Dropzones**:
  - **Contract A (Firm Baseline Playbook)**: Drag-and-drop zone for the firm's approved standard agreement (.DOCX / .PDF). Includes metadata fields for Matter Title and ARR Value ($4,200,000 ARR).
  - **Contract B (Counterparty Inbound Turn)**: Dropzone for the counterparty's marked-up Word redline. Includes fields for Counterparty Legal Entity (`Apex Dynamics Corp.`) and Jurisdiction (`Delaware Chancery Court`).
- **Concession Steerability Tuning**:
  - Interactive slider setting the allowable playbook variance ceiling (e.g., `18.5%`).
  - Dynamic advisory text explaining what the AI is authorized to negotiate without human sign-off (e.g. Net 45-60 payment terms, 2.0x ARR liability caps).
- **Verification Pipeline Checklist**: Automated verification of AST Diff Engine, 48,000+ EDGAR precedents, Hardware MFA, and Cryptographic Hash readiness.
- **Interactive Ingestion Trigger**: Clicking *"Initiate Bilateral Synthesis"* triggers a live progress bar simulating Pareto concession synthesis, then automatically opens the Negotiation Room.

---

### 4.4 Active Negotiation Room (`/negotiations/:id`)
*The tri-panel legal workspace where active bilateral deliberations take place.*

- **Top Docket Bar**: Displays docket ID, counterparty turn counter (Turn 3 of 4), and quick shortcuts to the Sandbox and Executive Report.
- **Panel 1: Contested Clause Outline (Left Drawer)**:
  - Lists all contested sections (`§ 11.2 Limitation of Liability`, `§ 14.1 IP Ownership`, `§ 8.3 Payment Terms`, `§ 16.4 Governing Law`).
  - Each item displays its section number, clause title, risk chip, precedent alignment percentage, and agreed/pending status.
  - Selecting any clause instantly updates the central parchment folio.
- **Panel 2: Parchment Document Folio (Center Canvas)**:
  - Beautiful warm parchment sheet (`#FAF7F2`) with intaglio rulings and serif typography.
  - **View Tabs**: Switch between `Comparative Redline Diff`, `Conformed Synthesis`, and `EDGAR Citations`.
  - **Redline Diff View**:
    - *Original Firm Language*: Clean baseline clause.
    - *Counterparty Markup*: Highlighted in rust red with strike-through and underline breach indicators.
    - *Negotia Conformed Fallback*: Forest green compromise text with an inline legal rationale memo.
  - **Folio Action Strip**: 1-click buttons to *"Edit in Sandbox"* or *"Accept & Conform"* (which updates clause state, decreases risk to low, and displays a confirmation alert).
- **Panel 3: Negotiation Terminal & Copilot (Right Panel)**:
  - *AgentCard / Memo*: Live deliberation rationale from Counsel Lex-Ultra v4.2 citing specific SEC EDGAR 10-K exhibits.
  - *Trade-off Concession Architecture*: Bullet points detailing the concessions made (e.g., traded Net 45 terms for 2.0x ARR super-cap).
  - *Cryptographic Integrity Box*: Displays the SHA-256 docket block hash.
  - Action buttons to stage the proposal or export the executive dossier.

---

### 4.5 Autonomous Negotiation Sandbox (`/sandbox`)
*The simulation laboratory for stress-testing concession trade-offs and game theory.*

- **Top Disclaimer Strip**: Highlights that changes here are staged in simulation mode and do not alter live docket copies until committed.
- **Posture Presets**: Switch in 1-click between:
  - *Aggressive Buyer*: 1.0x cap, Net 30, strict IP ownership.
  - *Balanced Standard*: 2.0x cap, Net 45, mutual carve-outs.
  - *Defensive Shield*: 2.5x cap, Net 60, customer leeway.
- **Variable Tuning Controls (Left Column)**:
  1. *Liability Cap Multiple Slider*: From 0.5x to 5.0x ARR.
  2. *Commercial Payment Terms Slider*: From Net 30 to Net 90 Days.
  3. *Audit Notice Period Slider*: From 10 to 60 Calendar Days.
  4. *IP Carve-out Tolerance*: Select between Strict Ownership, Mutual Carve-out, and Customer Leeway.
- **Simulation Cockpit & Fairness Gauge (Right Column)**:
  - **Circular Fairness Gauge**: Dynamically recalculates a 0-100 score with an amber progress arc and Pareto status.
  - **Counterparty Acceptance Probability**: Dynamically computes likelihood of outside counsel accepting without further markup (e.g. 85%).
  - **Firm Leverage Index**: Quantitative leverage score (e.g. 8.6 / 10).
  - **Simulated Turn Trajectory**: Compares Round 1 (52%), Round 2 (41% breach), and Round 3 (Simulated Nash Equilibrium).
- **Simulation Actions**:
  - *"Run Monte Carlo Test"*: Runs 5,000 simulated iterations.
  - *"Commit to Live Room"*: Commits the calibrated variables into the active docket.

---

### 4.6 Executive Negotiation Report (`/reports/:id`)
*The publication-grade executive brief and sign-off dossier.*

- **Docket Overline Banner**: Identifies the brief as Stage 4 Concluded and ready for final sign-off.
- **Prestige Masthead**: Formal publication header containing attorney-client confidentiality notices, publication date, lead counsel credential (`Elena Rostova`), and SEC EDGAR indexing tags.
- **Synthesis & Settlement Verdict**: Detailed narrative explaining how consensus was achieved across 3 redline turns, detailing the financial and operational impact ($28,500 counsel savings, 18-minute cycle time).
- **Pareto Conformance Gauge**: Highlighting a 94% Nash equilibrium settlement index.
- **Settled Concessions Ledger Table**: Formal ruled table summarizing every clause, its conformed proposal language, settled risk level, and precedent alignment.
- **Cryptographic Attestation & Sovereign Seal**:
  - *Lead Counsel Signature Box*: Digital signature line for Elena Rostova with hardware MFA (YubiKey 5C) verification timestamp.
  - *Wax Seal Verification Stamp*: Negotia Cryptoseal with immutable block hash digest (`0x8f22e8d9...`).
  - Interactive *"Execute Digital Seal"* button that officially stamps the document and enables *"Download Conformed PDF"*.

---

### 4.7 Deal Intelligence & Negotiation Analytics (`/analytics`)
*Macro-level portfolio intelligence and negotiation velocity analytics across all matters.*

- **Top Filter Bar**: Toggle analytics by Trailing 90 Days, Trailing 12 Months, or All-Time Benchmark.
- **Export Controls**: 1-click buttons to Export CSV and Generate Board Dossier.
- **Core Telemetry KPIs**:
  1. *Concession Velocity Delta*: 3.8x speedup (+280% acceleration).
  2. *Median Turnaround Latency*: 14.2 minutes per round (-96.4% reduction).
  3. *Precedent Convergence*: 93.8% alignment with EDGAR market standards.
  4. *Net Exposure Safeguarded*: $48.2M in uncapped liabilities averted.
- **Turn Distribution Bar Histogram**: Visual breakdown showing matters settled in Round 1 (29.5%), Round 2 (45.1%), Round 3 (19.7%), and Round 4+ (5.7%).
- **Contested Clause Friction Matrix**: Pinpoints where counterparty friction is concentrated (§ 11 Liability 42%, § 14 IP 28%, § 17 Indemnity 18%, § 8 Payments 12%).
- **Counterparty Velocity Ledger**: Ruled-row table tracking individual counterparty entities (Apex Dynamics, Novartis, Cantor Fitzgerald), average turns, observed stance (aggressive/balanced), and precedent convergence.

---

### 4.8 Team Roster & Access Governance (`/team`)
*Enterprise role-based delegation, signing thresholds, and cryptographic key management.*

- **Sovereign Governance Metrics**:
  - *Active Counsel Seats*: 14 / 20 with thin progress bar (70%).
  - *Autonomous Limit Signers*: 4 Level 4 signers with uncapped ARR authorization.
  - *Cryptographic Keys Active*: 14 hardware MFA keys with 0 revocation alarms.
  - *Dual-Key HSM Quorum*: 2-of-3 threshold enforcement active.
- **Enterprise Counsel Registry Table**:
  - Lists counsel members with monogram avatars, roles, departments, signing thresholds (Level 1 $500k to Level 4 Uncapped), hardware MFA badges, last active timestamps, and status chips.
- **Interactive Invite Modal**:
  - Form allowing General Counsel to authorize new team members.
  - Configure full name, work email, legal role, and signing authority level.
  - Enforce hardware MFA key requirement (FIDO2 / YubiKey).
  - Submitting instantly appends the invited counsel to the live registry.

---

### 4.9 AI Model & Autonomous Configuration (`/settings`)
*Fine-tuning multi-agent parameters, concession risk limits, and operational directives.*

- **Foundation Model Selector**:
  - Choose between *Negotia Lex-Ultra v4.2*, *Lex-Standard v3.9*, *Anthropic Claude 3.5 Sonnet*, or *Private On-Premise LegalLLM*.
  - Live latency (240ms), hallucination zero verification, and context window (128k tokens) badges.
  - Steerability temperature mode (Strict Deterministic 0.05 vs Cautious 0.15 vs Creative 0.35).
- **Autonomous Concession & Risk Slider**:
  - Interactive range slider from 0% (Conservative) to 50% (High Exposure).
  - Live dynamic advisory text detailing playbook mandates at the current variance percentage.
- **Autonomous Directives (5 Toggle Switches)**:
  1. *Autonomous Counter-Redline Generation* (Active).
  2. *Partner Escalation on Super-Cap Breaches* (Active).
  3. *Conformed Consensus Real-time Push* (Active).
  4. *Autonomous Dispatch to Counterparty* (Dual-Key Restricted).
  5. *Adversarial Strategy Detection* (Active).
- **Display Appearance & Contrast Mode**:
  - Select between **Tactile Parchment** (default legal folio) and **Dark Ink Terminal** (nocturnal monitoring).
- **Cryptographic Playbook Footer**: SHA-256 hash sealing verifying active configuration integrity.

---

### 4.10 Algorithmic Governance & Verification Dossier (`/governance`)
*Forensic decision lineage and deterministic audit trail for SEC and Delaware Chancery scrutiny.*

- **Auditor Header**: Displays active auditor status, dossier reference (`#2025-INT-809`), and buttons to *"Replay Lineage"* and *"Export Cryptographic Proof"*.
- **Forensic Case File Card**:
  - Analyzes target clause: `§ 11.2 Aggregate Liability Cap & Consequential Damages`.
  - Confidence metrics: Model Confidence (98.4%), Hallucination Risk (0.00%), EDGAR Grounding (34 exhibits).
- **Step-by-Step Decision Lineage Timeline**:
  - **Step 01 (AST Syntax Decomposition)**: Extracted 42 contract nodes; identified unhedged consequential damage expansion.
  - **Step 02 (SEC EDGAR Precedent Retrieval)**: Queried 48,000+ exhibits; retrieved 34 Fortune 500 SaaS MSAs (CrowdStrike, Snowflake, Palo Alto Networks); established 2.0x ARR super-cap standard.
  - **Step 03 (Stochastic Nash Concession Optimization)**: Calculated trade-off curve; conceded Net 45 in exchange for 2.0x cap.
  - **Step 04 (Cryptographic Hash Provenance)**: Deployed immutable SHA-256 block digest and validated Elena Rostova FIDO2 hardware MFA token.
- **Interactive Replay Button**: Triggers simulated verification replay of the entire lineage.
- **Merkle Root Proof Seal**: Displays root digest and Delaware Chancery Admissibility certification.

---

## 5. Reusable Typed Component System

All components live in `frontend/src/components/` and are built with TypeScript interfaces and strict Tailwind tokens:

| Component | Props | Description |
| :--- | :--- | :--- |
| **`WaxSealLogo`** | `size?: number`, `pulse?: boolean`, `className?: string` | Vector SVG medallion featuring the Negotia AI monogram, gold stroke, and optional pulsing outer beacon ring. |
| **`StatCard`** | `label`, `value`, `sublabel?`, `change?`, `trend?`, `tone?`, `icon?` | High-impact KPI card with serif numeral typography, trend chips, and hairline borders. |
| **`RiskChip`** | `level ('low' \| 'moderate' \| 'high' \| 'critical')`, `label?`, `score?`, `showDot?` | Sharp 2px-corner risk tag in forest green, amber, or rust red with monospace typography. |
| **`FairnessGauge`** | `value (0-100)`, `size?`, `label?`, `sublabel?` | Circular SVG gauge rendering an animated burnt amber progress arc and Nash equilibrium rating. |
| **`AgentCard`** | `agentName?`, `role?`, `rationale`, `precedentCitation?`, `timestamp?`, `status?` | Bordered legal memo card displaying wax-seal emblem, agent reasoning, and SEC EDGAR citations. |
| **`Button`** | `variant ('primary' \| 'secondary' \| 'parchment' \| 'outline' \| 'ghost')`, `size?`, `icon?`, `iconPosition?` | Sharp 4px-radius button matching the Ink & Amber color palette. |
| **`HairlineCard`** | `children`, `theme ('dark' \| 'parchment')`, `header?`, `footer?` | 1px hairline border container with crisp zero-blur separation. |
| **`LedgerTable`** | `columns: ColumnDef<T>[]`, `data: T[]`, `keyExtractor`, `onRowClick?` | Classical ruled legal ledger table with hover row highlights and responsive horizontal scroll. |
| **`ProgressBar`** | `value (0-100)`, `label?`, `sublabel?`, `tone?`, `height?` | Thin amber progress bar with subtle pulse and percentage readout. |

---

## Summary

The Negotia AI frontend architecture provides an authoritative, complete, and responsive client platform that seamlessly transitions legal teams from contract intake through stochastic simulation, bilateral compromise, and cryptographic attestation. All 10 views are fully linked and ready for future FastAPI backend integration.
