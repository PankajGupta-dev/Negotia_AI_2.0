import React, { useState } from 'react';
import { StatCard } from '../components/StatCard';
import { Button } from '../components/Button';
import { LedgerTable, ColumnDef } from '../components/LedgerTable';

interface CounterpartyTelemetry {
  id: string;
  name: string;
  docketsCount: number;
  avgTurns: number;
  avgVelocity: string;
  liabilityStance: 'aggressive' | 'moderate' | 'balanced';
  precedentIndex: number;
}

const MOCK_COUNTERPARTIES: CounterpartyTelemetry[] = [
  {
    id: 'cp-1',
    name: 'Apex Dynamics Corp.',
    docketsCount: 4,
    avgTurns: 3.2,
    avgVelocity: '18m avg',
    liabilityStance: 'aggressive',
    precedentIndex: 94,
  },
  {
    id: 'cp-2',
    name: 'Novartis Global Digital',
    docketsCount: 6,
    avgTurns: 2.1,
    avgVelocity: '12m avg',
    liabilityStance: 'balanced',
    precedentIndex: 98,
  },
  {
    id: 'cp-3',
    name: 'Cantor Fitzgerald FinTech',
    docketsCount: 3,
    avgTurns: 4.0,
    avgVelocity: '28m avg',
    liabilityStance: 'moderate',
    precedentIndex: 91,
  },
  {
    id: 'cp-4',
    name: 'Aetherion AI Labs',
    docketsCount: 2,
    avgTurns: 4.8,
    avgVelocity: '45m avg',
    liabilityStance: 'aggressive',
    precedentIndex: 82,
  },
];

export const Analytics: React.FC = () => {
  const [period, setPeriod] = useState<'90d' | '12m' | 'all'>('90d');

  const counterpartyColumns: ColumnDef<CounterpartyTelemetry>[] = [
    {
      key: 'name',
      title: 'Counterparty Legal Entity',
      render: (c) => (
        <span className="font-headline-md text-sm font-semibold text-on-surface">
          {c.name}
        </span>
      ),
    },
    {
      key: 'docketsCount',
      title: 'Total Dockets',
      render: (c) => <span className="font-mono text-xs">{c.docketsCount} Matters</span>,
    },
    {
      key: 'avgTurns',
      title: 'Avg. Negotiation Turns',
      render: (c) => (
        <span className="font-mono text-xs text-primary font-semibold">
          {c.avgTurns} Rounds
        </span>
      ),
    },
    {
      key: 'avgVelocity',
      title: 'Turnaround Latency',
      render: (c) => <span className="font-mono text-xs text-secondary">{c.avgVelocity}</span>,
    },
    {
      key: 'liabilityStance',
      title: 'Observed Stance',
      render: (c) => (
        <span
          className={`font-mono text-[10px] px-2 py-0.5 rounded uppercase font-semibold border ${
            c.liabilityStance === 'aggressive'
              ? 'bg-error-container/30 text-error border-error/30'
              : c.liabilityStance === 'moderate'
              ? 'bg-primary-container/20 text-primary border-primary/30'
              : 'bg-secondary-container/20 text-secondary border-secondary/30'
          }`}
        >
          {c.liabilityStance}
        </span>
      ),
    },
    {
      key: 'precedentIndex',
      title: 'Precedent Convergence',
      render: (c) => (
        <span className="font-mono text-xs font-bold text-secondary">
          {c.precedentIndex}%
        </span>
      ),
    },
  ];

  return (
    <div className="w-full bg-background text-on-surface p-space-base md:p-space-lg lg:p-space-xl space-y-space-xl min-h-screen">
      {/* 1. TOP CLASSIFICATION & HEADER ROW */}
      <div className="flex flex-col gap-space-md border-b border-outline-variant/30 pb-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-xs text-label-sm font-mono uppercase tracking-widest text-outline">
            <span>MATTER PORTFOLIO</span>
            <span>·</span>
            <span>ENTERPRISE INTELLIGENCE</span>
            <span>·</span>
            <span className="text-primary font-semibold">SEC EDGAR TELEMETRY</span>
          </div>
          <div className="flex items-center gap-space-xs text-label-sm font-mono text-secondary bg-secondary-container/20 px-2 py-0.5 rounded border border-secondary/30">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block animate-pulse" />
            <span>Autonomous Core v4.8 Active · 142 Dockets Indexed</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
          <div className="space-y-1">
            <h1 className="font-headline-xl text-3xl md:text-4xl text-on-surface tracking-tight font-semibold">
              Autonomous Legal Deal Intelligence & Analytics
            </h1>
            <p className="font-body-md text-on-surface-variant max-w-4xl text-sm">
              Empirical telemetry across 142 bilateral dockets, calibrated against 48,000+ SEC EDGAR
              precedent filings and autonomous agent concession dynamics.
            </p>
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <Button
              variant="secondary"
              size="md"
              icon="file_download"
              onClick={() => alert('Exporting telemetry CSV...')}
            >
              Export CSV
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="analytics"
              onClick={() => alert('Board Dossier generated.')}
            >
              Generate Board Dossier
            </Button>
          </div>
        </div>

        {/* Filter Period Bar */}
        <div className="pt-space-xs flex flex-wrap items-center justify-between gap-space-md border-t border-outline-variant/20">
          <div className="flex flex-wrap items-center gap-space-xs font-mono text-xs">
            <span className="text-outline uppercase tracking-wider mr-1">Period:</span>
            {(
              [
                { id: '90d', label: 'Trailing 90 Days (Q1 2025)' },
                { id: '12m', label: 'Trailing 12 Months' },
                { id: 'all', label: 'All-Time Benchmark' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1 rounded border uppercase tracking-wider transition-colors ${
                  period === p.id
                    ? 'border-primary bg-surface-container-high text-primary font-semibold'
                    : 'border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. KEY TELEMETRY KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-base">
        <StatCard
          label="Concession Velocity Delta"
          value="3.8x"
          sublabel="+280% acceleration vs outside counsel"
          change="3.8x Speed"
          trend="up"
          tone="amber"
          icon="bolt"
        />
        <StatCard
          label="Median Turnaround Latency"
          value="14.2m"
          sublabel="From inbound markup to conformed draft"
          change="-96.4% Cycle"
          trend="up"
          tone="forest"
          icon="timer"
        />
        <StatCard
          label="Precedent Convergence"
          value="93.8%"
          sublabel="Fortune 500 tech MSA market standard"
          change="88th Pct"
          trend="up"
          tone="forest"
          icon="verified"
        />
        <StatCard
          label="Net Exposure Safeguarded"
          value="$48.2M"
          sublabel="Avoided uncapped indemnities & damages"
          change="Zero Drift"
          trend="up"
          tone="amber"
          icon="shield"
        />
      </div>

      {/* 3. VISUAL DISTRIBUTION CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Left: Turn Distribution Bar Graph (6 cols) */}
        <div className="lg:col-span-6 bg-surface-container-low border border-outline-variant/30 rounded p-space-lg space-y-space-md shadow-sm">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
            <h2 className="font-headline-md text-lg text-on-surface font-semibold">
              Bilateral Turn Distribution to Settlement
            </h2>
            <span className="font-mono text-xs text-outline">142 Dockets</span>
          </div>

          <p className="font-body-sm text-xs text-on-surface-variant">
            Number of iterative redline exchanges required to reach signed consensus.
          </p>

          <div className="space-y-3 pt-2 font-mono text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-on-surface font-semibold">Round 1 (Direct Conformance)</span>
                <span className="text-secondary font-bold">42 Matters (29.5%)</span>
              </div>
              <div className="w-full bg-surface-container-highest h-2 rounded overflow-hidden">
                <div className="bg-secondary h-full rounded" style={{ width: '29.5%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-on-surface font-semibold">Round 2 (Single Compromise)</span>
                <span className="text-primary font-bold">64 Matters (45.1%)</span>
              </div>
              <div className="w-full bg-surface-container-highest h-2 rounded overflow-hidden">
                <div className="bg-primary-container h-full rounded" style={{ width: '45.1%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-on-surface font-semibold">Round 3 (Nash Deliberation)</span>
                <span className="text-outline font-bold">28 Matters (19.7%)</span>
              </div>
              <div className="w-full bg-surface-container-highest h-2 rounded overflow-hidden">
                <div className="bg-outline h-full rounded" style={{ width: '19.7%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-on-surface font-semibold">Round 4+ (Partner Escalation)</span>
                <span className="text-error font-bold">8 Matters (5.7%)</span>
              </div>
              <div className="w-full bg-surface-container-highest h-2 rounded overflow-hidden">
                <div className="bg-error h-full rounded" style={{ width: '5.7%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Contested Clause Risk Frequency (6 cols) */}
        <div className="lg:col-span-6 bg-surface-container-low border border-outline-variant/30 rounded p-space-lg space-y-space-md shadow-sm">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
            <h2 className="font-headline-md text-lg text-on-surface font-semibold">
              Contested Clause Risk Frequency
            </h2>
            <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
              High Friction Points
            </span>
          </div>

          <p className="font-body-sm text-xs text-on-surface-variant">
            Clause categories exhibiting the highest rate of counterparty resistance and markup.
          </p>

          <div className="space-y-3 pt-2 font-mono text-xs">
            <div className="p-space-sm bg-surface-container-lowest rounded border border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-base">gavel</span>
                <span className="text-on-surface font-medium">§ 11 Limitation of Liability</span>
              </div>
              <span className="font-bold text-error">42% of Redlines</span>
            </div>

            <div className="p-space-sm bg-surface-container-lowest rounded border border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">psychology</span>
                <span className="text-on-surface font-medium">§ 14 Intellectual Property & AI Weights</span>
              </div>
              <span className="font-bold text-primary">28% of Redlines</span>
            </div>

            <div className="p-space-sm bg-surface-container-lowest rounded border border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-outline text-base">shield</span>
                <span className="text-on-surface font-medium">§ 17 Mutual Indemnification</span>
              </div>
              <span className="font-bold text-outline">18% of Redlines</span>
            </div>

            <div className="p-space-sm bg-surface-container-lowest rounded border border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-base">payments</span>
                <span className="text-on-surface font-medium">§ 8 Payment Terms & Withholding</span>
              </div>
              <span className="font-bold text-secondary">12% of Redlines</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. COUNTERPARTY VELOCITY LEDGER TABLE */}
      <div className="space-y-space-sm">
        <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
          <h2 className="font-headline-md text-xl text-on-surface font-semibold">
            Counterparty Deliberation Velocity Ledger
          </h2>
          <span className="font-mono text-xs text-outline">
            Benchmarked against historical counterparties
          </span>
        </div>

        <LedgerTable
          columns={counterpartyColumns}
          data={MOCK_COUNTERPARTIES}
          keyExtractor={(item) => item.id}
        />
      </div>
    </div>
  );
};
