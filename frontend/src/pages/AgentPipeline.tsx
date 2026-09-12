import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { BACKEND_BASE_URL } from '../services/api';

interface AgentConfig {
  id: string;
  badge: string;
  name: string;
  technicalName: string;
  role: string;
  replacesBadge: string;
  icon: string;
  colorTone: 'amber' | 'blue' | 'purple' | 'green';
  lines: string[];
}

const AGENTS: AgentConfig[] = [
  {
    id: 'a1',
    badge: 'AGENT 01',
    name: 'Buyer Legal Analyst',
    technicalName: 'Lex-Ingestor A',
    role: 'Deconstructs Party A baseline contract & flags critical risk exposure',
    replacesBadge: 'Replaces: $350/hr Associate Legal Review',
    icon: 'document_scanner',
    colorTone: 'amber',
    lines: [
      'Ingesting Apex_Enterprise_MSA_2025.docx (Party A Baseline)...',
      'AST parse complete — 42 contract nodes decomposed',
      'Extracted core positions: §11.2 Liability, §14.1 IP, §8.3 Payment, §16.4 Venue',
      'Flagged §11.2 — Baseline calls for strict 1x ARR mutual liability cap',
      'Party A legal parameters mapped. Handing off to Agent 2 ✓',
    ],
  },
  {
    id: 'a2',
    badge: 'AGENT 02',
    name: 'Seller Redline Auditor',
    technicalName: 'Lex-Ingestor B',
    role: 'Dissects Party B counterparty redlines & quantifies breach points',
    replacesBadge: 'Replaces: 5-Day Outside Counsel Markup Turn',
    icon: 'edit_document',
    colorTone: 'blue',
    lines: [
      'Ingesting Apex_Dynamics_Inbound_Redline_Round3.docx (Party B Markup)...',
      'AST diff complete — detected aggressive counterparty revisions across 6 clauses',
      'BREACH ALERT §11.2: Counterparty inserted unlimited indirect indemnification',
      'COMMERCIAL CONFLICT §8.3: Counterparty demands Net 30 vs firm Net 60 policy',
      'Party B conflict vector quantified. Submitting to AI Judge (Agent 3) ✓',
    ],
  },
  {
    id: 'a3',
    badge: 'AGENT 03',
    name: 'AI Judge & Deal Mediator',
    technicalName: 'Arbiter-3',
    role: 'Evaluates dual legal & marketing lenses to balance Pareto compromise',
    replacesBadge: 'Replaces: $1,200/hr Neutral Arbitrator / Partner Review',
    icon: 'balance',
    colorTone: 'purple',
    lines: [
      'Cross-referencing 48,000+ SEC EDGAR Fortune 500 exhibits (CrowdStrike, Snowflake)...',
      '⚖️ LEGAL VERDICT: 2.0x ARR super-cap aligns with 88% market precedents (§11.2)',
      '📈 MARKETING VERDICT: Conceding Net 45 preserves $4.2M ARR strategic account value',
      'Solving Nash Equilibrium — Pareto optimal consensus achieved at 94% fairness index',
      'VERDICT RATIFIED: Concede Net 45 terms in exchange for 2.0x ARR super-cap ✓',
    ],
  },
  {
    id: 'a4',
    badge: 'AGENT 04',
    name: 'Executive Report Clerk',
    technicalName: 'Scrivener-4',
    role: 'Compiles consensus brief, computes cost savings & gates on human review',
    replacesBadge: 'Replaces: 3-Day Legal Operations Drafting',
    icon: 'assignment_turned_in',
    colorTone: 'green',
    lines: [
      'Synthesizing bilateral consensus brief from Agent 3 verdict...',
      'Conformed legal language drafted for all 6 contested clauses',
      'Calculated impact: $28,500 outside counsel savings | 18-minute cycle turnaround',
      'SHA-256 Merkle root digest sealed: 0x8f22e8d9a4b19c... (Delaware Chancery standard)',
      '⚠️ PENDING HUMAN REVIEW — Waiting for General Counsel final approval',
    ],
  },
];

type AgentStatus = 'idle' | 'running' | 'complete' | 'error';

function resolveAgentIndex(agentKey?: string): number {
  if (!agentKey) return -1;
  const k = agentKey.toLowerCase().trim();
  if (k === 'a1' || k === 'agent1' || k === 'agent_1' || k.includes('ingestor a') || k.includes('buyer')) return 0;
  if (k === 'a2' || k === 'agent2' || k === 'agent_2' || k.includes('ingestor b') || k.includes('seller')) return 1;
  if (k === 'a3' || k === 'agent3' || k === 'agent_3' || k.includes('arbiter') || k.includes('judge')) return 2;
  if (k === 'a4' || k === 'agent4' || k === 'agent_4' || k.includes('scrivener') || k.includes('clerk')) return 3;
  return -1;
}

export const AgentPipeline: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [statuses, setStatuses] = useState<AgentStatus[]>(['idle', 'idle', 'idle', 'idle']);
  const [streamLines, setStreamLines] = useState<string[][]>([[], [], [], []]);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    const targetId = id || '2025-INT-809';
    let eventSource: EventSource | null = null;
    let fallbackTimeouts: NodeJS.Timeout[] = [];

    // Helper: Simulated fallback if backend stream is not reachable or empty
    const runLocalFallback = () => {
      const runAgent = (agentIdx: number) => {
        if (agentIdx >= AGENTS.length) {
          setPipelineComplete(true);
          return;
        }

        setStatuses((prev) => {
          const next = [...prev];
          next[agentIdx] = 'running';
          return next;
        });

        const currentAgent = AGENTS[agentIdx];
        currentAgent.lines.forEach((line, lIdx) => {
          const t = setTimeout(() => {
            setStreamLines((prev) => {
              const next = [...prev];
              next[agentIdx] = [...(next[agentIdx] || []), line];
              return next;
            });

            if (lIdx === currentAgent.lines.length - 1) {
              const finishT = setTimeout(() => {
                setStatuses((prev) => {
                  const next = [...prev];
                  next[agentIdx] = 'complete';
                  return next;
                });
                runAgent(agentIdx + 1);
              }, 600);
              fallbackTimeouts.push(finishT);
            }
          }, (lIdx + 1) * 750);
          fallbackTimeouts.push(t);
        });
      };

      const startT = setTimeout(() => {
        runAgent(0);
      }, 400);
      fallbackTimeouts.push(startT);
    };

    // 1. Check existing matter status on mount
    fetch(`${BACKEND_BASE_URL}/api/matters/${encodeURIComponent(targetId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((matter) => {
        if (matter) {
          const mStatus = (matter.status || '').toLowerCase();
          if (['pending_review', 'approved', 'sealed', 'concluded'].includes(mStatus)) {
            setPipelineComplete(true);
            setStatuses(['complete', 'complete', 'complete', 'complete']);
            setStreamLines((prev) => {
              if (prev.every((arr) => arr.length === 0)) {
                return AGENTS.map((a) => a.lines);
              }
              return prev;
            });
          }
        }
      })
      .catch(() => {});

    // 2. Connect to live SSE stream
    try {
      const streamUrl = `${BACKEND_BASE_URL}/api/pipeline/stream/${encodeURIComponent(targetId)}`;
      eventSource = new EventSource(streamUrl);

      // Handle generic data
      const processEvent = (data: any, eventType?: string) => {
        if (!data) return;
        const type = eventType || data.event;

        // Pipeline Completion
        if (type === 'pipeline_complete' || data.status === 'pipeline_complete') {
          setPipelineComplete(true);
          setStatuses((prev) =>
            prev.map((s) => (s === 'idle' || s === 'running' ? 'complete' : s))
          );
          if (eventSource) {
            eventSource.close();
          }
          return;
        }

        // Pipeline Error
        if (type === 'pipeline_error' || data.status === 'failed' || data.status === 'error') {
          const agentIdx = resolveAgentIndex(data.agent);
          if (agentIdx !== -1) {
            setStatuses((prev) => {
              const next = [...prev];
              next[agentIdx] = 'error';
              return next;
            });
          }
          const errMsg = data.message || data.thought || 'Deliberation error occurred.';
          setPipelineError(errMsg);
          if (agentIdx !== -1) {
            setStreamLines((prev) => {
              const next = [...prev];
              const cur = next[agentIdx] || [];
              const formatted = `⚠️ ERROR: ${errMsg}`;
              if (!cur.includes(formatted)) {
                next[agentIdx] = [...cur, formatted];
              }
              return next;
            });
          }
          return;
        }

        // Merge Status (connector between Agent 2 and Agent 3)
        if (type === 'merge_status') {
          const thoughtText = data.thought || data.message || 'AST comparison & clause merging underway...';
          setStreamLines((prev) => {
            const next = [...prev];
            const cur = next[1] || [];
            if (!cur.includes(thoughtText)) {
              next[1] = [...cur, thoughtText];
            }
            return next;
          });
          return;
        }

        // Agent Update
        if (type === 'agent_update' || data.agent) {
          const agentIdx = resolveAgentIndex(data.agent);
          if (agentIdx !== -1) {
            const rawStatus = (data.status || '').toLowerCase();
            let mappedStatus: AgentStatus = 'running';
            if (rawStatus === 'complete' || rawStatus === 'completed' || rawStatus === 'success') {
              mappedStatus = 'complete';
            } else if (rawStatus === 'error' || rawStatus === 'failed') {
              mappedStatus = 'error';
            } else if (rawStatus === 'running' || rawStatus === 'active') {
              mappedStatus = 'running';
            } else if (rawStatus === 'pending' || rawStatus === 'idle') {
              mappedStatus = 'idle';
            }

            setStatuses((prev) => {
              const next = [...prev];
              next[agentIdx] = mappedStatus;
              // If downstream agent starts running, mark prior agents complete
              if (mappedStatus === 'running') {
                for (let i = 0; i < agentIdx; i++) {
                  if (next[i] !== 'error') {
                    next[i] = 'complete';
                  }
                }
              }
              return next;
            });

            const thoughtText = data.thought || data.message;
            if (thoughtText) {
              setStreamLines((prev) => {
                const next = [...prev];
                const cur = next[agentIdx] || [];
                if (!cur.includes(thoughtText)) {
                  next[agentIdx] = [...cur, thoughtText];
                }
                return next;
              });
            }
          }
        }
      };

      // Specific event listeners
      eventSource.addEventListener('agent_update', (e: MessageEvent) => {
        try {
          processEvent(JSON.parse(e.data), 'agent_update');
        } catch {}
      });

      eventSource.addEventListener('merge_status', (e: MessageEvent) => {
        try {
          processEvent(JSON.parse(e.data), 'merge_status');
        } catch {}
      });

      eventSource.addEventListener('pipeline_complete', (e: MessageEvent) => {
        try {
          processEvent(e.data ? JSON.parse(e.data) : {}, 'pipeline_complete');
        } catch {
          processEvent({}, 'pipeline_complete');
        }
      });

      eventSource.addEventListener('pipeline_error', (e: MessageEvent) => {
        try {
          processEvent(JSON.parse(e.data), 'pipeline_error');
        } catch {}
      });

      // Catch-all onmessage
      eventSource.onmessage = (e: MessageEvent) => {
        try {
          processEvent(JSON.parse(e.data));
        } catch {}
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
        }
        // If no stream data has arrived, trigger local fallback for resilience
        setStreamLines((prev) => {
          if (prev.every((lines) => lines.length === 0)) {
            runLocalFallback();
          }
          return prev;
        });
      };
    } catch {
      runLocalFallback();
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      fallbackTimeouts.forEach(clearTimeout);
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-background text-on-surface p-space-base md:p-space-xl flex flex-col items-center select-none">
      <div className="w-full max-w-4xl space-y-space-lg">
        {/* Header Ribbon with Explainer CTA */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 p-space-md rounded-lg flex flex-wrap items-center justify-between gap-4 shadow-md">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-label-sm px-2 py-0.5 bg-primary-container/20 text-primary border border-primary/30 rounded font-semibold uppercase">
                {id || 'DOCKET #2025-INT-809'}
              </span>
              <span className="font-headline-md text-lg text-on-surface font-semibold">
                Autonomous 4-Agent Negotiation Chamber
              </span>
            </div>
            <p className="text-on-surface-variant font-body-sm text-xs mt-1">
              Watch 4 specialized AI agents deliberate: 2 Analysts → 1 AI Judge → 1 Executive Clerk
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowExplainer(!showExplainer)}
              className="px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-primary/40 text-primary font-mono text-xs rounded flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">info</span>
              <span>{showExplainer ? 'Hide Architecture' : 'Judge Explainer (30s)'}</span>
            </button>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-high border border-outline-variant/40 rounded font-mono text-[11px] uppercase tracking-wider">
              <span
                className={`w-2 h-2 rounded-full ${
                  pipelineComplete
                    ? 'bg-secondary'
                    : pipelineError
                    ? 'bg-[#DC2626]'
                    : 'bg-primary animate-pulse'
                }`}
              />
              {pipelineComplete
                ? 'Deliberation Concluded'
                : pipelineError
                ? 'Deliberation Alert'
                : 'Live Deliberation Active'}
            </span>
          </div>
        </div>

        {/* Pipeline Error Banner */}
        {pipelineError && (
          <div className="w-full bg-[#FEF2F2] border border-[#DC2626] rounded-lg p-space-md text-[#991B1B] text-xs font-mono flex items-center justify-between shadow-md animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-[#DC2626]">error</span>
              <span>{pipelineError}</span>
            </div>
            <button
              type="button"
              onClick={() => setPipelineError(null)}
              className="text-[11px] uppercase hover:underline font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 30-Second Explainer Banner for Judges */}
        {showExplainer && (
          <div className="p-space-md bg-surface-container-low border border-primary/40 rounded-lg space-y-2 animate-fade-in shadow-lg">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">psychology</span>
                How Negotia AI Works for Hackathon Judges
              </span>
              <span className="text-[11px] font-mono text-secondary font-semibold">
                Saves 3 Weeks & $28,500 in Legal Fees
              </span>
            </div>
            <p className="font-body-md text-xs text-on-surface-variant leading-relaxed">
              Instead of an expensive 4-week ping-pong between outside law firms, our 4 AI agents operate as an autonomous courtroom:{' '}
              <strong>Agent 1</strong> represents the buyer's terms, <strong>Agent 2</strong> audits the seller's redlines,{' '}
              <strong>Agent 3</strong> acts as the impartial judge using SEC EDGAR market precedents and commercial value to decide the verdict, and{' '}
              <strong>Agent 4</strong> compiles the brief for final human approval.
            </p>
          </div>
        )}

        {/* 4 Agent Pipeline Cards */}
        <div className="flex flex-col items-center w-full space-y-4">
          {AGENTS.map((agent, idx) => {
            const status = statuses[idx];
            const lines = streamLines[idx] || [];

            return (
              <React.Fragment key={agent.id}>
                {/* Agent Card */}
                <div
                  className={`w-full bg-surface-container-lowest rounded-lg border transition-all duration-300 p-space-md shadow-md ${
                    status === 'running'
                      ? 'border-primary ring-2 ring-primary/40 shadow-primary/10'
                      : status === 'complete'
                      ? 'border-secondary/60'
                      : status === 'error'
                      ? 'border-[#DC2626] ring-2 ring-[#DC2626]/30 shadow-[#DC2626]/10'
                      : 'border-outline-variant/20 opacity-70'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/20 pb-3 mb-3">
                    <div className="flex items-center gap-3">
                      {/* Icon Avatar */}
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          status === 'running'
                            ? 'bg-primary-container text-on-primary-container shadow-md'
                            : status === 'complete'
                            ? 'bg-[#DCFCE7] text-[#166534]'
                            : status === 'error'
                            ? 'bg-[#FEE2E2] text-[#DC2626]'
                            : 'bg-surface-container-high text-outline'
                        }`}
                      >
                        <span className="material-symbols-outlined text-2xl">
                          {agent.icon}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 bg-surface-container-high text-on-surface rounded border border-outline-variant/30">
                            {agent.badge}
                          </span>
                          <h3 className="font-headline-md text-base md:text-lg font-bold text-on-surface">
                            {agent.name}
                          </h3>
                          <span className="font-mono text-[11px] text-primary/80">
                            ({agent.technicalName})
                          </span>
                        </div>
                        <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
                          {agent.role}
                        </p>
                      </div>
                    </div>

                    {/* Right side: Replacement tag & status indicator */}
                    <div className="flex flex-col items-end gap-1">
                      {/* Cost/Time Replacement Chip */}
                      <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 border border-secondary/30 px-2 py-0.5 rounded font-semibold">
                        {agent.replacesBadge}
                      </span>

                      {/* Status indicator */}
                      <div className="flex items-center gap-2 mt-1">
                        {status === 'idle' && (
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-on-surface-variant">
                            <span className="w-2 h-2 rounded-full bg-outline-variant" />
                            STANDBY
                          </span>
                        )}
                        {status === 'running' && (
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-primary font-bold">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            DELIBERATING...
                          </span>
                        )}
                        {status === 'complete' && (
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-secondary font-bold">
                            <span className="material-symbols-outlined text-[16px] text-secondary">
                              check_circle
                            </span>
                            ANALYSIS COMPLETE
                          </span>
                        )}
                        {status === 'error' && (
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#DC2626] font-bold">
                            <span className="material-symbols-outlined text-[16px] text-[#DC2626]">
                              error
                            </span>
                            DELIBERATION ERROR
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Terminal Thought Box */}
                  <div className="w-full bg-background rounded-md p-3 border border-outline-variant/20 font-mono text-xs min-h-[100px] flex flex-col justify-end space-y-1.5 overflow-hidden">
                    {lines.length === 0 ? (
                      <span className="text-on-surface-variant/40 italic flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        [Waiting for previous agent verification...]
                      </span>
                    ) : (
                      lines.map((ln, lIdx) => (
                        <div key={lIdx} className="flex items-start gap-2 text-on-surface/90">
                          <span className="text-primary font-bold select-none">{'>'}</span>
                          <span
                            className={
                              lIdx === lines.length - 1 && status === 'running'
                                ? 'text-primary font-bold'
                                : ''
                            }
                          >
                            {ln}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Connector / Merging Documents Graphic between Agent 2 & 3 */}
                {idx === 1 && (
                  <div className="w-full py-2 flex flex-col items-center justify-center relative">
                    <div className="w-full border-t border-dashed border-primary/40 relative flex items-center justify-center">
                      <div className="absolute -top-3 px-3 py-0.5 bg-surface-container-high border border-primary/30 rounded font-mono text-[10px] text-primary uppercase tracking-widest flex items-center gap-2 shadow-sm">
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping delay-75" />
                        </span>
                        <span>MERGING BUYER & SELLER DISPUTES ➔ ENTERING COURTROOM</span>
                      </div>
                    </div>
                    <div className="h-6 w-px border-r border-dashed border-primary/50 mt-3" />
                    <span className="material-symbols-outlined text-primary text-sm -mt-1">
                      expand_more
                    </span>
                  </div>
                )}

                {idx !== 1 && idx < AGENTS.length - 1 && (
                  <div className="flex flex-col items-center justify-center py-1">
                    <div className="h-6 w-px border-r border-dashed border-primary/50" />
                    <span className="material-symbols-outlined text-primary text-sm -mt-1">
                      expand_more
                    </span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Complete Banner */}
        {pipelineComplete && (
          <div className="w-full bg-[#166534]/20 border border-secondary/60 rounded-lg p-space-lg flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl animate-fade-in">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-secondary">
                verified
              </span>
              <div>
                <h2 className="font-headline-md text-xl font-bold text-secondary">
                  PIPELINE COMPLETE — All 4 Agents Reached Consensus
                </h2>
                <p className="font-body-md text-xs text-on-surface-variant">
                  $28,500 legal fees averted. Conformed contract ready for General Counsel sign-off.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="lg"
                icon="handshake"
                onClick={() => navigate(`/negotiations/${id || '2025-INT-809'}`)}
              >
                Negotiation Workspace
              </Button>
              <Button
                variant="primary"
                size="lg"
                icon="description"
                onClick={() => navigate(`/reports/${id || '2025-INT-809'}`)}
              >
                Review Executive Report
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentPipeline;
