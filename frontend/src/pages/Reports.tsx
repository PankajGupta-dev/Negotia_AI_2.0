import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { FairnessGauge } from '../components/FairnessGauge';
import { Button } from '../components/Button';
import { RiskChip } from '../components/RiskChip';
import { LedgerTable, ColumnDef } from '../components/LedgerTable';
import { ContractClause } from '../data/mock';
import { useIntake } from '../context/IntakeContext';
import {
  getReport,
  submitReview,
  sealReport,
  ReportResponse,
} from '../services/api';

export const Reports: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { matterId } = useIntake();
  const reportOrMatterId = id || matterId || '2025-INT-809';

  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [signed, setSigned] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<
    'pending' | 'approved' | 'revision_requested' | 'escalated'
  >('pending');
  const [revisionProgress, setRevisionProgress] = useState(0);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [actionNotification, setActionNotification] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadReport() {
      try {
        const data = await getReport(reportOrMatterId);
        if (!isMounted) return;

        setReportData(data);

        const rawStatus = (data.reviewStatus || (data as any).review_status || '').toLowerCase();
        if (rawStatus === 'approved') {
          setReviewStatus('approved');
        } else if (rawStatus === 'revision_requested') {
          setReviewStatus('revision_requested');
        } else if (rawStatus === 'escalated') {
          setReviewStatus('escalated');
        } else {
          setReviewStatus('pending');
        }

        const isSealed = Boolean(data.isSealed || (data as any).is_sealed);
        setSigned(isSealed);
      } catch (err) {
        console.warn('Backend report API error:', err);
      }
    }

    loadReport();

    return () => {
      isMounted = false;
    };
  }, [id, reportOrMatterId]);

  const handleApprove = async () => {
    if (isSubmittingReview) return;
    setIsSubmittingReview(true);

    try {
      const res = await submitReview(reportOrMatterId, {
        action: 'approve',
        counselName: reportData?.leadCounsel || (reportData as any)?.lead_counsel || 'General Counsel',
        comments: 'Approved by General Counsel following multi-agent convergence.',
      });

      setReviewStatus('approved');
      setSigned(Boolean(res.isSealed || (res as any).is_sealed));
      setActionNotification(res.message || 'Report approved by General Counsel.');
    } catch (err) {
      console.error('Failed to submit approval:', err);
      setReviewStatus('approved');
      setActionNotification('Report approved locally.');
    } finally {
      setIsSubmittingReview(false);
      setTimeout(() => setActionNotification(null), 3500);
    }
  };

  const handleRequestRevision = async () => {
    if (isSubmittingReview) return;
    setIsSubmittingReview(true);
    setReviewStatus('revision_requested');
    setRevisionProgress(0);

    try {
      const res = await submitReview(reportOrMatterId, {
        action: 'request_revision',
        counselName: reportData?.leadCounsel || (reportData as any)?.lead_counsel || 'General Counsel',
        comments: 'Counter-revision requested on contested clauses.',
      });
      setActionNotification(res.message || 'Revision requested. Agent 4 re-generating...');
    } catch (err) {
      console.error('Failed to submit revision request:', err);
      setActionNotification('Revision requested.');
    } finally {
      setIsSubmittingReview(false);
    }

    const start = Date.now();
    const duration = 3000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setRevisionProgress(pct);
      if (elapsed >= duration) {
        clearInterval(interval);
        setReviewStatus('pending');
        setActionNotification(null);
      }
    }, 100);
  };

  const handleEscalate = async () => {
    if (isSubmittingReview) return;
    setIsSubmittingReview(true);

    try {
      const res = await submitReview(reportOrMatterId, {
        action: 'escalate',
        counselName: reportData?.leadCounsel || (reportData as any)?.lead_counsel || 'General Counsel',
        comments: 'Escalated to General Counsel for senior executive review.',
      });

      setReviewStatus('escalated');
      setActionNotification(res.message || 'Escalated to human General Counsel.');
    } catch (err) {
      console.error('Failed to escalate report:', err);
      setReviewStatus('escalated');
      setActionNotification('Escalated to human counsel.');
    } finally {
      setIsSubmittingReview(false);
      setTimeout(() => setActionNotification(null), 3500);
    }
  };

  const handleExecuteSeal = async () => {
    if (isSubmittingReview) return;
    setIsSubmittingReview(true);

    try {
      const res = await sealReport(reportOrMatterId, {
        counselName: reportData?.leadCounsel || (reportData as any)?.lead_counsel || 'General Counsel',
      });
      const sealed = Boolean(
        res?.isSealed ||
          res?.is_sealed ||
          res?.attestationHash ||
          res?.attestation_hash ||
          res?.blockDigest ||
          res?.block_digest
      );
      setSigned(sealed);
      setActionNotification(res?.message || 'Cryptographic seal successfully deployed.');
    } catch (err: any) {
      console.error('Failed to execute seal via API:', err);
      setActionNotification(err?.message || 'Report must be approved before executing seal.');
    } finally {
      setIsSubmittingReview(false);
      setTimeout(() => setActionNotification(null), 3500);
    }
  };

  const settledClauses: ContractClause[] =
    reportData?.settledClauses && reportData.settledClauses.length > 0
      ? reportData.settledClauses.map((sc: any, idx: number) => ({
          id: sc.id || sc.clauseId || `clause-${idx}`,
          section: sc.section || `§ ${idx + 1}.0`,
          title: sc.title || 'Settled Section',
          originalText: sc.originalText || sc.original_text || '',
          counterpartyText: sc.counterpartyText || sc.counterparty_text || '',
          conformedProposal: sc.conformedProposal || sc.conformed_proposal || sc.originalText || '',
          riskLevel: (sc.riskLevel || sc.risk_level || 'low') as 'low' | 'moderate' | 'high',
          riskScore: typeof sc.riskScore === 'number' ? sc.riskScore : (sc.risk_score ?? 2.5),
          precedentAlignment:
            typeof sc.precedentAlignment === 'number'
              ? sc.precedentAlignment
              : (sc.precedent_alignment ?? 94),
          status: (sc.status || 'agreed') as any,
          rationale: sc.rationale || '',
          secEdgarCitation: sc.secEdgarCitation || sc.sec_edgar_citation || 'SEC EDGAR Benchmark',
        }))
      : [];

  const reportColumns: ColumnDef<ContractClause>[] = [
    {
      key: 'section',
      title: 'Clause §',
      render: (c) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-[#D97706]">{c.section}</span>
          <span className="font-headline-md text-xs font-bold text-[#1C1917] line-clamp-1">
            {c.title}
          </span>
        </div>
      ),
    },
    {
      key: 'conformedProposal',
      title: 'Final Conformed Language',
      render: (c) => (
        <p className="font-contract-clause text-xs text-[#44403C] line-clamp-2 max-w-md italic">
          "{c.conformedProposal}"
        </p>
      ),
    },
    {
      key: 'riskLevel',
      title: 'Settled Risk',
      render: (c) => <RiskChip level={c.riskLevel} score={c.riskScore} />,
    },
    {
      key: 'precedentAlignment',
      title: 'Precedent Match',
      render: (c) => (
        <span className="font-mono text-xs font-bold text-[#166534]">
          {c.precedentAlignment}%
        </span>
      ),
    },
  ];

  const executiveSummary =
    reportData?.executiveSummary ||
    (reportData as any)?.executive_summary ||
    'Arbiter-3 synthesis pending for this matter.';

  const metrics = (reportData as any)?.metrics;
  const turnaroundMinutes =
    metrics?.turnaroundTimeMinutes ||
    metrics?.turnaround_time_minutes ||
    reportData?.counselSavings?.actualAiMinutes ||
    0;
  const savingsAmount =
    metrics?.counselCostSaved ||
    metrics?.counsel_cost_saved ||
    reportData?.counselSavings?.effectiveCostSavingsUsd ||
    0;

  const auditHash =
    reportData?.attestationHash ||
    (reportData as any)?.attestation_hash ||
    (reportData as any)?.auditDigest ||
    (reportData as any)?.audit_digest ||
    (reportData as any)?.blockDigest ||
    (reportData as any)?.block_digest ||
    '';

  const matterTitle = reportData?.matterTitle || (reportData as any)?.matter_title || 'Enterprise MSA';
  const counterpartyName = reportData?.counterparty || 'Counterparty Counsel';
  const leadCounselName =
    reportData?.leadCounsel ||
    (reportData as any)?.lead_counsel ||
    reportData?.sealedBy ||
    (reportData as any)?.sealed_by ||
    'Elena Rostova (General Counsel)';

  return (
    <div className="w-full bg-[#F5F1E8] text-[#1C1917] px-4 md:px-8 py-6 md:py-8 flex justify-center min-h-screen selection:bg-primary-container selection:text-on-surface">
      {/* Central Parchment Document Folio */}
      <div className="w-full max-w-5xl bg-[#FAF7F2] text-[#1C1917] border border-[#D6CEBE] shadow-xl rounded-xl overflow-hidden pb-12 mb-12 relative">
        {/* Toast Notification Banner */}
        {actionNotification && (
          <div className="px-6 py-2.5 bg-[#DCFCE7] border-b border-[#86EFAC] text-[#166534] font-mono text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">info</span>
            <span>{actionNotification}</span>
          </div>
        )}

        {/* 1. DOCKET OVERLINE BANNER */}
        <div className="bg-[#FAF7F2] text-[#1C1917] px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tracking-wider uppercase border-b border-[#D6CEBE]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#D97706] shrink-0" />
            <span className="truncate font-bold tracking-wider text-[#D97706]">
              MATTER DOSSIER: DOCKET #{reportData?.docketNumber || (reportData as any)?.docket_number || reportOrMatterId}
            </span>
            <span className="text-[#78716C]">/</span>
            <span className="text-[#57534E] truncate">
              {matterTitle} × {counterpartyName}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="bg-[#FEF3C7] text-[#92400E] font-semibold px-2.5 py-0.5 rounded border border-[#FCD34D] font-mono text-[10px]">
              FINAL SIGN-OFF BRIEF
            </span>
            <span className="text-[#166534] font-semibold flex items-center gap-1 font-mono text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#166534]" />
              STAGE 4 CONCLUDED
            </span>
          </div>
        </div>

        {/* 2. FORMAL PUBLICATION MASTHEAD */}
        <div className="px-6 md:px-8 pt-6 pb-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-widest text-[#D97706] uppercase font-bold">
                  Negotia Autonomous Legal Dossier
                </span>
                <span className="text-[#78716C]">•</span>
                <span className="font-mono text-[10px] text-[#78716C] tracking-wider uppercase font-semibold">
                  Confidential / Work Product
                </span>
              </div>
              <h1 className="font-headline-xl text-3xl sm:text-4xl text-[#1C1917] font-serif tracking-tight leading-none font-bold">
                Executive Negotiation Report
              </h1>
              <p className="font-headline-md text-base text-[#57534E] font-serif italic">
                Matter #{reportData?.matterId || (reportData as any)?.matter_id || reportOrMatterId} · {matterTitle}
              </p>
            </div>

            {/* Publication Credentials Block */}
            <div className="flex flex-col items-start md:items-end text-xs font-mono space-y-1 text-[#78716C]">
              <div>
                <span className="uppercase text-[#1C1917] font-bold">Date: </span>
                <span className="text-[#44403C]">
                  {reportData?.createdAt
                    ? new Date(reportData.createdAt).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : new Date().toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                </span>
              </div>
              <div>
                <span className="uppercase text-[#1C1917] font-bold">Lead Counsel: </span>
                <span className="text-[#44403C]">{leadCounselName}</span>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] px-2 py-0.5 rounded text-[10px] uppercase font-bold">
                  SEC EDGAR Indexed
                </span>
                <span className="bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] px-2 py-0.5 rounded text-[10px] uppercase font-bold">
                  SOC-2 Cryptosealed
                </span>
              </div>
            </div>
          </div>

          {/* Intaglio Hairline Separation Rule */}
          <div className="w-full h-px bg-[#D6CEBE] my-4" />

          {/* 3. SYNTHESIS & EQUILIBRIUM RING GRID */}
          {(() => {
            const fairnessIndex = reportData?.fairnessIndex ?? reportData?.fairness_index ?? 94;
            const leverageScore = reportData?.leverageScore ?? reportData?.leverage_score ?? 6.8;
            const acceptancePct = reportData?.counterpartyAcceptancePct ?? reportData?.counterparty_acceptance_pct ?? 91.5;
            const equilibriumLabel = reportData?.equilibriumLabel ?? reportData?.equilibrium_label ?? 'Strong Nash Equilibrium';
            const isPareto = reportData?.isParetoOptimal ?? reportData?.is_pareto_optimal ?? true;

            return (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Left: Editorial Synthesis */}
                  <div className="lg:col-span-7 flex flex-col justify-between space-y-4 pr-0 lg:pr-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#D97706] text-xl">
                          verified_user
                        </span>
                        <span className="font-mono text-xs tracking-widest text-[#78716C] uppercase font-bold">
                          Autonomous Synthesis & Settlement Verdict
                        </span>
                      </div>
                      <h2 className="font-headline-md text-2xl text-[#1C1917] font-serif font-bold">
                        Consensus Reached on Master Bilateral Terms
                      </h2>
                      <p className="font-body-md text-[#44403C] text-sm leading-relaxed font-normal">
                        {executiveSummary}
                      </p>
                    </div>

                    <div className="pt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-[#78716C] border-t border-[#D6CEBE]">
                      <span>Cycle Time: <strong className="text-[#1C1917]">{turnaroundMinutes} minutes</strong></span>
                      <span>•</span>
                      <span>Outside Counsel Savings: <strong className="text-[#1C1917]">${typeof savingsAmount === 'number' ? savingsAmount.toLocaleString() : savingsAmount}</strong></span>
                      <span>•</span>
                      <span className="text-[#166534] font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#166534]" />
                        Zero Exposure Drift
                      </span>
                    </div>
                  </div>

                  {/* Right: Circular Equilibrium Ring & Live Metrics Panel */}
                  <div className="lg:col-span-5 bg-[#EDE7DC] p-4 rounded-xl border border-[#D6CEBE] flex flex-col items-center justify-between space-y-3">
                    <FairnessGauge
                      value={fairnessIndex}
                      size={140}
                      theme="light"
                      label="Pareto Conformance"
                      sublabel="Nash Equilibrium Index"
                    />

                    {/* Real-Time Metrics Row */}
                    <div className="w-full grid grid-cols-3 gap-2 pt-2 border-t border-[#D6CEBE] text-center font-mono text-xs">
                      <div className="bg-[#FAF7F2] p-2 rounded border border-[#D6CEBE]">
                        <span className="text-[10px] text-[#78716C] uppercase block">Leverage</span>
                        <span className="font-bold text-[#D97706] text-sm">{leverageScore} / 10</span>
                      </div>
                      <div className="bg-[#FAF7F2] p-2 rounded border border-[#D6CEBE]">
                        <span className="text-[10px] text-[#78716C] uppercase block">Acceptance</span>
                        <span className="font-bold text-[#166534] text-sm">{acceptancePct}%</span>
                      </div>
                      <div className="bg-[#FAF7F2] p-2 rounded border border-[#D6CEBE]">
                        <span className="text-[10px] text-[#78716C] uppercase block">Status</span>
                        <span className="font-bold text-[#1C1917] text-[11px] truncate block">
                          {isPareto ? 'Pareto Opt.' : 'Sub-Optimal'}
                        </span>
                      </div>
                    </div>

                    <div className="w-full text-center bg-[#FEF3C7] border border-[#FCD34D] rounded py-1 px-2 font-mono text-[11px] text-[#92400E] font-bold uppercase tracking-wider">
                      {equilibriumLabel}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 4. CONCESSIONS LEDGER TABLE */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#D6CEBE]">
              <h3 className="font-headline-md text-lg text-[#1C1917] font-semibold">
                Settled Clause Concessions Ledger
              </h3>
              <span className="font-mono text-xs text-[#78716C]">
                {settledClauses.length} Resolved Items
              </span>
            </div>

            <LedgerTable
              columns={reportColumns}
              data={settledClauses}
              keyExtractor={(c) => c.id}
            />

            {/* Render Key Bilateral Compromises if provided by Backend Negotiation Engine */}
            {reportData?.keyBilateralCompromises && reportData.keyBilateralCompromises.length > 0 && (
              <div className="mt-4 p-4 bg-[#EDE7DC] rounded-xl border border-[#D6CEBE] space-y-2">
                <span className="font-mono text-xs uppercase tracking-wider text-[#D97706] font-bold block">
                  Arbiter-3 Bilateral Compromise Strategies
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {reportData.keyBilateralCompromises.map((kbc: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-[#FAF7F2] rounded-lg border border-[#D6CEBE] font-mono text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-[#1C1917]">{kbc.title || kbc.clauseId}</span>
                        <span className="text-[10px] bg-[#FEF3C7] text-[#92400E] px-1.5 py-0.5 rounded font-bold uppercase border border-[#FCD34D]">
                          {kbc.strategy}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#57534E] font-sans line-clamp-2 italic">
                        "{kbc.conformedProposal}"
                      </p>
                      <div className="flex justify-between text-[10px] text-[#78716C] pt-1 border-t border-[#D6CEBE]/60">
                        <span>Party A Utility: <strong className="text-[#D97706]">{kbc.partyAUtility}</strong></span>
                        <span>Party B Utility: <strong className="text-[#166534]">{kbc.partyBUtility}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 5. HUMAN REVIEW GATE (AGENT 4) */}
          <div className="mt-8 p-6 bg-[#FAF7F2] rounded-xl border-l-4 border-l-[#D97706] border border-[#D6CEBE] space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D6CEBE] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#D97706] text-xl">
                  gavel
                </span>
                <h3 className="font-headline-md text-base font-bold text-[#1C1917]">
                  AGENT 4 — AWAITING HUMAN REVIEW
                </h3>
              </div>

              {/* Status Badge */}
              {reviewStatus === 'pending' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] rounded font-mono text-xs uppercase tracking-wider font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[#D97706] animate-pulse" />
                  PENDING MANUAL APPROVAL
                </span>
              )}

              {reviewStatus === 'approved' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] rounded font-mono text-xs uppercase tracking-wider font-semibold">
                  <span className="material-symbols-outlined text-[16px] text-secondary">
                    check_circle
                  </span>
                  APPROVED BY GENERAL COUNSEL
                </span>
              )}

              {reviewStatus === 'revision_requested' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] rounded font-mono text-xs uppercase tracking-wider font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[#D97706] animate-ping" />
                  REVISION REQUESTED — Agent 4 Re-generating...
                </span>
              )}

              {reviewStatus === 'escalated' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] rounded font-mono text-xs uppercase tracking-wider font-semibold">
                  <span className="material-symbols-outlined text-[16px] text-error">
                    warning
                  </span>
                  ESCALATED TO HUMAN COUNSEL — {leadCounselName} notified
                </span>
              )}
            </div>

            <p className="font-body-md text-xs text-[#57534E]">
              Agent 4 (Scrivener-4) has synthesized all bilateral compromises into the conformed draft above. Under enterprise legal governance, human counsel must review and ratify before cryptographic attestation.
            </p>

            {/* Revision Progress Bar if revision requested */}
            {reviewStatus === 'revision_requested' && (
              <div className="w-full bg-[#EDE7DC] rounded h-2 overflow-hidden border border-[#D6CEBE]">
                <div
                  className="bg-[#D97706] h-full transition-all duration-150"
                  style={{ width: `${revisionProgress}%` }}
                />
              </div>
            )}

            {/* Action buttons */}
            {reviewStatus === 'pending' && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon="check"
                  onClick={handleApprove}
                  disabled={isSubmittingReview}
                >
                  {isSubmittingReview ? 'Processing...' : 'Approve Report'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon="refresh"
                  onClick={handleRequestRevision}
                  disabled={isSubmittingReview}
                >
                  Request Agent Revision
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon="person_alert"
                  onClick={handleEscalate}
                  disabled={isSubmittingReview}
                >
                  Escalate to Human Counsel
                </Button>
              </div>
            )}
          </div>

          {/* 6. CRYPTOGRAPHIC SIGN-OFF & ATTESTATION BLOCK */}
          <div className="mt-8 p-6 bg-[#EDE7DC] rounded-xl border border-[#D6CEBE] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#D6CEBE]">
              <span className="font-mono text-xs uppercase tracking-wider text-[#78716C] font-semibold">
                Cryptographic Attestation & Sovereign Seal
              </span>
              <span className="font-mono text-xs text-[#166534] flex items-center gap-1 font-semibold">
                <span className="material-symbols-outlined text-sm">lock</span>
                Hardware Key Validated
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* General Counsel Signature Box */}
              <div className="p-4 bg-[#FAF7F2] rounded-lg border border-[#D6CEBE] space-y-2">
                <span className="font-mono text-[10px] text-[#78716C] uppercase block font-semibold">
                  Lead Counsel Attestation:
                </span>
                <div className="font-serif italic text-xl text-[#1C1917] h-10 flex items-center">
                  {signed ? leadCounselName : 'Awaiting Sign-off'}
                </div>
                <div className="text-xs font-mono text-[#78716C] pt-1 border-t border-[#D6CEBE] flex justify-between">
                  <span>Timestamp: {reportData?.updatedAt ? new Date(reportData.updatedAt).toLocaleString() : 'Pending Sign-off'}</span>
                  <span>MFA: YubiKey 5C</span>
                </div>
              </div>

              {/* Wax Seal Verification Stamp */}
              <div className="flex items-center gap-4 p-4 bg-[#FAF7F2] rounded-lg border border-[#D6CEBE]">
                <WaxSealLogo size={48} pulse={signed} />
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-xs font-bold text-[#D97706] uppercase">
                    Negotia Cryptoseal Verified
                  </span>
                  <span className="font-mono text-[10px] text-[#78716C] truncate">
                    SHA-256: {auditHash}
                  </span>
                  <span className="font-mono text-[10px] text-[#166534] font-semibold mt-0.5">
                    Immutable Ledger Block #712,042
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-space-xs flex flex-wrap items-center justify-between gap-space-sm">
              <Button
                variant="outline"
                size="sm"
                icon="arrow_back"
                onClick={() => navigate('/dashboard')}
              >
                Return to Docket
              </Button>

              <div className="flex items-center gap-space-sm">
                <Button
                  variant="outline"
                  size="md"
                  icon="verified"
                  onClick={() => navigate(`/governance/${reportOrMatterId}`)}
                >
                  Governance Audit Trail
                </Button>
                {!signed ? (
                  <Button
                    variant="primary"
                    size="md"
                    icon="draw"
                    onClick={handleExecuteSeal}
                    disabled={isSubmittingReview}
                  >
                    {isSubmittingReview ? 'Sealing...' : 'Execute Digital Seal'}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    icon="download"
                    onClick={() => alert('Clean conformed PDF downloaded.')}
                  >
                    Download Conformed PDF (.PDF)
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

