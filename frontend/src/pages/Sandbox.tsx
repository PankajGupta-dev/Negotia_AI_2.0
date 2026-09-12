import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FairnessGauge } from '../components/FairnessGauge';
import { Button } from '../components/Button';
import { RiskChip } from '../components/RiskChip';
import { runSandboxSimulation, SandboxSimulateResult } from '../services/api';

const Shimmer: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-block rounded animate-pulse bg-surface-container-highest ${className}`} aria-hidden="true" />
);

const DEFAULT_RESULT: SandboxSimulateResult = {
  fairness_index: 0,
  leverage_score: 0,
  counterparty_acceptance_pct: 0,
  is_pareto_optimal: false,
  equilibrium_label: '-',
  trajectory: [],
  recommendation: '',
  aggregate_compromise_score: 0,
  clause_scores: {},
};

export const Sandbox: React.FC = () => {
  const navigate = useNavigate();

  const [posture, setPosture] = useState<'aggressive' | 'balanced' | 'defensive'>('balanced');
  const [liabilityCap, setLiabilityCap] = useState(2.0);
  const [paymentTerms, setPaymentTerms] = useState(45);
  const [auditDays, setAuditDays] = useState(30);
  const [ipCarveout, setIpCarveout] = useState<'strict' | 'standard' | 'flexible'>('standard');

  const [result, setResult] = useState<SandboxSimulateResult>(DEFAULT_RESULT);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFirstResult, setHasFirstResult] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSimulation = useCallback(async (
    cap: number, terms: number, audit: number,
    ip: 'strict' | 'standard' | 'flexible',
    post: 'aggressive' | 'balanced' | 'defensive',
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await runSandboxSimulation({
        liability_cap: cap,
        payment_terms: terms,
        audit_days: audit,
        ip_carveout: ip,
        posture: post,
      });
      setResult(data);
      setHasFirstResult(true);
    } catch (err: any) {
      setError(err?.message ?? 'Simulation failed. Backend may be offline.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const scheduleSimulation = useCallback((
    cap: number, terms: number, audit: number,
    ip: 'strict' | 'standard' | 'flexible',
    post: 'aggressive' | 'balanced' | 'defensive',
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSimulation(cap, terms, audit, ip, post);
    }, 400);
  }, [fetchSimulation]);

  useEffect(() => {
    scheduleSimulation(liabilityCap, paymentTerms, auditDays, ipCarveout, posture);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [liabilityCap, paymentTerms, auditDays, ipCarveout, posture, scheduleSimulation]);

  const handleApplyPreset = (type: 'aggressive' | 'balanced' | 'defensive') => {
    setPosture(type);
    if (type === 'aggressive') { setLiabilityCap(1.0); setPaymentTerms(30); setAuditDays(15); setIpCarveout('strict'); }
    else if (type === 'balanced') { setLiabilityCap(2.0); setPaymentTerms(45); setAuditDays(30); setIpCarveout('standard'); }
    else { setLiabilityCap(2.5); setPaymentTerms(60); setAuditDays(45); setIpCarveout('flexible'); }
  };

  const handleRunMonteCarlo = () => {
    setIsSimulating(true);
    fetchSimulation(liabilityCap, paymentTerms, auditDays, ipCarveout, posture).finally(() => {
      setTimeout(() => setIsSimulating(false), 600);
    });
  };

  const fairness = result.fairness_index;
  const acceptanceProb = result.counterparty_acceptance_pct;
  const leverageScore = result.leverage_score;
  const eqLabel = result.equilibrium_label;
  const trajectory = result.trajectory;
  const riskLevel = fairness >= 75 ? 'low' : fairness >= 55 ? 'moderate' : 'high';

  return (
    <div className="w-full bg-background text-on-surface p-space-base md:p-space-lg lg:p-space-xl space-y-space-lg min-h-screen">
      {/* 1. TOP SANDBOX BANNER STRIP */}
      <section className="w-full bg-surface-container-low border border-outline-variant/30 rounded p-space-base shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0 shadow-md">
              <span className="material-symbols-outlined text-2xl">science</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-space-xs flex-wrap">
                <span className="bg-surface-container-lowest text-primary font-mono text-label-sm px-2 py-0.5 rounded tracking-widest uppercase font-semibold border border-primary/20">
                  SANDBOX MODE · SIMULATION ENGINE V5.4-LEX
                </span>
                <span className="text-outline text-label-sm">|</span>
                <span className="font-mono text-label-sm text-on-surface-variant tracking-wider">
                  LIVE NEGOTIATION ENGINE — Stochastic Nash Equilibrium
                </span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                All metrics are computed in real-time by the Negotiation Engine. Adjust sliders to see live results.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded border border-outline-variant/30 font-mono text-xs shrink-0">
            {(['aggressive', 'balanced', 'defensive'] as const).map((type) => (
              <button key={type} type="button" onClick={() => handleApplyPreset(type)}
                className={`px-3 py-1.5 rounded transition-colors ${posture === type ? 'bg-primary-container text-on-primary-container font-semibold' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}>
                {type === 'aggressive' ? 'Aggressive Buyer' : type === 'balanced' ? 'Balanced Standard' : 'Defensive Shield'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. EDITORIAL SUB-HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pb-space-xs border-b border-outline-variant/20">
        <div className="space-y-1 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
            <span className="font-mono text-label-sm text-primary uppercase tracking-widest font-semibold">Stochastic Nash Equilibrium Simulator</span>
          </div>
          <h1 className="font-headline-xl text-3xl md:text-4xl text-on-surface tracking-tight font-semibold">Autonomous Negotiation Sandbox</h1>
          <p className="font-body-md text-on-surface-variant text-sm">
            Stress-test multi-variable legal concessions, simulate counterparty game-theoretic dynamics,
            and calibrate conformed fairness thresholds before formal dispatch.
          </p>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
          <Button variant="secondary" size="md" icon="replay" onClick={handleRunMonteCarlo} disabled={isSimulating || isLoading}>
            {isSimulating ? 'Simulating 5,000 Iterations...' : 'Run Monte Carlo Test'}
          </Button>
          <Button variant="primary" size="md" icon="publish" onClick={() => { alert('Staged sandbox configuration committed to live Negotiation Room.'); navigate('/negotiations'); }}>
            Commit to Live Room
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-error-container/20 border border-error/40 rounded px-space-base py-space-sm text-xs font-mono text-error flex items-center gap-2">
          <span className="material-symbols-outlined text-base">warning</span>
          {error} — Showing last known values.
        </div>
      )}

      {/* 3. SIMULATION COCKPIT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Left: Variable Tuning Sliders */}
        <div className="lg:col-span-7 bg-surface-container-low border border-outline-variant/30 rounded p-space-lg space-y-space-lg shadow-sm">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
            <h2 className="font-headline-md text-xl text-on-surface font-semibold">Bilateral Concession Variables</h2>
            <span className={`font-mono text-xs px-2 py-0.5 rounded flex items-center gap-1 ${isLoading ? 'bg-outline/10 text-outline' : 'text-primary bg-primary/10'}`}>
              {isLoading && (
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {isLoading ? 'Computing...' : 'Stochastic Weights Active'}
            </span>
          </div>

          {/* Slider 1 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold">1. Data Breach Liability Cap Multiple</span>
              <span className="font-mono text-xs font-bold text-primary">{liabilityCap.toFixed(1)}x Total ARR</span>
            </div>
            <input type="range" min="0.5" max="5.0" step="0.1" value={liabilityCap}
              onChange={(e) => setLiabilityCap(parseFloat(e.target.value))}
              className="w-full h-2 bg-surface-container-highest rounded appearance-none cursor-pointer accent-primary-container" />
            <div className="flex justify-between font-mono text-[10px] text-outline">
              <span>0.5x (Strict Firm Cap)</span><span>2.0x (Market Precedent)</span><span>5.0x (High Risk Concession)</span>
            </div>
          </div>

          {/* Slider 2 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold">2. Invoiced Commercial Payment Terms</span>
              <span className="font-mono text-xs font-bold text-secondary">Net {paymentTerms} Days</span>
            </div>
            <input type="range" min="30" max="90" step="5" value={paymentTerms}
              onChange={(e) => setPaymentTerms(parseInt(e.target.value))}
              className="w-full h-2 bg-surface-container-highest rounded appearance-none cursor-pointer accent-secondary" />
            <div className="flex justify-between font-mono text-[10px] text-outline">
              <span>Net 30 (Cash Flow Optimized)</span><span>Net 45 (Standard Compromise)</span><span>Net 90 (Buyer Leeway)</span>
            </div>
          </div>

          {/* Slider 3 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold">3. Customer Security Audit Notice Window</span>
              <span className="font-mono text-xs font-bold text-on-surface">{auditDays} Calendar Days</span>
            </div>
            <input type="range" min="10" max="60" step="5" value={auditDays}
              onChange={(e) => setAuditDays(parseInt(e.target.value))}
              className="w-full h-2 bg-surface-container-highest rounded appearance-none cursor-pointer accent-outline" />
            <div className="flex justify-between font-mono text-[10px] text-outline">
              <span>10 Days (High Ops Friction)</span><span>30 Days (Balanced Security)</span><span>60 Days (Minimal Intrusion)</span>
            </div>
          </div>

          {/* IP Radio */}
          <div className="space-y-2 pt-space-xs border-t border-outline-variant/20">
            <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold block">4. Derivative Work &amp; IP Indemnity Tolerance</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'strict', label: 'Strict Ownership', desc: 'Zero fine-tuned weight sharing' },
                { id: 'standard', label: 'Mutual Carve-out', desc: 'Standard market EDGAR terms' },
                { id: 'flexible', label: 'Customer Leeway', desc: 'Co-exclusive telemetry use' },
              ].map((item) => (
                <button key={item.id} type="button" onClick={() => setIpCarveout(item.id as any)}
                  className={`p-space-sm rounded text-left border transition-all ${ipCarveout === item.id ? 'bg-surface-container-high border-primary text-on-surface shadow-sm' : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high/50'}`}>
                  <div className="font-label-sm text-xs font-bold text-primary">{item.label}</div>
                  <div className="text-[10px] text-outline mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Live Clause Score Breakdown */}
          {hasFirstResult && Object.keys(result.clause_scores).length > 0 && (
            <div className="pt-space-xs border-t border-outline-variant/20 space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-outline block mb-1">Clause-Level Engine Scores</span>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(result.clause_scores).map(([id, cs]) => (
                  <div key={id} className="bg-surface-container-lowest rounded p-2 border border-outline-variant/20">
                    <div className="font-mono text-[9px] uppercase text-outline truncate">{cs.title}</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] font-mono text-on-surface-variant">A: <strong className="text-primary">{cs.party_a_utility.toFixed(0)}</strong></span>
                      <span className="text-[10px] font-mono text-on-surface-variant">B: <strong className="text-secondary">{cs.party_b_utility.toFixed(0)}</strong></span>
                      {cs.is_pareto_efficient && <span className="text-[9px] bg-secondary/10 text-secondary px-1 rounded font-mono">Pareto</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Results Panel */}
        <div className="lg:col-span-5 space-y-space-md">
          <div className="bg-surface-container-low border border-outline-variant/30 rounded p-space-lg flex flex-col items-center justify-center space-y-space-md shadow-sm">
            <div className="w-full flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <span className="font-mono text-xs font-semibold text-outline uppercase tracking-wider">Equilibrium Verdict</span>
              {isLoading && !hasFirstResult ? (
                <Shimmer className="w-24 h-5" />
              ) : (
                <RiskChip level={riskLevel} label={eqLabel} />
              )}
            </div>

            {isLoading && !hasFirstResult ? (
              <div className="w-40 h-40 flex items-center justify-center">
                <Shimmer className="w-40 h-40 rounded-full" />
              </div>
            ) : (
              <FairnessGauge value={fairness} size={160} label="Simulated Fairness Index" sublabel="Calibrated against 48,000+ SEC EDGAR Precedents" />
            )}

            <div className="w-full grid grid-cols-2 gap-2 pt-space-xs border-t border-outline-variant/20 text-center font-mono">
              <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/20">
                <span className="text-[10px] text-outline block uppercase">Counterparty Acceptance</span>
                {isLoading && !hasFirstResult ? (
                  <Shimmer className="w-12 h-6 mx-auto mt-1" />
                ) : (
                  <span className={`text-lg font-bold text-secondary transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`}>{acceptanceProb.toFixed(0)}%</span>
                )}
              </div>
              <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/20">
                <span className="text-[10px] text-outline block uppercase">Firm Leverage Score</span>
                {isLoading && !hasFirstResult ? (
                  <Shimmer className="w-16 h-6 mx-auto mt-1" />
                ) : (
                  <span className={`text-lg font-bold text-primary transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`}>{leverageScore.toFixed(1)} / 10</span>
                )}
              </div>
            </div>

            <div className="w-full p-space-sm bg-surface-container-lowest rounded border border-outline-variant/30 text-xs font-body-sm text-on-surface-variant leading-relaxed min-h-[4rem]">
              <span className="font-mono text-primary font-semibold uppercase text-[10px] block mb-1">Simulation Recommendation:</span>
              {isLoading && !hasFirstResult ? (
                <div className="space-y-1"><Shimmer className="w-full h-3" /><Shimmer className="w-4/5 h-3" /><Shimmer className="w-3/5 h-3" /></div>
              ) : (
                <span className={`transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`}>{result.recommendation || '-'}</span>
              )}
            </div>
          </div>

          {/* Turn Trajectory */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded p-space-base space-y-2">
            <span className="font-mono text-xs font-semibold text-outline uppercase tracking-wider block">Simulated Turn Trajectory</span>
            <div className="space-y-1.5 text-xs font-mono">
              {isLoading && !hasFirstResult ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-1.5 bg-surface-container-lowest rounded">
                    <Shimmer className="w-32 h-3" /><Shimmer className="w-24 h-3" />
                  </div>
                ))
              ) : trajectory.length > 0 ? (
                trajectory.map((t) => (
                  <div key={t.round}
                    className={`flex items-center justify-between p-1.5 rounded transition-all ${t.status === 'nash' ? 'bg-surface-container-high border border-secondary/40' : 'bg-surface-container-lowest'} ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
                    <span className={t.status === 'nash' ? 'text-secondary font-bold' : 'text-outline'}>{t.label}</span>
                    <span className={t.status === 'nash' ? 'text-secondary font-bold' : t.status === 'breach' ? 'text-error font-bold' : 'text-primary font-bold'}>
                      {t.alignment_pct.toFixed(0)}% Alignment{t.status === 'breach' ? ' (Breach)' : ''}
                    </span>
                  </div>
                ))
              ) : (
                [
                  { label: 'Round 1 (Baseline)', cls: 'text-outline', valCls: 'text-primary', nash: false },
                  { label: 'Round 2 (Counterparty)', cls: 'text-outline', valCls: 'text-error', nash: false },
                  { label: 'Round 3 (Simulated Nash)', cls: 'text-secondary font-bold', valCls: 'text-secondary font-bold', nash: true },
                ].map((r, i) => (
                  <div key={i} className={`flex items-center justify-between p-1.5 rounded ${r.nash ? 'bg-surface-container-high border border-secondary/40' : 'bg-surface-container-lowest'}`}>
                    <span className={r.cls}>{r.label}</span><span className={r.valCls}>-</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
