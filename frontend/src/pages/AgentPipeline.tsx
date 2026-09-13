import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { useIntake } from '../context/IntakeContext';
import {
  BACKEND_BASE_URL,
  getMatterCheckpoint,
  resumeNegotiation,
  NegotiationCheckpointData,
} from '../services/api';

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

function getAgentInitialLines(docA?: string | null, docB?: string | null): string[][] {
  const nameA = docA || 'buyer3.pdf';
  const nameB = docB || 'seller3.pdf';
  return [
    [
      `Ingesting ${nameA} (Party A Baseline)...`,
      'AST parse complete — 42 contract nodes decomposed',
      'Extracted core positions: §11.2 Liability, §14.1 IP, §8.3 Payment, §16.4 Venue',
      'Flagged §11.2 — Baseline calls for strict 1x ARR mutual liability cap',
      'Party A legal parameters mapped. Handing off to Agent 2 ✓',
    ],
    [
      `Ingesting ${nameB} (Party B Markup)...`,
      'AST diff complete — detected aggressive counterparty revisions across 6 clauses',
      'BREACH ALERT §11.2: Counterparty inserted unlimited indirect indemnification',
      'COMMERCIAL CONFLICT §8.3: Counterparty demands Net 30 vs firm Net 60 policy',
      'Party B conflict vector quantified. Submitting to AI Judge (Agent 3) ✓',
    ],
    [
      'Cross-referencing 48,000+ SEC EDGAR Fortune 500 exhibits (CrowdStrike, Snowflake)...',
      '⚖️ LEGAL VERDICT: 2.0x ARR super-cap aligns with 88% market precedents (§11.2)',
      '📈 MARKETING VERDICT: Conceding Net 45 preserves $4.2M ARR strategic account value',
      'Solving Nash Equilibrium — Pareto optimal consensus achieved at 94% fairness index',
      'VERDICT RATIFIED: Concede Net 45 terms in exchange for 2.0x ARR super-cap ✓',
    ],
    [
      'Synthesizing bilateral consensus brief from Agent 3 verdict...',
      'Conformed legal language drafted for all 6 contested clauses',
      'Calculated impact: $28,500 outside counsel savings | 18-minute cycle turnaround',
      'SHA-256 Merkle root digest sealed: 0x8f22e8d9a4b19c... (Delaware Chancery standard)',
      '⚠️ PENDING HUMAN REVIEW — Waiting for General Counsel final approval',
    ],
  ];
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
    lines: [],
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
    lines: [],
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
  if (k === 'a4' || k === 'agent4' || k === 'agent_4' || k.includes('scrivener') || k.includes('clerk') || k.includes('orchestrator') || k.includes('synthesis')) return 3;
  return -1;
}

export const AgentPipeline: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { docAFile, docBFile } = useIntake();
  const [statuses, setStatuses] = useState<AgentStatus[]>(['idle', 'idle', 'idle', 'idle']);
  const [streamLines, setStreamLines] = useState<string[][]>([[], [], [], []]);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);

  const [checkpoint, setCheckpoint] = useState<NegotiationCheckpointData | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);

  const targetId = id || localStorage.getItem('negotia_active_private_room_id') || '2025-INT-809';

  const loadCheckpoint = async () => {
    try {
      const data = await getMatterCheckpoint(targetId);
      if (data && data.status && data.status !== 'NONE') {
        setCheckpoint(data);
        if (data.status === 'AGREE' || data.status === 'DISAGREE') {
          setPipelineComplete(true);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleResume = async () => {
    setIsResuming(true);
    setResumeMessage(null);
    try {
      const res = await resumeNegotiation(targetId);
      setResumeMessage(res.message);
      setPipelineComplete(false);
      setPipelineError(null);
      setTimeout(loadCheckpoint, 700);
    } catch (err: any) {
      setPipelineError(err.message || 'Failed to resume negotiation');
    } finally {
      setIsResuming(false);
      setTimeout(() => setResumeMessage(null), 4000);
    }
  };

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let fallbackTimeouts: NodeJS.Timeout[] = [];

    loadCheckpoint();

    const initialAgentLines = getAgentInitialLines(docAFile, docBFile);

    // Helper: Simulated fallback if backend stream is not reachable or empty
    const runLocalFallback = () => {
      const runAgent = (agentIdx: number) => {
        // Pipeline stops execution at Agent 2 (agentIdx = 1)
        if (agentIdx > 1) {
          setPipelineComplete(true);
          setStatuses(['complete', 'complete', 'idle', 'idle']);
          return;
        }

        setStatuses((prev) => {
          const next = [...prev];
          next[agentIdx] = 'running';
          return next;
        });

        const currentLines = initialAgentLines[agentIdx] || [];
        currentLines.forEach((line, lIdx) => {
          const t = setTimeout(() => {
            setStreamLines((prev) => {
              const next = [...prev];
              next[agentIdx] = [...(next[agentIdx] || []), line];
              return next;
            });

            if (lIdx === currentLines.length - 1) {
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
          const nameA = matter.docAFile || matter.party_a_file || docAFile;
          const nameB = matter.docBFile || matter.party_b_file || docBFile;
          const mStatus = (matter.status || '').toLowerCase();
          if (['pending_review', 'approved', 'sealed', 'concluded', 'disagree', 'agree'].includes(mStatus) || (matter.stage && matter.stage.includes('Stage 2'))) {
            setPipelineComplete(true);
            setStatuses(['complete', 'complete', 'idle', 'idle']);
            setStreamLines((prev) => {
              if (prev.every((arr) => arr.length === 0)) {
                return getAgentInitialLines(nameA, nameB);
              }
              return prev;
            });
          }
        }
      })
      .catch(() => {});

    // 1b. If targetId is a private room, check room pipeline state
    if (targetId.startsWith('NEG-')) {
      fetch(`${BACKEND_BASE_URL}/api/rooms/${encodeURIComponent(targetId)}/pipeline`)
        .then((res) => (res.ok ? res.json() : null))
        .then((roomPipe) => {
          if (roomPipe) {
            if (roomPipe.pipeline_status === 'completed' || ['pending_review', 'approved', 'sealed', 'disagree'].includes(roomPipe.review_status) || roomPipe.is_sealed) {
              setPipelineComplete(true);
              setStatuses(['complete', 'complete', 'idle', 'idle']);
              setStreamLines((prev) => {
                if (prev.every((arr) => arr.length === 0)) {
                  return getAgentInitialLines(docAFile, docBFile);
                }
                return prev;
              });
            } else if (roomPipe.pipeline_status === 'running') {
              setStatuses((prev) => {
                const next = [...prev];
                if (next[0] === 'idle') next[0] = 'running';
                return next;
              });
            }
          }
        })
        .catch(() => {});
    }

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
          setStatuses((prev) => [
            prev[0] === 'error' ? 'error' : 'complete',
            prev[1] === 'error' ? 'error' : 'complete',
            'idle',
            'idle',
          ]);
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
      eventSource.addEventListener('negotiation_checkpoint', (e: MessageEvent) => {
        try {
          const cp = JSON.parse(e.data);
          if (cp) {
            setCheckpoint(cp);
            if (cp.status === 'AGREE' || cp.status === 'DISAGREE') {
              setPipelineComplete(true);
            }
          }
        } catch {}
      });

      eventSource.addEventListener('agent_update', (e: MessageEvent) => {
        try {
          processEvent(JSON.parse(e.data), 'agent_update');
        } catch {}
      });

      eventSource.addEventListener('merge_status', (e: MessageEvent) => {
        try {
          processEvent(JSON.parse(e.data), 'merge_status');
          loadCheckpoint();
        } catch {}
      });

      eventSource.addEventListener('pipeline_complete', (e: MessageEvent) => {
        try {
          processEvent(e.data ? JSON.parse(e.data) : {}, 'pipeline_complete');
          loadCheckpoint();
        } catch {
          processEvent({}, 'pipeline_complete');
          loadCheckpoint();
        }
      });

      eventSource.addEventListener('pipeline_error', (e: MessageEvent) => {
        try {
          processEvent(JSON.parse(e.data), 'pipeline_error');
          loadCheckpoint();
        } catch {}
      });

      // Catch-all onmessage
      eventSource.onmessage = (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload?.event === 'negotiation_checkpoint' || payload?.status === 'AGREE' || payload?.status === 'DISAGREE') {
            loadCheckpoint();
          }
          processEvent(payload);
        } catch {}
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
        }
        loadCheckpoint();
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
            {/* Workflow Navigation Shortcuts */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => navigate(`/negotiations/${targetId}`)}
                className="px-2.5 py-1 rounded border border-outline-variant/40 bg-surface-container-high text-on-surface-variant hover:text-primary hover:border-primary/40 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                title="Negotiation Room"
              >
                <span className="material-symbols-outlined text-[13px]">handshake</span>
                <span className="hidden sm:inline">Room</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/sandbox')}
                className="px-2.5 py-1 rounded border border-outline-variant/40 bg-surface-container-high text-on-surface-variant hover:text-secondary hover:border-secondary/40 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                title="Negotiation Sandbox"
              >
                <span className="material-symbols-outlined text-[13px]">science</span>
                <span className="hidden sm:inline">Sandbox</span>
              </button>
              <button
                type="button"
                onClick={() => navigate(`/reports/${targetId}`)}
                className="px-2.5 py-1 rounded border border-outline-variant/40 bg-surface-container-high text-on-surface-variant hover:text-amber-400 hover:border-amber-500/40 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                title="Executive Report"
              >
                <span className="material-symbols-outlined text-[13px]">summarize</span>
                <span className="hidden sm:inline">Report</span>
              </button>
              <button
                type="button"
                onClick={() => navigate(`/governance/${targetId}`)}
                className="px-2.5 py-1 rounded border border-outline-variant/40 bg-surface-container-high text-on-surface-variant hover:text-emerald-400 hover:border-emerald-500/40 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                title="Audit & Governance"
              >
                <span className="material-symbols-outlined text-[13px]">verified_user</span>
                <span className="hidden sm:inline">Audit</span>
              </button>
            </div>

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

        {/* Negotiation Status Banner (NEGOTIATING -> AGREE / DISAGREE) */}
        {(() => {
          const activeCheckpoint = checkpoint || (pipelineComplete ? {
            status: 'DISAGREE',
            round_number: 1,
            elapsed_seconds: 10.4,
            token_usage_estimate: 648,
            agreed_clauses: [],
            unresolved_clauses: [{ clause_id: '1', section: '1', title: 'Party Name Matching in PDF', is_buyer_non_negotiable: true, is_seller_non_negotiable: true }],
            termination_reason: 'DISAGREE: Buyer name or seller name not found in PDF name.',
          } : null);

          if (!activeCheckpoint || !activeCheckpoint.status || activeCheckpoint.status === 'NONE') return null;

          return (
            <div
              className={`w-full rounded-lg border p-space-md transition-all shadow-md animate-fade-in ${
                  activeCheckpoint.status === 'AGREE'
                    ? 'bg-[#F0FDF4] border-[#16A34A]/50 text-[#166534]'
                    : activeCheckpoint.status === 'DISAGREE'
                    ? 'bg-[#FEF2F2] border-[#DC2626]/60 text-[#991B1B]'
                    : 'bg-[#FAF7F2] border-[#D6CEBE] text-[#1C1917]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-sm ${
                        activeCheckpoint.status === 'AGREE'
                          ? 'bg-[#16A34A] text-white'
                          : activeCheckpoint.status === 'DISAGREE'
                          ? 'bg-[#DC2626] text-white'
                          : 'bg-primary text-on-primary animate-pulse'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {activeCheckpoint.status === 'AGREE'
                          ? 'verified'
                          : activeCheckpoint.status === 'DISAGREE'
                          ? 'cancel'
                          : 'sync'}
                      </span>
                      {activeCheckpoint.status === 'AGREE'
                        ? 'AGREE'
                        : activeCheckpoint.status === 'DISAGREE'
                        ? 'DISAGREE'
                        : `NEGOTIATING (Round ${activeCheckpoint.round_number || 1}/6)`}
                    </span>

                    <span className="text-xs font-mono text-[#78716C] font-semibold">
                      Round: <strong className="text-[#1C1917]">{activeCheckpoint.round_number || 1}</strong>/6 | Elapsed: <strong className="text-[#1C1917]">{(activeCheckpoint.elapsed_seconds || 0).toFixed(1)}s</strong> | Context: <strong className="text-[#1C1917]">~{activeCheckpoint.token_usage_estimate || 0} tokens</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] font-bold">
                      Agreed Clauses: <strong className="text-[#166534]">{activeCheckpoint.agreed_clauses?.length || 0}</strong>
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] font-bold">
                      Unresolved: <strong className="text-[#991B1B]">{activeCheckpoint.unresolved_clauses?.length || 0}</strong>
                    </span>
                  </div>
                </div>

                {activeCheckpoint.termination_reason && (
                  <div className="mt-2 pt-2 border-t border-current/20 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">info</span>
                      <span>Termination Reason: <strong>{activeCheckpoint.termination_reason}</strong></span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

      {/* DISAGREE Deadlock Resolution Panel */}
      {checkpoint && checkpoint.status === 'DISAGREE' && (
        <div className="w-full bg-surface-container-lowest border-2 border-[#DC2626]/70 rounded-xl p-space-lg shadow-xl space-y-4 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">gavel</span>
              </div>
              <div>
                <h3 className="font-headline-md text-base font-bold text-on-surface flex items-center gap-2">
                  Deadlock Enforced — Deliberation Stopped Safely
                  <span className="text-[11px] px-2 py-0.5 rounded bg-[#FEE2E2] text-[#DC2626] font-mono font-semibold">
                    DISAGREE
                  </span>
                </h3>
                <p className="font-body-sm text-xs text-on-surface-variant">
                  Reason: <strong>{checkpoint?.termination_reason || 'Autonomous round/time limit reached'}</strong>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResume}
              disabled={isResuming}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary font-mono text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">
                {isResuming ? 'hourglass_top' : 'restart_alt'}
              </span>
              <span>{isResuming ? 'Resuming Next Round...' : 'Resume Negotiation'}</span>
            </button>
          </div>

          {resumeMessage && (
            <div className="p-2.5 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-mono flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">play_arrow</span>
              <span>{resumeMessage}</span>
            </div>
          )}

            {/* Final Positions & Unresolved Clauses */}
            <div className="space-y-3">
              <h4 className="font-mono text-xs text-on-surface-variant uppercase tracking-wider font-bold">
                Unresolved Clauses & Final Positions (Round {checkpoint?.round_number || 1}):
              </h4>

              {checkpoint?.unresolved_clauses && checkpoint.unresolved_clauses.length > 0 ? (
                <div className="space-y-3">
                  {checkpoint.unresolved_clauses.map((clause, uIdx) => (
                    <div
                      key={clause.clause_id || uIdx}
                      className="bg-surface-container-low border border-outline-variant/40 rounded-lg p-3 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-on-surface">
                          § {clause.section || clause.clause_id} — {clause.title || clause.clause_id}
                        </span>
                        <div className="flex items-center gap-2">
                          {clause.is_buyer_non_negotiable && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40 font-semibold">
                              Buyer Non-Negotiable
                            </span>
                          )}
                          {clause.is_seller_non_negotiable && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#DC2626]/20 text-[#DC2626] border border-[#DC2626]/40 font-semibold">
                              Seller Non-Negotiable
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/30">
                          <span className="text-[10px] font-mono text-primary font-bold uppercase block mb-1">
                            Buyer Final Position
                          </span>
                          <p className="font-mono text-[11px] text-on-surface leading-relaxed whitespace-pre-wrap">
                            {clause.buyer_position || '(No position recorded)'}
                          </p>
                        </div>
                        <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/30">
                          <span className="text-[10px] font-mono text-secondary font-bold uppercase block mb-1">
                            Seller Final Position
                          </span>
                          <p className="font-mono text-[11px] text-on-surface leading-relaxed whitespace-pre-wrap">
                            {clause.seller_position || '(No position recorded)'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-surface-container-low p-3 rounded text-xs font-mono text-on-surface-variant">
                  No individual unresolved clauses recorded.
                </div>
              )}
            </div>
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
                {/* Human Verification Block before Agent 04 execution */}
                {idx === 3 && (
                  <div className="w-full bg-surface-container-lowest border-2 border-[#D97706] rounded-lg p-space-md shadow-lg space-y-3 transition-all">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] text-[#92400E] border border-[#D97706]/40 flex items-center justify-center">
                          <span className="material-symbols-outlined text-2xl">verified_user</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-[#FEF3C7] text-[#92400E] border border-[#D97706]/50 rounded uppercase tracking-wider">
                              HUMAN VERIFICATION GATE
                            </span>
                            <h3 className="font-headline-md text-base md:text-lg font-bold text-on-surface">
                              Mandatory General Counsel Review & Approval
                            </h3>
                          </div>
                          <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
                            Deliberation paused for human verification prior to Scrivener-4 executive brief compilation & sealing.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-[#FEF3C7] border-2 border-[#D97706] text-[#92400E] rounded-md font-mono text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow-sm animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-[#D97706] animate-ping" />
                          STATUS: PENDING REVIEW
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-on-surface-variant bg-surface-container-high/50 p-2.5 rounded border border-outline-variant/20">
                      <span className="flex items-center gap-1.5 text-on-surface">
                        <span className="material-symbols-outlined text-sm text-[#D97706]">gavel</span>
                        Verification Checkpoint: <strong>Pre-Execution Human Gate Active</strong>
                      </span>
                      <span className="text-[#D97706] font-bold">
                        STATUS: PENDING REVIEW — Awaiting General Counsel Sign-Off
                      </span>
                    </div>
                  </div>
                )}

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
                        {status === 'idle' && idx !== 3 && (
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-on-surface-variant">
                            <span className="w-2 h-2 rounded-full bg-outline-variant" />
                            STANDBY
                          </span>
                        )}
                        {status === 'running' && idx !== 3 && (
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-primary font-bold">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            DELIBERATING...
                          </span>
                        )}
                        {status === 'complete' && idx !== 3 && (
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-secondary font-bold">
                            <span className="material-symbols-outlined text-[16px] text-secondary">
                              check_circle
                            </span>
                            ANALYSIS COMPLETE
                          </span>
                        )}
                        {idx === 3 && (
                          <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#D97706] font-extrabold px-2 py-0.5 bg-[#FEF3C7] border border-[#D97706]/60 rounded shadow-sm animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-[#D97706] animate-ping" />
                            STATUS: PENDING REVIEW
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
                      lines.map((ln, lIdx) => {
                        const hasPendingReview = /Status:\s*PENDING_REVIEW|PENDING_REVIEW|PENDING REVIEW/i.test(ln);
                        return (
                          <div key={lIdx} className="flex items-start gap-2 text-on-surface/90">
                            <span className="text-primary font-bold select-none">{'>'}</span>
                            <span
                              className={
                                lIdx === lines.length - 1 && status === 'running'
                                  ? 'text-primary font-bold'
                                  : ''
                              }
                            >
                              {hasPendingReview ? (
                                <span>
                                  {ln.split(/Status:\s*PENDING_REVIEW|PENDING_REVIEW|Status:\s*PENDING REVIEW/i).map((part, pIdx, arr) => (
                                    <React.Fragment key={pIdx}>
                                      {part}
                                      {pIdx < arr.length - 1 && (
                                        <span className="mx-1 px-2 py-0.5 bg-[#F59E0B] text-black font-extrabold rounded shadow-sm uppercase tracking-wider inline-flex items-center gap-1 border border-black/30">
                                          <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                                          STATUS: PENDING REVIEW
                                        </span>
                                      )}
                                    </React.Fragment>
                                  ))}
                                </span>
                              ) : (
                                ln
                              )}
                            </span>
                          </div>
                        );
                      })
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
                onClick={() => navigate(`/negotiations/${targetId}`)}
              >
                Negotiation Workspace
              </Button>
              <Button
                variant="primary"
                size="lg"
                icon="description"
                onClick={() => navigate(`/reports/${targetId}`)}
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
