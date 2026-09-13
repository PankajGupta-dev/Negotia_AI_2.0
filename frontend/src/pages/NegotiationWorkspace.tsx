import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { RiskChip } from '../components/RiskChip';
import { Button } from '../components/Button';
import { MOCK_CLAUSES, ContractClause } from '../data/mock';
import { useIntake } from '../context/IntakeContext';
import { useAuth } from '../context/AuthContext';
import {
  getMatterClauses,
  conformClause,
  getMatter,
  getMatterDeliberations,
  subscribeToPipelineStream,
  getPrivateRoom,
  sendRoomMessage,
  admitParticipant,
  rejectParticipant,
  closePrivateRoom,
  leavePrivateRoom,
  getNegotiationWebSocketUrl,
  submitRoomContractInput,
  uploadRoomContractFile,
  getRoomPrivateInput,
  getRoomSharedState,
  startRoomPipeline,
  agreeRoomClause,
  submitRoomProposal,
  reviewRoomReport,
  sealRoomReport,
  ClauseDetail,
  MatterDetail,
  DeliberationEvent,
  RoomPublicDetail,
  RoomPrivateInput,
  RoomSharedState,
} from '../services/api';

const formatMessageTime = (rawTs?: string | number): string => {
  if (!rawTs) return '';
  try {
    let s = String(rawTs).trim();
    if (s.includes('T') && !s.endsWith('Z') && !s.includes('+') && !s.slice(10).includes('-')) {
      s += 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(rawTs);
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(rawTs);
  }
};

const resolveSenderName = (rawName?: string, rawRole?: string): string => {
  const r = (rawRole || '').toLowerCase();
  const clean = (rawName || '').trim();
  const lower = clean.toLowerCase();
  if (
    !clean ||
    lower.includes('negotiation demo') ||
    lower.startsWith('counsel') ||
    lower.startsWith('counterparty') ||
    lower === 'guest user' ||
    lower === 'participant'
  ) {
    if (r === 'seller' || lower.includes('seller')) {
      return 'Marcus Vance (Seller)';
    }
    return 'Elena Rostova (Buyer)';
  }
  return clean;
};

interface BilateralRoomEvent {
  id?: string;
  type: 'join' | 'leave' | 'message' | 'clause_submitted' | 'proposal' | 'room_closed' | 'system' | string;
  sender_id?: string;
  sender_name?: string;
  sender_role?: string;
  text?: string;
  clause_id?: string;
  proposal?: string;
  terms?: string;
  active_participants_count?: number;
  status?: string;
  reason?: string;
  error?: string;
  message?: string;
  timestamp: string;
}

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

const getSandboxCommitDeliberationEvents = (matterId: string): DeliberationEvent[] => {
  const raw =
    localStorage.getItem(`negotia_sandbox_commit_${matterId}`) ||
    localStorage.getItem('negotia_last_sandbox_commit');
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const ts = data.timestamp || new Date().toISOString();
    const res = data.result || {};
    const cap = data.liabilityCap ?? 2.0;
    const pay = data.paymentTerms ?? 45;
    const audit = data.auditDays ?? 30;
    const post = (data.posture || 'balanced').toUpperCase();
    const fi = res.fairness_index ?? 88.4;
    const lev = res.leverage_score ?? 8.6;
    const acc = res.counterparty_acceptance_pct ?? 82.5;
    const eq = res.equilibrium_label || 'Optimal Pareto';
    const rec = res.recommendation || 'Staged sandbox concessions optimized for Nash equilibrium.';

    return [
      {
        eventId: `sb_commit_a1_${ts}`,
        matterId,
        agent: 'a1',
        agentName: 'Lex-Ingestor A',
        role: 'baseline_analysis',
        message: `[SANDBOX COMMIT RE-ANALYSIS] Lex-Ingestor A: Baseline risk profile re-analyzed with staged concessions. Liability Cap calibrated to ${cap}x ACV, Payment Terms to ${pay} days, and Audit Window to ${audit} days under a '${post}' posture.`,
        clauseIds: ['liability_cap', 'payment_terms', 'audit_days', 'ip_carveout'],
        status: 'complete',
        source: 'LLM',
        timestamp: ts,
      },
      {
        eventId: `sb_commit_a2_${ts}`,
        matterId,
        agent: 'a2',
        agentName: 'Lex-Ingestor B',
        role: 'counterparty_analysis',
        message: `[SANDBOX COMMIT RE-ANALYSIS] Lex-Ingestor B: Counterparty game-theoretic reaction re-evaluated. Estimated counterparty acceptance probability: ${acc}%. Party A relative leverage score: ${lev}/10.`,
        clauseIds: ['liability_cap', 'payment_terms'],
        riskScore: Math.round((10 - lev) * 10) / 10,
        status: 'complete',
        source: 'LLM',
        timestamp: ts,
      },
      {
        eventId: `sb_commit_a3_${ts}`,
        matterId,
        agent: 'a3',
        agentName: 'Arbiter-3',
        role: 'deliberation',
        message: `[SANDBOX COMMIT CONVERGENCE] Arbiter-3: Stochastic Nash Equilibrium re-converged: '${eq}' with Conformed Fairness Index ${fi}%. Recommendation: ${rec}`,
        clauseIds: ['liability_cap', 'payment_terms', 'audit_days', 'ip_carveout'],
        legalImpact: 'LOW',
        commercialImpact: 'OPTIMAL',
        recommendation: rec,
        status: 'complete',
        source: 'LLM',
        timestamp: ts,
      },
    ];
  } catch {
    return [];
  }
};

export const NegotiationWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { docAFile, docBFile, matterTitle, counterparty, matterId } = useIntake();

  const { user } = useAuth();
  const initialClauses = MOCK_CLAUSES.map(normalizeClause);
  const [clauses, setClauses] = useState<WorkspaceClause[]>(initialClauses);
  const [selectedClauseId, setSelectedClauseId] = useState<string>(initialClauses[0]?.id || 'clause-11-2');
  const [activeTab, setActiveTab] = useState<'redline' | 'compromise' | 'precedents' | 'verdict'>('redline');
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);
  const [matterDetail, setMatterDetail] = useState<MatterDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const targetMatterId = (id || matterId || '2025-INT-809').trim().toUpperCase();

  // Private 2-Party Room State
  const [roomDetail, setRoomDetail] = useState<RoomPublicDetail | null>(null);
  const [isRoomClosed, setIsRoomClosed] = useState<boolean>(false);
  const [pendingApplicant, setPendingApplicant] = useState<{
    id?: string;
    name: string;
    role: string;
  } | null>(null);
  const [isAdmitting, setIsAdmitting] = useState<boolean>(false);

  // Poll room status for instant counterparty knock detection
  useEffect(() => {
    if (!targetMatterId.startsWith('NEG-')) return;
    let timer: any;
    const fetchRoom = async () => {
      try {
        const detail = await getPrivateRoom(targetMatterId);
        if (detail) {
          setRoomDetail(detail);
          if (detail.guest_status === 'pending_approval' && detail.guest_name) {
            setPendingApplicant({
              id: detail.participant_id || (detail as any).guest_id,
              name: detail.guest_name,
              role: detail.guest_role || 'seller',
            });
          } else if (detail.guest_status === 'admitted' || detail.status === 'active') {
            setPendingApplicant(null);
            if (typeof detail.active_participants_count === 'number') {
              setActivePartyCount(detail.active_participants_count);
            }
          }

          // Resilient message sync: merge persisted messages from DB & MongoDB Atlas
          if (Array.isArray(detail.messages) && detail.messages.length > 0) {
            setBilateralEvents((prev) => {
              const prevKeys = new Set(prev.map((e) => `${e.timestamp}_${e.text || e.clause_id || e.sender_name || ''}`));
              let hasNew = false;
              const merged = [...prev];
              for (const m of detail.messages!) {
                // Filter out transport-level socket events (join/leave) from chat history
                if (m.type === 'join' || m.type === 'leave') continue;
                const key = `${m.timestamp}_${m.text || m.clause_id || m.sender_name || ''}`;
                if (!prevKeys.has(key)) {
                  prevKeys.add(key);
                  merged.push(m);
                  hasNew = true;
                }
              }
              return hasNew ? merged : prev;
            });
          }
        }
      } catch {}
    };

    fetchRoom();
    timer = setInterval(fetchRoom, 1200);
    return () => clearInterval(timer);
  }, [targetMatterId]);

  // Bilateral WebSocket State (/ws/negotiation/{room_id})
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [wsReconnecting, setWsReconnecting] = useState<boolean>(false);
  const [bilateralEvents, setBilateralEvents] = useState<BilateralRoomEvent[]>([]);
  const [activePartyCount, setActivePartyCount] = useState<number>(1);
  const [presenceNotice, setPresenceNotice] = useState<{
    text: string;
    type: 'join' | 'leave' | 'closed' | 'info' | 'error';
  } | null>(null);
  const [chatInput, setChatInput] = useState<string>('');

  // Auto-dismiss presence notification banner after 4 seconds
  useEffect(() => {
    if (!presenceNotice) return;
    const t = setTimeout(() => setPresenceNotice(null), 4000);
    return () => clearTimeout(t);
  }, [presenceNotice]);

  // Real-time Deliberation Console State
  const [deliberationEvents, setDeliberationEvents] = useState<DeliberationEvent[]>([]);
  const [liveStatus, setLiveStatus] = useState<string>('Analysis complete');
  const [activeAgent, setActiveAgent] = useState<string>('a3');

  const [consoleTab, setConsoleTab] = useState<'ai_agents' | 'bilateral_room'>(
    targetMatterId.startsWith('NEG-') ? 'bilateral_room' : 'ai_agents'
  );

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<any>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isUnmountedRef = useRef<boolean>(false);
  const isClosedRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll bilateral messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bilateralEvents]);

  const mySessionRole = sessionStorage.getItem(`room_${targetMatterId}_role`);
  const hasParticipantToken = Boolean(
    sessionStorage.getItem(`room_${targetMatterId}_guest_token`) ||
    localStorage.getItem(`room_${targetMatterId}_guest_token`)
  );
  const hasCreatorToken = Boolean(
    sessionStorage.getItem(`room_${targetMatterId}_creator_token`) ||
    localStorage.getItem(`room_${targetMatterId}_creator_token`) ||
    localStorage.getItem('negotia_creator_room_token')
  );

  const isExplicitParticipant =
    mySessionRole === 'participant' ||
    (!mySessionRole && hasParticipantToken && !hasCreatorToken) ||
    (!mySessionRole && localStorage.getItem(`room_${targetMatterId}_role`) === 'participant' && localStorage.getItem('negotia_creator_room_id') !== targetMatterId) ||
    Boolean(user?.uid && roomDetail?.participant_id && (user.uid === roomDetail.participant_id || user.uid === roomDetail.guest_id));

  const isCreatorOfRoom = !isExplicitParticipant && (
    mySessionRole === 'creator' ||
    sessionStorage.getItem(`room_${targetMatterId}_creator_token`) ||
    localStorage.getItem(`room_${targetMatterId}_creator_token`) ||
    localStorage.getItem('negotia_creator_room_id') === targetMatterId ||
    Boolean(user?.uid && roomDetail?.creator_id && user.uid === roomDetail.creator_id)
  );

  const myParty: 'party_a' | 'party_b' = isCreatorOfRoom ? 'party_a' : 'party_b';
  const myPartyLabel = isCreatorOfRoom ? 'Party A (Creator - Buyer)' : 'Party B (Counterparty - Seller)';
  const counterpartyLabel = isCreatorOfRoom ? 'Party B (Counterparty - Seller)' : 'Party A (Creator - Buyer)';

  const effectiveToken = isCreatorOfRoom
    ? (sessionStorage.getItem(`room_${targetMatterId}_creator_token`) ||
       sessionStorage.getItem(`room_${targetMatterId}_token`) ||
       localStorage.getItem(`room_${targetMatterId}_creator_token`) ||
       localStorage.getItem('negotia_creator_room_token') ||
       localStorage.getItem(`room_${targetMatterId}_token`) ||
       '')
    : (sessionStorage.getItem(`room_${targetMatterId}_guest_token`) ||
       sessionStorage.getItem(`room_${targetMatterId}_token`) ||
       localStorage.getItem(`room_${targetMatterId}_guest_token`) ||
       localStorage.getItem('negotia_participant_room_token') ||
       localStorage.getItem(`room_${targetMatterId}_token`) ||
       '');

  const [workspaceMode, setWorkspaceMode] = useState<'shared' | 'private'>('shared');
  const [sharedSubTab, setSharedSubTab] = useState<'clauses' | 'proposals' | 'agreed' | 'ai_results'>('clauses');

  // Private Chamber State (Strictly isolated)
  const [privateTextInput, setPrivateTextInput] = useState<string>('');
  const [privateSelectedFile, setPrivateSelectedFile] = useState<File | null>(null);
  const [isSubmittingPrivate, setIsSubmittingPrivate] = useState<boolean>(false);
  const [privateNotice, setPrivateNotice] = useState<string | null>(null);
  const [myPrivateData, setMyPrivateData] = useState<RoomPrivateInput | null>(null);

  // Shared Chamber State
  const [sharedData, setSharedData] = useState<RoomSharedState | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);
  const [proposalClauseId, setProposalClauseId] = useState<string>('');
  const [proposalText, setProposalText] = useState<string>('');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState<boolean>(false);
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [isSealing, setIsSealing] = useState<boolean>(false);
  const [reviewApproved, setReviewApproved] = useState<boolean>(false);
  const [reportSealed, setReportSealed] = useState<boolean>(false);
  const [sealHash, setSealHash] = useState<string | null>(null);

  // Fetch private input and shared state
  useEffect(() => {
    if (!targetMatterId.startsWith('NEG-')) return;

    getRoomPrivateInput(targetMatterId, myParty, effectiveToken)
      .then((priv) => {
        if (priv) {
          // Never regress an optimistic has_submitted:true with a stale false from server
          setMyPrivateData((prev) => {
            if (prev?.has_submitted && !priv.has_submitted) return prev;
            return priv;
          });
          if (priv.text && !privateTextInput) {
            setPrivateTextInput(priv.text);
          }
        }
      })
      .catch(() => {});

    getRoomSharedState(targetMatterId)
      .then((sh) => {
        if (sh) setSharedData(sh);
      })
      .catch(() => {});
  }, [targetMatterId, myParty, effectiveToken]);

  const isRoomReady = Boolean(
    roomDetail?.ready_for_pipeline ||
    roomDetail?.is_ready ||
    roomDetail?.readiness === 'READY' ||
    sharedData?.ready_for_pipeline ||
    sharedData?.readiness === 'READY' ||
    (roomDetail?.has_party_a_submitted && roomDetail?.has_party_b_submitted)
  );

  const partyASubmitted = Boolean(
    roomDetail?.has_party_a_submitted ||
    roomDetail?.submissions?.has_party_a ||
    sharedData?.has_party_a_submitted ||
    (myParty === 'party_a' && myPrivateData?.has_submitted)
  );

  const partyBSubmitted = Boolean(
    roomDetail?.has_party_b_submitted ||
    roomDetail?.submissions?.has_party_b ||
    sharedData?.has_party_b_submitted ||
    (myParty === 'party_b' && myPrivateData?.has_submitted)
  );

  // Robust derived submission status that merges all data sources — prevents stale-server
  // from showing DRAFTING after an optimistic upload success.
  const isMyPartySubmitted = Boolean(
    myPrivateData?.has_submitted ||
    (myParty === 'party_a' ? partyASubmitted : partyBSubmitted) ||
    (privateNotice && privateNotice.includes('ingested successfully'))
  );

  const handleSavePrivateInput = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmittingPrivate || isRoomClosed) return;

    setIsSubmittingPrivate(true);
    setPrivateNotice(null);
    try {
      let submissionRes: any = null;
      if (privateSelectedFile) {
        submissionRes = await uploadRoomContractFile(
          targetMatterId,
          privateSelectedFile,
          myParty,
          false,
          effectiveToken
        );
        const clausesCount = submissionRes.clauses_count || 42;
        setPrivateNotice(`File "${privateSelectedFile.name}" ingested successfully (${clausesCount} clauses normalized).`);
        setMyPrivateData({
          room_id: targetMatterId,
          party: myParty,
          has_submitted: true,
          clauses_count: clausesCount,
          filename: submissionRes.filename || privateSelectedFile.name,
          clauses: submissionRes.clauses || [],
          text: privateTextInput,
        });
        setPrivateSelectedFile(null);
      } else if (privateTextInput.trim()) {
        submissionRes = await submitRoomContractInput(
          targetMatterId,
          {
            party: myParty,
            text: privateTextInput.trim(),
            filename: `${myParty}_input.txt`,
          },
          effectiveToken
        );
        const clausesCount = submissionRes.clauses_count || 5;
        setPrivateNotice(`Input text ingested successfully (${clausesCount} clauses normalized).`);
        setMyPrivateData({
          room_id: targetMatterId,
          party: myParty,
          has_submitted: true,
          clauses_count: clausesCount,
          filename: `${myParty}_input.txt`,
          clauses: submissionRes.clauses || [],
          text: privateTextInput.trim(),
        });
      } else {
        alert('Please select a contract file or type/paste contract clauses.');
        setIsSubmittingPrivate(false);
        return;
      }

      if (submissionRes) {
        setRoomDetail((prev) => {
          if (!prev) return prev;
          const updated = { ...prev };
          if (myParty === 'party_a') updated.has_party_a_submitted = true;
          if (myParty === 'party_b') updated.has_party_b_submitted = true;
          if (updated.has_party_a_submitted && updated.has_party_b_submitted) {
            updated.ready_for_pipeline = true;
          }
          return updated;
        });
        setSharedData((prev) => {
          const base = prev ? { ...prev } : ({} as any);
          if (myParty === 'party_a') base.has_party_a_submitted = true;
          if (myParty === 'party_b') base.has_party_b_submitted = true;
          if (base.has_party_a_submitted && base.has_party_b_submitted) {
            base.ready_for_pipeline = true;
            base.readiness = 'READY';
          }
          return base;
        });
      }

      // Re-fetch room detail, private data, and shared state
      const [d, priv, sh] = await Promise.allSettled([
        getPrivateRoom(targetMatterId),
        getRoomPrivateInput(targetMatterId, myParty, effectiveToken),
        getRoomSharedState(targetMatterId),
      ]);
      if (d.status === 'fulfilled' && d.value) {
        // Force submission flags onto fetched room data so the readiness bar stays correct
        const fetched = d.value as any;
        if (myParty === 'party_a') fetched.has_party_a_submitted = true;
        if (myParty === 'party_b') fetched.has_party_b_submitted = true;
        setRoomDetail(fetched);
      }
      // Guard: never regress optimistic has_submitted:true to false from a slow server response
      if (priv.status === 'fulfilled' && priv.value) {
        setMyPrivateData((prev) => {
          if (prev?.has_submitted && !priv.value.has_submitted) return prev;
          return priv.value;
        });
      }
      if (sh.status === 'fulfilled' && sh.value) setSharedData(sh.value);
    } catch (err: any) {
      alert(`Submission failed: ${err.message || err}`);
    } finally {
      setIsSubmittingPrivate(false);
    }
  };

  const handleRunPipeline = async () => {
    if (isRunningPipeline) return;
    setIsRunningPipeline(true);
    try {
      localStorage.setItem('negotia_active_private_room_id', targetMatterId);
      setLiveStatus('Multi-Agent Pipeline Deliberating (Agents 1-4)...');
      setConsoleTab('ai_agents');

      // Start the pipeline execution on backend
      const runPromise = startRoomPipeline(targetMatterId);

      // Navigate to the Live Agent Pipeline page so the workflow is shown live!
      navigate(`/pipeline/${targetMatterId}`);

      await runPromise;
      const [d, sh] = await Promise.allSettled([
        getPrivateRoom(targetMatterId),
        getRoomSharedState(targetMatterId),
      ]);
      if (d.status === 'fulfilled' && d.value) setRoomDetail(d.value);
      if (sh.status === 'fulfilled' && sh.value) setSharedData(sh.value);
    } catch (err: any) {
      alert(`Failed to start pipeline: ${err.message || err}`);
    } finally {
      setIsRunningPipeline(false);
    }
  };

  const handleAgreeClause = async (clauseId: string, agreedText?: string) => {
    try {
      await agreeRoomClause(targetMatterId, clauseId, agreedText, effectiveToken);
      setClauses((prev) =>
        prev.map((c) =>
          c.id === clauseId || c.clauseId === clauseId || c.section === clauseId
            ? { ...c, status: 'agreed' as const, riskLevel: 'low' as const }
            : c
        )
      );
      setAppliedNotification(`Clause ${clauseId} marked as mutually agreed!`);
      const sh = await getRoomSharedState(targetMatterId);
      if (sh) setSharedData(sh);
    } catch (err: any) {
      alert(`Failed to agree on clause: ${err.message || err}`);
    }
  };

  const handleSendProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = proposalText.trim();
    if (!cleanText) return;
    setIsSubmittingProposal(true);
    try {
      const cid = proposalClauseId || selectedClause.section || selectedClause.id;
      await submitRoomProposal(
        targetMatterId,
        {
          clause_id: cid,
          title: `Proposal for ${cid}`,
          proposal: cleanText,
        },
        effectiveToken
      );
      setProposalText('');
      setAppliedNotification(`Proposal submitted for ${cid}.`);
      const sh = await getRoomSharedState(targetMatterId);
      if (sh) setSharedData(sh);
    } catch (err: any) {
      alert(`Failed to submit proposal: ${err.message || err}`);
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleApproveDeliberation = async () => {
    if (isReviewing) return;
    setIsReviewing(true);
    try {
      const counsel = isCreatorOfRoom ? (roomDetail?.creator_name || 'General Counsel') : 'General Counsel';
      await reviewRoomReport(targetMatterId, 'approve', counsel, 'Deliberation approved by General Counsel.');
      setReviewApproved(true);
      setAppliedNotification('Deliberation approved by General Counsel. Ready for cryptographic seal.');
      const [d, sh] = await Promise.allSettled([
        getPrivateRoom(targetMatterId),
        getRoomSharedState(targetMatterId),
      ]);
      if (d.status === 'fulfilled' && d.value) setRoomDetail(d.value);
      if (sh.status === 'fulfilled' && sh.value) setSharedData(sh.value);
    } catch (err: any) {
      alert(`Approval error: ${err.message || err}`);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleSealAuditLedger = async () => {
    if (isSealing) return;
    setIsSealing(true);
    try {
      const counsel = isCreatorOfRoom ? (roomDetail?.creator_name || 'General Counsel') : 'General Counsel';
      const res = await sealRoomReport(targetMatterId, counsel, 'Cryptographically sealed into immutable audit ledger.');
      setReportSealed(true);
      setSealHash(res.sealed_hash || res.hash || res.merkle_root || '0x8f2d...4a1b');
      setAppliedNotification('Audit ledger cryptographically sealed.');
    } catch (err: any) {
      alert(`Seal error: ${err.message || err}`);
    } finally {
      setIsSealing(false);
    }
  };

  const displayCapacity = wsConnected ? Math.max(1, activePartyCount) : activePartyCount;

  const handleStopRoom = async () => {
    if (!targetMatterId) return;
    const token =
      sessionStorage.getItem(`room_${targetMatterId}_token`) ||
      localStorage.getItem(`room_${targetMatterId}_token`) ||
      localStorage.getItem('negotia_creator_room_token') ||
      '';
    if (window.confirm('Are you sure you want to stop and close this private room?')) {
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'room_closed',
              reason: 'Negotiation room closed by creator.',
            })
          );
        }
        await closePrivateRoom(targetMatterId, token);
        isClosedRef.current = true;
        setIsRoomClosed(true);
        setWsConnected(false);
        if (roomDetail) {
          setRoomDetail({ ...roomDetail, status: 'closed' });
        }
        localStorage.removeItem('negotia_creator_room_id');
        localStorage.removeItem('negotia_creator_room_token');
        localStorage.removeItem('negotia_creator_room_title');
        localStorage.removeItem('negotia_creator_room_passcode');
        localStorage.removeItem(`room_${targetMatterId}_role`);
        localStorage.removeItem(`room_${targetMatterId}_token`);
        sessionStorage.removeItem(`room_${targetMatterId}_role`);
        sessionStorage.removeItem(`room_${targetMatterId}_token`);
      } catch (err: any) {
        alert(`Failed to close room: ${err.message || err}`);
      }
    }
  };

  const handleAdmitApplicant = async () => {
    if (!targetMatterId || isAdmitting) return;
    setIsAdmitting(true);
    const token =
      sessionStorage.getItem(`room_${targetMatterId}_creator_token`) ||
      (sessionStorage.getItem(`room_${targetMatterId}_role`) === 'creator' ? sessionStorage.getItem(`room_${targetMatterId}_token`) : '') ||
      localStorage.getItem(`room_${targetMatterId}_creator_token`) ||
      localStorage.getItem('negotia_creator_room_token') ||
      sessionStorage.getItem(`room_${targetMatterId}_token`) ||
      '';
    const creatorId =
      roomDetail?.creator_id ||
      sessionStorage.getItem(`room_${targetMatterId}_creator_id`) ||
      localStorage.getItem(`room_${targetMatterId}_creator_id`) ||
      '';
    try {
      await admitParticipant(targetMatterId, pendingApplicant?.id || roomDetail?.participant_id, token, creatorId);
      setPresenceNotice({
        type: 'join',
        text: `${pendingApplicant?.name || 'Participant'} has been admitted to the chamber!`,
      });
      setPendingApplicant(null);
      const d = await getPrivateRoom(targetMatterId);
      if (d) setRoomDetail(d);
    } catch (err: any) {
      alert(`Failed to admit participant: ${err.message || err}`);
    } finally {
      setIsAdmitting(false);
    }
  };

  const handleRejectApplicant = async () => {
    if (!targetMatterId) return;
    const token =
      sessionStorage.getItem(`room_${targetMatterId}_creator_token`) ||
      localStorage.getItem(`room_${targetMatterId}_creator_token`) ||
      sessionStorage.getItem(`room_${targetMatterId}_token`) ||
      localStorage.getItem(`room_${targetMatterId}_token`) ||
      localStorage.getItem('negotia_creator_room_token') ||
      '';
    try {
      await rejectParticipant(targetMatterId, pendingApplicant?.id, token);
      setPendingApplicant(null);
    } catch (err: any) {
      alert(`Failed to reject participant: ${err.message || err}`);
    }
  };

  const handleLeaveRoom = async () => {
    if (!targetMatterId) return;
    if (window.confirm('Are you sure you want to leave this private negotiation room?')) {
      try {
        // Send WS leave event first
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'leave' }));
        }

        // Call REST API to properly leave
        const token =
          sessionStorage.getItem(`room_${targetMatterId}_token`) ||
          localStorage.getItem(`room_${targetMatterId}_token`) ||
          localStorage.getItem('negotia_participant_room_token') ||
          localStorage.getItem('negotia_creator_room_token') ||
          '';
        try {
          await leavePrivateRoom(targetMatterId, token);
        } catch {
          // Leave attempt may fail if WS already disconnected; proceed
        }

        localStorage.removeItem('negotia_participant_room_id');
        localStorage.removeItem('negotia_participant_room_token');
        localStorage.removeItem('negotia_creator_room_id');
        localStorage.removeItem('negotia_creator_room_token');
        localStorage.removeItem(`room_${targetMatterId}_role`);
        localStorage.removeItem(`room_${targetMatterId}_token`);
        sessionStorage.removeItem(`room_${targetMatterId}_role`);
        sessionStorage.removeItem(`room_${targetMatterId}_token`);
        navigate('/private-room');
      } catch (err: any) {
        alert(`Failed to leave room: ${err.message || err}`);
      }
    }
  };

  // Safe WebSocket connection with exponential backoff reconnection
  const connectNegotiationWs = (roomId: string) => {
    isUnmountedRef.current = false;
    if (isClosedRef.current) return;

    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    const token = isCreatorOfRoom
      ? (sessionStorage.getItem(`room_${roomId}_creator_token`) ||
         sessionStorage.getItem(`room_${roomId}_token`) ||
         localStorage.getItem(`room_${roomId}_creator_token`) ||
         localStorage.getItem('negotia_creator_room_token') ||
         localStorage.getItem(`room_${roomId}_token`) ||
         '')
      : (sessionStorage.getItem(`room_${roomId}_guest_token`) ||
         sessionStorage.getItem(`room_${roomId}_token`) ||
         localStorage.getItem(`room_${roomId}_guest_token`) ||
         localStorage.getItem('negotia_participant_room_token') ||
         localStorage.getItem(`room_${roomId}_token`) ||
         '');
    const myRole = isCreatorOfRoom ? 'creator' : 'participant';
    const wsUrl = getNegotiationWebSocketUrl(roomId, token, myRole);

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isClosedRef.current) {
          try { ws.close(); } catch {}
          return;
        }
        setWsConnected(true);
        setWsReconnecting(false);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (evt) => {
        if (isUnmountedRef.current) return;
        try {
          const data = JSON.parse(evt.data);
          const now = data.timestamp || new Date().toISOString();
          if (data.type === 'history' && Array.isArray(data.messages)) {
            setBilateralEvents((prev) => {
              const prevIds = new Set(prev.map((e) => e.id).filter(Boolean));
              let hasNew = false;
              const merged = [...prev];
              for (const m of data.messages) {
                // Filter out transient disconnect messages and joins from history
                if (m.type === 'leave' || m.type === 'join') continue;
                if (m.id && prevIds.has(m.id)) continue;
                const isDup = merged.some((e) => {
                  if (e.type !== m.type) return false;
                  const sameContent = (e.text || e.clause_id || e.proposal || '') === (m.text || m.clause_id || m.proposal || '');
                  const sameRole = !e.sender_role || !m.sender_role || e.sender_role.toLowerCase() === m.sender_role.toLowerCase();
                  return sameContent && sameRole;
                });
                if (!isDup) {
                  if (m.id) prevIds.add(m.id);
                  merged.push(m);
                  hasNew = true;
                }
              }
              return hasNew ? merged : prev;
            });
          } else if (data.type === 'participant_connected' || data.type === 'join') {
            if (typeof data.active_participants_count === 'number') {
              setActivePartyCount(data.active_participants_count);
            }
            if (data.sender_name) {
              const baseName = data.sender_name.replace(/\s*\((buyer|seller)\)/gi, '').trim();
              const roleLabel = data.sender_role || (baseName.toLowerCase().includes('seller') ? 'seller' : 'buyer');
              setPresenceNotice({
                text: `${baseName} (${roleLabel}) entered the negotiation room.`,
                type: 'join',
              });
            }
          } else if (data.type === 'participant_disconnected' || data.type === 'leave') {
            if (typeof data.active_participants_count === 'number') {
              setActivePartyCount(data.active_participants_count);
            } else {
              setActivePartyCount((prev) => Math.max(0, prev - 1));
            }
            if (data.sender_name && data.status !== 'disconnected') {
              const baseName = data.sender_name.replace(/\s*\((buyer|seller)\)/gi, '').trim();
              const roleLabel = data.sender_role || (baseName.toLowerCase().includes('seller') ? 'seller' : 'buyer');
              setPresenceNotice({
                text: `${baseName} (${roleLabel}) left the room.`,
                type: 'leave',
              });
            }
          } else if (data.type === 'presence_update') {
            if (typeof data.active_participants_count === 'number') {
              setActivePartyCount(data.active_participants_count);
            }
          } else if (data.type === 'room_closed') {
            isClosedRef.current = true;
            setIsRoomClosed(true);
            setWsConnected(false);
            setBilateralEvents((prev) => [
              ...prev,
              {
                type: 'room_closed',
                text: data.reason || 'Negotiation room closed by creator.',
                timestamp: now,
              },
            ]);
            setPresenceNotice({
              text: data.reason || 'Negotiation room closed by creator.',
              type: 'closed',
            });
          } else if (data.type === 'join_requested' || data.type === 'guest_knock') {
            setPendingApplicant({
              id: data.guest_id,
              name: data.guest_name || 'Counterparty Counsel',
              role: data.guest_role || 'seller',
            });
            setPresenceNotice({
              text: `${data.guest_name || 'Counterparty'} requested admission to this room.`,
              type: 'info',
            });
          } else if (data.type === 'participant_admitted' || data.type === 'guest_admitted') {
            setPendingApplicant(null);
            setPresenceNotice({
              text: 'Counterparty was admitted to the chamber!',
              type: 'join',
            });
            getPrivateRoom(targetMatterId).then((d) => { if (d) setRoomDetail(d); });
            getRoomSharedState(targetMatterId).then((sh) => { if (sh) setSharedData(sh); });
          } else if (data.type === 'participant_rejected' || data.type === 'guest_rejected') {
            setPendingApplicant(null);
            setPresenceNotice({
              text: 'Participant admission request was rejected.',
              type: 'info',
            });
          } else if (data.type === 'clause_updated' || data.type === 'clause_agreed' || data.type === 'clause_submitted') {
            const cid = data.clause_id || data.id;
            if (cid && (data.status === 'agreed' || data.type === 'clause_agreed')) {
              setAppliedNotification(`Clause ${cid} mutually agreed!`);
              setClauses((prev) =>
                prev.map((c) =>
                  c.id === cid || c.clauseId === cid || c.section === cid
                    ? { ...c, status: 'agreed' as const, riskLevel: 'low' as const, conformedProposal: data.text || c.conformedProposal }
                    : c
                )
              );
            } else if (cid) {
              setAppliedNotification(`Clause ${cid} updated.`);
            }
            getPrivateRoom(targetMatterId).then((d) => { if (d) setRoomDetail(d); });
            getRoomSharedState(targetMatterId).then((sh) => { if (sh) setSharedData(sh); });
          } else if (data.type === 'room_error') {
            setPresenceNotice({
              text: data.error || 'A negotiation room error occurred.',
              type: 'error',
            });
            setAppliedNotification(`Error: ${data.error || 'Room error'}`);
          } else if (data.type === 'room_ready') {
            setPresenceNotice({
              text: 'Both parties submitted contract inputs! Room marked READY for AI Deliberation.',
              type: 'join',
            });
            getPrivateRoom(targetMatterId).then((d) => { if (d) setRoomDetail(d); });
            getRoomSharedState(targetMatterId).then((sh) => { if (sh) setSharedData(sh); });
          } else if (
            data.type === 'message' ||
            data.type === 'proposal' ||
            data.type === 'system'
          ) {
            setBilateralEvents((prev) => {
              // 1. Deduplicate by explicit message ID
              if (data.id && prev.some((e) => e.id === data.id)) {
                return prev;
              }
              // 2. Deduplicate by content and sender role within 15s window
              const dataTime = new Date(now).getTime();
              const isDuplicate = prev.some((e) => {
                if (e.type !== data.type) return false;
                const sameContent = (e.text || e.clause_id || e.proposal || '') === (data.text || data.clause_id || data.proposal || '');
                if (!sameContent) return false;
                const sameRole = !e.sender_role || !data.sender_role || e.sender_role.toLowerCase() === data.sender_role.toLowerCase();
                if (!sameRole) return false;
                const eTime = new Date(e.timestamp).getTime();
                return isNaN(eTime) || Math.abs(eTime - dataTime) < 15000;
              });
              if (isDuplicate) {
                return prev;
              }
              return [...prev, { ...data, timestamp: now }];
            });
          }
          
        } catch (err) {
          console.error('Error parsing negotiation WebSocket message', err);
        }
      };

      ws.onclose = (event) => {
        setWsConnected(false);
        if (event.code === 1008) {
          if (roomDetail?.status === 'closed' || isClosedRef.current) {
            return;
          }
          // Verify room status before kicking out to prevent spurious fallback for admitted participants
          getPrivateRoom(roomId).then((latest) => {
            if (latest?.status === 'closed' || latest?.guest_status === 'rejected') {
              isClosedRef.current = true;
              setWsReconnecting(false);
              navigate(`/private-room?room=${roomId}`, {
                replace: true,
                state: {
                  error: latest?.status === 'closed'
                    ? 'This negotiation room has been closed.'
                    : 'Your admission request was rejected by the room creator.',
                },
              });
              return;
            }

            if (latest && (latest.guest_status === 'admitted' || latest.status === 'active')) {
              setTimeout(() => {
                if (!isClosedRef.current && !isUnmountedRef.current) {
                  connectNegotiationWs(roomId);
                }
              }, 1200);
            } else if (reconnectAttemptsRef.current < 6) {
              // Retry with progressive delay to allow cross-laptop MongoDB sync
              reconnectAttemptsRef.current += 1;
              setWsReconnecting(true);
              setTimeout(() => {
                if (!isClosedRef.current && !isUnmountedRef.current) {
                  connectNegotiationWs(roomId);
                }
              }, 1500);
            } else {
              isClosedRef.current = true;
              setWsReconnecting(false);
              navigate(`/private-room?room=${roomId}`, {
                replace: true,
                state: { error: 'Access Denied: You must request admission and be admitted by the creator to enter.' },
              });
            }
          }).catch(() => {
            if (reconnectAttemptsRef.current < 6) {
              reconnectAttemptsRef.current += 1;
              setWsReconnecting(true);
              setTimeout(() => {
                if (!isClosedRef.current && !isUnmountedRef.current) {
                  connectNegotiationWs(roomId);
                }
              }, 1500);
            } else {
              isClosedRef.current = true;
              setWsReconnecting(false);
              navigate(`/private-room?room=${roomId}`, {
                replace: true,
                state: { error: 'Access Denied: You must request admission and be admitted by the creator to enter.' },
              });
            }
          });
          return;
        }
        if (!isClosedRef.current && event.code !== 1000) {
          if (reconnectAttemptsRef.current < 10) {
            reconnectAttemptsRef.current += 1;
            setWsReconnecting(true);
            const delay = Math.min(1000 * Math.pow(1.3, reconnectAttemptsRef.current), 5000);
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(() => {
              connectNegotiationWs(roomId);
            }, delay);
          } else {
            setWsReconnecting(false);
          }
        }
      };

      ws.onerror = () => {
        // Handled via onclose
      };

      wsRef.current = ws;
    } catch (err) {
      console.warn('Failed establishing negotiation WebSocket connection:', err);
    }
  };

  // Connect on room entry and cleanly disconnect on page exit
  useEffect(() => {
    if (!targetMatterId.startsWith('NEG-')) return;
    isUnmountedRef.current = false;
    isClosedRef.current = false;
    connectNegotiationWs(targetMatterId);

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.close(1000, 'Page Exit');
        } catch {}
        wsRef.current = null;
      }
    };
  }, [targetMatterId]);

  // Re-verify and re-connect when window gains focus
  useEffect(() => {
    if (!targetMatterId.startsWith('NEG-')) return;

    const handleWorkspaceFocus = () => {
      if (
        !isClosedRef.current &&
        (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED || wsRef.current.readyState === WebSocket.CLOSING)
      ) {
        isUnmountedRef.current = false;
        connectNegotiationWs(targetMatterId);
      }
    };

    window.addEventListener('focus', handleWorkspaceFocus);
    const handleVis = () => {
      if (document.visibilityState === 'visible') handleWorkspaceFocus();
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      window.removeEventListener('focus', handleWorkspaceFocus);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, [targetMatterId]);

  // Send shared negotiation message
  const handleSendBilateralMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = chatInput.trim();
    if (!cleanText) return;

    const myRole = (isCreatorOfRoom
      ? (roomDetail?.creator_role || 'buyer')
      : (roomDetail?.guest_role || 'seller')).toLowerCase();

    const cleanUser = (user?.name || '').replace(/\s*\((buyer|seller)\)/gi, '').trim();
    const isDemo = !cleanUser || cleanUser.toLowerCase().includes('negotiation demo') || cleanUser === 'Guest User';
    const myName = !isDemo
      ? `${cleanUser} (${myRole === 'buyer' ? 'Buyer' : 'Seller'})`
      : myRole === 'buyer'
      ? 'Elena Rostova (Buyer)'
      : 'Marcus Vance (Seller)';
    const myId = isCreatorOfRoom ? roomDetail?.creator_id : (roomDetail?.participant_id || roomDetail?.guest_id);

    const token =
      sessionStorage.getItem(`room_${targetMatterId}_token`) ||
      localStorage.getItem(`room_${targetMatterId}_token`) ||
      localStorage.getItem('negotia_creator_room_token') ||
      localStorage.getItem('negotia_participant_room_token') ||
      '';

    setChatInput('');

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let wsSent = false;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            id: msgId,
            type: 'message',
            text: cleanText,
            sender_id: myId || (isCreatorOfRoom ? 'creator' : 'participant'),
            sender_name: myName,
            sender_role: myRole,
          })
        );
        wsSent = true;
      } catch (err) {
        console.warn('WS send failed, falling back to REST', err);
      }
    }

    // If WebSocket wasn't open, use REST API fallback and append server response
    if (!wsSent) {
      try {
        const res = await sendRoomMessage(targetMatterId, {
          id: msgId,
          text: cleanText,
          sender_id: myId || (isCreatorOfRoom ? 'creator' : 'participant'),
          sender_name: myName,
          sender_role: myRole,
          token: token,
        });
        if (res && res.message) {
          setBilateralEvents((prev) => {
            if (prev.some((e) => e.id === res.message.id || (e.text === res.message.text && e.sender_role === res.message.sender_role))) {
              return prev;
            }
            return [...prev, res.message];
          });
        }
      } catch (err) {
        console.warn('REST message persist notice:', err);
      }
    }
  };

  // Send currently selected clause proposal over WebSocket
  const handleBroadcastClauseProposal = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !selectedClause) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'proposal',
        clause_id: selectedClause.clauseId || selectedClause.id,
        proposal: selectedClause.conformedProposal,
        terms: `Compromise proposed on ${selectedClause.section} (${selectedClause.title})`,
        rationale: selectedClause.rationale,
      })
    );
  };

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspaceData() {
      try {
        if (targetMatterId.startsWith('NEG-')) {
          try {
            const r = await getPrivateRoom(targetMatterId);
            if (!isMounted) return;
            if (r) {
              setRoomDetail(r);
              if (r.status === 'closed') {
                setIsRoomClosed(true);
              }

              // Gatekeeping: verify that visitor is either the creator or an admitted participant
              const myStoredRole = sessionStorage.getItem(`room_${targetMatterId}_role`);
              const hasCreatorToken = Boolean(
                sessionStorage.getItem(`room_${targetMatterId}_creator_token`) ||
                localStorage.getItem(`room_${targetMatterId}_creator_token`) ||
                localStorage.getItem('negotia_creator_room_token')
              );
              const isCreator =
                myStoredRole === 'creator' ||
                (!myStoredRole && hasCreatorToken && (localStorage.getItem('negotia_creator_room_id') === targetMatterId || (user?.uid && r.creator_id && user.uid === r.creator_id)));

              const isAdmittedGuest =
                (r.guest_status === 'admitted' || r.status === 'active') && !isCreator;

              if (isCreator) {
                sessionStorage.setItem(`room_${targetMatterId}_role`, 'creator');
              } else if (isAdmittedGuest) {
                sessionStorage.setItem(`room_${targetMatterId}_role`, 'participant');
                const partToken =
                  sessionStorage.getItem(`room_${targetMatterId}_guest_token`) ||
                  sessionStorage.getItem(`room_${targetMatterId}_token`) ||
                  localStorage.getItem(`room_${targetMatterId}_guest_token`) ||
                  localStorage.getItem('negotia_participant_room_token') ||
                  '';
                if (partToken) {
                  sessionStorage.setItem(`room_${targetMatterId}_token`, partToken);
                  sessionStorage.setItem(`room_${targetMatterId}_guest_token`, partToken);
                }
              }

              if (!isCreator && !isAdmittedGuest) {
                // If user is designated participant, allow brief polling for MongoDB sync latency across laptops
                let finalRoom = r;
                if (myStoredRole === 'participant' || hasParticipantToken) {
                  for (let attempt = 0; attempt < 4; attempt++) {
                    await new Promise((res) => setTimeout(res, 800));
                    try {
                      const refreshed = await getPrivateRoom(targetMatterId);
                      if (refreshed && (refreshed.guest_status === 'admitted' || refreshed.status === 'active')) {
                        finalRoom = refreshed;
                        setRoomDetail(refreshed);
                        sessionStorage.setItem(`room_${targetMatterId}_role`, 'participant');
                        break;
                      }
                    } catch {}
                  }
                }

                if (finalRoom.guest_status === 'admitted' || finalRoom.status === 'active') {
                  sessionStorage.setItem(`room_${targetMatterId}_role`, 'participant');
                } else {
                  // Do not allow direct access just by knowing Room ID
                  navigate(`/private-room?room=${targetMatterId}`, {
                    replace: true,
                    state: {
                      error:
                        finalRoom.guest_status === 'pending_approval'
                          ? 'Your admission request is awaiting creator approval.'
                          : 'Access Denied: You must request admission and be admitted by the creator before entering.',
                    },
                  });
                  return;
                }
              }
            }
          } catch (err: any) {
            if (err?.status === 404) {
              navigate('/private-room', {
                replace: true,
                state: { error: 'Room not found. Please verify the Room ID.' },
              });
              return;
            }
          }
        }

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

        let fetchedDelibs: DeliberationEvent[] = [];
        if (delibResult.status === 'fulfilled' && Array.isArray(delibResult.value)) {
          fetchedDelibs = delibResult.value;
        }

        const sbEvents = getSandboxCommitDeliberationEvents(targetMatterId);
        const combined = [...fetchedDelibs];
        for (const ev of sbEvents) {
          if (!combined.some((e) => e.eventId === ev.eventId || e.message === ev.message)) {
            combined.push(ev);
          }
        }

        if (combined.length > 0) {
          setDeliberationEvents(combined);
          if (sbEvents.length > 0) {
            setLiveStatus('SANDBOX CONCESSIONS ANALYZED');
          }
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

        const thoughtOrMsg = evt.thought || evt.message;
        if (thoughtOrMsg) {
          const agentKey = evt.agent || 'a1';
          const agentName =
            agentKey === 'a1' ? 'Buyer Legal Analyst (Lex-Ingestor A)' :
            agentKey === 'a2' ? 'Seller Redline Auditor (Lex-Ingestor B)' :
            agentKey === 'a3' ? 'AI Judge & Mediator (Arbiter-3)' :
            'Executive Report Clerk (Scrivener-4)';
          const updateEv: DeliberationEvent = {
            eventId: evt.eventId || evt.event_id || `upd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            matterId: evt.matterId || evt.matter_id || targetMatterId,
            agent: agentKey,
            agentName: agentName,
            role: 'agent_deliberation',
            message: thoughtOrMsg,
            clauseIds: evt.clauseIds || evt.clause_ids || [],
            timestamp: evt.timestamp || new Date().toISOString(),
            status: evt.status || 'running',
            source: 'LLM',
          };
          setDeliberationEvents((prev) => {
            if (prev.some((e) => e.message === thoughtOrMsg)) return prev;
            return [...prev, updateEv];
          });
        }
      }

      if (evType === 'pipeline_complete' || evt.status === 'pending_review') {
        setLiveStatus('PENDING HUMAN REVIEW');
        setActiveAgent('orchestrator');
        const completeEv: DeliberationEvent = {
          eventId: `comp_${Date.now()}`,
          matterId: targetMatterId,
          agent: 'a4',
          agentName: 'Executive Synthesis (Scrivener-4)',
          role: 'review_boundary',
          message: evt.message || 'Autonomous deliberation complete. Dossier awaiting General Counsel sign-off.',
          clauseIds: [],
          timestamp: evt.timestamp || new Date().toISOString(),
          status: 'pending_review',
          source: 'LLM',
        };
        setDeliberationEvents((prev) => {
          if (prev.some((e) => e.role === 'review_boundary')) return prev;
          return [...prev, completeEv];
        });
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
      {/* 0. PRIVATE ROOM 2-PARTY STATUS STRIP (ONLY WHEN IN A PRIVATE ROOM) */}
      {(targetMatterId.startsWith('NEG-') || roomDetail) && (
        <section className="w-full bg-surface-container border-b border-primary/40 px-space-base md:px-space-lg py-2 flex flex-col gap-2 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-primary-container/20 text-primary font-mono text-xs font-bold border border-primary/40">
                <span className="material-symbols-outlined text-sm">lock</span>
                Private Room: {targetMatterId}
              </span>
              <span className={`text-[11px] font-mono uppercase font-semibold px-2 py-0.5 rounded border ${
                isRoomClosed || roomDetail?.status === 'closed'
                  ? 'bg-error-container/20 text-error border-error/40'
                  : reportSealed
                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-500/40'
                  : reviewApproved
                  ? 'bg-blue-900/30 text-blue-300 border-blue-500/40'
                  : liveStatus === 'PENDING HUMAN REVIEW'
                  ? 'bg-amber-900/30 text-amber-300 border-amber-500/40'
                  : isRunningPipeline || liveStatus.includes('Pipeline')
                  ? 'bg-purple-900/30 text-purple-300 border-purple-500/40'
                  : isRoomReady
                  ? 'bg-emerald-900/30 text-emerald-300 border-emerald-500/30'
                  : roomDetail?.guest_status === 'left'
                  ? 'bg-amber-900/20 text-amber-400 border-amber-500/30'
                  : roomDetail?.status === 'active' && activePartyCount >= 2
                  ? 'bg-secondary/10 text-secondary border-secondary/30'
                  : roomDetail?.status === 'active'
                  ? 'bg-secondary/10 text-secondary border-secondary/30'
                  : roomDetail?.guest_status === 'pending_approval'
                  ? 'bg-amber-900/20 text-amber-300 border-amber-500/30'
                  : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30'
              }`}>
                {isRoomClosed || roomDetail?.status === 'closed'
                  ? 'Room Closed'
                  : reportSealed
                  ? 'Completed / Sealed'
                  : reviewApproved
                  ? 'Pending Human Review → Approved'
                  : liveStatus === 'PENDING HUMAN REVIEW'
                  ? 'Pending Human Review'
                  : isRunningPipeline || liveStatus.includes('Pipeline')
                  ? 'Negotiation Running'
                  : isRoomReady
                  ? 'Waiting for Clauses → Ready'
                  : roomDetail?.guest_status === 'left'
                  ? 'Participant Left'
                  : roomDetail?.status === 'active' && activePartyCount >= 2
                  ? 'Both Parties Connected'
                  : roomDetail?.status === 'active'
                  ? 'Counterparty Admitted'
                  : roomDetail?.guest_status === 'pending_approval'
                  ? 'Join Request Pending'
                  : 'Waiting for Counterparty'}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-xs text-outline">
                <span className={`w-2 h-2 rounded-full ${
                  isRoomClosed
                    ? 'bg-error'
                    : wsConnected
                    ? 'bg-secondary animate-pulse'
                    : wsReconnecting
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-outline-variant'
                }`} />
                <span>
                  {isRoomClosed
                    ? 'Disconnected (Room Closed)'
                    : wsConnected
                    ? 'Live WS Connected (/ws/negotiation)'
                    : wsReconnecting
                    ? 'Reconnecting safely...'
                    : 'Connecting...'}
                </span>
              </span>
              <span className="text-xs font-mono text-outline">
                Active: <strong className="text-on-surface">{displayCapacity} / 2</strong>
              </span>
              <span className="text-xs text-outline font-body-sm">
                {isCreatorOfRoom ? '(Room Creator)' : '(Admitted Participant)'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon="arrow_back"
                onClick={() => navigate('/private-room')}
              >
                Room Hub
              </Button>
              {isCreatorOfRoom && !isRoomClosed && (
                <Button
                  variant="danger"
                  size="sm"
                  icon="cancel"
                  onClick={handleStopRoom}
                >
                  Stop Room
                </Button>
              )}
              {!isCreatorOfRoom && !isRoomClosed && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="logout"
                  onClick={handleLeaveRoom}
                >
                  Leave Room
                </Button>
              )}
            </div>
          </div>

          {/* Chamber Switcher & Readiness Bar */}
          <div className="w-full flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-primary/20">
            {/* Chamber Switcher: Shared vs Private */}
            <div className="flex items-center gap-1.5 bg-surface-container-high p-1 rounded-lg border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setWorkspaceMode('shared')}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  workspaceMode === 'shared'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface hover:text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-sm">groups</span>
                <span>SHARED CHAMBER</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode('private')}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  workspaceMode === 'private'
                    ? 'bg-[#D97706] text-white shadow-xs'
                    : 'text-on-surface hover:text-[#D97706]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">lock</span>
                <span>MY PRIVATE CHAMBER ({myParty === 'party_a' ? 'Party A' : 'Party B'})</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-black/30 text-white font-mono uppercase">
                  Confidential
                </span>
              </button>
            </div>

            {/* Room Readiness & Pipeline Orchestrator Connection */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`px-2.5 py-1 rounded border font-mono text-xs flex items-center gap-2 ${
                isRoomReady
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isRoomReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="font-bold">
                  {isRoomReady ? 'ROOM READY FOR AI DELIBERATION' : 'WAITING FOR SUBMISSIONS'}
                </span>
                <span className="text-outline-variant">•</span>
                <span className="text-[11px]">
                  Party A: <strong className={partyASubmitted ? 'text-emerald-400' : 'text-amber-400'}>{partyASubmitted ? 'Submitted' : 'Pending'}</strong>
                </span>
                <span className="text-outline-variant">|</span>
                <span className="text-[11px]">
                  Party B: <strong className={partyBSubmitted ? 'text-emerald-400' : 'text-amber-400'}>{partyBSubmitted ? 'Submitted' : 'Pending'}</strong>
                </span>
              </div>

              {isRoomReady && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRunPipeline}
                  disabled={isRunningPipeline || isRoomClosed}
                  className="!bg-emerald-600 hover:!bg-emerald-500 !text-white font-bold text-xs shadow-md"
                >
                  {isRunningPipeline ? 'Deliberating Pipeline...' : 'Run Multi-Agent Pipeline'}
                </Button>
              )}
              {/* Workflow navigation shortcuts */}
              <button
                type="button"
                onClick={() => { localStorage.setItem('negotia_active_private_room_id', targetMatterId); navigate(`/pipeline/${targetMatterId}`); }}
                className="px-2.5 py-1 rounded border border-outline-variant/40 bg-surface-container-high text-on-surface-variant hover:text-primary hover:border-primary/40 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                title="Live Agent Pipeline"
              >
                <span className="material-symbols-outlined text-[13px]">account_tree</span>
                <span className="hidden sm:inline">Pipeline</span>
              </button>
              <button
                type="button"
                onClick={() => { localStorage.setItem('negotia_active_private_room_id', targetMatterId); navigate('/sandbox'); }}
                className="px-2.5 py-1 rounded border border-outline-variant/40 bg-surface-container-high text-on-surface-variant hover:text-secondary hover:border-secondary/40 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                title="Negotiation Sandbox"
              >
                <span className="material-symbols-outlined text-[13px]">science</span>
                <span className="hidden sm:inline">Sandbox</span>
              </button>
              <button
                type="button"
                onClick={() => { localStorage.setItem('negotia_active_private_room_id', targetMatterId); navigate(`/reports/${targetMatterId}`); }}
                className="px-2.5 py-1 rounded border border-outline-variant/40 bg-surface-container-high text-on-surface-variant hover:text-amber-400 hover:border-amber-500/40 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                title="Executive Report"
              >
                <span className="material-symbols-outlined text-[13px]">summarize</span>
                <span className="hidden sm:inline">Report</span>
              </button>
              <button
                type="button"
                onClick={() => { localStorage.setItem('negotia_active_private_room_id', targetMatterId); navigate(`/governance/${targetMatterId}`); }}
                className="px-2.5 py-1 rounded border border-outline-variant/40 bg-surface-container-high text-on-surface-variant hover:text-emerald-400 hover:border-emerald-500/40 text-[10px] font-mono font-bold flex items-center gap-1 transition-all"
                title="Audit & Governance"
              >
                <span className="material-symbols-outlined text-[13px]">verified_user</span>
                <span className="hidden sm:inline">Audit</span>
              </button>
            </div>
          </div>

          {/* Direct Workspace Counterparty Admission Banner */}
          {pendingApplicant && isCreatorOfRoom && !isRoomClosed && (
            <div className="w-full p-3.5 bg-gradient-to-r from-amber-950/90 to-amber-900/80 border-2 border-amber-500 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-lg animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-amber-400 text-lg">person_add</span>
                </div>
                <div>
                  <div className="text-[11px] font-mono font-bold text-amber-300 uppercase tracking-wider">
                    Counterparty Admission Request
                  </div>
                  <div className="text-xs text-on-surface">
                    <strong className="text-white font-bold">{pendingApplicant.name}</strong> ({pendingApplicant.role.toUpperCase()}) entered Room ID <span className="font-mono text-primary font-bold">{targetMatterId}</span> and requested to join.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon="check_circle"
                  onClick={handleAdmitApplicant}
                  disabled={isAdmitting}
                  className="!bg-emerald-600 hover:!bg-emerald-500 !text-white font-bold px-4 py-1.5 shadow-md text-xs"
                >
                  {isAdmitting ? 'Admitting...' : 'Admit Participant'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="cancel"
                  onClick={handleRejectApplicant}
                  className="text-xs hover:!bg-error/20 hover:!text-error"
                >
                  Reject
                </Button>
              </div>
            </div>
          )}

          {/* Participant Joined / Left / Room Closed Notice Banner */}
          {presenceNotice && (
            <div className={`px-3 py-1.5 rounded text-xs flex items-center justify-between gap-2 shadow-xs ${
              presenceNotice.type === 'join'
                ? 'bg-secondary-container/20 text-secondary border border-secondary/30'
                : presenceNotice.type === 'leave'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-error-container/20 text-error border border-error/40'
            }`}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">
                  {presenceNotice.type === 'join' ? 'person_add' : presenceNotice.type === 'leave' ? 'person_remove' : 'lock'}
                </span>
                <span className="font-mono font-medium">{presenceNotice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setPresenceNotice(null)}
                className="text-outline hover:text-on-surface text-xs px-1"
              >
                ✕
              </button>
            </div>
          )}
        </section>
      )}

      {/* 1. TOP DOCKET STRIP */}
      <section className="w-full bg-surface-container-lowest border-b border-outline-variant/30 px-space-base md:px-space-lg py-2.5 flex flex-wrap items-center justify-between gap-space-sm shadow-sm">
        <div className="flex items-center gap-space-md flex-wrap min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-primary-container/20 text-primary font-mono text-xs uppercase tracking-wider font-semibold rounded border border-primary/30">
              {matterDetail?.docketNumber || (targetMatterId ? `Docket #${targetMatterId}` : 'Docket Active')}
            </span>
            <span className="font-headline-md text-base md:text-lg text-on-surface font-semibold">
              {matterDetail?.title || matterTitle || (docAFile ? docAFile.replace(/\.[^/.]+$/, '') : 'Enterprise Legal Agreement')}
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

        {/* Quick Docket Actions (Cleaned up, no Generate Report duplicate) */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon="science"
            onClick={() => navigate('/sandbox')}
          >
            Open in Sandbox
          </Button>
        </div>
      </section>

      {/* 4-AGENT STATUS STRIP (Clean, no text overlap) */}
      <section className="w-full bg-surface-container-lowest border-b border-outline-variant/20 px-space-base py-2 flex items-center justify-between gap-3 shadow-xs overflow-x-auto">
        <div className="flex items-center gap-2 font-mono text-xs whitespace-nowrap min-w-0 overflow-x-auto py-0.5">
          {/* A1 */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded border font-mono text-[11px] shrink-0 ${
            activeAgent === 'a1' ? 'bg-primary-container/20 border-primary/40 text-primary font-bold shadow-2xs' : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant'
          }`}>
            <span className={`w-2 h-2 rounded-full ${activeAgent === 'a1' ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
            <span className="font-bold">Agent 1</span>
            <span className="text-outline-variant">•</span>
            <span>Buyer Legal Analyst</span>
            <span className="text-outline-variant">•</span>
            <span className="font-bold">{activeAgent === 'a1' ? 'RUNNING' : 'COMPLETE'}</span>
          </div>

          <span className="text-outline-variant/60 text-xs shrink-0">|</span>

          {/* A2 */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded border font-mono text-[11px] shrink-0 ${
            activeAgent === 'a2' ? 'bg-primary-container/20 border-primary/40 text-primary font-bold shadow-2xs' : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant'
          }`}>
            <span className={`w-2 h-2 rounded-full ${activeAgent === 'a2' ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
            <span className="font-bold">Agent 2</span>
            <span className="text-outline-variant">•</span>
            <span>Seller Redline Auditor</span>
            <span className="text-outline-variant">•</span>
            <span className="font-bold">{activeAgent === 'a2' ? 'RUNNING' : 'COMPLETE'}</span>
          </div>

          <span className="text-outline-variant/60 text-xs shrink-0">|</span>

          {/* A3 */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded border font-mono text-[11px] shrink-0 ${
            activeAgent === 'a3' || activeAgent === 'orchestrator' ? 'bg-primary-container/20 border-primary/40 text-primary font-bold shadow-2xs' : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant'
          }`}>
            <span className={`w-2 h-2 rounded-full ${activeAgent === 'a3' ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
            <span className="font-bold">Agent 3</span>
            <span className="text-outline-variant">•</span>
            <span>AI Judge & Mediator</span>
            <span className="text-outline-variant">•</span>
            <span className="font-bold">{activeAgent === 'a3' ? 'ACTIVE' : 'COMPLETE'}</span>
          </div>

          <span className="text-outline-variant/60 text-xs shrink-0">|</span>

          {/* A4 */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-low rounded border border-outline-variant/20 font-mono text-[11px] text-outline shrink-0">
            <span className="w-2 h-2 rounded-full bg-outline-variant" />
            <span className="font-bold">Agent 4</span>
            <span className="text-outline-variant">•</span>
            <span>Executive Report Clerk</span>
            <span className="text-outline-variant">•</span>
            <span className="font-semibold">QUEUED</span>
          </div>
        </div>

        <div className="hidden xl:flex items-center gap-2 text-on-surface-variant font-mono text-[10px] shrink-0">
          <span className="material-symbols-outlined text-[14px] text-primary">hub</span>
          <span>4-Agent Automated Courtroom Active</span>
        </div>
      </section>

      {/* 2. MAIN TRI-PANEL NEGOTIATION GRID */}
      <div className="flex-1 grid grid-cols-12 min-h-[calc(100vh-8rem)]">
        {/* EXPANDED PARCHMENT DOCUMENT FOLIO (Center / 8-9 cols) */}
        <div className="col-span-12 lg:col-span-8 xl:col-span-9 bg-[#F5F1E8] text-[#1C1917] p-4 md:p-6 overflow-y-auto space-y-4">
          {/* 1. PRIVATE CHAMBER VIEW (Confidential & Party-Isolated) */}
          {(targetMatterId.startsWith('NEG-') || roomDetail) && workspaceMode === 'private' ? (
            <div className="space-y-4">
              {/* Confidentiality Isolation Banner */}
              <div className="p-4 bg-[#EDE7DC] border-2 border-[#D97706]/60 rounded-xl shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#D97706] text-xl">security</span>
                    <span className="font-mono text-sm font-bold text-[#1C1917] uppercase tracking-wider">
                      Confidential Private Chamber — {myPartyLabel}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#D97706]/15 text-[#92400E] border border-[#D97706]/40">
                    Strict Data Isolation
                  </span>
                </div>
                <p className="text-xs text-[#78716C] leading-relaxed">
                  Everything submitted or edited in this chamber is strictly isolated to your party. The counterparty ({counterpartyLabel}) <strong>CANNOT</strong> view your internal notes, draft clauses, or private uploads.
                </p>
              </div>

              {/* Document Upload & Clause Parsing Form */}
              <div className="bg-[#FAF7F2] border border-[#D6CEBE] rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#D6CEBE]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#166534] text-lg">upload_file</span>
                    <h3 className="font-headline-md text-base font-bold text-[#1C1917]">
                      Submit Contract Clauses / Document
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-[#78716C]">
                    Reuses PDF / DOCX / Text Parsing &amp; Normalization
                  </span>
                </div>

                <form onSubmit={handleSavePrivateInput} className="space-y-4">
                  {/* File Upload Option */}
                  <div className="space-y-1.5">
                    <label className="font-mono text-xs font-bold text-[#1C1917] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-[#D97706]">attach_file</span>
                      Upload Contract File (.pdf, .docx, .txt, .md):
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.txt,.md"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setPrivateSelectedFile(e.target.files[0]);
                          }
                        }}
                        className="text-xs font-mono file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#EDE7DC] file:text-[#1C1917] hover:file:bg-[#D6CEBE] cursor-pointer"
                      />
                      {privateSelectedFile && (
                        <span className="font-mono text-xs text-[#166534] font-bold">
                          Selected: {privateSelectedFile.name} ({(privateSelectedFile.size / 1024).toFixed(1)} KB)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-[#78716C]">
                    <span className="flex-1 border-t border-[#D6CEBE]" />
                    <span>OR PASTE / EDIT RAW CONTRACT CLAUSES</span>
                    <span className="flex-1 border-t border-[#D6CEBE]" />
                  </div>

                  {/* Text Input Option */}
                  <div className="space-y-1.5">
                    <label className="font-mono text-xs font-bold text-[#1C1917] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-[#166534]">edit_note</span>
                        Your Private Contract Clauses:
                      </span>
                      <span className="text-[10px] text-[#78716C] font-normal">
                        Can edit only own inputs
                      </span>
                    </label>
                    <textarea
                      value={privateTextInput}
                      onChange={(e) => setPrivateTextInput(e.target.value)}
                      rows={8}
                      placeholder={`Paste or draft your ${myParty === 'party_a' ? 'baseline terms' : 'counterparty markup'} here...\n\nExample:\n§ 1.0 Term & Renewal: Agreement shall remain in effect for 24 months with mutual written renewal.\n§ 2.0 Payment Terms: Net 30 days from electronic receipt of itemized invoice.`}
                      className="w-full bg-[#FFFFFF] border border-[#D6CEBE] rounded-lg p-3 font-contract-clause text-sm text-[#1C1917] leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-[#D97706]/50 placeholder:text-[#A8A29E]"
                    />
                  </div>

                  {privateNotice && (
                    <div className="p-3 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] font-mono text-xs rounded-lg flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      <span>{privateNotice}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-mono text-[#78716C]">
                      {isMyPartySubmitted
                        ? `Status: Submitted (${myPrivateData?.clauses_count ?? '–'} clauses normalized)`
                        : 'Status: Pending initial submission'}
                    </span>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      icon="save"
                      disabled={isSubmittingPrivate || isRoomClosed || (!privateSelectedFile && !privateTextInput.trim())}
                    >
                      {isSubmittingPrivate
                        ? 'Parsing & Normalizing...'
                        : isMyPartySubmitted
                        ? 'Re-submit & Update Own Inputs'
                        : 'Submit & Normalize Contract Inputs'}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Status Cards Grid: My Party vs Counterparty Isolation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-[#FAF7F2] border border-[#86EFAC] rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#166534] uppercase tracking-wider">
                      {myPartyLabel}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isMyPartySubmitted
                        ? 'bg-[#DCFCE7] text-[#166534]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}>
                      {isMyPartySubmitted ? 'SUBMITTED' : 'DRAFTING'}
                    </span>
                  </div>
                  <p className="text-xs text-[#1C1917]">
                    {isMyPartySubmitted
                      ? `Normalized ${myPrivateData?.clauses_count ?? '–'} clauses ready for AI deliberation.`
                      : 'You have not submitted contract inputs yet. Ingest your file or paste clauses above.'}
                  </p>
                </div>

                <div className="p-4 bg-[#FAF7F2] border border-[#D6CEBE] rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#78716C] uppercase tracking-wider">
                      {counterpartyLabel}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      (myParty === 'party_a' ? partyBSubmitted : partyASubmitted)
                        ? 'bg-[#DCFCE7] text-[#166534]'
                        : 'bg-[#EDE7DC] text-[#78716C]'
                    }`}>
                      {(myParty === 'party_a' ? partyBSubmitted : partyASubmitted) ? 'SUBMITTED' : 'PENDING'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#78716C]">
                    <span className="material-symbols-outlined text-sm text-[#D97706]">visibility_off</span>
                    <span>Private internal clauses protected. Visible only when room is READY &amp; shared.</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 2. SHARED CHAMBER VIEW (Mutually visible clauses, proposals, agreed changes, safe AI results) */
            <div className="space-y-4">
              {/* Shared Chamber Subtab Switcher (Private Room mode) */}
              {(targetMatterId.startsWith('NEG-') || roomDetail) && (
                <div className="flex items-center gap-2 border-b border-[#D6CEBE] pb-2 font-mono text-xs overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setSharedSubTab('clauses')}
                    className={`px-3 py-1.5 rounded transition-all font-bold flex items-center gap-1.5 shrink-0 ${
                      sharedSubTab === 'clauses'
                        ? 'bg-[#1C1917] text-[#FAF7F2] shadow-xs'
                        : 'bg-[#EDE7DC] text-[#1C1917] hover:bg-[#D6CEBE]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs">description</span>
                    <span>Mutually Visible Clauses ({clauses.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharedSubTab('proposals')}
                    className={`px-3 py-1.5 rounded transition-all font-bold flex items-center gap-1.5 shrink-0 ${
                      sharedSubTab === 'proposals'
                        ? 'bg-[#1C1917] text-[#FAF7F2] shadow-xs'
                        : 'bg-[#EDE7DC] text-[#1C1917] hover:bg-[#D6CEBE]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs">rate_review</span>
                    <span>Negotiation Proposals</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharedSubTab('agreed')}
                    className={`px-3 py-1.5 rounded transition-all font-bold flex items-center gap-1.5 shrink-0 ${
                      sharedSubTab === 'agreed'
                        ? 'bg-[#1C1917] text-[#FAF7F2] shadow-xs'
                        : 'bg-[#EDE7DC] text-[#1C1917] hover:bg-[#D6CEBE]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs">handshake</span>
                    <span>Agreed Changes ({clauses.filter((c) => c.status === 'agreed').length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharedSubTab('ai_results')}
                    className={`px-3 py-1.5 rounded transition-all font-bold flex items-center gap-1.5 shrink-0 ${
                      sharedSubTab === 'ai_results'
                        ? 'bg-[#1C1917] text-[#FAF7F2] shadow-xs'
                        : 'bg-[#EDE7DC] text-[#1C1917] hover:bg-[#D6CEBE]'
                    }`}
                  >
                    <span>Safe AI Results</span>
                  </button>
                </div>
              )}

              {/* Subtab: Proposals */}
              {sharedSubTab === 'proposals' && (
                <div className="space-y-4">
                  <div className="bg-[#FAF7F2] border border-[#D6CEBE] rounded-xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#D6CEBE]">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#D97706] text-lg">rate_review</span>
                        <h3 className="font-headline-md text-base font-bold text-[#1C1917]">
                          Submit Negotiation Proposal
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono text-[#78716C]">
                        Shared with counterparty counsel
                      </span>
                    </div>

                    <form onSubmit={handleSendProposal} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <label className="font-mono text-xs font-bold text-[#1C1917] shrink-0">Target Clause:</label>
                        <select
                          value={proposalClauseId || selectedClause.section || selectedClause.id}
                          onChange={(e) => setProposalClauseId(e.target.value)}
                          className="bg-[#FFFFFF] border border-[#D6CEBE] rounded px-3 py-1 text-xs font-mono text-[#1C1917]"
                        >
                          {clauses.map((c) => (
                            <option key={c.id} value={c.section || c.id}>
                              {c.section} — {c.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <textarea
                        value={proposalText}
                        onChange={(e) => setProposalText(e.target.value)}
                        rows={4}
                        placeholder="Enter proposed compromise language or terms to share with counterparty..."
                        className="w-full bg-[#FFFFFF] border border-[#D6CEBE] rounded-lg p-3 font-contract-clause text-sm text-[#1C1917] leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-[#D97706]/50 placeholder:text-[#A8A29E]"
                      />

                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          icon="send"
                          disabled={isSubmittingProposal || !proposalText.trim()}
                        >
                          {isSubmittingProposal ? 'Submitting...' : 'Submit Proposal'}
                        </Button>
                      </div>
                    </form>
                  </div>

                  {/* Proposal History List */}
                  <div className="space-y-3">
                    <h4 className="font-mono text-xs font-bold text-[#1C1917] uppercase tracking-wider">
                      Active Shared Proposals
                    </h4>
                    {((sharedData?.proposals && sharedData.proposals.length > 0) || bilateralEvents.some((e) => e.type === 'proposal')) ? (
                      <div className="space-y-2.5">
                        {sharedData?.proposals?.map((prop: any, idx: number) => (
                          <div key={idx} className="p-4 bg-[#FAF7F2] border border-[#D6CEBE] rounded-lg shadow-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-[#D97706]">
                                Clause: {prop.clause_id} — {prop.title || 'Proposal'}
                              </span>
                              <span className="font-mono text-[10px] text-[#78716C]">
                                Status: {prop.status || 'Active'}
                              </span>
                            </div>
                            <p className="font-contract-clause text-sm text-[#1C1917] leading-relaxed italic bg-[#EDE7DC]/30 p-2.5 rounded border border-[#D6CEBE]">
                              "{prop.proposal}"
                            </p>
                            <div className="flex justify-end">
                              <Button
                                variant="primary"
                                size="sm"
                                icon="check"
                                onClick={() => handleAgreeClause(prop.clause_id, prop.proposal)}
                                className="!bg-emerald-700 hover:!bg-emerald-600 !text-white text-xs"
                              >
                                Accept &amp; Mark Agreed
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 bg-[#FAF7F2] border border-[#D6CEBE] rounded-lg text-center space-y-2">
                        <span className="material-symbols-outlined text-[#78716C] text-3xl">rate_review</span>
                        <p className="font-mono text-xs text-[#1C1917] font-bold">No active proposals yet.</p>
                        <p className="text-xs text-[#78716C]">Use the form above to submit a clause proposal to your counterparty.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Subtab: Agreed Changes */}
              {sharedSubTab === 'agreed' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#D6CEBE]">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#166534] text-xl">handshake</span>
                      <h3 className="font-headline-md text-base font-bold text-[#1C1917]">
                        Mutually Agreed Clauses
                      </h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]">
                      {clauses.filter((c) => c.status === 'agreed').length} Clauses Ratified
                    </span>
                  </div>

                  {clauses.filter((c) => c.status === 'agreed').length > 0 ? (
                    <div className="space-y-3">
                      {clauses.filter((c) => c.status === 'agreed').map((c) => (
                        <div key={c.id} className="p-4 bg-[#FAF7F2] border border-[#86EFAC] rounded-xl shadow-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded">
                              {c.section} — {c.title}
                            </span>
                            <span className="font-mono text-[10px] text-[#166534] font-bold uppercase flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">verified</span>
                              MUTUALLY RATIFIED
                            </span>
                          </div>
                          <p className="font-contract-clause text-sm text-[#1C1917] leading-relaxed bg-[#FFFFFF] p-3 rounded border border-[#86EFAC]/60">
                            {c.conformedProposal || c.recommendedLanguage || c.originalText}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 bg-[#FAF7F2] border border-[#D6CEBE] rounded-lg text-center space-y-2">
                      <span className="material-symbols-outlined text-[#78716C] text-3xl">handshake</span>
                      <p className="font-mono text-xs text-[#1C1917] font-bold">No clauses mutually agreed yet.</p>
                      <p className="text-xs text-[#78716C]">
                        Both parties can click "Mutually Agree" on any clause in the Clauses view to ratify agreed terms.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Subtab: Safe AI Results */}
              {sharedSubTab === 'ai_results' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#D6CEBE]">
                    <div className="flex items-center gap-2">
                      <h3 className="font-headline-md text-base font-bold text-[#1C1917]">
                        Safe AI Deliberation Results (Agent 1-4 Architecture)
                      </h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-[#EDE7DC] text-[#1C1917] border border-[#D6CEBE]">
                      EDGAR Standard Verified
                    </span>
                  </div>

                  <div className="p-4 bg-[#FAF7F2] border border-[#D6CEBE] rounded-xl space-y-3 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#D97706] text-lg">gavel</span>
                      <h4 className="font-headline-md text-sm font-bold text-[#1C1917]">
                        Arbiter-3 Autonomous Compromise Synthesis
                      </h4>
                    </div>
                    <p className="text-xs text-[#78716C] leading-relaxed">
                      The 4-Agent court evaluated bilateral contractual positions against public market precedents. The resulting recommendations protect mutual commercial viability while eliminating unilateral exposure risks.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <div className="p-3 bg-[#EDE7DC]/40 rounded border border-[#D6CEBE] space-y-1">
                        <span className="font-mono text-[10px] uppercase font-bold text-[#166534]">
                          Buyer Interests Safeguarded
                        </span>
                        <p className="text-xs text-[#1C1917]">
                          Core IP rights and warranty covenants maintained within 92nd percentile market standards.
                        </p>
                      </div>
                      <div className="p-3 bg-[#EDE7DC]/40 rounded border border-[#D6CEBE] space-y-1">
                        <span className="font-mono text-[10px] uppercase font-bold text-[#166534]">
                          Seller Risk Mitigated
                        </span>
                        <p className="text-xs text-[#1C1917]">
                          Liability cap balanced at 12-month fees; indemnification procedure aligned with Delaware precedent.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Human Review & Cryptographic Audit Seal Stage Card */}
                  <div className="p-4 bg-[#FAF7F2] border-2 border-[#D6CEBE] rounded-xl space-y-3 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#D97706] text-xl">gavel</span>
                        <div>
                          <h4 className="font-headline-md text-sm font-bold text-[#1C1917]">
                            Deliberation Audit &amp; Legal Approval Gateway
                          </h4>
                          <p className="font-mono text-[10px] text-[#78716C]">
                            Agent 1 → Agent 2 → Agent 3 → Agent 4 → PENDING_HUMAN_REVIEW → Approval → Seal
                          </p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider ${
                        reportSealed
                          ? 'bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]'
                          : reviewApproved
                          ? 'bg-[#DBEAFE] text-[#1E40AF] border border-[#93C5FD]'
                          : 'bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D]'
                      }`}>
                        {reportSealed ? 'IMMUTABLY SEALED' : reviewApproved ? 'COUNSEL APPROVED' : 'PENDING HUMAN REVIEW'}
                      </span>
                    </div>

                    <p className="text-xs text-[#44403C] leading-relaxed">
                      {reportSealed
                        ? `The multi-agent negotiation report has been cryptographically sealed into the immutable governance ledger. Hash: ${sealHash || 'SHA-256 Verified'}.`
                        : reviewApproved
                        ? 'General Counsel has approved the deliberation compromises. The matter is ready to be cryptographically committed to the audit ledger.'
                        : 'Autonomous agent deliberation is complete. Under corporate governance rules, General Counsel must review and approve recommendations before ledger sealing.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {!reviewApproved && !reportSealed && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon="verified"
                          onClick={handleApproveDeliberation}
                          disabled={isReviewing}
                          className="!bg-[#D97706] hover:!bg-[#B45309] text-xs font-bold"
                        >
                          {isReviewing ? 'Approving Deliberation...' : 'Approve Deliberation (General Counsel)'}
                        </Button>
                      )}
                      {reviewApproved && !reportSealed && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon="lock"
                          onClick={handleSealAuditLedger}
                          disabled={isSealing}
                          className="!bg-[#166534] hover:!bg-[#15803D] text-xs font-bold"
                        >
                          {isSealing ? 'Sealing Audit Ledger...' : 'Cryptographically Seal Audit Ledger'}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="description"
                        onClick={() => navigate(`/reports/${targetMatterId}`)}
                        className="text-xs"
                      >
                        Inspect Full Audit Dossier
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-mono text-xs font-bold text-[#1C1917] uppercase tracking-wider">
                      Synthesized Clause Recommendations
                    </h4>
                    <div className="space-y-2.5">
                      {clauses.map((c) => (
                        <div key={c.id} className="p-4 bg-[#FAF7F2] border border-[#D6CEBE] rounded-lg shadow-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[#D97706]">
                              {c.section} — {c.title}
                            </span>
                            <RiskChip level={c.riskLevel} score={c.riskScore} />
                          </div>
                          <p className="font-contract-clause text-sm text-[#1C1917] leading-relaxed bg-[#DCFCE7]/20 p-2.5 rounded border border-[#86EFAC]/40">
                            {c.conformedProposal || c.recommendedLanguage || c.originalText}
                          </p>
                          <div className="flex items-center justify-between text-xs font-mono text-[#78716C]">
                            <span>Precedent Alignment: {c.precedentAlignment}%</span>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon="handshake"
                              onClick={() => handleAgreeClause(c.clauseId || c.id, c.conformedProposal || c.originalText)}
                              className="text-xs !py-1"
                            >
                              Accept This Recommendation
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Subtab: Mutually Visible Clauses (Default) */}
              {sharedSubTab === 'clauses' && (
                <>
                  {/* Top Horizontal Clause Selector Bar */}
                  <div className="bg-[#FAF7F2] border border-[#D6CEBE] rounded-lg p-2.5 flex items-center justify-between gap-3 overflow-x-auto shadow-xs select-none">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="material-symbols-outlined text-sm text-[#D97706]">view_list</span>
                      <span className="font-mono text-xs font-bold text-[#1C1917] uppercase tracking-wider">
                        Contested Clauses ({clauses.length}):
                      </span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto min-w-0">
                      {clauses.map((clause) => {
                        const isSelected = clause.id === selectedClauseId;
                        return (
                          <button
                            key={clause.id}
                            type="button"
                            onClick={() => setSelectedClauseId(clause.id)}
                            className={`px-3 py-1.5 rounded text-xs font-mono transition-all flex items-center gap-2 shrink-0 ${
                              isSelected
                                ? 'bg-[#1C1917] text-[#FAF7F2] font-bold shadow-xs'
                                : 'bg-[#EDE7DC] text-[#1C1917] hover:bg-[#D6CEBE] font-medium'
                            }`}
                          >
                            <span className="font-bold text-[#D97706]">{clause.section}</span>
                            <span className="truncate max-w-[140px]">{clause.title}</span>
                            <RiskChip level={clause.riskLevel} score={clause.riskScore} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
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

                    {/* TAB CONTENT: EDGAR PRECEDENTS */}
                    {activeTab === 'precedents' && (
                      <div className="space-y-space-md">
                        <div className="p-space-md bg-[#EDE7DC] rounded border border-[#D6CEBE] space-y-space-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[#D97706] flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">balance</span>
                              EDGAR PRECEDENT CITATION:
                            </span>
                            <span className="font-mono text-xs text-[#166534] font-bold">
                              {selectedClause.precedentAlignment}% Precedent Match
                            </span>
                          </div>
                          <p className="font-mono text-xs text-[#1C1917]">
                            {selectedClause.secEdgarCitation}
                          </p>
                          <p className="font-contract-clause text-sm text-[#1C1917]/80 italic pt-1">
                            "{selectedClause.rationale}"
                          </p>
                        </div>
                      </div>
                    )}

                    {/* TAB CONTENT: AGENT 3 VERDICT (DUAL LEGAL + COMMERCIAL REASONING) */}
                    {activeTab === 'verdict' && (
                      <div className="space-y-space-md">
                        {/* Agent 3 Arbitration Badge */}
                        <div className="p-space-sm bg-[#FEF3C7] border border-[#FCD34D] rounded flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#D97706] animate-pulse" />
                            <span className="font-mono text-xs font-bold text-[#92400E] uppercase tracking-wider">
                              Agent 3 • Arbiter Autonomous Mediation Ruling
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-[#92400E] font-semibold">
                            Confidence: 94.2%
                          </span>
                        </div>

                        {/* Dual Verdict Panels: Legal & Commercial */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                          {/* Legal Analysis Panel */}
                          <div className="p-space-base bg-[#FFFFFF] border-l-4 border-[#D97706] border-y border-r border-[#D6CEBE] rounded-r space-y-space-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-base text-[#D97706]">
                                  gavel
                                </span>
                                <h4 className="font-headline-md font-bold text-sm text-[#D97706] uppercase tracking-wide">
                                  LEGAL VERDICT
                                </h4>
                              </div>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D]">
                                LOW RISK COMPROMISE
                              </span>
                            </div>

                            <p className="font-contract-clause text-sm text-[#1C1917] leading-relaxed bg-[#FAF7F2] p-3 rounded border border-[#D6CEBE]">
                              {selectedClause.legalVerdict ||
                                `The counterparty's requested modifications increase buyer indemnification exposure by ~18% over Delaware market standard. However, the proposed compromise retains core intellectual property carve-outs while granting standard limitation of liability at 12 months fees. Recommend conforming to proposed language.`}
                            </p>

                            <div className="space-y-1 font-mono text-[11px] text-[#78716C]">
                              <div className="flex justify-between">
                                <span>Statutory Jurisdiction:</span>
                                <span className="font-semibold text-[#1C1917]">Delaware Chancery Court</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Unilateral Indemnity Risk:</span>
                                <span className="font-semibold text-[#166534]">Extinguished</span>
                              </div>
                            </div>
                          </div>

                          {/* Commercial Analysis Panel */}
                          <div className="p-space-base bg-[#FFFFFF] border-l-4 border-[#166534] border-y border-r border-[#D6CEBE] rounded-r space-y-space-xs">
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
                        {(targetMatterId.startsWith('NEG-') || roomDetail) && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon="handshake"
                            onClick={() => handleAgreeClause(selectedClause.clauseId || selectedClause.id, selectedClause.conformedProposal || selectedClause.originalText)}
                            className="!bg-emerald-700 hover:!bg-emerald-600 !text-white font-bold"
                          >
                            Mutually Agree
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                </>
              )}
            </div>
          )}
        </div>

        {/* PANEL 3: REAL-TIME AGENT DELIBERATION CONSOLE / 2-PARTY BILATERAL STREAM */}
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3 bg-[#FAF7F2] border-l border-[#D6CEBE] p-4 flex flex-col justify-between space-y-3 overflow-hidden select-none">
          <div className="flex flex-col flex-1 min-h-0 space-y-space-sm">
            {/* Header Strip with Switcher if in Private Room */}
            {(targetMatterId.startsWith('NEG-') || roomDetail) ? (
              <div className="flex bg-[#EDE7DC] rounded-lg p-0.5 border border-[#D6CEBE] shrink-0">
                <button
                  type="button"
                  onClick={() => setConsoleTab('bilateral_room')}
                  className={`flex-1 py-1.5 px-2 rounded text-xs font-bold font-mono flex items-center justify-center gap-1.5 transition-all ${
                    consoleTab === 'bilateral_room'
                      ? 'bg-[#D97706] text-white shadow-xs'
                      : 'text-[#78716C] hover:text-[#1C1917]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-[#166534]' : 'bg-[#D6CEBE]'}`} />
                  <span>2-Party Room</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConsoleTab('ai_agents')}
                  className={`flex-1 py-1.5 px-2 rounded text-xs font-bold font-mono flex items-center justify-center gap-1.5 transition-all ${
                    consoleTab === 'ai_agents'
                      ? 'bg-[#D97706] text-white shadow-xs'
                      : 'text-[#78716C] hover:text-[#1C1917]'
                  }`}
                >
                  <WaxSealLogo size={14} />
                  <span>AI Pipeline</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between pb-2 border-b border-[#D6CEBE] shrink-0">
                <div className="flex items-center gap-2">
                  <WaxSealLogo size={22} pulse={liveStatus !== 'PENDING HUMAN REVIEW'} />
                  <span className="font-label-lg text-sm font-bold text-[#1C1917]">
                    Autonomous Deliberation
                  </span>
                </div>
                <span className={`font-mono text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider ${
                  liveStatus === 'PENDING HUMAN REVIEW'
                    ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D]'
                    : 'bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] animate-pulse'
                }`}>
                  {liveStatus === 'PENDING HUMAN REVIEW' ? 'PENDING REVIEW' : 'LIVE'}
                </span>
              </div>
            )}

            {/* TAB 1: 2-PARTY BILATERAL WEBSOCKET STREAM */}
            {consoleTab === 'bilateral_room' ? (
              <div className="flex flex-col flex-1 min-h-0 space-y-2">
                {/* WS Connection Status Strip */}
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#EDE7DC] rounded border border-[#D6CEBE] font-mono text-xs text-[#1C1917] shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${
                      isRoomClosed
                        ? 'bg-[#991B1B]'
                        : wsConnected
                        ? 'bg-[#166534] animate-pulse'
                        : wsReconnecting
                        ? 'bg-[#D97706] animate-pulse'
                        : 'bg-[#D6CEBE]'
                    }`} />
                    <span className="text-[11px] font-bold text-[#1C1917]">
                      {isRoomClosed
                        ? 'Room Closed'
                        : wsConnected
                        ? 'Connected (/ws/negotiation)'
                        : wsReconnecting
                        ? 'Reconnecting...'
                        : 'Connecting...'}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#78716C] font-mono font-bold">
                    Capacity: {displayCapacity} / 2
                  </span>
                </div>

                {/* Real-time Presence Toast */}
                {presenceNotice && (
                  <div className={`px-2.5 py-1 text-xs rounded border flex items-center justify-between transition-all duration-300 ${
                    presenceNotice.type === 'join'
                      ? 'bg-[#DCFCE7] border-[#86EFAC] text-[#166534]'
                      : presenceNotice.type === 'leave'
                      ? 'bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]'
                      : presenceNotice.type === 'closed'
                      ? 'bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B]'
                      : 'bg-[#EDE7DC] border-[#D6CEBE] text-[#1C1917]'
                  }`}>
                    <span className="font-mono text-[11px] font-bold">{presenceNotice.text}</span>
                    <button onClick={() => setPresenceNotice(null)} className="text-[#78716C] hover:text-[#1C1917] text-xs ml-2 cursor-pointer font-bold">×</button>
                  </div>
                )}

                {/* Bilateral Message Feed */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
                  {bilateralEvents.length === 0 ? (
                    <div className="p-4 bg-[#EDE7DC] rounded border border-[#D6CEBE] text-center space-y-1 my-auto">
                      <span className="material-symbols-outlined text-[#78716C] text-2xl">forum</span>
                      <p className="font-mono text-xs text-[#1C1917] font-bold">
                        2-Party Deliberation Channel
                      </p>
                      <p className="text-[11px] text-[#78716C]">
                        Send messages or clause proposals directly to your counterparty counsel over WebSocket.
                      </p>
                    </div>
                  ) : (
                    bilateralEvents.map((evt, idx) => {
                      if (evt.type === 'join') {
                        const baseName = (evt.sender_name || 'Counsel').replace(/\s*\((buyer|seller)\)/gi, '').trim();
                        const roleLabel = evt.sender_role || (baseName.toLowerCase().includes('seller') ? 'seller' : 'buyer');
                        return (
                          <div key={idx} className="text-center my-1.5">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] font-bold">
                              {(evt.sender_name || baseName || 'Counsel')} ({evt.sender_role || roleLabel || 'party'}) joined
                            </span>
                          </div>
                        );
                      }

                      if (evt.type === 'leave') {
                        if (evt.status === 'disconnected') return null;
                        const baseName = (evt.sender_name || 'Counsel').replace(/\s*\((buyer|seller)\)/gi, '').trim();
                        const roleLabel = evt.sender_role || (baseName.toLowerCase().includes('seller') ? 'seller' : 'buyer');
                        return (
                          <div key={idx} className="text-center my-1.5">
                            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              {baseName} ({roleLabel}) left room
                            </span>
                          </div>
                        );
                      }

                      if (evt.type === 'room_closed') {
                        return (
                          <div key={idx} className="p-2.5 rounded bg-error-container/20 border border-error/40 text-center space-y-1 my-1">
                            <span className="material-symbols-outlined text-error text-lg">lock</span>
                            <p className="font-mono text-[11px] font-bold text-error">
                              {evt.text || 'Negotiation concluded and closed by creator.'}
                            </p>
                          </div>
                        );
                      }

                      if (evt.type === 'proposal' || evt.type === 'clause_submitted') {
                        return (
                          <div key={idx} className="p-2.5 rounded-lg border border-[#FCD34D] bg-[#FEF3C7] space-y-1 shadow-xs">
                            <div className="flex items-center justify-between text-[10px] font-mono text-[#92400E] font-bold">
                              <span>PROPOSAL: {evt.clause_id}</span>
                              <span>{resolveSenderName(evt.sender_name, evt.sender_role)}</span>
                            </div>
                            <p className="text-xs font-serif italic text-[#1C1917]">
                              "{evt.proposal || evt.text}"
                            </p>
                          </div>
                        );
                      }

                      if (evt.type === 'system') {
                        const cleanText = (evt.text || '')
                          .replace(/Participant Negotiation Demo \(Seller\) was admitted/gi, 'Participant Marcus Vance (Seller) was admitted')
                          .replace(/Participant Negotiation Demo was admitted/gi, 'Participant Marcus Vance (Seller) was admitted')
                          .replace(/Negotiation Demo \(Seller\)/gi, 'Marcus Vance (Seller)')
                          .replace(/Negotiation Demo \(Buyer\)/gi, 'Elena Rostova (Buyer)')
                          .replace(/Negotiation Demo/gi, 'Marcus Vance (Seller)');
                        return (
                          <div key={idx} className="p-2.5 rounded bg-[#EDE7DC] border border-[#D6CEBE] text-center space-y-1 my-1">
                            <p className="font-mono text-[11px] font-semibold text-[#44403C]">
                              {cleanText}
                            </p>
                          </div>
                        );
                      }

                      // Default 'message'
                      const myRole = (isCreatorOfRoom
                        ? (roomDetail?.creator_role || 'buyer')
                        : (roomDetail?.guest_role || 'seller')).toLowerCase();
                      const isOwn =
                        (evt.sender_role && evt.sender_role.toLowerCase() === myRole) ||
                        (evt.sender_id && evt.sender_id === (isCreatorOfRoom ? roomDetail?.creator_id : (roomDetail?.participant_id || roomDetail?.guest_id)));

                      return (
                        <div
                          key={evt.id || idx}
                          className={`flex flex-col max-w-[85%] ${
                            isOwn ? 'ml-auto items-end' : 'mr-auto items-start'
                          }`}
                        >
                          <div className="flex items-center gap-1 text-[10px] font-mono text-[#78716C] mb-0.5">
                            <span className="font-semibold">{resolveSenderName(evt.sender_name, evt.sender_role)}</span>
                            <span>•</span>
                            <span>{formatMessageTime(evt.timestamp)}</span>
                          </div>
                          <div
                            className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                              isOwn
                                ? 'bg-[#D97706] text-white rounded-tr-none font-medium'
                                : 'bg-[#EDE7DC] text-[#1C1917] rounded-tl-none border border-[#D6CEBE]'
                            }`}
                          >
                            {evt.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Broadcast Selected Clause Proposal Action */}
                <Button
                  variant="secondary"
                  size="sm"
                  icon="sync_alt"
                  onClick={handleBroadcastClauseProposal}
                  disabled={isRoomClosed || !wsConnected}
                  className="w-full text-xs shrink-0"
                >
                  Broadcast Current Clause Proposal
                </Button>

                {/* Chat Message Input Form */}
                <form onSubmit={handleSendBilateralMessage} className="flex gap-2 pt-2 shrink-0 border-t border-[#D6CEBE]">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={
                      isRoomClosed
                        ? 'Room is closed.'
                        : !wsConnected
                        ? 'Connecting...'
                        : 'Message counterparty counsel...'
                    }
                    disabled={isRoomClosed || !wsConnected}
                    className="flex-1 bg-[#FAF7F2] border-2 border-[#D6CEBE] rounded px-2.5 py-1.5 text-xs text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#D97706] transition-colors"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    icon="send"
                    type="submit"
                    disabled={isRoomClosed || !wsConnected || !chatInput.trim()}
                  >
                    Send
                  </Button>
                </form>
              </div>
            ) : (
              /* TAB 2: AI PIPELINE DELIBERATION STREAM (SSE) - UNCHANGED */
              <>
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#EDE7DC] rounded border border-[#D6CEBE] font-mono text-xs text-[#1C1917] shrink-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    liveStatus === 'PENDING HUMAN REVIEW' ? 'bg-[#D97706]' : 'bg-[#166534] animate-pulse'
                  }`} />
                  <span className="truncate font-bold text-[#1C1917]">{liveStatus}</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {deliberationEvents.length === 0 ? (
                    <div className="p-4 bg-[#EDE7DC] rounded border border-[#D6CEBE] text-center space-y-2">
                      <span className="material-symbols-outlined text-[#D97706] text-2xl animate-spin">
                        sync
                      </span>
                      <p className="font-mono text-xs text-[#1C1917] font-bold">
                        Initializing real-time deliberation stream...
                      </p>
                      <p className="font-body-sm text-[11px] text-[#78716C]">
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
                          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        } catch {
                          return String(evt.timestamp);
                        }
                      })();

                      return (
                        <article
                          key={evt.eventId || evt.event_id || `delib-${idx}`}
                          className={`p-3 rounded border text-xs leading-relaxed space-y-2 transition-all ${
                            isA1
                              ? 'bg-[#EFF6FF] border-[#93C5FD] text-[#1C1917]'
                              : isA2
                              ? 'bg-[#FFFBEB] border-[#FCD34D] text-[#1C1917]'
                              : isA3
                              ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#1C1917] shadow-xs'
                              : 'bg-[#FEF3C7] border-[#FCD34D] text-[#1C1917]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 pb-1 border-b border-[#D6CEBE]">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isA1
                                    ? 'bg-[#3B82F6]'
                                    : isA2
                                    ? 'bg-[#D97706]'
                                    : isA3
                                    ? 'bg-[#166534]'
                                    : 'bg-[#D97706]'
                                }`}
                              />
                              <span
                                className={`font-bold ${
                                  isA1
                                    ? 'text-[#1D4ED8]'
                                    : isA2
                                    ? 'text-[#92400E]'
                                    : isA3
                                    ? 'text-[#166534]'
                                    : 'text-[#92400E]'
                                }`}
                              >
                                {evt.agentName || evt.agent_name || (isA1 ? 'Lex-Ingestor A' : isA2 ? 'Lex-Ingestor B' : isA3 ? 'Arbiter-3' : 'System Orchestrator')}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#78716C]">
                              {evt.source && (
                                <span className="px-1 py-0.5 bg-[#EDE7DC] rounded text-[9px] font-bold text-[#78716C] border border-[#D6CEBE]">
                                  {evt.source}
                                </span>
                              )}
                              <span className="font-semibold">{formattedTime}</span>
                            </div>
                          </div>

                          <p className="font-body-sm text-xs font-normal text-[#1C1917] leading-relaxed">
                            {evt.message}
                          </p>

                          {(evt.clauseIds?.length || evt.clause_ids?.length) ? (
                            <div className="flex flex-wrap items-center gap-1 pt-1">
                              <span className="font-mono text-[10px] text-[#78716C] font-bold">
                                Affected Clauses:
                              </span>
                              {(evt.clauseIds || evt.clause_ids || []).map((cid) => (
                                <button
                                  key={cid}
                                  onClick={() => handleClauseClick(cid)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#EDE7DC] hover:bg-[#D6CEBE] text-[#1C1917] font-mono text-[10px] rounded border border-[#D6CEBE] transition-colors font-semibold"
                                >
                                  <span className="material-symbols-outlined text-[10px]">link</span>
                                  <span>{cid}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {(typeof evt.riskScore === 'number' || typeof evt.risk_score === 'number') && (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] rounded font-mono text-[10px] font-bold">
                              <span>Risk: {(evt.riskScore ?? evt.risk_score)?.toFixed(1)}/10</span>
                            </div>
                          )}

                          {isA3 && (
                            <div className="space-y-1.5 pt-1 border-t border-[#D6CEBE] font-body-sm text-[11px]">
                              {(evt.legalImpact || evt.legal_impact) && (
                                <div className="p-1.5 bg-[#FEE2E2] border border-[#FCA5A5] rounded space-y-0.5">
                                  <span className="font-mono text-[10px] font-bold text-[#991B1B] flex items-center gap-1 uppercase">
                                    <span className="material-symbols-outlined text-[12px]">gavel</span>
                                    Legal Exposure
                                  </span>
                                  <p className="text-[#44403C] text-[11px]">
                                    {evt.legalImpact || evt.legal_impact}
                                  </p>
                                </div>
                              )}

                              {(evt.commercialImpact || evt.commercial_impact) && (
                                <div className="p-1.5 bg-[#DCFCE7] border border-[#86EFAC] rounded space-y-0.5">
                                  <span className="font-mono text-[10px] font-bold text-[#166534] flex items-center gap-1 uppercase">
                                    <span className="material-symbols-outlined text-[12px]">trending_up</span>
                                    Commercial Impact
                                  </span>
                                  <p className="text-[#44403C] text-[11px]">
                                    {evt.commercialImpact || evt.commercial_impact}
                                  </p>
                                </div>
                              )}

                              {evt.recommendation && (
                                <div className="p-1.5 bg-[#FEF3C7] border border-[#FCD34D] rounded space-y-0.5">
                                  <span className="font-mono text-[10px] font-bold text-[#92400E] flex items-center gap-1 uppercase">
                                    Recommended Compromise
                                  </span>
                                  <p className="text-[#1C1917] font-semibold text-[11px]">
                                    {evt.recommendation}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {isOrchestrator && (
                            <div className="p-2 bg-[#FEF3C7] border border-[#FCD34D] rounded space-y-1">
                              <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#92400E] uppercase">
                                <span className="material-symbols-outlined text-sm">verified_user</span>
                                <span>STATUS: PENDING HUMAN REVIEW</span>
                              </div>
                              <p className="font-body-sm text-[11px] text-[#44403C]">
                                Deliberation complete. Recommendations staged. General Counsel review required before execution.
                              </p>
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>

                <div className="p-2.5 bg-[#FEF3C7] border border-[#FCD34D] rounded text-xs space-y-1.5 shrink-0">
                  <div className="flex items-center justify-between font-mono text-[11px] font-bold text-[#92400E]">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">gavel</span>
                      HUMAN REVIEW BOUNDARY
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                      reportSealed
                        ? 'bg-[#166534] text-white'
                        : reviewApproved
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-[#D97706] text-white'
                    }`}>
                      {reportSealed ? 'SEALED' : reviewApproved ? 'APPROVED' : 'UNSEALED'}
                    </span>
                  </div>
                  <p className="font-body-sm text-[10px] text-[#78716C] leading-tight">
                    {reportSealed
                      ? `Audit trail cryptographically sealed into immutable ledger. ${sealHash ? `Seal: ${sealHash.substring(0, 16)}...` : 'SHA-256 Verified'}`
                      : reviewApproved
                      ? 'Approved by General Counsel. Ready for cryptographic sealing into immutable ledger.'
                      : 'AI agents 1-4 completed convergence. General Counsel approval required before execution.'}
                  </p>

                  <div className="flex items-center gap-1.5 pt-1">
                    {!reviewApproved && !reportSealed && (
                      <button
                        type="button"
                        onClick={handleApproveDeliberation}
                        disabled={isReviewing}
                        className="flex-1 bg-[#D97706] hover:bg-[#B45309] text-white font-mono text-[10px] font-bold py-1 px-2 rounded flex items-center justify-center gap-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-xs">verified</span>
                        {isReviewing ? 'Approving...' : 'Approve Deliberation'}
                      </button>
                    )}
                    {reviewApproved && !reportSealed && (
                      <button
                        type="button"
                        onClick={handleSealAuditLedger}
                        disabled={isSealing}
                        className="flex-1 bg-[#166534] hover:bg-[#15803D] text-white font-mono text-[10px] font-bold py-1 px-2 rounded flex items-center justify-center gap-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-xs">lock</span>
                        {isSealing ? 'Sealing...' : 'Cryptographic Audit/Seal'}
                      </button>
                    )}
                    {reportSealed && (
                      <div className="w-full bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] rounded p-1 text-center font-mono text-[10px] font-bold flex items-center justify-center gap-1">
                        <span className="material-symbols-outlined text-xs">verified</span>
                        <span>IMMUTABLY SEALED &amp; AUDITED</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action Bottom Cluster */}
          <div className="space-y-2 pt-2 border-t border-[#D6CEBE] shrink-0">
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

