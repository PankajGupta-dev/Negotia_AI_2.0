// Negotia AI Strongly-Typed Mock Data & Interfaces

export interface Matter {
  id: string;
  docketNumber: string;
  title: string;
  counterparty: string;
  type: string;
  stage: string;
  round: number;
  totalRounds: number;
  status: 'active' | 'review' | 'concluded' | 'escalated';
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  riskScore: number; // 0-10
  precedentMatch: number; // percentage e.g. 94
  lastUpdated: string;
  arrValue?: string;
  leadCounsel: string;
  pendingRedlinesCount: number;
}

export interface ContractClause {
  id: string;
  section: string;
  title: string;
  originalText: string;
  counterpartyText: string;
  conformedProposal: string;
  riskLevel: 'low' | 'moderate' | 'high';
  riskScore: number;
  precedentAlignment: number; // percentage
  status: 'agreed' | 'pending' | 'flagged' | 'conceded';
  rationale: string;
  secEdgarCitation: string;
}

export interface ActivityFeedItem {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  matterId: string;
  details: string;
  type: 'autonomous' | 'manual' | 'alert' | 'signing';
}

export interface ProcessingQueueItem {
  id: string;
  matterId: string;
  docketNumber: string;
  step: string;
  progress: number; // 0-100
  status: 'analyzing' | 'synthesizing' | 'complete' | 'queued';
  eta: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  authorityLevel: string; // e.g. "Level 4 (Uncapped ARR)"
  mfaStatus: 'hardware_mfa' | 'app_mfa' | 'pending';
  lastActive: string;
  status: 'active' | 'invited' | 'suspended';
  avatarUrl?: string;
}

export interface AISettingsConfig {
  foundationModel: string;
  temperatureMode: string;
  varianceCeiling: number; // 0 to 50%
  autoCounterRedlines: boolean;
  partnerSuperCapEscalation: boolean;
  conformedConsensusPush: boolean;
  autonomousDispatch: boolean;
  adversarialStrategyDetection: boolean;
  displayMode: 'parchment' | 'dark_ink';
}

// ----------------------------------------------------
// Mock Datasets
// ----------------------------------------------------

export const MOCK_MATTERS: Matter[] = [
  {
    id: '2025-INT-809',
    docketNumber: 'DOCKET #2025-INT-809',
    title: 'Cloud Services & Enterprise License Agreement',
    counterparty: 'Apex Dynamics Corp.',
    type: 'Enterprise MSA',
    stage: 'Round 3 Deliberation',
    round: 3,
    totalRounds: 4,
    status: 'active',
    riskLevel: 'high',
    riskScore: 8.7,
    precedentMatch: 94,
    lastUpdated: '12 minutes ago',
    arrValue: '$4.2M ARR',
    leadCounsel: 'Elena Rostova',
    pendingRedlinesCount: 4,
  },
  {
    id: '2025-MSA-409',
    docketNumber: 'DOCKET #2025-MSA-409',
    title: 'Global Master SaaS & Data Processing Addendum',
    counterparty: 'Veloce Systems Inc.',
    type: 'Bilateral SaaS',
    stage: 'Round 2 Inbound',
    round: 2,
    totalRounds: 4,
    status: 'active',
    riskLevel: 'moderate',
    riskScore: 5.4,
    precedentMatch: 91,
    lastUpdated: '45 minutes ago',
    arrValue: '$1.8M ARR',
    leadCounsel: 'Elena Rostova',
    pendingRedlinesCount: 2,
  },
  {
    id: '2025-DPA-104',
    docketNumber: 'DOCKET #2025-DPA-104',
    title: 'Cross-Border Data Processing & Model Governance Addendum',
    counterparty: 'Novartis Global Digital',
    type: 'DPA / EU SCCs',
    stage: 'Stage 4 Concluded',
    round: 4,
    totalRounds: 4,
    status: 'concluded',
    riskLevel: 'low',
    riskScore: 2.1,
    precedentMatch: 98,
    lastUpdated: '3 hours ago',
    arrValue: '$6.5M ARR',
    leadCounsel: 'Marcus Vance',
    pendingRedlinesCount: 0,
  },
  {
    id: '2025-IP-312',
    docketNumber: 'DOCKET #2025-IP-312',
    title: 'Proprietary Model Weights & IP Assignment Rider',
    counterparty: 'Aetherion AI Labs',
    type: 'IP Licensing',
    stage: 'Round 1 Intake',
    round: 1,
    totalRounds: 3,
    status: 'review',
    riskLevel: 'high',
    riskScore: 9.1,
    precedentMatch: 82,
    lastUpdated: 'Yesterday',
    arrValue: '$3.1M ARR',
    leadCounsel: 'Sofia Chen',
    pendingRedlinesCount: 6,
  },
  {
    id: '2025-SEC-661',
    docketNumber: 'DOCKET #2025-SEC-661',
    title: 'Enterprise Vendor Security & Business Continuity Protocol',
    counterparty: 'Cantor Fitzgerald FinTech',
    type: 'Security Schedule',
    stage: 'Final Sign-off Brief',
    round: 3,
    totalRounds: 3,
    status: 'review',
    riskLevel: 'low',
    riskScore: 3.3,
    precedentMatch: 96,
    lastUpdated: '2 days ago',
    arrValue: '$950k ARR',
    leadCounsel: 'Elena Rostova',
    pendingRedlinesCount: 1,
  },
];

export const MOCK_CLAUSES: ContractClause[] = [
  {
    id: 'clause-11-2',
    section: '§ 11.2',
    title: 'Limitation of Liability & Data Breach Super-Cap',
    originalText:
      'Neither party shall be liable for indirect, punitive, or consequential damages. Each party’s total aggregate liability arising under this Agreement shall be strictly capped at twelve (12) months of fees paid by Customer.',
    counterpartyText:
      'Neither party shall be liable for indirect damages, except that Provider’s total aggregate liability for all claims arising out of data protection breaches shall be uncapped and subject to unlimited indemnification without exclusion.',
    conformedProposal:
      'Except for gross negligence, willful misconduct, or unauthorized disclosure of confidential data, each party’s aggregate liability shall not exceed two times (2x) the total fees paid or payable in the twelve (12) months preceding the claim.',
    riskLevel: 'high',
    riskScore: 9.4,
    precedentAlignment: 94,
    status: 'pending',
    rationale:
      'Counterparty demands uncapped liability for data breach. Conformed language introduces a 2x ARR super-cap aligned with 88% of SEC EDGAR Fortune 500 SaaS precedents.',
    secEdgarCitation: 'SEC Edgar Exhibit 10.42 (CrowdStrike 2024 10-K / Snowflake MSA benchmark)',
  },
  {
    id: 'clause-14-1',
    section: '§ 14.1',
    title: 'Intellectual Property & Model Weights Ownership',
    originalText:
      'Customer retains all right, title, and interest in Customer Data. Provider retains all rights in the Service and underlying machine learning models.',
    counterpartyText:
      'Customer shall solely own all derivative works, fine-tuned weights, embeddings, and telemetry artifacts generated during Customer’s utilization of the platform.',
    conformedProposal:
      'Customer retains exclusive ownership of Customer Data and Customer Outputs. Provider retains sole ownership of pre-existing models, general algorithms, and aggregate non-identifiable telemetry.',
    riskLevel: 'moderate',
    riskScore: 6.2,
    precedentAlignment: 91,
    status: 'agreed',
    rationale:
      'Compromise language preserves customer ownership of raw outputs while safeguarding core foundation architecture against IP confiscation.',
    secEdgarCitation: 'SEC Edgar Exhibit 10.18 (Palantir Enterprise Commercial Terms)',
  },
  {
    id: 'clause-8-3',
    section: '§ 8.3',
    title: 'Payment Terms & Disputed Invoice Withholding',
    originalText:
      'All undisputed invoices are payable net thirty (30) days from invoice date.',
    counterpartyText:
      'Invoices shall be payable net ninety (90) days, and Customer may withhold up to 50% of monthly fees pending resolution of service level inquiries.',
    conformedProposal:
      'Customer shall pay undisputed invoices net forty-five (45) days. In the event of a good-faith dispute, Customer may withhold only the specifically disputed amount while remitting all undisputed portions.',
    riskLevel: 'low',
    riskScore: 3.8,
    precedentAlignment: 97,
    status: 'agreed',
    rationale:
      'Accepted 45-day commercial compromise in exchange for counterparty concession on SLA liquidated damage caps.',
    secEdgarCitation: 'SEC Edgar Exhibit 10.9 (Salesforce Standard Enterprise Master Agreement)',
  },
  {
    id: 'clause-16-4',
    section: '§ 16.4',
    title: 'Governing Law & Dispute Resolution Venue',
    originalText:
      'This Agreement shall be governed by Delaware law and adjudicated exclusively in Wilmington, Delaware Chancery Court.',
    counterpartyText:
      'This Agreement shall be governed by the laws of Texas with binding unilateral arbitration held in Austin, Texas.',
    conformedProposal:
      'This Agreement shall be governed by the laws of the State of Delaware, without regard to conflicts of law principles. Any dispute shall be resolved through binding JAMS arbitration held in New York, NY.',
    riskLevel: 'low',
    riskScore: 2.9,
    precedentAlignment: 95,
    status: 'agreed',
    rationale:
      'Neutral Delaware law preserved with neutral NYC arbitration venue agreeable to both enterprise parties.',
    secEdgarCitation: 'Delaware Chancery Court Approved Standard Forum Protocol',
  },
];

export const MOCK_ACTIVITY_FEED: ActivityFeedItem[] = [
  {
    id: 'act-1',
    timestamp: '8m ago',
    actor: 'Agent Counsel Core v4.8',
    action: 'Synthesized Conformed Clause § 11.2',
    matterId: '2025-INT-809',
    details: 'Derived 2.0x ARR liability compromise calibrated against 34 peer SEC EDGAR filings.',
    type: 'autonomous',
  },
  {
    id: 'act-2',
    timestamp: '24m ago',
    actor: 'Apex Dynamics Counsel',
    action: 'Inbound Redline Received',
    matterId: '2025-INT-809',
    details: 'Marked up § 11.2 (Liability), § 14.1 (IP Ownership), § 8.3 (Payment Terms).',
    type: 'manual',
  },
  {
    id: 'act-3',
    timestamp: '1h ago',
    actor: 'Elena Rostova (General Counsel)',
    action: 'Signed Executive Report #REC-8842',
    matterId: '2025-DPA-104',
    details: 'Executed bilateral sign-off with Novartis Global Digital. Cryptographic seal deployed.',
    type: 'signing',
  },
  {
    id: 'act-4',
    timestamp: '2h ago',
    actor: 'Risk Engine Monitor',
    action: 'Super-Cap Breach Warning Triggered',
    matterId: '2025-IP-312',
    details: 'Aetherion AI Labs demanded uncapped intellectual property indemnity.',
    type: 'alert',
  },
];

export const MOCK_PROCESSING_QUEUE: ProcessingQueueItem[] = [
  {
    id: 'proc-1',
    matterId: '2025-INT-809',
    docketNumber: 'DOCKET #2025-INT-809',
    step: 'Synthesizing conformed fallback for Section 11.2',
    progress: 78,
    status: 'synthesizing',
    eta: '2m remaining',
  },
  {
    id: 'proc-2',
    matterId: '2025-MSA-409',
    docketNumber: 'DOCKET #2025-MSA-409',
    step: 'Extracting bilateral redlines from DOCX markup',
    progress: 95,
    status: 'analyzing',
    eta: '30s remaining',
  },
  {
    id: 'proc-3',
    matterId: '2025-IP-312',
    docketNumber: 'DOCKET #2025-IP-312',
    step: 'Benchmarking against 48,000 SEC EDGAR precedents',
    progress: 42,
    status: 'analyzing',
    eta: '5m remaining',
  },
];

export const MOCK_TEAM: TeamMember[] = [
  {
    id: 'team-1',
    name: 'Elena Rostova',
    email: 'elena.rostova@enterprise-legal.com',
    role: 'General Counsel & Partner',
    department: 'Executive Legal Ops',
    authorityLevel: 'Level 4 (Uncapped ARR Signer)',
    mfaStatus: 'hardware_mfa',
    lastActive: 'Active Now',
    status: 'active',
  },
  {
    id: 'team-2',
    name: 'Marcus Vance',
    email: 'marcus.vance@enterprise-legal.com',
    role: 'Deputy General Counsel',
    department: 'Commercial Transactions',
    authorityLevel: 'Level 3 ($5M ARR Threshold)',
    mfaStatus: 'hardware_mfa',
    lastActive: '14m ago',
    status: 'active',
  },
  {
    id: 'team-3',
    name: 'Sofia Chen',
    email: 'sofia.chen@enterprise-legal.com',
    role: 'Senior Legal Counsel (IP & Tech)',
    department: 'IP & Regulatory',
    authorityLevel: 'Level 2 ($2M ARR Threshold)',
    mfaStatus: 'hardware_mfa',
    lastActive: '1h ago',
    status: 'active',
  },
  {
    id: 'team-4',
    name: 'David K. Thorne',
    email: 'david.thorne@enterprise-legal.com',
    role: 'Contracts Manager & Ops Lead',
    department: 'Legal Operations',
    authorityLevel: 'Level 1 ($500k ARR Threshold)',
    mfaStatus: 'app_mfa',
    lastActive: '3h ago',
    status: 'active',
  },
  {
    id: 'team-5',
    name: 'Claire Beauchamp',
    email: 'claire.b@enterprise-legal.com',
    role: 'External Outside Counsel (Latham)',
    department: 'Securities & M&A',
    authorityLevel: 'Review Only (Dual-Key Required)',
    mfaStatus: 'hardware_mfa',
    lastActive: 'Yesterday',
    status: 'active',
  },
];

export const DEFAULT_AI_SETTINGS: AISettingsConfig = {
  foundationModel: 'Negotia Lex-Ultra v4.2 (48,000+ SEC EDGAR Precedents Fine-Tuned)',
  temperatureMode: 'Strict Deterministic (0.05 Temp - Zero Drift)',
  varianceCeiling: 18.5,
  autoCounterRedlines: true,
  partnerSuperCapEscalation: true,
  conformedConsensusPush: true,
  autonomousDispatch: false,
  adversarialStrategyDetection: true,
  displayMode: 'parchment',
};
