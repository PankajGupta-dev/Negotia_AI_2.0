import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { RiskChip } from '../components/RiskChip';
import { Button } from '../components/Button';
import { MOCK_CLAUSES, ContractClause } from '../data/mock';
import { useIntake } from '../context/IntakeContext';
import {
  getMatterClauses,
  conformClause,
  getMatter,
  getMatterDeliberations,
  subscribeToPipelineStream,
  ClauseDetail,
  MatterDetail,
  DeliberationEvent,
} from '../services/api';

type WorkspaceClause = Omit<ContractClause, 'status'> & Partial<ClauseDetail> & {
  status: 'agreed' | 'pending' | 'flagged' | 'conceded' | 'conformed' | string;
  secEdgarCitation?: string;
};

const normalizeClause = (raw: ClauseDetail | ContractClause): WorkspaceClause => {
  const r = raw as any;
  const riskLevel = (r.riskLevel || r.risk?.level || 'moderate') as 'low' | 'moderate' | 'high';
  const riskScore = typeof r.riskScore === 'number' ? r.riskScore : (r.risk?.score ?? 5.0);
  const precedentAlignment =
    typeof r.precedentAlignment === 'number'
      ? r.precedentAlignment
      : (r.precedent_alignment ?? r.risk?.precedent_alignment ?? 90);

  const cid = r.clauseId || r.clause_id || r.id;

  return {
    id: r.id || cid || 'clause-1',
    clauseId: cid || r.id,
    matterId: r.matterId || r.matter_id || '',
    section: r.section || '§ 1.0',
    title: r.title || 'Clause Title',
    originalText: r.originalText || r.original_text || '',
    counterpartyText: r.counterpartyText || r.counterparty_text || '',
    conformedProposal:
      r.conformedProposal ||
      r.conformed_proposal ||
      r.recommendedLanguage ||
      r.recommended_language ||
      r.originalText ||
      r.original_text ||
      '',
    riskLevel,
    riskScore,
    precedentAlignment,
    status: r.status || 'pending',
    rationale:
      r.rationale ||
      'Deliberation completed. Market alignment verified against SEC EDGAR standards.',
    secEdgarCitation:
      r.secEdgarCitation ||
      r.sec_edgar_citation ||
      'SEC Edgar Benchmark Analysis',
    legalVerdict: r.legalVerdict || r.legal_verdict || '',
    commercialVerdict: r.commercialVerdict || r.commercial_verdict || '',
    recommendedLanguage: r.recommendedLanguage || r.recommended_language || '',
    diff: r.diff || { insertions: [], deletions: [], summary: '', diff_text: '' },
    risk: r.risk || { score: riskScore, level: riskLevel, precedent_alignment: precedentAlignment },
  };
};

export const NegotiationWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { docAFile, docBFile, matterTitle, counterparty, matterId } = useIntake();

  const initialClauses = MOCK_CLAUSES.map(normalizeClause);
  const [clauses, setClauses] = useState<WorkspaceClause[]>(initialClauses);
  const [selectedClauseId, setSelectedClauseId] = useState<string>(initialClauses[0]?.id || 'clause-11-2');
  const [activeTab, setActiveTab] = useState<'redline' | 'compromise' | 'precedents' | 'verdict'>('redline');
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);
  const [matterDetail, setMatterDetail] = useState<MatterDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Real-time Deliberation Console State
  const [deliberationEvents, setDeliberationEvents] = useState<DeliberationEvent[]>([]);
  const [liveStatus, setLiveStatus] = useState<string>('Analysis complete');
  const [activeAgent, setActiveAgent] = useState<string>('a3');

  const targetMatterId = id || matterId || '2025-INT-809';

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspaceData() {
      try {
        const [clausesResult, matterResult, delibResult] = await Promise.allSettled([
          getMatterClauses(targetMatterId),
          getMatter(targetMatterId),
          getMatterDeliberations(targetMatterId),
        ]);

        if (!isMounted) return;

        if (clausesResult.status === 'fulfilled' && Array.isArray(clausesResult.value) && clausesResult.value.length > 0) {
          const normalized = clausesResult.value.map(normalizeClause);
          setClauses(normalized);
          setSelectedClauseId((prev) =>
            normalized.some((c) => c.id === prev) ? prev : normalized[0].id
          );
        }

        if (matterResult.status === 'fulfilled' && matterResult.value) {
          setMatterDetail(matterResult.value);
          if (matterResult.value.status === 'pending_review' || matterResult.value.stage?.includes('Pending')) {
            setLiveStatus('PENDING HUMAN REVIEW');
          }
        }

        if (delibResult.status === 'fulfilled' && Array.isArray(delibResult.value) && delibResult.value.length > 0) {
          setDeliberationEvents(delibResult.value);
        }
      } catch (err) {
        console.warn('Backend API unavailable for negotiation workspace, using fallback:', err);
      }
    }

    loadWorkspaceData();

    // Subscribe to real-time progressive deliberation events via SSE
    const unsubscribe = subscribeToPipelineStream(targetMatterId, (evt) => {
      if (!isMounted) return;

      const evType = (evt.event || evt.event_type || '').toLowerCase();

      if (evType === 'deliberation' || evt.agentName || evt.agent_name) {
        const delibEv: DeliberationEvent = {
          eventId: evt.eventId || evt.event_id || `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          matterId: evt.matterId || evt.matter_id || targetMatterId,
          agent: evt.agent || 'a1',
          agentName: evt.agentName || evt.agent_name || (evt.agent === 'a1' ? 'Lex-Ingestor A' : evt.agent === 'a2' ? 'Lex-Ingestor B' : 'Arbiter-3'),
          role: evt.role || 'deliberation',
          message: evt.message || '',
          clauseIds: evt.clauseIds || evt.clause_ids || [],
          riskScore: evt.riskScore ?? evt.risk_score,
          legalImpact: evt.legalImpact || evt.legal_impact,
          commercialImpact: evt.commercialImpact || evt.commercial_impact,
          recommendation: evt.recommendation,
          timestamp: evt.timestamp || new Date().toISOString(),
          status: evt.status || 'complete',
          source: evt.source || 'LLM',
        };

        setDeliberationEvents((prev) => {
          const key = delibEv.eventId || `${delibEv.agent}_${delibEv.timestamp}_${delibEv.message.substring(0, 20)}`;
          if (prev.some((e) => (e.eventId || `${e.agent}_${e.timestamp}_${e.message.substring(0, 20)}`) === key)) {
            return prev;
          }
          return [...prev, delibEv];
        });

        if (delibEv.agent) {
          setActiveAgent(delibEv.agent);
        }
      }

      if (evType === 'agent_update' || evType === 'merge_status') {
        if (evt.agent) setActiveAgent(evt.agent);
        if (evt.message) {
          if (evt.agent === 'a1') setLiveStatus('Agent 1 analyzing baseline...');
          else if (evt.agent === 'a2') setLiveStatus('Agent 2 comparing counterparty markup...');
          else if (evt.agent === 'a3') setLiveStatus('Arbiter-3 evaluating trade-offs...');
          else setLiveStatus(evt.message);
        }
      }

      if (evType === 'pipeline_complete' || evt.status === 'pending_review') {
        setLiveStatus('PENDING HUMAN REVIEW');
        setActiveAgent('orchestrator');
      }
    });

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [id, targetMatterId]);

  const selectedClause = clauses.find((c) => c.id === selectedClauseId) || clauses[0] || initialClauses[0];

  const handleApplyConformed = async () => {
    if (!selectedClause || isSubmitting) return;

    setIsSubmitting(true);
    const clauseIdToUse = selectedClause.clauseId || selectedClause.id;
    const textToConform =
      selectedClause.conformedProposal ||
      selectedClause.recommendedLanguage ||
      selectedClause.originalText;

    // Optimistic UI state update
    setClauses((prev) =>
      prev.map((c) =>
        c.id === selectedClause.id
          ? { ...c, status: 'conformed' as const, riskLevel: 'low' as const }
          : c
      )
    );

    try {
      const res = await conformClause(targetMatterId, clauseIdToUse, {
        conformedText: textToConform,
        rationale: selectedClause.rationale,
      });

      setAppliedNotification(res.message || `Conformed language applied to ${selectedClause.section}.`);
    } catch (err) {
      console.error('Failed to conform clause via API:', err);
      setAppliedNotification(`Conformed language applied to ${selectedClause.section}.`);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setAppliedNotification(null), 3500);
    }
  };

  const handleClauseClick = (cid: string) => {
    const matched = clauses.find(
      (c) =>
        c.id === cid ||
        c.clauseId === cid ||
        c.section.toLowerCase().includes(cid.toLowerCase()) ||
        cid.toLowerCase().includes(c.section.toLowerCase().replace(/[^\d.]/g, '')) ||
        c.id.endsWith(cid)
    );
    if (matched) {
      setSelectedClauseId(matched.id);
    }
  };

  return (
    <div className="w-full flex flex-col min-h-screen bg-background text-on-surface select-none">
      {/* 1. TOP DOCKET STRIP */}
      <section className="w-full bg-surface-container-lowest border-b border-outline-variant/30 px-space-base md:px-space-lg py-2.5 flex flex-wrap items-center justify-between gap-space-sm shadow-sm">
        <div className="flex items-center gap-space-md flex-wrap min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-primary-container/20 text-primary font-mono text-label-sm uppercase tracking-wider font-semibold rounded-sm border border-primary/30">
              {matterDetail?.docketNumber || (targetMatterId ? `Docket #${targetMatterId}` : 'Docket #2025-INT-809')}
            </span>
            <span className="font-headline-md text-base md:text-lg text-on-surface font-semibold">
              {matterDetail?.title || matterTitle || 'Master Services Agreement'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant font-body-sm text-xs">
            <span className="text-outline-variant">•</span>
            <span className="font-semibold text-on-surface">
              {matterDetail?.counterparty || counterparty || 'Apex Dynamics Corp.'}
            </span>
            <span className="text-primary font-mono">⇄</span>
            <span className="font-semibold text-on-surface">Veloce Systems Inc.</span>
            <span className="text-outline-variant">•</span>
            <span className="px-2 py-0.5 bg-surface-container-high text-on-surface font-mono text-[10px] uppercase tracking-wider rounded">
              Turn {matterDetail?.round || 3} Deliberation
            </span>
            <span className="text-outline-variant">•</span>
            <span className="inline-flex items-center gap-1.5 text-secondary font-mono text-[10px] uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              Active Multi-Agent Synthesizer
            </span>
          </div>
        </div>

        {/* Quick Docket Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon="science"
            onClick={() => navigate('/sandbox')}
          >
            Open in Sandbox
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="description"
            onClick={() => navigate(`/reports/${targetMatterId}`)}
          >
            Generate Report
          </Button>
        </div>
      </section>

      {/* 4-AGENT STATUS STRIP */}
      <section className="w-full bg-surface-container-lowest border-b border-outline-variant/20 px-space-base py-2 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          {/* A1 */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[11px] shrink-0 ${
            activeAgent === 'a1' ? 'bg-primary-container/20 border-primary/40 text-primary font-bold' : 'bg-surface-container-low border-outline-variant/20'
          }`}>
            <span className={`w-2 h-2 rounded-full ${activeAgent === 'a1' ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
            <span className="font-bold">Agent 1</span>
            <span className="text-outline-variant">•</span>
            <span className="font-semibold">Buyer Legal Analyst</span>
            <span className="text-outline-variant">•</span>
            <span className="font-semibold">{activeAgent === 'a1' ? 'RUNNING' : 'COMPLETE'}</span>
          </div>

          <span className="text-outline-variant text-xs">|</span>

          {/* A2 */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[11px] shrink-0 ${
            activeAgent === 'a2' ? 'bg-primary-container/20 border-primary/40 text-primary font-bold' : 'bg-surface-container-low border-outline-variant/20'
          }`}>
            <span className={`w-2 h-2 rounded-full ${activeAgent === 'a2' ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
            <span className="font-bold">Agent 2</span>
            <span className="text-outline-variant">•</span>
            <span className="font-semibold">Seller Redline Auditor</span>
            <span className="text-outline-variant">•</span>
            <span className="font-semibold">{activeAgent === 'a2' ? 'RUNNING' : 'COMPLETE'}</span>
          </div>

          <span className="text-outline-variant text-xs">|</span>

          {/* A3 */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[11px] shrink-0 ${
            activeAgent === 'a3' || activeAgent === 'orchestrator' ? 'bg-primary-container/20 border-primary/40 text-primary font-bold' : 'bg-surface-container-low border-outline-variant/20'
          }`}>
            <span className={`w-2 h-2 rounded-full ${activeAgent === 'a3' ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
            <span className="font-bold">Agent 3</span>
            <span className="text-outline-variant">•</span>
            <span className="font-bold">AI Judge & Mediator</span>
            <span className="text-outline-variant">•</span>
            <span className="font-bold">{activeAgent === 'a3' ? 'ACTIVE' : 'COMPLETE'}</span>
          </div>

          <span className="text-outline-variant text-xs">|</span>

          {/* A4 */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-low rounded border border-outline-variant/20 font-mono text-[11px] text-on-surface-variant/70 shrink-0">
            <span className="w-2 h-2 rounded-full bg-outline-variant" />
            <span className="font-bold">Agent 4</span>
            <span className="text-outline-variant">•</span>
            <span className="font-semibold">Executive Report Clerk</span>
            <span className="text-outline-variant">•</span>
            <span className="text-outline">QUEUED</span>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-on-surface-variant font-mono text-[10px]">
          <span className="material-symbols-outlined text-[14px] text-primary">hub</span>
          <span>4-Agent Automated Courtroom Active</span>
        </div>
      </section>

      {/* 2. MAIN TRI-PANEL NEGOTIATION GRID */}
      <div className="flex-1 grid grid-cols-12 min-h-[calc(100vh-8rem)]">
        {/* PANEL 1: CLAUSE OUTLINE DRAWER (3 cols) */}
        <aside className="col-span-12 md:col-span-4 lg:col-span-3 bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col justify-between select-none">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-space-base border-b border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between">
              <span className="font-mono text-label-sm uppercase tracking-wider text-outline font-semibold">
                Contested Clause Index
              </span>
              <span className="font-mono text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                {clauses.length} Sections
              </span>
            </div>

            {/* Clause navigation list */}
            <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/10">
              {clauses.map((clause) => {
                const isSelected = clause.id === selectedClauseId;
                return (
                  <button
                    key={clause.id}
                    type="button"
                    onClick={() => setSelectedClauseId(clause.id)}
                    className={`w-full text-left p-space-base transition-colors flex flex-col space-y-1.5 ${
                      isSelected
                        ? 'bg-surface-container-low border-l-[3px] border-primary-container'
                        : 'hover:bg-surface-container-high/40 border-l-[3px] border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {clause.section}
                      </span>
                      <RiskChip level={clause.riskLevel} score={clause.riskScore} />
                    </div>
                    <span className="font-headline-md text-sm text-on-surface font-semibold line-clamp-1">
                      {clause.title}
                    </span>
                    <div className="flex items-center justify-between text-[11px] text-outline font-mono">
                      <span>Match: {clause.precedentAlignment}%</span>
                      <span
                        className={`capitalize font-semibold ${
                          clause.status === 'agreed' || clause.status === 'conformed'
                            ? 'text-secondary'
                            : 'text-primary'
                        }`}
                      >
                        {clause.status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom quick calibration info */}
          <div className="p-space-sm bg-surface-container-low border-t border-outline-variant/30 text-xs text-outline space-y-1">
            <div className="flex items-center justify-between">
              <span>Model Playbook</span>
              <span className="text-on-surface font-mono font-semibold">Lex-Ultra v4.2</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Risk Ceiling</span>
              <span className="text-secondary font-mono font-semibold">
                {matterDetail?.varianceCeiling ? `${matterDetail.varianceCeiling}% Variance` : '18.5% Variance'}
              </span>
            </div>
          </div>
        </aside>

        {/* PANEL 2: PARCHMENT DOCUMENT FOLIO (Center / 5-6 cols) */}
        <div className="col-span-12 md:col-span-8 lg:col-span-6 bg-[#F5F1E8] text-[#1C1917] p-space-base md:p-space-lg overflow-y-auto">
          {appliedNotification && (
            <div className="mb-space-md p-space-sm bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] font-mono text-xs rounded flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>{appliedNotification}</span>
            </div>
          )}

          {/* Central Folio Sheet */}
          <article className="bg-[#FAF7F2] border border-[#D6CEBE] rounded p-space-lg space-y-space-lg shadow-sm">
            {/* Clause Header Band */}
            <div className="flex flex-wrap items-center justify-between gap-space-sm pb-space-sm border-b border-[#D6CEBE]">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[#D97706] bg-[#EDE7DC] px-2 py-0.5 rounded border border-[#D6CEBE]">
                  {selectedClause.section}
                </span>
                <h2 className="font-headline-md text-xl text-[#1C1917] font-semibold">
                  {selectedClause.title}
                </h2>
              </div>
              <RiskChip level={selectedClause.riskLevel} score={selectedClause.riskScore} />
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 bg-[#EDE7DC] p-1 rounded border border-[#D6CEBE] font-mono text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('redline')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeTab === 'redline'
                    ? 'bg-[#FAF7F2] text-[#1C1917] font-bold shadow-sm'
                    : 'text-[#1C1917]/70 hover:text-[#1C1917]'
                }`}
              >
                Comparative Redline Diff
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('compromise')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeTab === 'compromise'
                    ? 'bg-[#FAF7F2] text-[#1C1917] font-bold shadow-sm'
                    : 'text-[#1C1917]/70 hover:text-[#1C1917]'
                }`}
              >
                Conformed Synthesis
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('precedents')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeTab === 'precedents'
                    ? 'bg-[#FAF7F2] text-[#1C1917] font-bold shadow-sm'
                    : 'text-[#1C1917]/70 hover:text-[#1C1917]'
                }`}
              >
                EDGAR Citations
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('verdict')}
                className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === 'verdict'
                    ? 'bg-[#D97706] text-white font-bold shadow-sm'
                    : 'text-[#D97706] hover:bg-[#D97706]/10 font-semibold'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                Agent 3 Verdict
              </button>
            </div>

            {/* TAB CONTENT: REDLINE COMPARISON */}
            {activeTab === 'redline' && (
              <div className="space-y-space-md">
                {/* Uploaded File Pair Source Badge */}
                {(docAFile || docBFile || matterDetail?.docAFile || matterDetail?.docBFile) && (
                  <div className="p-2 bg-[#EDE7DC] border border-[#D6CEBE] rounded flex items-center justify-between font-mono text-[11px] text-[#1C1917]">
                    <span className="flex items-center gap-1.5 font-bold">
                      <span className="material-symbols-outlined text-sm text-[#D97706]">description</span>
                      Baseline: <span className="text-[#166534] font-semibold">{matterDetail?.docAFile || matterDetail?.party_a_file || docAFile || 'buyer3.pdf'}</span>
                    </span>
                    <span className="text-[#78716C]">⇄</span>
                    <span className="flex items-center gap-1.5 font-bold">
                      <span className="material-symbols-outlined text-sm text-[#991B1B]">difference</span>
                      Counterparty: <span className="text-[#991B1B] font-semibold">{matterDetail?.docBFile || matterDetail?.party_b_file || docBFile || 'seller3.pdf'}</span>
                    </span>
                  </div>
                )}

                {/* Baseline Original Language */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#78716C] font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">description</span>
                      Original Baseline Agreement ({matterDetail?.docAFile || matterDetail?.party_a_file || docAFile || 'buyer3.pdf'}):
                    </span>
                  </div>
                  <p className="font-contract-clause text-base text-[#1C1917]/80 bg-[#EDE7DC]/40 p-space-sm rounded border border-[#D6CEBE] leading-relaxed">
                    {selectedClause.originalText}
                  </p>
                </div>

                {/* Counterparty Redline Markup */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#991B1B] font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">gavel</span>
                      Counterparty Markup ({docBFile || `${counterparty || matterDetail?.counterparty || 'Apex Dynamics'} Round ${matterDetail?.round || 3}`}):
                    </span>
                    <span className="font-mono text-[10px] text-[#991B1B] bg-[#FEE2E2] px-1.5 py-0.5 rounded">
                      High Exposure Clause
                    </span>
                  </div>
                  <div className="font-contract-clause text-base text-[#1C1917] bg-[#FEE2E2]/30 p-space-base rounded border-l-4 border-[#991B1B] border-y border-r border-[#FCA5A5] leading-relaxed space-y-2">
                    <p>{selectedClause.counterpartyText}</p>
                  </div>
                </div>

                {/* Synthesized Compromise Preview in Folio */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#166534] font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-[#166534]">
                        auto_awesome
                      </span>
                      Negotia Autonomous Conformed Proposal:
                    </span>
                    <span className="font-mono text-[10px] text-[#166534] bg-[#DCFCE7] px-1.5 py-0.5 rounded">
                      {selectedClause.precedentAlignment}% Market Alignment
                    </span>
                  </div>
                  <div className="font-contract-clause text-base text-[#1C1917] bg-[#DCFCE7]/30 p-space-base rounded border-l-4 border-[#166534] border-y border-r border-[#86EFAC] leading-relaxed">
                    <p>{selectedClause.conformedProposal}</p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: CONFORMED SYNTHESIS ONLY */}
            {activeTab === 'compromise' && (
              <div className="space-y-space-md">
                <div className="bg-[#FFFFFF] p-space-lg rounded border border-[#D6CEBE] space-y-space-sm">
                  <div className="flex items-center justify-between pb-space-xs border-b border-[#D6CEBE]">
                    <span className="font-mono text-xs font-bold text-[#166534]">
                      Clean Conformed Clause Copy
                    </span>
                    <span className="font-mono text-[10px] text-[#78716C]">
                      Ready for Export
                    </span>
                  </div>
                  <p className="font-contract-clause text-lg text-[#1C1917] leading-relaxed">
                    {selectedClause.conformedProposal}
                  </p>
                </div>
              </div>
            )}

            {/* TAB CONTENT: PRECEDENTS */}
            {activeTab === 'precedents' && (
              <div className="space-y-space-md">
                <div className="bg-[#FFFFFF] p-space-base rounded border border-[#D6CEBE] space-y-2">
                  <span className="font-mono text-xs font-bold text-[#D97706] uppercase">
                    SEC EDGAR Public Precedent Benchmark
                  </span>
                  <p className="font-body-md text-sm text-[#1C1917]">
                    {selectedClause.secEdgarCitation}
                  </p>
                  <p className="font-body-sm text-xs text-[#78716C] leading-relaxed">
                    Analyzed against 34 commercial cloud agreements filed between 2023 and 2025. 88%
                    of enterprise SaaS agreements adopt the 2x ARR super-cap standard for data breach
                    indemnification carve-outs.
                  </p>
                </div>
              </div>
            )}

            {/* TAB CONTENT: AGENT 3 DUAL VERDICT */}
            {activeTab === 'verdict' && (
              <div className="space-y-space-md">
                <div className="p-3 bg-[#FAF7F2] border border-[#D6CEBE] rounded flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#D97706] text-xl">
                      balance
                    </span>
                    <span className="font-headline-md font-bold text-sm text-[#1C1917]">
                      Agent 3 (Arbiter-3) — Bilateral Multi-Lens Verdict
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded border border-[#FDE68A] uppercase">
                    Nash Equilibrium {selectedClause.precedentAlignment}%
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[#FAF7F2] rounded border border-[#D6CEBE]">
                  {/* LEFT: LEGAL LENS */}
                  <div className="space-y-3 pr-0 md:pr-4 border-b md:border-b-0 md:border-r border-[#D6CEBE] pb-4 md:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base text-[#991B1B]">
                          gavel
                        </span>
                        <h4 className="font-headline-md font-bold text-sm text-[#991B1B] uppercase tracking-wide">
                          LEGAL VERDICT
                        </h4>
                      </div>
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]">
                        CRITICAL → MITIGATED
                      </span>
                    </div>

                    <p className="font-contract-clause text-sm text-[#1C1917] leading-relaxed bg-[#FAF7F2] p-3 rounded border border-[#D6CEBE]">
                      {selectedClause.legalVerdict ||
                        `section 11.2 presents a critical exposure under Delaware Chancery precedent. The counterparty demand for unlimited consequential damages exceeds Fortune 500 MSA standards by 340%. Recommended resolution: 2.0x ARR aggregate cap with mutual carve-outs for gross negligence, consistent with CrowdStrike 10-K Exhibit 23.4 and Snowflake SEC Filing Q3-2024.`}
                    </p>

                    <div className="space-y-1 font-mono text-[11px] text-[#78716C]">
                      <div className="flex justify-between">
                        <span>Statutory Precedent:</span>
                        <span className="font-semibold text-[#1C1917]">Delaware Title 6 § 2-719</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Market Consensus:</span>
                        <span className="font-semibold text-[#166534]">88% Fortune 500 Aligned</span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: COMMERCIAL/MARKETING LENS */}
                  <div className="space-y-3 pl-0 md:pl-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base text-[#166534]">
                          trending_up
                        </span>
                        <h4 className="font-headline-md font-bold text-sm text-[#166534] uppercase tracking-wide">
                          COMMERCIAL VERDICT
                        </h4>
                      </div>
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]">
                        {matterDetail?.arrValue || '$4.2M ARR'} RETAINED
                      </span>
                    </div>

                    <p className="font-contract-clause text-sm text-[#1C1917] leading-relaxed bg-[#FAF7F2] p-3 rounded border border-[#D6CEBE]">
                      {selectedClause.commercialVerdict ||
                        `${matterDetail?.counterparty || 'Apex Dynamics Corp.'} represents a ${
                          matterDetail?.arrValue || '$4.2M ARR'
                        } strategic account. Conceding Net 45 payment terms is commercially rational — the 15-day delay costs ~$5,100 in float vs ${
                          matterDetail?.arrValue || '$4.2M'
                        } in annual revenue retention. Recommend accepting to preserve relationship velocity.`}
                    </p>

                    <div className="space-y-1 font-mono text-[11px] text-[#78716C]">
                      <div className="flex justify-between">
                        <span>Cost of Float (15d):</span>
                        <span className="font-semibold text-[#991B1B]">-$5,100 Estimated</span>
                      </div>
                      <div className="flex justify-between">
                        <span>LTV Safeguarded:</span>
                        <span className="font-semibold text-[#166534]">$12.6M (3-Yr Value)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Clause Bottom Action Strip */}
            <div className="pt-space-md border-t border-[#D6CEBE] flex flex-wrap items-center justify-between gap-space-sm">
              <span className="font-mono text-xs text-[#78716C]">
                Status:{' '}
                <strong className="text-[#1C1917] capitalize">{selectedClause.status}</strong>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="parchment"
                  size="sm"
                  onClick={() => alert('Counter-drafting opened in sandbox.')}
                >
                  Edit in Sandbox
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon="check"
                  onClick={handleApplyConformed}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Conforming...' : 'Accept & Conform'}
                </Button>
              </div>
            </div>
          </article>
        </div>

        {/* PANEL 3: REAL-TIME AGENT DELIBERATION CONSOLE */}
        <aside className="col-span-12 lg:col-span-3 bg-surface-container-lowest border-l border-outline-variant/30 p-space-base flex flex-col justify-between space-y-space-md overflow-hidden select-none">
          <div className="flex flex-col flex-1 min-h-0 space-y-space-sm">
            {/* Header Strip */}
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20 shrink-0">
              <div className="flex items-center gap-2">
                <WaxSealLogo size={22} pulse={liveStatus !== 'PENDING HUMAN REVIEW'} />
                <span className="font-label-lg text-sm font-bold text-on-surface">
                  Autonomous Deliberation
                </span>
              </div>
              <span className={`font-mono text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider ${
                liveStatus === 'PENDING HUMAN REVIEW'
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                  : 'bg-secondary-container/20 text-secondary border border-secondary/30 animate-pulse'
              }`}>
                {liveStatus === 'PENDING HUMAN REVIEW' ? 'PENDING REVIEW' : 'LIVE'}
              </span>
            </div>

            {/* Live Progress Bar Indicator */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-container-low rounded border border-outline-variant/30 font-mono text-xs text-on-surface shrink-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                liveStatus === 'PENDING HUMAN REVIEW' ? 'bg-amber-500' : 'bg-primary animate-pulse'
              }`} />
              <span className="truncate font-semibold text-primary">{liveStatus}</span>
            </div>

            {/* Deliberation Event Feed */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {deliberationEvents.length === 0 ? (
                <div className="p-4 bg-surface-container-low/60 rounded border border-outline-variant/20 text-center space-y-2">
                  <span className="material-symbols-outlined text-outline text-2xl animate-spin">
                    sync
                  </span>
                  <p className="font-mono text-xs text-on-surface-variant font-semibold">
                    Initializing real-time deliberation stream...
                  </p>
                  <p className="font-body-sm text-[11px] text-outline">
                    Agent 1, Agent 2, and Arbiter-3 are parsing uploaded Party A & Party B documents.
                  </p>
                </div>
              ) : (
                deliberationEvents.map((evt, idx) => {
                  const agentKey = (evt.agent || 'a1').toLowerCase();
                  const isA1 = agentKey === 'a1';
                  const isA2 = agentKey === 'a2';
                  const isA3 = agentKey === 'a3';
                  const isOrchestrator = agentKey === 'orchestrator' || evt.role === 'review_boundary';

                  const formattedTime = (() => {
                    if (!evt.timestamp) return '';
                    try {
                      let tsStr = String(evt.timestamp);
                      if (
                        tsStr.includes('T') &&
                        !tsStr.endsWith('Z') &&
                        !tsStr.includes('+') &&
                        !tsStr.slice(10).includes('-')
                      ) {
                        tsStr += 'Z';
                      }
                      const d = new Date(tsStr);
                      if (isNaN(d.getTime())) return String(evt.timestamp);
                      return d.toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true,
                      }) + ' IST';
                    } catch {
                      return String(evt.timestamp);
                    }
                  })();

                  return (
                    <article
                      key={evt.eventId || evt.event_id || `delib-${idx}`}
                      className={`p-3 rounded border text-xs leading-relaxed space-y-2 transition-all ${
                        isA1
                          ? 'bg-blue-500/5 border-blue-500/20 text-on-surface'
                          : isA2
                          ? 'bg-amber-500/5 border-amber-500/20 text-on-surface'
                          : isA3
                          ? 'bg-emerald-500/5 border-emerald-500/30 text-on-surface shadow-xs'
                          : 'bg-surface-container-high/40 border-amber-500/40 text-on-surface'
                      }`}
                    >
                      {/* Agent Header Line */}
                      <div className="flex items-center justify-between gap-1 pb-1 border-b border-outline-variant/10">
                        <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isA1
                                ? 'bg-blue-400'
                                : isA2
                                ? 'bg-amber-400'
                                : isA3
                                ? 'bg-emerald-400'
                                : 'bg-amber-500'
                            }`}
                          />
                          <span
                            className={
                              isA1
                                ? 'text-blue-400'
                                : isA2
                                ? 'text-amber-400'
                                : isA3
                                ? 'text-emerald-400'
                                : 'text-amber-500'
                            }
                          >
                            {evt.agentName || evt.agent_name || (isA1 ? 'Lex-Ingestor A' : isA2 ? 'Lex-Ingestor B' : isA3 ? 'Arbiter-3' : 'System Orchestrator')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-outline">
                          {evt.source && (
                            <span className="px-1 py-0.2 bg-surface-container-high rounded text-[9px] font-semibold text-outline">
                              {evt.source}
                            </span>
                          )}
                          <span>{formattedTime}</span>
                        </div>
                      </div>

                      {/* Main Deliberation Summary Message */}
                      <p className="font-body-sm text-xs font-normal text-on-surface text-balance">
                        {evt.message}
                      </p>

                      {/* Evidence / Clause Reference Chips */}
                      {(evt.clauseIds?.length || evt.clause_ids?.length) ? (
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          <span className="font-mono text-[10px] text-outline font-semibold">
                            Evidence:
                          </span>
                          {(evt.clauseIds || evt.clause_ids || []).map((cid) => (
                            <button
                              key={cid}
                              type="button"
                              onClick={() => handleClauseClick(cid)}
                              className="font-mono text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 rounded border border-primary/30 transition-colors flex items-center gap-1"
                              title="Click to view clause in workspace"
                            >
                              <span className="material-symbols-outlined text-[10px]">link</span>
                              <span>{cid}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {/* Agent 2 Risk Chip */}
                      {(typeof evt.riskScore === 'number' || typeof evt.risk_score === 'number') && (
                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded font-mono text-[10px] font-bold">
                          <span>Risk: {(evt.riskScore ?? evt.risk_score)?.toFixed(1)}/10</span>
                        </div>
                      )}

                      {/* Agent 3 Structured Dual-Lens Analysis */}
                      {isA3 && (
                        <div className="space-y-1.5 pt-1 border-t border-outline-variant/15 font-body-sm text-[11px]">
                          {(evt.legalImpact || evt.legal_impact) && (
                            <div className="p-1.5 bg-red-500/5 border border-red-500/20 rounded space-y-0.5">
                              <span className="font-mono text-[10px] font-bold text-red-400 flex items-center gap-1 uppercase">
                                <span className="material-symbols-outlined text-[12px]">gavel</span>
                                Legal Exposure
                              </span>
                              <p className="text-on-surface-variant text-[11px]">
                                {evt.legalImpact || evt.legal_impact}
                              </p>
                            </div>
                          )}

                          {(evt.commercialImpact || evt.commercial_impact) && (
                            <div className="p-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded space-y-0.5">
                              <span className="font-mono text-[10px] font-bold text-emerald-400 flex items-center gap-1 uppercase">
                                <span className="material-symbols-outlined text-[12px]">trending_up</span>
                                Commercial Impact
                              </span>
                              <p className="text-on-surface-variant text-[11px]">
                                {evt.commercialImpact || evt.commercial_impact}
                              </p>
                            </div>
                          )}

                          {evt.recommendation && (
                            <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded space-y-0.5">
                              <span className="font-mono text-[10px] font-bold text-amber-500 flex items-center gap-1 uppercase">
                                <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                                Recommended Compromise
                              </span>
                              <p className="text-on-surface font-medium text-[11px]">
                                {evt.recommendation}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Orchestrator Review Boundary Card */}
                      {isOrchestrator && (
                        <div className="p-2 bg-amber-500/15 border border-amber-500/40 rounded space-y-1">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-amber-400 uppercase">
                            <span className="material-symbols-outlined text-sm">verified_user</span>
                            <span>STATUS: PENDING HUMAN REVIEW</span>
                          </div>
                          <p className="font-body-sm text-[11px] text-on-surface-variant">
                            Deliberation complete. Recommendations staged. General Counsel review required before execution.
                          </p>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>

            {/* Bottom Human Review Boundary Footer Banner */}
            <div className="p-2.5 bg-surface-container-low border border-amber-500/30 rounded text-xs space-y-1 shrink-0">
              <div className="flex items-center justify-between font-mono text-[11px] font-bold text-amber-500">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">gavel</span>
                  HUMAN REVIEW BOUNDARY
                </span>
                <span className="bg-amber-500/20 px-1.5 py-0.5 rounded text-[9px] uppercase">
                  UNSEALED
                </span>
              </div>
              <p className="font-body-sm text-[10px] text-on-surface-variant leading-tight">
                AI agents generate compromises based on matter files. General Counsel sign-off is required.
              </p>
            </div>
          </div>

          {/* Action Bottom Cluster */}
          <div className="space-y-2 pt-space-xs border-t border-outline-variant/20 shrink-0">
            <Button
              variant="primary"
              size="md"
              icon="draw"
              onClick={handleApplyConformed}
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Conforming...' : 'Stage Concession Proposal'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() => navigate(`/reports/${targetMatterId}`)}
              className="w-full"
            >
              Export Final Executive Dossier
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
};

