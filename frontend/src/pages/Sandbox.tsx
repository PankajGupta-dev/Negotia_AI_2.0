import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FairnessGauge } from '../components/FairnessGauge';
import { Button } from '../components/Button';
import { RiskChip } from '../components/RiskChip';

export const Sandbox: React.FC = () => {
  const navigate = useNavigate();
  const [posture, setPosture] = useState<'aggressive' | 'balanced' | 'defensive'>('balanced');
  const [liabilityCap, setLiabilityCap] = useState(2.0); // 0.5x to 5.0x ARR
  const [paymentTerms, setPaymentTerms] = useState(45); // 30 to 90 days
  const [auditDays, setAuditDays] = useState(30); // 10 to 60 days
  const [ipCarveout, setIpCarveout] = useState<'strict' | 'standard' | 'flexible'>('standard');
  const [isSimulating, setIsSimulating] = useState(false);

  // Dynamic calculations based on parameters
  const calculateFairness = () => {
    let score = 75;
    if (posture === 'aggressive') score -= 15;
    if (posture === 'defensive') score += 12;
    if (liabilityCap >= 2.0 && liabilityCap <= 2.5) score += 8;
    if (paymentTerms >= 45 && paymentTerms <= 60) score += 6;
    if (ipCarveout === 'standard') score += 5;
    return Math.min(98, Math.max(35, score));
  };

  const calculateAcceptanceProb = () => {
    let prob = 70;
    if (liabilityCap > 3.0) prob += 15;
    if (paymentTerms > 60) prob += 10;
    if (ipCarveout === 'flexible') prob += 8;
    if (posture === 'aggressive') prob -= 25;
    return Math.min(96, Math.max(20, prob));
  };

  const handleApplyPreset = (type: 'aggressive' | 'balanced' | 'defensive') => {
    setPosture(type);
    if (type === 'aggressive') {
      setLiabilityCap(1.0);
      setPaymentTerms(30);
      setAuditDays(15);
      setIpCarveout('strict');
    } else if (type === 'balanced') {
      setLiabilityCap(2.0);
      setPaymentTerms(45);
      setAuditDays(30);
      setIpCarveout('standard');
    } else {
      setLiabilityCap(2.5);
      setPaymentTerms(60);
      setAuditDays(45);
      setIpCarveout('flexible');
    }
  };

  const handleRunMonteCarlo = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
    }, 900);
  };

  const fairness = calculateFairness();
  const acceptanceProb = calculateAcceptanceProb();

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
                  DOCKET #2025-INT-809 (Apex Dynamics MSA)
                </span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                Staged concessions here do not alter the active docket conformed copy until committed.
              </p>
            </div>
          </div>

          {/* Quick Preset Posture Switchers */}
          <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded border border-outline-variant/30 font-mono text-xs shrink-0">
            <button
              type="button"
              onClick={() => handleApplyPreset('aggressive')}
              className={`px-3 py-1.5 rounded transition-colors ${
                posture === 'aggressive'
                  ? 'bg-primary-container text-on-primary-container font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Aggressive Buyer
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('balanced')}
              className={`px-3 py-1.5 rounded transition-colors ${
                posture === 'balanced'
                  ? 'bg-primary-container text-on-primary-container font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Balanced Standard
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('defensive')}
              className={`px-3 py-1.5 rounded transition-colors ${
                posture === 'defensive'
                  ? 'bg-primary-container text-on-primary-container font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Defensive Shield
            </button>
          </div>
        </div>
      </section>

      {/* 2. EDITORIAL SUB-HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pb-space-xs border-b border-outline-variant/20">
        <div className="space-y-1 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
            <span className="font-mono text-label-sm text-primary uppercase tracking-widest font-semibold">
              Stochastic Nash Equilibrium Simulator
            </span>
          </div>
          <h1 className="font-headline-xl text-3xl md:text-4xl text-on-surface tracking-tight font-semibold">
            Autonomous Negotiation Sandbox
          </h1>
          <p className="font-body-md text-on-surface-variant text-sm">
            Stress-test multi-variable legal concessions, simulate counterparty game-theoretic dynamics,
            and calibrate conformed fairness thresholds before formal dispatch.
          </p>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
          <Button
            variant="secondary"
            size="md"
            icon="replay"
            onClick={handleRunMonteCarlo}
            disabled={isSimulating}
          >
            {isSimulating ? 'Simulating 5,000 Iterations...' : 'Run Monte Carlo Test'}
          </Button>
          <Button
            variant="primary"
            size="md"
            icon="publish"
            onClick={() => {
              alert('Staged sandbox configuration committed to live Negotiation Room.');
              navigate('/negotiations/2025-INT-809');
            }}
          >
            Commit to Live Room
          </Button>
        </div>
      </div>

      {/* 3. SIMULATION COCKPIT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Left: Variable Tuning Sliders (7 cols) */}
        <div className="lg:col-span-7 bg-surface-container-low border border-outline-variant/30 rounded p-space-lg space-y-space-lg shadow-sm">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
            <h2 className="font-headline-md text-xl text-on-surface font-semibold">
              Bilateral Concession Variables
            </h2>
            <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
              Stochastic Weights Active
            </span>
          </div>

          {/* Slider 1: Liability Cap Multiple */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold">
                1. Data Breach Liability Cap Multiple
              </span>
              <span className="font-mono text-xs font-bold text-primary">
                {liabilityCap.toFixed(1)}x Total ARR
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.1"
              value={liabilityCap}
              onChange={(e) => setLiabilityCap(parseFloat(e.target.value))}
              className="w-full h-2 bg-surface-container-highest rounded appearance-none cursor-pointer accent-primary-container"
            />
            <div className="flex justify-between font-mono text-[10px] text-outline">
              <span>0.5x (Strict Firm Cap)</span>
              <span>2.0x (Market Precedent)</span>
              <span>5.0x (High Risk Concession)</span>
            </div>
          </div>

          {/* Slider 2: Payment Terms Extension */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold">
                2. Invoiced Commercial Payment Terms
              </span>
              <span className="font-mono text-xs font-bold text-secondary">
                Net {paymentTerms} Days
              </span>
            </div>
            <input
              type="range"
              min="30"
              max="90"
              step="5"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(parseInt(e.target.value))}
              className="w-full h-2 bg-surface-container-highest rounded appearance-none cursor-pointer accent-secondary"
            />
            <div className="flex justify-between font-mono text-[10px] text-outline">
              <span>Net 30 (Cash Flow Optimized)</span>
              <span>Net 45 (Standard Compromise)</span>
              <span>Net 90 (Buyer Leeway)</span>
            </div>
          </div>

          {/* Slider 3: Audit Notice Period */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold">
                3. Customer Security Audit Notice Window
              </span>
              <span className="font-mono text-xs font-bold text-on-surface">
                {auditDays} Calendar Days
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              step="5"
              value={auditDays}
              onChange={(e) => setAuditDays(parseInt(e.target.value))}
              className="w-full h-2 bg-surface-container-highest rounded appearance-none cursor-pointer accent-outline"
            />
            <div className="flex justify-between font-mono text-[10px] text-outline">
              <span>10 Days (High Ops Friction)</span>
              <span>30 Days (Balanced Security)</span>
              <span>60 Days (Minimal Intrusion)</span>
            </div>
          </div>

          {/* Radio Group: IP Carve-out Tolerance */}
          <div className="space-y-2 pt-space-xs border-t border-outline-variant/20">
            <span className="font-mono text-xs uppercase tracking-wider text-outline font-semibold block">
              4. Derivative Work & IP Indemnity Tolerance
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'strict', label: 'Strict Ownership', desc: 'Zero fine-tuned weight sharing' },
                { id: 'standard', label: 'Mutual Carve-out', desc: 'Standard market EDGAR terms' },
                { id: 'flexible', label: 'Customer Leeway', desc: 'Co-exclusive telemetry use' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIpCarveout(item.id as any)}
                  className={`p-space-sm rounded text-left border transition-all ${
                    ipCarveout === item.id
                      ? 'bg-surface-container-high border-primary text-on-surface shadow-sm'
                      : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high/50'
                  }`}
                >
                  <div className="font-label-sm text-xs font-bold text-primary">{item.label}</div>
                  <div className="text-[10px] text-outline mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Simulation Gauges & Outcome Projection (5 cols) */}
        <div className="lg:col-span-5 space-y-space-md">
          {/* Fairness Gauge Card */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded p-space-lg flex flex-col items-center justify-center space-y-space-md shadow-sm">
            <div className="w-full flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <span className="font-mono text-xs font-semibold text-outline uppercase tracking-wider">
                Equilibrium Verdict
              </span>
              <RiskChip
                level={fairness >= 75 ? 'low' : fairness >= 55 ? 'moderate' : 'high'}
                label={fairness >= 75 ? 'Optimal Pareto' : fairness >= 55 ? 'Tolerable' : 'Asymmetric Risk'}
              />
            </div>

            <FairnessGauge
              value={fairness}
              size={160}
              label="Simulated Fairness Index"
              sublabel="Calibrated against 48,000+ SEC EDGAR Precedents"
            />

            {/* Key Outcomes Stats Grid */}
            <div className="w-full grid grid-cols-2 gap-2 pt-space-xs border-t border-outline-variant/20 text-center font-mono">
              <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/20">
                <span className="text-[10px] text-outline block uppercase">Counterparty Acceptance</span>
                <span className="text-lg font-bold text-secondary">{acceptanceProb}%</span>
              </div>
              <div className="bg-surface-container-lowest p-2 rounded border border-outline-variant/20">
                <span className="text-[10px] text-outline block uppercase">Firm Leverage Score</span>
                <span className="text-lg font-bold text-primary">8.6 / 10</span>
              </div>
            </div>

            {/* Strategy Rationale */}
            <div className="w-full p-space-sm bg-surface-container-lowest rounded border border-outline-variant/30 text-xs font-body-sm text-on-surface-variant leading-relaxed">
              <span className="font-mono text-primary font-semibold uppercase text-[10px] block mb-1">
                Simulation Recommendation:
              </span>
              Trading a <strong>{liabilityCap}x ARR</strong> super-cap in exchange for <strong>Net {paymentTerms}</strong> terms maintains a{' '}
              <strong>{acceptanceProb}% probability</strong> of direct sign-off without additional counterparty turns.
            </div>
          </div>

          {/* Historical Simulated Rounds Bar */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded p-space-base space-y-2">
            <span className="font-mono text-xs font-semibold text-outline uppercase tracking-wider block">
              Simulated Turn Trajectory
            </span>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between p-1.5 bg-surface-container-lowest rounded">
                <span className="text-outline">Round 1 (Baseline)</span>
                <span className="text-primary font-bold">52% Alignment</span>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-surface-container-lowest rounded">
                <span className="text-outline">Round 2 (Counterparty)</span>
                <span className="text-error font-bold">41% Alignment (Breach)</span>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-surface-container-high rounded border border-secondary/40">
                <span className="text-secondary font-bold">Round 3 (Simulated Nash)</span>
                <span className="text-secondary font-bold">{fairness}% Alignment</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
