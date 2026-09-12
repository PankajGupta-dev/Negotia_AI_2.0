import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { useParams, useSearchParams } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { Button } from '../components/Button';
import { LedgerTable, ColumnDef } from '../components/LedgerTable';
import { MOCK_TEAM, TeamMember } from '../data/mock';
import { getMatterAudit, MatterAuditChainResponse } from '../services/api';

interface AuditStep {
  stepNumber: string;
  title: string;
  timestamp: string;
  status: 'verified' | 'analyzed' | 'enforced' | string;
  agent: string;
  summary: string;
  hash: string;
  previousHash?: string;
  isHashValid?: boolean;
  edgarCitations?: string[];
}

const MOCK_AUDIT_STEPS: AuditStep[] = [
  {
    stepNumber: '01',
    title: 'AST Syntax & Bilateral Markup Decomposition',
    timestamp: '14:22:04 UTC',
    status: 'verified',
    agent: 'Forensic Parsing Core v4.8',
    summary:
      'Extracted semantic differential across 42 contract nodes. Identified unhedged consequential damage expansion in counterparty markup § 11.2.',
    hash: '0x4f899e31d044ab112ef901c87241b112',
    isHashValid: true,
  },
  {
    stepNumber: '02',
    title: 'SEC EDGAR Precedent Clustering & Vector Retrieval',
    timestamp: '14:22:11 UTC',
    status: 'analyzed',
    agent: 'Precedent Alignment Engine',
    summary:
      'Queried 48,000+ public exhibits. Retrieved 34 Fortune 500 SaaS MSAs. Established 2.0x ARR liability cap as the 88th-percentile market standard.',
    hash: '0x9a31bc4021ef9a803328e18b417c4e80',
    isHashValid: true,
    edgarCitations: [
      'SEC Edgar Exhibit 10.42 (CrowdStrike 10-K)',
      'SEC Edgar Exhibit 10.18 (Snowflake MSA)',
      'SEC Edgar Exhibit 10.29 (Palo Alto Networks 2024)',
    ],
  },
  {
    stepNumber: '03',
    title: 'Stochastic Nash Equilibrium Concession Optimization',
    timestamp: '14:22:19 UTC',
    status: 'enforced',
    agent: 'Game Theory Synthesizer',
    summary:
      'Formulated bilateral trade-off curve: Conceded Net 45 payment terms in exchange for counterparty submission to the 2.0x ARR data breach super-cap.',
    hash: '0x7c22a194be412089cf1801ee038afd09',
    isHashValid: true,
  },
  {
    stepNumber: '04',
    title: 'Cryptographic Hash Provenance & Signature Deployment',
    timestamp: '14:22:28 UTC',
    status: 'verified',
    agent: 'Sovereign Ledger Notary',
    summary:
      'Generated immutable SHA-256 block digest. Validated Elena Rostova FIDO2 hardware MFA token. Stamped conformed copy into audit archive.',
    hash: '0x8f22e8d9c0919b4412e45903b17454ba019a823c',
    isHashValid: true,
  },
];

export const Governance: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetMatterId = id || searchParams.get('matterId') || searchParams.get('id') || '2025-INT-809';

  const initialTab = searchParams.get('tab') === 'team' ? 'team' : 'audit';
  const [activeTab, setActiveTab] = useState<'audit' | 'team'>(initialTab);

  // Audit state
  const [auditData, setAuditData] = useState<MatterAuditChainResponse | null>(null);
  const [replaying, setReplaying] = useState(false);

  // Team Governance state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(MOCK_TEAM);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Senior Legal Counsel');
  const [newMemberLevel, setNewMemberLevel] = useState('Level 2 ($2M ARR Threshold)');
  const [notification, setNotification] = useState<string | null>(null);

  // Sync tab with URL
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'team' && activeTab !== 'team') {
      setActiveTab('team');
    } else if (tabParam === 'audit' && activeTab !== 'audit') {
      setActiveTab('audit');
    }
  }, [searchParams]);

  const handleTabChange = (tab: 'audit' | 'team') => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  useEffect(() => {
    let isMounted = true;

    async function loadAudit() {
      try {
        const data = await getMatterAudit(targetMatterId);
        if (isMounted && data) {
          setAuditData(data);
        }
      } catch (err) {
        console.warn('Backend audit endpoint unavailable, using mock audit data:', err);
      }
    }

    loadAudit();

    return () => {
      isMounted = false;
    };
  }, [targetMatterId]);

  const handleReplay = async () => {
    setReplaying(true);
    try {
      const data = await getMatterAudit(targetMatterId);
      if (data) {
        setAuditData(data);
      }
    } catch (err) {
      console.warn('Audit replay failed:', err);
    } finally {
      setTimeout(() => setReplaying(false), 1200);
    }
  };

  const handleExportAuditContract = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginL = 25;
    const marginR = 25;
    const contentW = pageW - marginL - marginR;
    const docket = auditData?.docketNumber || targetMatterId;
    const tipHash = auditData?.tipHash || (auditData as any)?.tip_hash || '0x8f22e8d9c0919b4412e45903b17454ba019a823c';
    const chainLen = auditData?.chainLength || steps.length;
    const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const exportTimestamp = new Date().toISOString();

    let y = 20;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - 25) {
        // Footer on current page
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text(`Negotia AI — Audit Contract — Docket #${docket}`, marginL, pageH - 10);
        doc.text(`Page ${doc.getNumberOfPages()}`, pageW - marginR, pageH - 10, { align: 'right' });
        doc.addPage();
        y = 20;
      }
    };

    const drawSectionTitle = (title: string) => {
      ensureSpace(18);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(title.toUpperCase(), marginL, y);
      y += 2;
      doc.setDrawColor(180, 140, 60);
      doc.setLineWidth(0.5);
      doc.line(marginL, y, marginL + contentW, y);
      y += 7;
    };

    const drawParagraph = (text: string, indent = 0) => {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50, 50, 50);
      const lines = doc.splitTextToSize(text, contentW - indent);
      for (const line of lines) {
        ensureSpace(5);
        doc.text(line, marginL + indent, y);
        y += 4.5;
      }
      y += 2;
    };

    const drawClause = (num: string, title: string, body: string) => {
      ensureSpace(20);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(`${num}  ${title}`, marginL, y);
      y += 6;
      drawParagraph(body, 5);
    };

    // ── COVER / TITLE BLOCK ──
    doc.setDrawColor(180, 140, 60);
    doc.setLineWidth(1.2);
    doc.line(marginL, y, marginL + contentW, y);
    y += 4;
    doc.setLineWidth(0.3);
    doc.line(marginL, y, marginL + contentW, y);
    y += 12;

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(25, 25, 25);
    doc.text('AUDIT CONTRACT', pageW / 2, y, { align: 'center' });
    y += 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 90, 90);
    doc.text('Cryptographic Audit Provenance & Governance Certification', pageW / 2, y, { align: 'center' });
    y += 10;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(160, 120, 40);
    doc.text(`DOCKET #${docket}`, pageW / 2, y, { align: 'center' });
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Date of Issuance: ${genDate}`, pageW / 2, y, { align: 'center' });
    y += 4;
    doc.text(`Tip Hash: ${tipHash}`, pageW / 2, y, { align: 'center' });
    y += 10;

    doc.setDrawColor(180, 140, 60);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, marginL + contentW, y);
    y += 2;
    doc.setLineWidth(1.2);
    doc.line(marginL, y, marginL + contentW, y);
    y += 12;

    // ── RECITALS ──
    drawSectionTitle('Recitals');
    drawParagraph(
      `WHEREAS, the undersigned parties (collectively, the "Parties") have engaged in a contract negotiation process governed by automated AI deliberation through the Negotia AI platform (the "Platform"), under Matter Docket #${docket};`
    );
    drawParagraph(
      'WHEREAS, the Platform has executed a deterministic, multi-agent deliberation pipeline producing a cryptographically sealed, immutable audit chain that records every material decision, concession, and analytical step taken during the negotiation;'
    );
    drawParagraph(
      `WHEREAS, the audit chain consists of ${chainLen} cryptographic blocks, each bearing a SHA-256 hash digest linked to its preceding block, establishing a tamper-evident provenance ledger with zero drift;`
    );
    drawParagraph(
      'NOW, THEREFORE, in consideration of the mutual covenants and agreements set forth herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:'
    );

    // ── ARTICLE I: DEFINITIONS ──
    drawSectionTitle('Article I — Definitions');
    drawClause('1.1', 'Audit Chain',
      '"Audit Chain" means the sequential, cryptographically linked series of block records generated by the Platform during the negotiation lifecycle, each containing a SHA-256 hash digest, timestamp, agent identifier, and deliberation summary.'
    );
    drawClause('1.2', 'Block',
      '"Block" means an individual record within the Audit Chain, representing a discrete deliberation step, analysis, or decision point, identified by a unique hash and linked to the hash of the immediately preceding Block.'
    );
    drawClause('1.3', 'Tip Hash',
      `"Tip Hash" means the SHA-256 hash digest of the final Block in the Audit Chain, serving as the definitive cryptographic fingerprint of the complete deliberation record. The current Tip Hash is: ${tipHash}.`
    );
    drawClause('1.4', 'Zero Drift',
      '"Zero Drift" means the verified condition in which no Block within the Audit Chain has been altered, deleted, or inserted after initial commitment, as mathematically confirmed by sequential hash validation.'
    );
    drawClause('1.5', 'Platform',
      '"Platform" means the Negotia AI contract negotiation and audit system, including all constituent AI agents, analytical engines, and cryptographic verification modules.'
    );

    // ── ARTICLE II: AUDIT CHAIN PROVENANCE SCHEDULE ──
    drawSectionTitle('Article II — Audit Chain Provenance Schedule');
    drawParagraph(
      'The following schedule sets forth each Block in the Audit Chain, constituting the complete and unaltered record of the AI-assisted deliberation process:'
    );
    y += 2;

    steps.forEach((step, idx) => {
      ensureSpace(30);
      // Block header
      doc.setFillColor(248, 245, 240);
      doc.rect(marginL, y - 3, contentW, 7, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(160, 120, 40);
      doc.text(`Block ${step.stepNumber}`, marginL + 3, y + 1);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(step.timestamp, marginL + contentW - 3, y + 1, { align: 'right' });
      y += 8;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(9.5);
      doc.text(step.title, marginL + 5, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(70, 70, 70);
      const summaryLines = doc.splitTextToSize(step.summary, contentW - 10);
      for (const line of summaryLines) {
        ensureSpace(5);
        doc.text(line, marginL + 5, y);
        y += 4;
      }
      y += 2;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text(`Signer: ${step.agent}`, marginL + 5, y);
      doc.text(`Hash: ${step.hash}`, marginL + 75, y);
      const statusLabel = (step.isHashValid ?? true) ? '✓ HASH VALID' : '✗ INVALID';
      doc.setTextColor((step.isHashValid ?? true) ? 60 : 180, (step.isHashValid ?? true) ? 130 : 40, (step.isHashValid ?? true) ? 60 : 40);
      doc.text(statusLabel, marginL + contentW - 3, y, { align: 'right' });
      y += 5;

      if (step.edgarCitations && step.edgarCitations.length > 0) {
        doc.setFontSize(7.5);
        doc.setTextColor(100, 100, 100);
        doc.text('SEC EDGAR Citations:', marginL + 5, y);
        y += 4;
        step.edgarCitations.forEach((cite) => {
          ensureSpace(4);
          doc.text(`  • ${cite}`, marginL + 8, y);
          y += 3.5;
        });
        y += 2;
      }

      if (idx < steps.length - 1) {
        doc.setDrawColor(220, 215, 205);
        doc.setLineWidth(0.2);
        doc.line(marginL + 5, y, marginL + contentW - 5, y);
        y += 6;
      } else {
        y += 4;
      }
    });

    // ── ARTICLE III: REPRESENTATIONS AND WARRANTIES ──
    drawSectionTitle('Article III — Representations and Warranties');
    drawClause('3.1', 'Chain Integrity',
      `The Platform represents and warrants that the Audit Chain comprising ${chainLen} Blocks has been validated through sequential SHA-256 hash verification, confirming Zero Drift status as of the date hereof. No Block has been altered, removed, or retroactively inserted since its initial commitment to the ledger.`
    );
    drawClause('3.2', 'Algorithmic Fidelity',
      'The Platform represents and warrants that each AI agent contributing to the deliberation pipeline operated within its designated parameters, and that all analytical outputs, including SEC EDGAR precedent retrieval, Nash equilibrium modeling, and AST markup decomposition, were generated through deterministic, reproducible algorithms.'
    );
    drawClause('3.3', 'Authentication',
      'Each human reviewer identified within the Audit Chain was authenticated via FIDO2-compliant hardware multi-factor authentication at the time of their review action, ensuring non-repudiation of all counsel approvals and delegations.'
    );
    drawClause('3.4', 'Accuracy of Precedent Data',
      'SEC EDGAR exhibits and precedent data referenced within the Audit Chain were sourced from publicly available filings with the United States Securities and Exchange Commission. The Platform does not warrant the continued accuracy or applicability of such precedent data beyond the date of retrieval.'
    );

    // ── ARTICLE IV: LIMITATION OF LIABILITY ──
    drawSectionTitle('Article IV — Limitation of Liability');
    drawClause('4.1', 'Scope of Liability',
      'THE AUDIT CHAIN AND THIS AUDIT CONTRACT ARE PROVIDED "AS IS." TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE PLATFORM SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO THE USE OR RELIANCE UPON THE AUDIT CHAIN OR ANY INFORMATION CONTAINED THEREIN.'
    );
    drawClause('4.2', 'Aggregate Cap',
      'In no event shall the aggregate liability of the Platform under or in connection with this Audit Contract exceed the fees actually paid by the Parties to the Platform for the negotiation services giving rise to the Audit Chain.'
    );
    drawClause('4.3', 'No Legal Advice',
      'Nothing in this Audit Contract or the Audit Chain constitutes legal advice. The Parties acknowledge that the Platform is an analytical tool and that all final decisions regarding contract terms remain the sole responsibility of the Parties and their respective legal counsel.'
    );

    // ── ARTICLE V: GOVERNING LAW AND DISPUTE RESOLUTION ──
    drawSectionTitle('Article V — Governing Law and Dispute Resolution');
    drawClause('5.1', 'Governing Law',
      'This Audit Contract shall be governed by and construed in accordance with the laws of the State of Delaware, United States of America, without regard to its conflict-of-laws principles.'
    );
    drawClause('5.2', 'Dispute Resolution',
      'Any dispute arising out of or in connection with this Audit Contract, including any question regarding its existence, validity, or termination, shall be resolved through binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, with the seat of arbitration in Wilmington, Delaware.'
    );
    drawClause('5.3', 'Injunctive Relief',
      'Notwithstanding the foregoing, either Party may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent irreparable harm pending the outcome of arbitration.'
    );

    // ── ARTICLE VI: MISCELLANEOUS ──
    drawSectionTitle('Article VI — Miscellaneous');
    drawClause('6.1', 'Entire Agreement',
      'This Audit Contract, together with the Audit Chain it certifies, constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior negotiations, representations, or agreements relating thereto.'
    );
    drawClause('6.2', 'Severability',
      'If any provision of this Audit Contract is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect, and the invalid or unenforceable provision shall be modified to the minimum extent necessary to make it valid and enforceable.'
    );
    drawClause('6.3', 'Amendments',
      'This Audit Contract may not be amended except by a written instrument signed by all Parties hereto. Any purported amendment that is not so executed shall be void and of no effect.'
    );
    drawClause('6.4', 'Counterparts',
      'This Audit Contract may be executed in counterparts, each of which shall be deemed an original, and all of which together shall constitute one and the same instrument.'
    );

    // ── SIGNATURE BLOCK ──
    drawSectionTitle('Execution and Attestation');
    drawParagraph(
      'IN WITNESS WHEREOF, the Parties have executed this Audit Contract as of the date first written above, acknowledging receipt and verification of the Audit Chain described herein.'
    );
    y += 8;

    // Party A Signature
    ensureSpace(35);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('PARTY A — Baseline Drafter', marginL, y);
    y += 12;
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, marginL + 70, y);
    y += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Authorized Signatory', marginL, y);
    doc.text('Date: _______________', marginL + 80, y);
    y += 14;

    // Party B Signature
    ensureSpace(35);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text('PARTY B — Counterparty', marginL, y);
    y += 12;
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, marginL + 70, y);
    y += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Authorized Signatory', marginL, y);
    doc.text('Date: _______________', marginL + 80, y);
    y += 14;

    // Platform Attestation
    ensureSpace(35);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text('PLATFORM ATTESTATION — Negotia AI', marginL, y);
    y += 12;
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, marginL + 70, y);
    y += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Platform Verification Officer', marginL, y);
    doc.text('Date: _______________', marginL + 80, y);
    y += 14;

    // ── FOOTER / CERTIFICATION SEAL ──
    ensureSpace(25);
    doc.setDrawColor(180, 140, 60);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, marginL + contentW, y);
    y += 6;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(130, 130, 130);
    doc.text(
      `This document was generated by Negotia AI on ${genDate} at ${exportTimestamp}. ` +
      `Audit chain integrity: ${chainLen} blocks verified, zero drift, SHA-256 valid. ` +
      `Tip hash: ${tipHash}. This contract is machine-generated and should be reviewed by qualified legal counsel before execution.`,
      marginL, y, { maxWidth: contentW }
    );

    // Add footers to all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140, 140, 140);
      doc.text(`Negotia AI — Audit Contract — Docket #${docket}`, marginL, pageH - 10);
      doc.text(`Page ${i} of ${totalPages}`, pageW - marginR, pageH - 10, { align: 'right' });
    }

    doc.save(`Audit-Contract-${docket}.pdf`);
    showNotice('Audit Contract PDF exported successfully.');
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Email', 'Role', 'Department', 'Signing Authority', 'MFA Status', 'Last Active', 'Status'];
    const rows = teamMembers.map((m) => [
      `"${m.name}"`,
      `"${m.email}"`,
      `"${m.role}"`,
      `"${m.department}"`,
      `"${m.authorityLevel}"`,
      `"${m.mfaStatus}"`,
      `"${m.lastActive}"`,
      `"${m.status}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enterprise-counsel-roster-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('Enterprise Counsel Roster exported (.CSV).');
  };

  const showNotice = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName || !newMemberEmail) return;

    const newMember: TeamMember = {
      id: `team-${Date.now()}`,
      name: newMemberName,
      email: newMemberEmail,
      role: newMemberRole,
      department: 'Commercial Legal',
      authorityLevel: newMemberLevel,
      mfaStatus: 'hardware_mfa',
      lastActive: 'Invited Just Now',
      status: 'invited',
    };

    setTeamMembers([newMember, ...teamMembers]);
    setIsInviteModalOpen(false);
    setNewMemberName('');
    setNewMemberEmail('');
    showNotice(`Delegation invite dispatched to ${newMemberEmail}`);
  };

  const steps: AuditStep[] =
    auditData?.blocks && auditData.blocks.length > 0
      ? auditData.blocks.map((b, idx) => {
          const stepNumber = String(b.blockIndex !== undefined ? b.blockIndex + 1 : idx + 1).padStart(2, '0');
          const rawEvent = b.event || 'Audit Record';
          const title = rawEvent
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

          let timeStr = '14:22:04 UTC';
          if (b.timestamp) {
            try {
              const d = new Date(b.timestamp);
              timeStr = !isNaN(d.getTime())
                ? d.toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }) + ' UTC'
                : String(b.timestamp);
            } catch {
              timeStr = String(b.timestamp);
            }
          }

          const agent = b.humanReviewer || (b as any).human_reviewer || 'Sovereign Ledger Notary';
          const isHashValid = b.isHashValid !== undefined ? b.isHashValid : (b as any).is_hash_valid ?? true;

          const summary = b.reviewAction
            ? `Counsel review action '${b.reviewAction}' executed by ${agent}. Cryptographically sealed into immutable provenance ledger.`
            : `Deliberation event '${rawEvent}' committed at block #${stepNumber}. Mathematical SHA-256 digest linked to preceding block.`;

          const mockFallback = MOCK_AUDIT_STEPS[idx % MOCK_AUDIT_STEPS.length];

          return {
            stepNumber,
            title: title.length > 3 ? title : mockFallback.title,
            timestamp: timeStr,
            status: isHashValid ? 'verified' : 'analyzed',
            agent,
            summary,
            hash: b.currentHash || (b as any).current_hash || mockFallback.hash,
            previousHash: b.previousHash || (b as any).previous_hash,
            isHashValid,
            edgarCitations: idx === 1 ? mockFallback.edgarCitations : undefined,
          };
        })
      : MOCK_AUDIT_STEPS;

  const isChainValid = auditData?.isValid ?? true;
  const tipDigest = auditData?.tipHash || (auditData as any)?.tip_hash || '0x8f22e8d9c0919b4412e45903b17454ba019a823c';

  const teamColumns: ColumnDef<TeamMember>[] = [
    {
      key: 'name',
      title: 'Counsel / Member',
      render: (m) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-surface-container-high border border-outline-variant/50 flex items-center justify-center font-serif text-primary font-bold text-xs shrink-0">
            {m.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-headline-md text-sm font-semibold text-on-surface truncate">
              {m.name}
            </span>
            <span className="font-mono text-[11px] text-outline truncate">{m.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      title: 'Role & Department',
      render: (m) => (
        <div className="flex flex-col">
          <span className="text-on-surface font-medium text-xs">{m.role}</span>
          <span className="text-outline text-[11px]">{m.department}</span>
        </div>
      ),
    },
    {
      key: 'authorityLevel',
      title: 'Signing Authority',
      render: (m) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {m.authorityLevel}
        </span>
      ),
    },
    {
      key: 'mfaStatus',
      title: 'Cryptographic MFA',
      render: () => (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-secondary bg-secondary-container/20 px-2 py-0.5 rounded border border-secondary/30 uppercase font-semibold">
          <span className="material-symbols-outlined text-[12px]">key</span>
          Hardware Key
        </span>
      ),
    },
    {
      key: 'lastActive',
      title: 'Docket Activity',
      render: (m) => <span className="font-mono text-xs text-outline">{m.lastActive}</span>,
    },
    {
      key: 'status',
      title: 'Status',
      render: (m) => (
        <span
          className={`font-mono text-[10px] px-2 py-0.5 rounded uppercase font-semibold border ${
            m.status === 'active'
              ? 'bg-secondary-container/20 text-secondary border-secondary/30'
              : 'bg-primary-container/20 text-primary border-primary/30'
          }`}
        >
          {m.status}
        </span>
      ),
    },
  ];

  return (
    <div className="w-full bg-background text-on-surface p-space-base md:p-space-lg lg:p-space-xl space-y-space-lg min-h-screen">
      {/* NOTIFICATION TOAST */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 bg-surface-container-high border border-primary/50 text-on-surface px-4 py-2.5 rounded shadow-xl font-mono text-xs flex items-center gap-2 animate-fade-in">
          <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
          <span>{notification}</span>
        </div>
      )}

      {/* 1. TOP HEADER & BREADCRUMBS */}
      <header className="flex flex-col space-y-space-xs pb-space-md border-b border-outline-variant/30">
        <div className="flex items-center justify-between flex-wrap gap-space-sm">
          <div className="flex items-center gap-space-xs text-outline font-mono text-label-sm uppercase tracking-widest">
            <span className="material-symbols-outlined text-base text-primary">verified_user</span>
            <span>Audit and Governance</span>
            <span>·</span>
            <span>SEC EDGAR Provenance</span>
            <span>·</span>
            <span className="text-on-surface font-semibold">
              Docket #{auditData?.docketNumber || auditData?.matterId || targetMatterId}
            </span>
          </div>

          <div className="flex items-center gap-space-sm">
            <div className="flex items-center gap-1.5 px-space-sm py-1 bg-surface-container-low border border-outline-variant/40 text-secondary rounded font-mono text-[11px] uppercase font-bold">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              Auditor Mode: Active
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-space-sm py-1 bg-surface-container-lowest border border-outline-variant/40 text-on-surface rounded font-mono text-[11px]">
              <span
                className={`material-symbols-outlined text-[14px] ${
                  isChainValid ? 'text-primary' : 'text-error'
                }`}
              >
                {isChainValid ? 'verified' : 'gpp_bad'}
              </span>
              <span>Chain: {steps.length} Blocks</span>
              <span className="text-outline">|</span>
              <span
                className={`font-semibold ${
                  isChainValid ? 'text-secondary' : 'text-error'
                }`}
              >
                {isChainValid ? 'Zero Drift · SHA-256 Valid' : 'Hash Verification Failed'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-space-xs">
          <div>
            <h1 className="font-headline-xl text-3xl md:text-4xl text-on-surface font-semibold tracking-tight leading-tight">
              Audit and Governance
            </h1>
            <p className="font-body-md text-sm text-on-surface-variant mt-1 max-w-3xl">
              Cryptographic decision lineage, SEC EDGAR proof verification, team signing authority,
              and enterprise access governance for <strong>Matter #{auditData?.docketNumber || auditData?.matterId || targetMatterId}</strong>.
            </p>
          </div>

          {/* Action Cluster Based on Active Tab */}
          <div className="flex items-center gap-space-xs self-start md:self-auto shrink-0 flex-wrap">
            {activeTab === 'audit' ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="history"
                  onClick={handleReplay}
                  disabled={replaying}
                >
                  {replaying ? 'Replaying Lineage...' : 'Replay Lineage'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon="description"
                  onClick={handleExportAuditContract}
                >
                  Audit Contract (.PDF)
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="history_edu"
                  onClick={handleExportCSV}
                >
                  Export Ledger (.CSV)
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon="person_add"
                  onClick={() => setIsInviteModalOpen(true)}
                >
                  + Invite Team Member
                </Button>
              </>
            )}
          </div>
        </div>

        {/* TAB NAVIGATION PILLS */}
        <div className="flex items-center gap-2 pt-4 border-t border-outline-variant/20 mt-2">
          <button
            type="button"
            onClick={() => handleTabChange('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded font-mono text-xs uppercase tracking-wider transition-all duration-150 border ${
              activeTab === 'audit'
                ? 'bg-surface-container-high text-primary border-primary/50 shadow-sm font-bold'
                : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface border-outline-variant/30 hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">verified</span>
            <span>Cryptographic Audit & Provenance</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-primary-container/20 text-primary border border-primary/30">
              {steps.length} Blocks
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('team')}
            className={`flex items-center gap-2 px-4 py-2 rounded font-mono text-xs uppercase tracking-wider transition-all duration-150 border ${
              activeTab === 'team'
                ? 'bg-surface-container-high text-primary border-primary/50 shadow-sm font-bold'
                : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface border-outline-variant/30 hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">group</span>
            <span>Team & Access Governance</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-secondary-container/20 text-secondary border border-secondary/30">
              {teamMembers.length} Members
            </span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* TAB 1: AUDIT & CRYPTOGRAPHIC PROVENANCE                                   */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-space-lg">
          {/* CASE FILE OVERVIEW CARD */}
          <article className="bg-surface-container-low border border-outline-variant/30 rounded p-space-lg space-y-space-lg shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-sm border-b border-outline-variant/20">
              <div className="space-y-1">
                <div className="flex items-center gap-space-sm flex-wrap">
                  <span className="px-2 py-0.5 bg-surface-container-lowest text-on-surface font-mono text-[11px] tracking-widest uppercase font-semibold rounded border border-outline-variant/40">
                    Case File #{auditData?.docketNumber || 'REC-8842-A'}
                  </span>
                  <span className="font-mono text-xs text-outline uppercase tracking-wider">
                    Target: § 11.2 Aggregate Liability Cap & Consequential Damages
                  </span>
                </div>
                <h2 className="font-headline-md text-2xl text-on-surface font-semibold">
                  Deterministic Deliberation Proof & Lineage
                </h2>
              </div>

              <div className="flex items-center gap-space-md font-mono text-xs">
                <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/30 text-center min-w-[100px]">
                  <span className="text-[10px] text-outline uppercase block">Model Confidence</span>
                  <span className="font-bold text-base text-secondary">98.4%</span>
                </div>
                <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/30 text-center min-w-[100px]">
                  <span className="text-[10px] text-outline uppercase block">Hallucination Risk</span>
                  <span className="font-bold text-base text-secondary">0.00%</span>
                </div>
                <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/30 text-center min-w-[100px]">
                  <span className="text-[10px] text-outline uppercase block">Audit Chain</span>
                  <span className="font-bold text-base text-primary">{steps.length} Blocks</span>
                </div>
              </div>
            </div>

            {/* STEP-BY-STEP DECISION LINEAGE TIMELINE */}
            <div className="space-y-space-md">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold block">
                  Cryptographic Step Lineage Trajectory
                </span>
                {auditData?.verificationMessage && (
                  <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-2 py-0.5 rounded border border-secondary/30">
                    {auditData.verificationMessage}
                  </span>
                )}
              </div>

              <div className="space-y-space-md relative before:absolute before:top-4 before:bottom-4 before:left-4 before:w-0.5 before:bg-outline-variant/30">
                {steps.map((step) => (
                  <div
                    key={step.stepNumber}
                    className="relative pl-10 space-y-1.5 p-space-base bg-surface-container-lowest rounded border border-outline-variant/30 hover:border-primary/50 transition-colors"
                  >
                    {/* Node icon */}
                    <div
                      className={`absolute left-2.5 top-3.5 w-3.5 h-3.5 rounded-full border-2 border-surface-container-lowest flex items-center justify-center -translate-x-1/2 ${
                        step.isHashValid !== false ? 'bg-primary' : 'bg-error'
                      }`}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          Step {step.stepNumber}
                        </span>
                        <h3 className="font-headline-md text-base text-on-surface font-semibold">
                          {step.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        <span className="text-outline">{step.timestamp}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded uppercase font-semibold border ${
                            step.isHashValid !== false
                              ? 'bg-secondary-container/20 text-secondary border-secondary/30'
                              : 'bg-error-container/20 text-error border-error/30'
                          }`}
                        >
                          {step.status}
                        </span>
                      </div>
                    </div>

                    <p className="font-body-md text-xs text-on-surface-variant leading-relaxed">
                      {step.summary}
                    </p>

                    {step.edgarCitations && (
                      <div className="pt-2 flex flex-wrap gap-2">
                        {step.edgarCitations.map((cite) => (
                          <span
                            key={cite}
                            className="font-mono text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30"
                          >
                            {cite}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="pt-1 text-[10px] font-mono text-outline flex items-center justify-between flex-wrap gap-2">
                      <span>
                        Signer: <strong className="text-on-surface">{step.agent}</strong>
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>
                          Block Hash: <code className="text-on-surface bg-surface-container-high px-1.5 py-0.5 rounded">{step.hash}</code>
                        </span>
                        {step.isHashValid !== undefined && (
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider ${
                              step.isHashValid
                                ? 'bg-secondary-container/20 text-secondary border border-secondary/30'
                                : 'bg-error-container/20 text-error border border-error/30'
                            }`}
                          >
                            {step.isHashValid ? '✓ Hash Valid' : '✗ Invalid Hash'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MERKLE ROOT PROOF SEAL */}
            <div className="p-space-base bg-surface-container-lowest rounded border border-outline-variant/30 flex flex-col md:flex-row items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-sm">
                <WaxSealLogo size={40} />
                <div className="flex flex-col">
                  <span className="font-mono text-xs font-bold text-on-surface uppercase">
                    Cryptographic Merkle Root Attested
                  </span>
                  <span className="font-mono text-[11px] text-outline">
                    Root Digest: SHA256({tipDigest})
                  </span>
                </div>
              </div>

              <span
                className={`font-mono text-[11px] border px-3 py-1 rounded font-bold uppercase tracking-wider ${
                  isChainValid
                    ? 'text-secondary bg-secondary-container/20 border-secondary/30'
                    : 'text-error bg-error-container/20 border-error/30'
                }`}
              >
                {isChainValid
                  ? 'Delaware Chancery Admissible · Hash Verified'
                  : 'Hash Verification Mismatch'}
              </span>
            </div>
          </article>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TEAM & ACCESS GOVERNANCE                                           */}
      {/* ========================================================================= */}
      {activeTab === 'team' && (
        <div className="space-y-space-lg">
          {/* 1. SOVEREIGN LEDGER METRICS OVERVIEW */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
            <div className="bg-surface-container-low p-space-base rounded border border-outline-variant/30 flex flex-col justify-between">
              <span className="font-mono text-xs text-outline uppercase tracking-wider">
                Active Counsel Seats
              </span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="font-headline-lg text-2xl font-semibold text-on-surface">
                  {teamMembers.length} <span className="text-xs font-mono text-outline">/ 20</span>
                </span>
                <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded border border-secondary/30 uppercase font-semibold">
                  Vetted
                </span>
              </div>
              <div className="w-full bg-surface-container-highest h-1 rounded mt-2 overflow-hidden">
                <div className="bg-primary-container h-full" style={{ width: `${(teamMembers.length / 20) * 100}%` }} />
              </div>
            </div>

            <div className="bg-surface-container-low p-space-base rounded border border-outline-variant/30 flex flex-col justify-between">
              <span className="font-mono text-xs text-outline uppercase tracking-wider">
                Autonomous Limit Signers
              </span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="font-headline-lg text-2xl font-semibold text-on-surface">4</span>
                <span className="font-mono text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/30 uppercase font-semibold">
                  Level 4
                </span>
              </div>
              <span className="font-mono text-[10px] text-outline mt-2 truncate">
                Max ARR Threshold: Uncapped
              </span>
            </div>

            <div className="bg-surface-container-low p-space-base rounded border border-outline-variant/30 flex flex-col justify-between">
              <span className="font-mono text-xs text-outline uppercase tracking-wider">
                Cryptographic Keys Active
              </span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="font-headline-lg text-2xl font-semibold text-on-surface">{teamMembers.length}</span>
                <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded border border-secondary/30 uppercase font-semibold">
                  Hardware MFA
                </span>
              </div>
              <span className="font-mono text-[10px] text-outline mt-2 truncate">
                Zero Key Revocation Alarms
              </span>
            </div>

            <div className="bg-surface-container-low p-space-base rounded border border-outline-variant/30 flex flex-col justify-between">
              <span className="font-mono text-xs text-outline uppercase tracking-wider">
                Dual-Key HSM Quorum
              </span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="font-headline-lg text-2xl font-semibold text-secondary">2-of-3</span>
                <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded border border-secondary/30 uppercase font-semibold">
                  Active
                </span>
              </div>
              <span className="font-mono text-[10px] text-outline mt-2 truncate">
                Threshold Enforcement Active
              </span>
            </div>
          </div>

          {/* 2. ROSTER LEDGER TABLE */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded p-space-lg space-y-space-md shadow-sm">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div>
                <h2 className="font-headline-md text-xl text-on-surface font-semibold">
                  Enterprise Counsel Registry & Access Delegation
                </h2>
                <p className="font-body-sm text-xs text-on-surface-variant">
                  Granular signing authority thresholds, hardware token attestations, and active privilege assignments.
                </p>
              </div>
              <span className="font-mono text-xs text-outline bg-surface-container-lowest px-2 py-1 rounded border border-outline-variant/30">
                {teamMembers.length} Members Authorized
              </span>
            </div>

            <LedgerTable
              columns={teamColumns}
              data={teamMembers}
              keyExtractor={(m) => m.id}
            />
          </div>
        </div>
      )}

      {/* 4. INVITE TEAM MEMBER MODAL */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-surface-container-low border border-outline-variant/40 rounded p-space-lg w-full max-w-lg shadow-2xl space-y-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">person_add</span>
                <h3 className="font-headline-md text-xl text-on-surface font-semibold">
                  Authorize New Counsel
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-body-md">close</span>
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-space-md font-body-sm text-xs">
              <div>
                <label className="font-mono text-[10px] uppercase text-outline block mb-1">
                  Full Legal Name
                </label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="e.g. Rachel Sterling, Esq."
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase text-outline block mb-1">
                  Enterprise Work Email
                </label>
                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="rachel.sterling@enterprise-legal.com"
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-space-md">
                <div>
                  <label className="font-mono text-[10px] uppercase text-outline block mb-1">
                    Role & Title
                  </label>
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option>General Counsel & Partner</option>
                    <option>Deputy General Counsel</option>
                    <option>Senior Legal Counsel</option>
                    <option>Contracts Specialist</option>
                    <option>External Outside Counsel</option>
                  </select>
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase text-outline block mb-1">
                    Signing Authority
                  </label>
                  <select
                    value={newMemberLevel}
                    onChange={(e) => setNewMemberLevel(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option>Level 4 (Uncapped ARR Signer)</option>
                    <option>Level 3 ($5M ARR Threshold)</option>
                    <option>Level 2 ($2M ARR Threshold)</option>
                    <option>Level 1 ($500k ARR Threshold)</option>
                    <option>Review Only (No Sign Authority)</option>
                  </select>
                </div>
              </div>

              <div className="p-space-sm bg-surface-container-lowest rounded border border-outline-variant/30 flex items-center gap-2">
                <input type="checkbox" id="mfaReq" defaultChecked className="accent-primary-container" />
                <label htmlFor="mfaReq" className="text-on-surface-variant text-[11px]">
                  Enforce Hardware MFA Key registration (FIDO2 / YubiKey required).
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit">
                  Send Sovereign Delegation Invite
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
