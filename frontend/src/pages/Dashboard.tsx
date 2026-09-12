import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { RiskChip } from '../components/RiskChip';
import { ProgressBar } from '../components/ProgressBar';
import { LedgerTable, ColumnDef } from '../components/LedgerTable';
import { Button } from '../components/Button';
import {
  MOCK_MATTERS,
  MOCK_ACTIVITY_FEED,
  MOCK_PROCESSING_QUEUE,
  Matter,
} from '../data/mock';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRisk, setFilterRisk] = useState<'all' | 'high' | 'moderate' | 'low'>('all');

  const filteredMatters = MOCK_MATTERS.filter((matter) => {
    const matchesSearch =
      matter.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      matter.counterparty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      matter.docketNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk = filterRisk === 'all' || matter.riskLevel === filterRisk;
    return matchesSearch && matchesRisk;
  });

  const matterColumns: ColumnDef<Matter>[] = [
    {
      key: 'docketNumber',
      title: 'Docket / Matter',
      render: (m) => (
        <div className="flex flex-col">
          <span className="font-headline-md text-sm font-semibold text-on-surface hover:text-primary transition-colors">
            {m.title}
          </span>
          <span className="font-mono text-[10px] text-outline tracking-wider">
            {m.docketNumber} · {m.type}
          </span>
        </div>
      ),
    },
    {
      key: 'counterparty',
      title: 'Counterparty',
      render: (m) => (
        <div className="flex items-center gap-1.5 font-medium text-on-surface">
          <span className="material-symbols-outlined text-outline text-[16px]">domain</span>
          <span>{m.counterparty}</span>
        </div>
      ),
    },
    {
      key: 'stage',
      title: 'Turn & Stage',
      render: (m) => (
        <div className="flex flex-col">
          <span className="text-on-surface font-medium text-xs">{m.stage}</span>
          <span className="text-outline text-[10px] font-mono">Round {m.round} of {m.totalRounds}</span>
        </div>
      ),
    },
    {
      key: 'riskLevel',
      title: 'Risk Profile',
      render: (m) => (
        <RiskChip level={m.riskLevel} score={m.riskScore} />
      ),
    },
    {
      key: 'precedentMatch',
      title: 'Precedent Alignment',
      render: (m) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-secondary">
            {m.precedentMatch}%
          </span>
          <div className="w-16 bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div
              className="bg-secondary h-full rounded-full"
              style={{ width: `${m.precedentMatch}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      title: 'Action',
      align: 'right',
      render: (m) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/negotiations/${m.id}`);
            }}
          >
            Enter Room
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full flex flex-col space-y-space-lg p-space-base md:p-space-lg lg:p-space-xl">
      {/* 1. TOP CONTEXT / EXECUTIVE COMMAND STRIP */}
      <header className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded p-space-lg flex flex-wrap items-center justify-between gap-space-md shadow-sm">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-space-sm text-outline font-mono uppercase tracking-widest text-[11px]">
            <span>Thursday, October 24</span>
            <span>•</span>
            <span className="text-primary font-semibold">Portfolio Overview · Docket Active</span>
          </div>
          <h1 className="font-headline-xl text-3xl md:text-4xl text-on-surface font-semibold tracking-tight mt-1">
            Legal Operations Command
          </h1>
          <p className="font-body-md text-on-surface-variant text-sm mt-0.5">
            Real-time multi-agent negotiation telemetry, bilateral concessions, and precedent monitoring.
          </p>
        </div>

        {/* Search & Upload CTA */}
        <div className="flex items-center gap-space-sm flex-wrap">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-outline text-body-md pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 142 matters, counterparties..."
              className="w-64 md:w-80 pl-9 pr-12 py-2 bg-surface-container-low border border-outline-variant/50 rounded text-body-sm font-body-sm text-on-surface placeholder:text-outline/70 focus:outline-none focus:border-primary transition-colors"
            />
            <div className="absolute right-2.5 flex items-center pointer-events-none">
              <kbd className="font-mono text-[10px] bg-surface-container-high text-outline px-1.5 py-0.5 rounded border border-outline-variant/40">
                ⌘K
              </kbd>
            </div>
          </div>

          <Button
            variant="primary"
            size="md"
            icon="add_circle"
            onClick={() => navigate('/intake')}
          >
            Upload Contract
          </Button>
        </div>
      </header>

      {/* 2. QUICK ACTION SHORTCUTS STRIP */}
      <section className="w-full bg-surface-container-low/60 border border-outline-variant/20 rounded p-2.5 flex items-center justify-between overflow-x-auto gap-space-sm">
        <div className="flex items-center gap-2">
          <span className="font-mono text-label-sm uppercase tracking-wider text-outline shrink-0 pr-1">
            Actions:
          </span>
          <button
            type="button"
            onClick={() => navigate('/pipeline/2025-INT-809')}
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono text-[11px] rounded flex items-center gap-1.5 font-bold shrink-0 hover:bg-primary hover:text-white transition-colors shadow-sm border border-primary/40"
          >
            <span className="material-symbols-outlined text-[15px]">account_tree</span>
            <span>Watch Live Pipeline</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/intake')}
            className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">upload_file</span>
            <span>Upload Contract</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/negotiations/2025-INT-809')}
            className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-primary">bolt</span>
            <span>Start Negotiation</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/sandbox')}
            className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-outline">balance</span>
            <span>Open Sandbox</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/reports/2025-INT-809')}
            className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-outline">description</span>
            <span>Executive Reports</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/team')}
            className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-outline">person_add</span>
            <span>Invite Team Member</span>
          </button>
        </div>
      </section>

      {/* 3. KPI STATS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-base">
        <StatCard
          label="Active Docket Matters"
          value="14"
          sublabel="4 bilateral negotiations underway"
          change="+3 this month"
          trend="up"
          tone="amber"
          icon="gavel"
        />
        <StatCard
          label="Pending Redlines"
          value="9"
          sublabel="4 high-risk clause breaches detected"
          change="4 urgent"
          trend="down"
          tone="rust"
          icon="edit_document"
        />
        <StatCard
          label="Precedent Alignment"
          value="94.2%"
          sublabel="Calibrated across 48,000+ SEC exhibits"
          change="+1.8%"
          trend="up"
          tone="forest"
          icon="verified"
        />
        <StatCard
          label="Avg. Cycle Turnaround"
          value="4.2m"
          sublabel="Compared to 11 days manual benchmark"
          change="98% faster"
          trend="up"
          tone="forest"
          icon="schedule"
        />
      </div>

      {/* 4. MAIN DOCKET LEDGER & PROCESSING QUEUE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Left: Active Matters Ledger Table (8 cols) */}
        <div className="lg:col-span-8 space-y-space-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
            <div className="flex items-center gap-2">
              <h2 className="font-headline-md text-xl font-semibold text-on-surface">
                Active Matters Ledger
              </h2>
              <span className="font-mono text-label-sm bg-surface-container-high text-primary px-2 py-0.5 rounded">
                {filteredMatters.length} Total
              </span>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded border border-outline-variant/30 font-mono text-[11px]">
              {(['all', 'high', 'moderate', 'low'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setFilterRisk(lvl)}
                  className={`px-2.5 py-1 rounded transition-colors uppercase font-medium ${
                    filterRisk === lvl
                      ? 'bg-primary-container text-on-primary-container font-semibold'
                      : 'text-outline hover:text-on-surface'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <LedgerTable
            columns={matterColumns}
            data={filteredMatters}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => navigate(`/negotiations/${item.id}`)}
          />
        </div>

        {/* Right: Processing Queue & Activity Stream (4 cols) */}
        <div className="lg:col-span-4 space-y-space-lg">
          {/* Real-Time Processing Queue */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded p-space-base space-y-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <h3 className="font-label-lg text-sm font-semibold text-on-surface">
                  Processing Queue
                </h3>
              </div>
              <span className="font-mono text-[10px] text-outline uppercase">
                {MOCK_PROCESSING_QUEUE.length} In Progress
              </span>
            </div>

            <div className="space-y-space-md">
              {MOCK_PROCESSING_QUEUE.map((item) => (
                <div
                  key={item.id}
                  className="bg-surface-container-lowest p-space-sm rounded border border-outline-variant/20 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-primary">
                      {item.docketNumber}
                    </span>
                    <span className="font-mono text-[10px] text-outline">
                      {item.eta}
                    </span>
                  </div>
                  <ProgressBar
                    value={item.progress}
                    label={item.step}
                    tone="amber"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Recent Autonomous Activity Feed */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded p-space-base space-y-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <h3 className="font-label-lg text-sm font-semibold text-on-surface">
                Autonomous Activity Feed
              </h3>
              <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded border border-secondary/30">
                Live Telemetry
              </span>
            </div>

            <div className="space-y-3">
              {MOCK_ACTIVITY_FEED.map((act) => (
                <div
                  key={act.id}
                  className="flex items-start gap-2.5 pb-2.5 border-b border-outline-variant/10 last:border-0 last:pb-0"
                >
                  <div className="w-7 h-7 rounded bg-surface-container-high border border-outline-variant/40 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[15px] text-primary">
                      {act.type === 'autonomous'
                        ? 'auto_awesome'
                        : act.type === 'alert'
                        ? 'warning'
                        : act.type === 'signing'
                        ? 'verified'
                        : 'history_edu'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-label-md text-xs font-semibold text-on-surface truncate">
                        {act.action}
                      </span>
                      <span className="font-mono text-[10px] text-outline shrink-0 ml-1">
                        {act.timestamp}
                      </span>
                    </div>
                    <p className="font-body-sm text-xs text-on-surface-variant line-clamp-2 mt-0.5">
                      {act.details}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
