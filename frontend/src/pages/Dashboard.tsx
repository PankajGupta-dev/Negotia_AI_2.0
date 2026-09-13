import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RiskChip } from '../components/RiskChip';
import { Button } from '../components/Button';
import {
  MOCK_MATTERS,
  MOCK_ACTIVITY_FEED,
  MOCK_PROCESSING_QUEUE,
} from '../data/mock';
import { getMatters } from '../services/api';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRisk, setFilterRisk] = useState<'all' | 'high' | 'moderate' | 'low'>('all');
  const [matters, setMatters] = useState<any[]>(MOCK_MATTERS);

  useEffect(() => {
    let isMounted = true;
    getMatters()
      .then((data) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setMatters(data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredMatters = matters.filter((m) => {
    const title = m.title || '';
    const counterparty = m.counterparty || '';
    const docketNumber = m.docketNumber || m.docket_number || '';
    const riskLevel = (m.riskLevel || m.risk_level || 'moderate').toLowerCase();

    const matchesSearch =
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      counterparty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      docketNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk = filterRisk === 'all' || riskLevel === filterRisk;
    return matchesSearch && matchesRisk;
  });

  // Calculate dynamic metrics from actual matters data
  const activeCount = matters.length;
  const totalPendingRedlines = matters.reduce(
    (acc, m) => acc + (m.pendingRedlinesCount ?? m.pending_redlines_count ?? 3),
    0
  );
  const highRiskCount = matters.filter(
    (m) =>
      (m.riskLevel || m.risk_level) === 'high' || (m.riskScore ?? m.risk_score ?? 0) >= 7.0
  ).length;
  const avgAlignment = (
    matters.reduce((acc, m) => acc + (m.precedentMatch ?? m.precedent_match ?? 90), 0) /
    (matters.length || 1)
  ).toFixed(1);

  return (
    <div className="w-full min-h-screen flex flex-col space-y- space-y-6 p-4 md:p-6 lg:p-8 bg-surface-container-lowest/50 text-on-surface">


      {/* 2. EXECUTIVE QUICK ACTION BAR (Cleaned up, no upload duplicate) */}
      <section className="w-full bg-surface-container-low/70 border border-outline-variant/20 rounded-lg p-2.5 flex items-center justify-between overflow-x-auto gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-wider text-outline shrink-0 pr-1 font-semibold">
            Directives:
          </span>
          <button
            type="button"
            onClick={() => navigate('/pipeline/2025-INT-809')}
            className="px-3.5 py-1.5 bg-primary-container text-on-primary-container font-mono text-[11px] rounded flex items-center gap-1.5 font-bold shrink-0 hover:bg-primary hover:text-white transition-colors shadow-xs border border-primary/40"
          >
            <span className="material-symbols-outlined text-[15px]">account_tree</span>
            <span>Watch Live Pipeline</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/negotiations/2025-INT-809')}
            className="px-3.5 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-primary">gavel</span>
            <span>Start Negotiation</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/sandbox')}
            className="px-3.5 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-outline">balance</span>
            <span>Open Sandbox</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/reports/2025-INT-809')}
            className="px-3.5 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-outline">description</span>
            <span>Executive Reports</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/governance')}
            className="px-3.5 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 text-on-surface font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-secondary">verified_user</span>
            <span>Audit & Governance</span>
          </button>
        </div>
      </section>

      {/* 3. DYNAMIC KPI TELEMETRY GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-4 flex flex-col justify-between space-y-3 transition-all hover:border-primary/40 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-outline uppercase tracking-wider font-semibold">
              Active Docket Matters
            </span>
            <span className="material-symbols-outlined text-primary text-lg">gavel</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-headline-xl text-3xl font-bold text-primary tracking-tight">
              {activeCount}
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold uppercase">
              Live Matters
            </span>
          </div>
          <p className="font-body-sm text-xs text-outline leading-tight">
            {highRiskCount > 0 ? `${highRiskCount} high exposure, ${activeCount} active` : `${activeCount} bilateral negotiations underway`}
          </p>
        </div>

        {/* Metric 2 */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-4 flex flex-col justify-between space-y-3 transition-all hover:border-error/40 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-outline uppercase tracking-wider font-semibold">
              Pending Redlines
            </span>
            <span className="material-symbols-outlined text-error text-lg">edit_document</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-headline-xl text-3xl font-bold text-error tracking-tight">
              {totalPendingRedlines}
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-error-container/20 text-error border border-error/30 font-semibold uppercase">
              Action Req.
            </span>
          </div>
          <p className="font-body-sm text-xs text-outline leading-tight">
            {highRiskCount} high-risk clause breaches detected
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-4 flex flex-col justify-between space-y-3 transition-all hover:border-secondary/40 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-outline uppercase tracking-wider font-semibold">
              Precedent Alignment
            </span>
            <span className="material-symbols-outlined text-secondary text-lg">verified</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-headline-xl text-3xl font-bold text-secondary tracking-tight">
              {avgAlignment}%
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-secondary-container/20 text-secondary border border-secondary/30 font-semibold uppercase">
              EDGAR Synced
            </span>
          </div>
          <p className="font-body-sm text-xs text-outline leading-tight">
            Calibrated across 48,000+ SEC exhibits
          </p>
        </div>

        {/* Metric 4 */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-4 flex flex-col justify-between space-y-3 transition-all hover:border-secondary/40 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-outline uppercase tracking-wider font-semibold">
              Avg. Cycle Turnaround
            </span>
            <span className="material-symbols-outlined text-secondary text-lg">schedule</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-headline-xl text-3xl font-bold text-secondary tracking-tight">
              3.8m
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-secondary-container/20 text-secondary border border-secondary/30 font-semibold uppercase">
              98% Faster
            </span>
          </div>
          <p className="font-body-sm text-xs text-outline leading-tight">
            vs. 11 days manual benchmark
          </p>
        </div>
      </div>

      {/* 4. MAIN DOCKET LEDGER & SIDEBAR GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active Matters Ledger Table (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-low p-4 rounded-t-lg border border-outline-variant/30 border-b-0">
            <div className="flex items-center gap-2">
              <h2 className="font-headline-md text-lg font-bold text-on-surface">
                Active Matters Ledger
              </h2>
              <span className="font-mono text-[11px] bg-surface-container-highest text-primary px-2 py-0.5 rounded font-semibold border border-primary/20">
                {filteredMatters.length} Total
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Compact Search Input */}
              <div className="relative flex items-center min-w-[200px] sm:min-w-[240px]">
                <span className="material-symbols-outlined absolute left-2.5 text-outline text-body-md pointer-events-none text-sm">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search docket or party..."
                  className="w-full pl-8 pr-3 py-1 bg-surface-container-lowest border border-outline-variant/40 rounded text-xs text-on-surface placeholder:text-outline/70 focus:outline-none focus:border-primary transition-all"
                />
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded border border-outline-variant/30 font-mono text-[11px]">
                {(['all', 'high', 'moderate', 'low'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setFilterRisk(lvl)}
                    className={`px-3 py-1 rounded transition-all uppercase font-medium ${
                      filterRisk === lvl
                        ? 'bg-primary-container text-on-primary-container font-semibold shadow-xs'
                        : 'text-outline hover:text-on-surface'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Clean Ledger Table */}
          <div className="w-full overflow-x-auto border border-outline-variant/30 rounded-b-lg bg-surface-container-lowest shadow-xs">
            <table className="w-full text-left border-collapse select-none text-xs">
              <thead>
                <tr className="bg-surface-container-low/80 border-b border-outline-variant/30 text-outline font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Docket / Matter</th>
                  <th className="py-3 px-4 font-semibold">Counterparty</th>
                  <th className="py-3 px-4 font-semibold">Turn & Stage</th>
                  <th className="py-3 px-4 font-semibold">Risk Profile</th>
                  <th className="py-3 px-4 font-semibold">Precedent Alignment</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredMatters.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-outline italic">
                      No matching matters found in docket ledger.
                    </td>
                  </tr>
                ) : (
                  filteredMatters.map((m) => {
                    const docketId = m.docketNumber || m.docket_number || `#${m.id}`;
                    const riskLvl = (m.riskLevel || m.risk_level || 'moderate').toLowerCase();
                    const riskSc = m.riskScore ?? m.risk_score ?? 5.0;
                    const precMatch = m.precedentMatch ?? m.precedent_match ?? 90;
                    const roundNum = m.round || 3;
                    const totalR = m.totalRounds || m.total_rounds || 4;

                    return (
                      <tr
                        key={m.id}
                        onClick={() => navigate(`/negotiations/${m.id}`)}
                        className="transition-colors hover:bg-surface-container-low/80 cursor-pointer"
                      >
                        {/* Docket / Matter */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-on-surface hover:text-primary transition-colors text-sm">
                              {m.title}
                            </span>
                            <span className="font-mono text-[10px] text-outline mt-0.5">
                              {docketId} · {m.type || 'MSA Agreement'}
                            </span>
                          </div>
                        </td>

                        {/* Counterparty */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-medium text-on-surface">
                            <span className="material-symbols-outlined text-outline text-base">domain</span>
                            <span>{m.counterparty}</span>
                          </div>
                        </td>

                        {/* Turn & Stage */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="text-on-surface font-medium">{m.stage || 'Deliberation'}</span>
                            <span className="text-outline text-[10px] font-mono mt-0.5">
                              Round {roundNum} of {totalR}
                            </span>
                          </div>
                        </td>

                        {/* Risk Profile */}
                        <td className="py-3.5 px-4">
                          <RiskChip level={riskLvl} score={riskSc} />
                        </td>

                        {/* Precedent Alignment */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-secondary min-w-[36px]">
                              {precMatch}%
                            </span>
                            <div className="w-16 bg-surface-container-high h-1.5 rounded-full overflow-hidden border border-outline-variant/30">
                              <div
                                className="bg-secondary h-full rounded-full transition-all duration-300"
                                style={{ width: `${precMatch}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/negotiations/${m.id}`);
                            }}
                          >
                            Enter Room →
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Processing Queue & Activity Stream (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Real-Time Processing Queue */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
                  Processing Queue
                </h3>
              </div>
              <span className="font-mono text-[10px] text-outline uppercase font-semibold">
                {MOCK_PROCESSING_QUEUE.length} In Progress
              </span>
            </div>

            <div className="space-y-3">
              {MOCK_PROCESSING_QUEUE.map((item) => (
                <div
                  key={item.id}
                  className="bg-surface-container-lowest p-3 rounded-md border border-outline-variant/20 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-primary">
                      {item.docketNumber}
                    </span>
                    <span className="font-mono text-[10px] text-outline font-semibold">
                      {item.eta}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-body-sm text-on-surface-variant">
                      <span className="truncate pr-2">{item.step}</span>
                      <span className="font-mono font-semibold shrink-0">{item.progress}%</span>
                    </div>
                    <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Autonomous Activity Feed */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
                Autonomous Telemetry Feed
              </h3>
              <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-2 py-0.5 rounded border border-secondary/30 font-semibold">
                Live Audit Stream
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
                        ? 'smart_toy'
                        : act.type === 'alert'
                        ? 'warning'
                        : act.type === 'signing'
                        ? 'verified'
                        : 'history_edu'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-on-surface truncate">
                        {act.action}
                      </span>
                      <span className="font-mono text-[10px] text-outline shrink-0 ml-1">
                        {act.timestamp}
                      </span>
                    </div>
                    <p className="font-body-sm text-[11px] text-on-surface-variant line-clamp-2 mt-0.5">
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

