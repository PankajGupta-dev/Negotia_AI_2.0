import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { FairnessGauge } from '../components/FairnessGauge';
import { Button } from '../components/Button';
import { RiskChip } from '../components/RiskChip';
import { LedgerTable, ColumnDef } from '../components/LedgerTable';
import { MOCK_CLAUSES, ContractClause } from '../data/mock';
import {
  getReport,
  submitReview,
  sealReport,
  ReportResponse,
} from '../services/api';

export const Reports: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reportOrMatterId = id || '2025-INT-809';

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
        console.warn('Backend report API unavailable, using fallback data:', err);
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
        counselName: 'Elena Rostova',
        comments: 'Approved by General Counsel following multi-agent convergence.',
      });

      setReviewStatus('approved');
      // CRITICAL CONSTRAINT: The approval button must never directly perform cryptographic sealing on frontend.
      // The backend controls approval and sealing.
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
        counselName: 'Elena Rostova',
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
        counselName: 'Elena Rostova',
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
        counselName: 'Elena Rostova',
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
      : MOCK_CLAUSES;

  const reportColumns: ColumnDef<ContractClause>[] = [
    {
      key: 'section',
      title: 'Clause §',
      render: (c) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-primary">{c.section}</span>
          <span className="font-headline-md text-xs font-semibold text-on-surface line-clamp-1">
            {c.title}
          </span>
        </div>
      ),
    },
    {
      key: 'conformedProposal',
      title: 'Final Conformed Language',
      render: (c) => (
        <p className="font-contract-clause text-xs text-on-surface-variant line-clamp-2 max-w-md italic">
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
        <span className="font-mono text-xs font-semibold text-secondary">
          {c.precedentAlignment}%
        </span>
      ),
    },
  ];

  const executiveSummary =
    reportData?.executiveSummary ||
    (reportData as any)?.executive_summary ||
    'Following three iterative counterparty redline cycles, Negotia AI has converged with Apex Dynamics outside legal counsel on a mutually approved conformed draft. Key compromises establish a 2.0x ARR liability super-cap for data protection breaches while retaining Net 45 payment terms and sole ownership of pre-existing model architectures.';

  const metrics = (reportData as any)?.metrics;
  const turnaroundMinutes =
    metrics?.turnaroundTimeMinutes ||
    metrics?.turnaround_time_minutes ||
    reportData?.counselSavings?.actualAiMinutes ||
    18;
  const savingsAmount =
    metrics?.counselCostSaved ||
    metrics?.counsel_cost_saved ||
    reportData?.counselSavings?.effectiveCostSavingsUsd ||
    28500;

  const auditHash =
    reportData?.attestationHash ||
    (reportData as any)?.attestation_hash ||
    (reportData as any)?.auditDigest ||
    (reportData as any)?.audit_digest ||
    (reportData as any)?.blockDigest ||
    (reportData as any)?.block_digest ||
    '0x8f22e8d9c0919b4412...';

  return (
    <div className="w-full bg-surface-container-low px-space-base md:px-space-xl py-space-lg flex justify-center min-h-screen selection:bg-primary-container selection:text-on-surface">
      {/* Central Parchment Document Folio */}
      <div className="w-full max-w-[62rem] bg-surface-container-lowest text-on-surface border border-outline-variant/40 shadow-2xl rounded overflow-hidden pb-space-3xl mb-space-3xl relative">
        {/* Toast Notification Banner */}
        {actionNotification && (
          <div className="px-space-lg py-2 bg-[#DCFCE7] border-b border-[#86EFAC] text-[#166534] font-mono text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">info</span>
            <span>{actionNotification}</span>
          </div>
        )}

        {/* 1. DOCKET OVERLINE BANNER */}
        <div className="bg-surface-container-low text-on-surface px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-xs text-label-sm font-mono tracking-widest uppercase border-b border-outline-variant/30">
          <div className="flex items-center gap-space-sm min-w-0">
            <span className="w-2 h-2 rounded-full bg-primary-container shrink-0" />
            <span className="truncate font-bold tracking-wider text-primary">
              MATTER DOSSIER: DOCKET #{reportData?.docketNumber || (reportData as any)?.docket_number || reportOrMatterId}
            </span>
            <span className="text-outline-variant">/</span>
            <span className="text-on-surface-variant truncate">
              APEX DYNAMICS CORP. × VELOCE SYSTEMS INC.
            </span>
          </div>
          <div className="flex items-center gap-space-md shrink-0">
            <span className="bg-surface-container-high text-primary font-semibold px-2 py-0.5 rounded border border-primary/20">
              FINAL SIGN-OFF BRIEF
            </span>
            <span className="text-secondary font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              STAGE 4 CONCLUDED
            </span>
          </div>
        </div>

        {/* 2. FORMAL PUBLICATION MASTHEAD */}
        <div className="px-space-xl pt-space-xl pb-space-lg">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pb-space-base">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center gap-space-xs">
                <span className="font-mono text-label-sm tracking-widest text-primary uppercase font-bold">
                  Negotia Autonomous Legal Dossier
                </span>
                <span className="text-outline-variant">•</span>
                <span className="font-mono text-label-sm text-outline tracking-wider uppercase">
                  Confidential / Work Product
                </span>
              </div>
              <h1 className="font-headline-xl text-3xl sm:text-4xl text-on-surface font-serif tracking-tight leading-none">
                Executive Negotiation Report
              </h1>
              <p className="font-headline-md text-base text-primary font-serif italic">
                Matter #{reportData?.matterId || (reportData as any)?.matter_id || reportOrMatterId} · Enterprise Master Services Agreement
              </p>
            </div>

            {/* Publication Credentials Block */}
            <div className="flex flex-col items-start md:items-end text-label-sm font-mono space-y-1 text-outline">
              <div>
                <span className="uppercase text-on-surface font-semibold">Date: </span>
                <span>
                  {reportData?.createdAt
                    ? new Date(reportData.createdAt).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'October 24, 2025 · 16:40 EST'}
                </span>
              </div>
              <div>
                <span className="uppercase text-on-surface font-semibold">Lead Counsel: </span>
                <span>
                  {reportData?.sealedBy || (reportData as any)?.sealed_by || 'Elena Rostova (General Counsel)'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="bg-secondary-container/30 text-secondary border border-secondary/30 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">
                  SEC EDGAR Indexed
                </span>
                <span className="bg-primary-container/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">
                  SOC-2 Cryptosealed
                </span>
              </div>
            </div>
          </div>

          {/* Intaglio Hairline Separation Rule */}
          <div className="w-full h-px bg-outline-variant/30 my-space-md" />

          {/* 3. SYNTHESIS & EQUILIBRIUM RING GRID */}
          {(() => {
            const fairnessIndex = reportData?.fairnessIndex ?? reportData?.fairness_index ?? 94;
            const leverageScore = reportData?.leverageScore ?? reportData?.leverage_score ?? 6.8;
            const acceptancePct = reportData?.counterpartyAcceptancePct ?? reportData?.counterparty_acceptance_pct ?? 91.5;
            const equilibriumLabel = reportData?.equilibriumLabel ?? reportData?.equilibrium_label ?? 'Strong Nash Equilibrium';
            const isPareto = reportData?.isParetoOptimal ?? reportData?.is_pareto_optimal ?? true;

            return (
              <div className="space-y-space-md pt-space-xs">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
                  {/* Left: Editorial Synthesis */}
                  <div className="lg:col-span-7 flex flex-col justify-between space-y-space-sm pr-0 lg:pr-space-md">
                    <div className="space-y-space-xs">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-xl">
                          verified_user
                        </span>
                        <span className="font-mono text-label-sm tracking-widest text-outline uppercase font-semibold">
                          Autonomous Synthesis & Settlement Verdict
                        </span>
                      </div>
                      <h2 className="font-headline-md text-2xl text-on-surface font-serif">
                        Consensus Reached on Master Bilateral Terms
                      </h2>
                      <p className="font-body-md text-on-surface-variant text-sm leading-relaxed">
                        {executiveSummary}
                      </p>
                    </div>

                    <div className="pt-3 flex flex-wrap items-center gap-space-sm font-mono text-xs text-outline border-t border-outline-variant/20">
                      <span>Cycle Time: <strong>{turnaroundMinutes} minutes</strong></span>
                      <span>•</span>
                      <span>Outside Counsel Savings: <strong>${typeof savingsAmount === 'number' ? savingsAmount.toLocaleString() : savingsAmount}</strong></span>
                      <span>•</span>
                      <span className="text-secondary font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                        Zero Exposure Drift
                      </span>
                    </div>
                  </div>

                  {/* Right: Circular Equilibrium Ring & Live Metrics Panel */}
                  <div className="lg:col-span-5 bg-surface-container-low p-space-md rounded-lg border border-outline-variant/30 flex flex-col items-center justify-between space-y-space-sm">
                    <FairnessGauge
                      value={fairnessIndex}
                      size={140}
                      label="Pareto Conformance"
                      sublabel="Nash Equilibrium Index"
                    />

                    {/* Real-Time Metrics Row */}
                    <div className="w-full grid grid-cols-3 gap-2 pt-2 border-t border-outline-variant/30 text-center font-mono text-xs">
                      <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/20">
                        <span className="text-[10px] text-outline uppercase block">Leverage</span>
                        <span className="font-bold text-primary text-sm">{leverageScore} / 10</span>
                      </div>
                      <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/20">
                        <span className="text-[10px] text-outline uppercase block">Acceptance</span>
                        <span className="font-bold text-secondary text-sm">{acceptancePct}%</span>
                      </div>
                      <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/20">
                        <span className="text-[10px] text-outline uppercase block">Status</span>
                        <span className="font-bold text-on-surface text-[11px] truncate block">
                          {isPareto ? 'Pareto Opt.' : 'Sub-Optimal'}
                        </span>
                      </div>
                    </div>

                    <div className="w-full text-center bg-primary-container/20 border border-primary/30 rounded py-1 px-2 font-mono text-[11px] text-primary font-semibold uppercase tracking-wider">
                      {equilibriumLabel}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 4. CONCESSIONS LEDGER TABLE */}
          <div className="mt-space-xl space-y-space-sm">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <h3 className="font-headline-md text-lg text-on-surface font-semibold">
                Settled Clause Concessions Ledger
              </h3>
              <span className="font-mono text-xs text-outline">
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
              <div className="mt-space-md p-space-md bg-surface-container-low rounded border border-outline-variant/30 space-y-space-xs">
                <span className="font-mono text-xs uppercase tracking-wider text-primary font-semibold block">
                  Arbiter-3 Bilateral Compromise Strategies
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {reportData.keyBilateralCompromises.map((kbc: any, idx: number) => (
                    <div key={idx} className="p-2 bg-surface-container-lowest rounded border border-outline-variant/20 font-mono text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-on-surface">{kbc.title || kbc.clauseId}</span>
                        <span className="text-[10px] bg-secondary-container/40 text-secondary px-1.5 py-0.5 rounded font-bold uppercase">
                          {kbc.strategy}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant font-sans line-clamp-2 italic">
                        "{kbc.conformedProposal}"
                      </p>
                      <div className="flex justify-between text-[10px] text-outline pt-1 border-t border-outline-variant/10">
                        <span>Party A Utility: <strong className="text-primary">{kbc.partyAUtility}</strong></span>
                        <span>Party B Utility: <strong className="text-secondary">{kbc.partyBUtility}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 5. HUMAN REVIEW GATE (AGENT 4) */}
          <div className="mt-space-2xl p-space-lg bg-surface-container-lowest rounded border-l-[3px] border-l-primary border-y border-r border-outline-variant/30 space-y-space-md shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">
                  gavel
                </span>
                <h3 className="font-headline-md text-base font-bold text-on-surface">
                  AGENT 4 — AWAITING HUMAN REVIEW
                </h3>
              </div>

              {/* Status Badge */}
              {reviewStatus === 'pending' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-container/20 text-primary border border-primary/40 rounded font-mono text-xs uppercase tracking-wider font-semibold">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
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
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-container/30 text-primary border border-primary/50 rounded font-mono text-xs uppercase tracking-wider font-semibold">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                  REVISION REQUESTED — Agent 4 Re-generating...
                </span>
              )}

              {reviewStatus === 'escalated' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] rounded font-mono text-xs uppercase tracking-wider font-semibold">
                  <span className="material-symbols-outlined text-[16px] text-error">
                    warning
                  </span>
                  ESCALATED TO HUMAN COUNSEL — Elena Rostova notified
                </span>
              )}
            </div>

            <p className="font-body-md text-xs text-on-surface-variant">
              Agent 4 (Scrivener-4) has synthesized all bilateral compromises into the conformed draft above. Under enterprise legal governance, human counsel must review and ratify before cryptographic attestation.
            </p>

            {/* Revision Progress Bar if revision requested */}
            {reviewStatus === 'revision_requested' && (
              <div className="w-full bg-surface-container-high rounded h-2 overflow-hidden border border-outline-variant/30">
                <div
                  className="bg-primary h-full transition-all duration-150"
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
                  variant="ghost"
                  size="sm"
                  icon="person_alert"
                  className="text-error hover:bg-error-container/20"
                  onClick={handleEscalate}
                  disabled={isSubmittingReview}
                >
                  Escalate to Human Counsel
                </Button>
              </div>
            )}
          </div>

          {/* 6. CRYPTOGRAPHIC SIGN-OFF & ATTESTATION BLOCK */}
          <div className="mt-space-2xl p-space-lg bg-surface-container-low rounded border border-outline-variant/30 space-y-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold">
                Cryptographic Attestation & Sovereign Seal
              </span>
              <span className="font-mono text-xs text-secondary flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">lock</span>
                Hardware Key Validated
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg items-center">
              {/* General Counsel Signature Box */}
              <div className="p-space-base bg-surface-container-lowest rounded border border-outline-variant/20 space-y-2">
                <span className="font-mono text-[10px] text-outline uppercase block">
                  Lead Counsel Attestation:
                </span>
                <div className="font-serif italic text-xl text-on-surface h-10 flex items-center">
                  {signed ? 'Elena Rostova, General Counsel' : 'Awaiting Sign-off'}
                </div>
                <div className="text-xs font-mono text-outline pt-1 border-t border-outline-variant/20 flex justify-between">
                  <span>Timestamp: Oct 24, 2025 16:42:19 EST</span>
                  <span>MFA: YubiKey 5C</span>
                </div>
              </div>

              {/* Wax Seal Verification Stamp */}
              <div className="flex items-center gap-space-md p-space-base bg-surface-container-lowest rounded border border-outline-variant/20">
                <WaxSealLogo size={48} pulse={signed} />
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-xs font-bold text-primary uppercase">
                    Negotia Cryptoseal Verified
                  </span>
                  <span className="font-mono text-[10px] text-outline truncate">
                    SHA-256: {auditHash}
                  </span>
                  <span className="font-mono text-[10px] text-secondary font-semibold mt-0.5">
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

