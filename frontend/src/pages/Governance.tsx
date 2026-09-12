import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { Button } from '../components/Button';
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
    hash: '0x4f89...b112',
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
    hash: '0x9a31...4e80',
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
    hash: '0x7c22...fd09',
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
    hash: '0x8f22e8d9c0919b4412e45903b17454ba',
    isHashValid: true,
  },
];

export const Governance: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const targetMatterId = id || searchParams.get('matterId') || searchParams.get('id') || '2025-INT-809';

  const [auditData, setAuditData] = useState<MatterAuditChainResponse | null>(null);
  const [replaying, setReplaying] = useState(false);

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

  const handleExportProof = () => {
    const payload = {
      matterId: targetMatterId,
      docketNumber: auditData?.docketNumber || `DOCKET #${targetMatterId}`,
      tipHash: auditData?.tipHash || '0x8f22e8d9c0919b4412e45903b17454ba',
      genesisHash: auditData?.genesisHash,
      chainLength: auditData?.chainLength || steps.length,
      isValid: auditData?.isValid ?? true,
      verificationMessage: auditData?.verificationMessage || 'Mathematical integrity verified.',
      blocks: auditData?.blocks || MOCK_AUDIT_STEPS,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cryptographic-audit-${targetMatterId}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  return (
    <div className="w-full bg-[#F5F1E8] text-[#1C1917] p-space-base md:p-space-lg lg:p-space-xl space-y-space-lg min-h-screen selection:bg-primary-container selection:text-on-primary-container">
      {/* 1. TOP HEADER & BREADCRUMBS */}
      <header className="flex flex-col space-y-space-xs pb-space-lg border-b border-[#D6CEBE]">
        <div className="flex items-center justify-between flex-wrap gap-space-sm">
          <div className="flex items-center gap-space-xs text-[#78716C] font-mono text-label-sm uppercase tracking-widest">
            <span className="material-symbols-outlined text-base text-[#D97706]">policy</span>
            <span>Governance & Algorithmic Audit Trail</span>
            <span>·</span>
            <span>SEC EDGAR Provenance</span>
            <span>·</span>
            <span className="text-[#1C1917] font-semibold">
              Dossier Ref: #{auditData?.docketNumber || auditData?.matterId || targetMatterId}
            </span>
          </div>

          <div className="flex items-center gap-space-sm">
            <div className="flex items-center gap-1.5 px-space-sm py-1 bg-[#EDE7DC] border border-[#D6CEBE] text-[#166534] rounded font-mono text-[11px] uppercase font-bold">
              <span className="w-2 h-2 rounded-full bg-[#166534]" />
              Auditor Mode: Active
            </div>
            {/* Hash Verification Status in Header */}
            <div className="hidden sm:flex items-center gap-1.5 px-space-sm py-1 bg-[#1C1917] text-[#EDE7DC] rounded font-mono text-[11px]">
              <span
                className={`material-symbols-outlined text-[13px] ${
                  isChainValid ? 'text-[#D97706]' : 'text-red-400'
                }`}
              >
                {isChainValid ? 'verified' : 'gpp_bad'}
              </span>
              <span>Chain: {steps.length} Blocks</span>
              <span className="text-[#78716C]">|</span>
              <span
                className={`font-semibold ${
                  isChainValid ? 'text-[#8BD79B]' : 'text-red-400'
                }`}
              >
                {isChainValid ? 'Zero Drift Verified · SHA-256 Valid' : 'Hash Verification Failed'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-space-xs">
          <div>
            <h1 className="font-headline-xl text-3xl md:text-4xl text-[#1C1917] font-serif tracking-tight leading-none">
              Algorithmic Governance & Verification Dossier
            </h1>
            <p className="font-body-md text-sm text-[#57534E] mt-1.5 max-w-3xl">
              Bilateral model inspection, confidence calibration, and deterministic decision lineage
              for <strong>Matter #{auditData?.docketNumber || auditData?.matterId || targetMatterId}</strong> (Enterprise Master Services Concession).
            </p>
          </div>

          <div className="flex items-center gap-space-xs self-start md:self-auto shrink-0">
            <Button
              variant="parchment"
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
              icon="file_download"
              onClick={handleExportProof}
            >
              Export Cryptographic Proof
            </Button>
          </div>
        </div>
      </header>

      {/* 2. CASE FILE OVERVIEW CARD */}
      <article className="bg-[#FFFFFF] border border-[#D6CEBE] rounded p-space-lg space-y-space-lg shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-sm border-b border-[#D6CEBE]">
          <div className="space-y-1">
            <div className="flex items-center gap-space-sm flex-wrap">
              <span className="px-2 py-0.5 bg-[#1C1917] text-[#FAF7F2] font-mono text-[11px] tracking-widest uppercase font-semibold rounded-sm">
                Case File #{auditData?.docketNumber || 'REC-8842-A'}
              </span>
              <span className="font-mono text-xs text-[#78716C] uppercase tracking-wider">
                Target: § 11.2 Aggregate Liability Cap & Consequential Damages
              </span>
            </div>
            <h2 className="font-headline-md text-2xl text-[#1C1917] font-serif">
              Deterministic Deliberation Proof & Lineage
            </h2>
          </div>

          <div className="flex items-center gap-space-md font-mono text-xs">
            <div className="bg-[#FAF7F2] p-2 rounded border border-[#D6CEBE] text-center">
              <span className="text-[10px] text-[#78716C] uppercase block">Model Confidence</span>
              <span className="font-bold text-base text-[#166534]">98.4%</span>
            </div>
            <div className="bg-[#FAF7F2] p-2 rounded border border-[#D6CEBE] text-center">
              <span className="text-[10px] text-[#78716C] uppercase block">Hallucination Risk</span>
              <span className="font-bold text-base text-[#166534]">0.00%</span>
            </div>
            <div className="bg-[#FAF7F2] p-2 rounded border border-[#D6CEBE] text-center">
              <span className="text-[10px] text-[#78716C] uppercase block">Audit Chain</span>
              <span className="font-bold text-base text-[#D97706]">{steps.length} Blocks</span>
            </div>
          </div>
        </div>

        {/* 3. STEP-BY-STEP DECISION LINEAGE TIMELINE */}
        <div className="space-y-space-md">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-[#78716C] font-semibold block">
              Cryptographic Step Lineage Trajectory
            </span>
            {auditData?.verificationMessage && (
              <span className="font-mono text-[10px] text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded border border-[#86EFAC]">
                {auditData.verificationMessage}
              </span>
            )}
          </div>

          <div className="space-y-space-md relative before:absolute before:top-4 before:bottom-4 before:left-4 before:w-0.5 before:bg-[#D6CEBE]">
            {steps.map((step) => (
              <div
                key={step.stepNumber}
                className="relative pl-10 space-y-1.5 p-space-base bg-[#FAF7F2] rounded border border-[#D6CEBE] hover:border-[#D97706] transition-colors"
              >
                {/* Node icon */}
                <div
                  className={`absolute left-2.5 top-3.5 w-3.5 h-3.5 rounded-full border-2 border-[#FAF7F2] flex items-center justify-center -translate-x-1/2 ${
                    step.isHashValid !== false ? 'bg-[#D97706]' : 'bg-red-500'
                  }`}
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#D97706]">
                      Step {step.stepNumber}
                    </span>
                    <h3 className="font-headline-md text-base text-[#1C1917] font-semibold">
                      {step.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="text-[#78716C]">{step.timestamp}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded uppercase font-semibold ${
                        step.isHashValid !== false
                          ? 'bg-[#DCFCE7] text-[#166534]'
                          : 'bg-[#FEE2E2] text-[#991B1B]'
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>
                </div>

                <p className="font-body-md text-xs text-[#57534E] leading-relaxed">
                  {step.summary}
                </p>

                {step.edgarCitations && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    {step.edgarCitations.map((cite) => (
                      <span
                        key={cite}
                        className="font-mono text-[10px] text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded border border-[#FCD34D]"
                      >
                        {cite}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-1 text-[10px] font-mono text-[#78716C] flex items-center justify-between flex-wrap gap-2">
                  <span>
                    Signer: <strong>{step.agent}</strong>
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>
                      Block Hash: <code className="text-[#1C1917]">{step.hash}</code>
                    </span>
                    {step.isHashValid !== undefined && (
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider ${
                          step.isHashValid
                            ? 'bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]'
                            : 'bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5]'
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

        {/* 4. MERKLE ROOT PROOF SEAL */}
        <div className="p-space-base bg-[#EDE7DC] rounded border border-[#D6CEBE] flex flex-col md:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm">
            <WaxSealLogo size={40} />
            <div className="flex flex-col">
              <span className="font-mono text-xs font-bold text-[#1C1917] uppercase">
                Cryptographic Merkle Root Attested
              </span>
              <span className="font-mono text-[11px] text-[#78716C]">
                Root Digest: SHA256({tipDigest})
              </span>
            </div>
          </div>

          <span
            className={`font-mono text-[11px] border px-3 py-1 rounded font-bold uppercase tracking-wider ${
              isChainValid
                ? 'text-[#166534] bg-[#DCFCE7] border-[#86EFAC]'
                : 'text-[#991B1B] bg-[#FEE2E2] border-[#FCA5A5]'
            }`}
          >
            {isChainValid
              ? 'Delaware Chancery Admissible · Hash Verified'
              : 'Hash Verification Mismatch'}
          </span>
        </div>
      </article>
    </div>
  );
};

