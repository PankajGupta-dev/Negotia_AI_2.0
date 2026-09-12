/**
 * Negotia AI Backend API Client
 *
 * Provides strongly-typed functions connecting the Negotia AI frontend
 * to the FastAPI backend service running at http://localhost:8000.
 *
 * Supported domains:
 *   • Contract Ingestion (multipart/form-data upload & background orchestration)
 *   • Matter Retrieval (list dockets & individual matter state)
 *   • Clauses & Bilateral Redlines (word diffs, legal/commercial verdicts, risk scores)
 *   • Conforming Clauses (proposal settling while maintaining pending_review)
 *   • Reports & Synthesis (executive brief, counsel savings, commercial impact)
 *   • Human Counsel Review (approve, request_revision, escalate)
 *   • Governance & Audit (immutable block chain, 7 required fields & hash verification)
 *   • Real-Time Pipeline SSE Stream (EventSource observer for live agent progress)
 */

export const BACKEND_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:8000';

// ═════════════════════════════════════════════════════════════════════════════
// Generic HTTP Client Helper
// ═════════════════════════════════════════════════════════════════════════════

export class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BACKEND_BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  // Do not set Content-Type for FormData as the browser automatically sets multipart/form-data with boundary
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  try {
    const res = await fetch(url, config);

    if (!res.ok) {
      let errorBody: any;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = await res.text();
      }
      const message =
        typeof errorBody === 'object' && errorBody?.detail
          ? String(errorBody.detail)
          : `API request failed with status ${res.status}: ${res.statusText}`;
      throw new ApiError(message, res.status, errorBody);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      err instanceof Error ? err.message : 'Unknown network error',
      0,
      err
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Contract Ingestion
// ═════════════════════════════════════════════════════════════════════════════

export interface IngestContractParams {
  fileA: File | Blob;
  fileB: File | Blob;
  matterId?: string;
  title?: string;
  counterparty?: string;
  arrValue?: string;
  varianceCeiling?: number;
  leadCounsel?: string;
}

export interface ContractIngestResponse {
  matterId: string;
  status: string; // "ingested"
  pipelineUrl: string; // "/api/pipeline/stream/{matter_id}"
  title?: string;
  counterparty?: string;
  message?: string;
}

/**
 * Ingest Party A baseline and Party B redline contracts to initiate autonomous deliberation.
 * Accepts either an IngestContractParams object or a prepared FormData object.
 */
export async function ingestContracts(
  input: IngestContractParams | FormData
): Promise<ContractIngestResponse> {
  let formData: FormData;

  if (input instanceof FormData) {
    formData = input;
  } else {
    formData = new FormData();
    formData.append('file_a', input.fileA);
    formData.append('file_b', input.fileB);
    if (input.matterId) formData.append('matter_id', input.matterId);
    if (input.title) formData.append('title', input.title);
    if (input.counterparty) formData.append('counterparty', input.counterparty);
    if (input.arrValue) formData.append('arr_value', input.arrValue);
    if (input.varianceCeiling !== undefined) {
      formData.append('variance_ceiling', String(input.varianceCeiling));
    }
    if (input.leadCounsel) formData.append('lead_counsel', input.leadCounsel);
  }

  return request<ContractIngestResponse>('/api/contracts/ingest', {
    method: 'POST',
    body: formData,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Matter Retrieval
// ═════════════════════════════════════════════════════════════════════════════

export interface MatterDetail {
  id: string;
  matterId: string;
  docketNumber: string;
  title: string;
  counterparty: string;
  type: string;
  stage: string;
  round: number;
  totalRounds: number;
  status: 'active' | 'review' | 'concluded' | 'escalated' | 'pending_review' | 'approved' | 'sealed';
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  riskScore: number;
  precedentMatch: number;
  arrValue?: string;
  varianceCeiling?: number;
  leadCounsel: string;
  pendingRedlinesCount: number;
  docAFile?: string;
  docBFile?: string;
  party_a_file?: string;
  party_b_file?: string;
  lastUpdated?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Retrieve all negotiation matters stored in the system.
 */
export async function getMatters(params?: {
  skip?: number;
  limit?: number;
}): Promise<MatterDetail[]> {
  const query = new URLSearchParams();
  if (params?.skip !== undefined) query.set('skip', String(params.skip));
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  const queryString = query.toString() ? `?${query.toString()}` : '';

  return request<MatterDetail[]>(`/api/matters${queryString}`);
}

/**
 * Retrieve single matter docket metadata and current lifecycle status.
 */
export async function getMatter(id: string): Promise<MatterDetail> {
  return request<MatterDetail>(`/api/matters/${encodeURIComponent(id)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Clauses & Bilateral Redlines
// ═════════════════════════════════════════════════════════════════════════════

export interface ClauseDiff {
  insertions: string[];
  deletions: string[];
  summary: string;
  diff_text: string;
}

export interface ClauseRisk {
  score: number;
  level: string;
  precedent_alignment?: number;
}

export interface ClauseDetail {
  id: string;
  clauseId: string;
  clause_id?: string;
  matterId: string;
  matter_id?: string;
  section: string;
  title: string;
  originalText: string;
  original_text?: string;
  counterpartyText: string;
  counterparty_text?: string;
  diff: ClauseDiff;
  risk: ClauseRisk;
  riskScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical' | string;
  legalVerdict: string;
  legal_verdict?: string;
  commercialVerdict: string;
  commercial_verdict?: string;
  recommendedLanguage: string;
  recommended_language?: string;
  conformedProposal?: string;
  conformed_proposal?: string;
  precedentAlignment: number;
  precedent_alignment?: number;
  status: 'agreed' | 'pending' | 'flagged' | 'conceded' | 'conformed' | string;
  rationale?: string;
}

/**
 * Retrieve all negotiated clauses, diffs, Arbiter dual-lens verdicts, and risk scores for a matter.
 */
export async function getMatterClauses(matterId: string): Promise<ClauseDetail[]> {
  return request<ClauseDetail[]>(`/api/matters/${encodeURIComponent(matterId)}/clauses`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Conform Clause
// ═════════════════════════════════════════════════════════════════════════════

export interface ConformClausePayload {
  conformedText?: string;
  conformedLanguage?: string;
  text?: string;
  rationale?: string;
}

export interface ConformClauseResponse {
  clauseId: string;
  clause_id?: string;
  matterId: string;
  matter_id?: string;
  status: string;
  conformedProposal: string;
  conformed_proposal?: string;
  matterStatus: string;
  matter_status?: string;
  isSealed: boolean;
  is_sealed?: boolean;
  message: string;
}

/**
 * Persist settled or conformed clause proposal into the matter record.
 * GUARANTEE: Does NOT approve or seal the matter docket.
 */
export async function conformClause(
  matterId: string,
  clauseId: string,
  payload: ConformClausePayload | string
): Promise<ConformClauseResponse> {
  const body =
    typeof payload === 'string'
      ? { conformed_text: payload }
      : {
          conformed_text: payload.conformedText || payload.conformedLanguage || payload.text,
          rationale: payload.rationale,
        };

  return request<ConformClauseResponse>(
    `/api/matters/${encodeURIComponent(matterId)}/clauses/${encodeURIComponent(clauseId)}/conform`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Reports & Executive Dossier
// ═════════════════════════════════════════════════════════════════════════════

export interface KeyNegotiatedChange {
  clauseId: string;
  section: string;
  title: string;
  compromiseProposal: string;
  status: string;
  rationale?: string;
}

export interface LegalRiskSummary {
  overallRiskScore: number;
  riskLevel: string;
  precedentAlignmentPercent: number;
  secCitations: string[];
  topExposureClauses: string[];
}

export interface CommercialImpact {
  arrValue: string;
  costVarianceCeiling: string;
  protectedArrValue: string;
  paymentTerms: string;
  netCarryingCostSummary: string;
}

export interface CounselSavings {
  estimatedTraditionalHours: number;
  actualAiMinutes: number;
  effectiveCostSavingsUsd: number;
  savingsSummary: string;
}

export interface ReportResponse {
  id: string;
  reportId?: string;
  report_id?: string;
  matterId: string;
  matter_id?: string;
  docketNumber: string;
  docket_number?: string;
  executiveSummary: string;
  executive_summary?: string;
  keyNegotiatedChanges: KeyNegotiatedChange[];
  key_negotiated_changes?: KeyNegotiatedChange[];
  legalRiskSummary: LegalRiskSummary;
  legal_risk_summary?: LegalRiskSummary;
  commercialImpact: CommercialImpact;
  commercial_impact?: CommercialImpact;
  counselSavings: CounselSavings;
  counsel_savings?: CounselSavings;
  reviewStatus: 'pending_review' | 'approved' | 'revision_requested' | 'escalated' | string;
  review_status?: string;
  isSealed: boolean;
  is_sealed?: boolean;
  attestationHash?: string | null;
  attestation_hash?: string | null;
  blockDigest?: string | null;
  block_digest?: string | null;
  sealedBy?: string | null;
  sealed_by?: string | null;
  sealedAt?: string | null;
  sealed_at?: string | null;
  settledClauses: ClauseDetail[];
  settled_clauses?: ClauseDetail[];
  settledClausesCount: number;
  settled_clauses_count?: number;
  totalClausesCount: number;
  total_clauses_count?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Retrieve comprehensive executive dossier report for a matter or report ID.
 */
export async function getReport(reportOrMatterId: string): Promise<ReportResponse> {
  return request<ReportResponse>(`/api/reports/${encodeURIComponent(reportOrMatterId)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Human Counsel Review
// ═════════════════════════════════════════════════════════════════════════════

export interface ReviewActionPayload {
  action: 'approve' | 'request_revision' | 'escalate';
  counselName: string;
  comments?: string;
}

export interface ReviewActionResponse {
  reportId: string;
  report_id?: string;
  matterId: string;
  matter_id?: string;
  action: 'approve' | 'request_revision' | 'escalate' | string;
  counselName: string;
  counsel_name?: string;
  reviewStatus: string;
  review_status?: string;
  matterStatus: string;
  matter_status?: string;
  isSealedEligible: boolean;
  is_sealed_eligible?: boolean;
  isSealed: boolean;
  is_sealed?: boolean;
  message: string;
}

/**
 * Submit General Counsel decision:
 *   • 'approve'           -> Marks report approved, eligible for cryptographic seal
 *   • 'request_revision'  -> Marks status = revision_requested
 *   • 'escalate'          -> Marks status = escalated
 */
export async function submitReview(
  reportOrMatterId: string,
  payload: ReviewActionPayload
): Promise<ReviewActionResponse> {
  const body = {
    action: payload.action,
    counsel_name: payload.counselName,
    counselName: payload.counselName,
    comments: payload.comments,
  };

  return request<ReviewActionResponse>(
    `/api/reports/${encodeURIComponent(reportOrMatterId)}/review`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}

export interface SealReportResponse {
  reportId?: string;
  report_id?: string;
  matterId?: string;
  matter_id?: string;
  isSealed: boolean;
  is_sealed?: boolean;
  attestationHash?: string;
  attestation_hash?: string;
  blockDigest?: string;
  block_digest?: string;
  message?: string;
}

/**
 * Cryptographically seal an approved matter report.
 * Fails if human counsel has not first approved the report.
 */
export async function sealReport(
  reportOrMatterId: string,
  payload?: { counselName?: string; comments?: string }
): Promise<SealReportResponse> {
  const body = {
    counsel_name: payload?.counselName,
    comments: payload?.comments,
  };

  return request<SealReportResponse>(
    `/api/reports/${encodeURIComponent(reportOrMatterId)}/seal`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Governance & Immutable Audit Chain
// ═════════════════════════════════════════════════════════════════════════════

export interface AuditBlock {
  blockIndex: number;
  block_index?: number;
  event: string;
  timestamp: string;
  previousHash: string;
  previous_hash?: string;
  currentHash: string;
  current_hash?: string;
  humanReviewer?: string | null;
  human_reviewer?: string | null;
  reviewAction?: string | null;
  review_action?: string | null;
  isHashValid: boolean;
  is_hash_valid?: boolean;
}

export interface MatterAuditChainResponse {
  matterId: string;
  matter_id?: string;
  docketNumber: string;
  docket_number?: string;
  isValid: boolean;
  is_valid?: boolean;
  chainLength: number;
  chain_length?: number;
  genesisHash: string;
  genesis_hash?: string;
  tipHash: string;
  tip_hash?: string;
  blocks: AuditBlock[];
  verificationMessage: string;
  verification_message?: string;
}

/**
 * Retrieve complete immutable governance audit trail with mathematical hash verification.
 * Includes all 7 required fields per block:
 *   - block index
 *   - event
 *   - timestamp
 *   - previous hash
 *   - current hash
 *   - human reviewer
 *   - review action
 */
export async function getMatterAudit(matterId: string): Promise<MatterAuditChainResponse> {
  return request<MatterAuditChainResponse>(`/api/matters/${encodeURIComponent(matterId)}/audit`);
}

/**
 * Verify mathematical chain integrity from Genesis to tip for a report or matter.
 */
export async function verifyAuditChain(
  reportOrMatterId: string
): Promise<{ valid: boolean; chainLength?: number; message?: string }> {
  return request<{ valid: boolean; chainLength?: number; message?: string }>(
    `/api/reports/${encodeURIComponent(reportOrMatterId)}/audit-chain`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. Real-Time Pipeline SSE Stream Observer
// ═════════════════════════════════════════════════════════════════════════════

export interface PipelineStreamEvent {
  eventType?: 'agent_update' | 'deliberation' | 'merge_status' | 'pipeline_complete' | 'pipeline_error' | string;
  event?: string;
  event_type?: string;
  matterId?: string;
  matter_id?: string;
  agent?: string;
  agentName?: string;
  agent_name?: string;
  role?: string;
  status?: string;
  thought?: string;
  message?: string;
  timestamp?: string;
  clauseIds?: string[];
  clause_ids?: string[];
  riskScore?: number;
  risk_score?: number;
  legalImpact?: string;
  legal_impact?: string;
  commercialImpact?: string;
  commercial_impact?: string;
  recommendation?: string;
  eventId?: string;
  event_id?: string;
  source?: 'LLM' | 'FALLBACK' | string;
  payload?: Record<string, any>;
}

/**
 * Connect to live pipeline Server-Sent Events (SSE) stream for a matter.
 * Returns an unsubscribe callback function to close the connection when unmounting.
 */
export function subscribeToPipelineStream(
  matterId: string,
  onEvent: (event: PipelineStreamEvent) => void,
  onError?: (error: Event) => void
): () => void {
  const url = `${BACKEND_BASE_URL}/api/pipeline/stream/${encodeURIComponent(matterId)}`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (e) => {
    try {
      const parsed: PipelineStreamEvent = JSON.parse(e.data);
      onEvent(parsed);
    } catch {
      // Ignore heartbeat comments or unparseable frames
    }
  };

  if (onError) {
    eventSource.onerror = (e) => {
      onError(e);
    };
  }

  // Return teardown function
  return () => {
    eventSource.close();
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Negotiation Checkpoints & Termination Controller
// ═════════════════════════════════════════════════════════════════════════════

export interface AgreedClauseItem {
  clause_id: string;
  section: string;
  title: string;
  agreed_text: string;
  round_agreed: number;
  compromise_score?: number;
  rationale?: string;
}

export interface UnresolvedClauseItem {
  clause_id: string;
  section: string;
  title: string;
  buyer_position: string;
  seller_position: string;
  gap_summary?: string;
  is_buyer_non_negotiable?: boolean;
  is_seller_non_negotiable?: boolean;
  compromise_score?: number;
}

export interface NegotiationCheckpointData {
  matter_id: string;
  round_number: number;
  status: 'NEGOTIATING' | 'AGREE' | 'DISAGREE' | 'NONE';
  termination_reason?: string | null;
  buyer_offer: Record<string, any>;
  seller_offer: Record<string, any>;
  agreed_clauses: AgreedClauseItem[];
  unresolved_clauses: UnresolvedClauseItem[];
  concessions_made: Array<{
    round_number: number;
    party: string;
    clause_id: string;
    section: string;
    description: string;
  }>;
  buyer_non_negotiables: string[];
  seller_non_negotiables: string[];
  elapsed_seconds?: number;
  token_usage_estimate?: number;
}

/**
 * Fetch latest compact negotiation checkpoint for a matter.
 */
export async function getMatterCheckpoint(matterId: string): Promise<NegotiationCheckpointData> {
  return request<NegotiationCheckpointData>(`/api/pipeline/checkpoint/${encodeURIComponent(matterId)}`);
}

/**
 * Resume negotiation from the last saved checkpoint (does not restart from Round 1).
 */
export async function resumeNegotiation(matterId: string): Promise<{
  success: boolean;
  matter_id: string;
  resumed_from_round: number;
  next_round: number;
  message: string;
}> {
  return request<{
    success: boolean;
    matter_id: string;
    resumed_from_round: number;
    next_round: number;
    message: string;
  }>(`/api/pipeline/resume/${encodeURIComponent(matterId)}`, {
    method: 'POST',
  });
}

export interface DeliberationEvent {
  eventId?: string;
  event_id?: string;
  matterId: string;
  matter_id?: string;
  agent: 'a1' | 'a2' | 'a3' | 'orchestrator' | string;
  agentName?: string;
  agent_name?: string;
  role: string;
  message: string;
  clauseIds?: string[];
  clause_ids?: string[];
  riskScore?: number;
  risk_score?: number;
  legalImpact?: string;
  legal_impact?: string;
  commercialImpact?: string;
  commercial_impact?: string;
  recommendation?: string;
  timestamp: string;
  status?: string;
  source?: 'LLM' | 'FALLBACK' | string;
}

/**
 * Fetch persisted real-time agent deliberations for a matter.
 */
export async function getMatterDeliberations(matterId: string): Promise<DeliberationEvent[]> {
  return request<DeliberationEvent[]>(`/api/matters/${encodeURIComponent(matterId)}/deliberations`);
}

// ═════════════════════════════════════════════════════════════════════════════
// Private Negotiation Room (2-Party) API
// ═════════════════════════════════════════════════════════════════════════════

export interface CreateRoomPayload {
  title: string;
  matter_id?: string;
  creator_name: string;
  creator_role: 'buyer' | 'seller';
  passcode?: string;
}

export interface CreateRoomResult {
  room_id: string;
  passcode?: string | null;
  creator_id: string;
  creator_token: string;
  status: string;
  title: string;
  created_at: string;
}

export interface RoomPublicDetail {
  room_id: string;
  title: string;
  matter_id?: string;
  status: string;
  creator_name?: string;
  creator_role?: string;
  creator_id?: string;
  creator?: { id: string; name: string; role: string };
  guest_name?: string;
  guest_role?: string;
  guest_status: 'none' | 'pending_approval' | 'admitted' | 'rejected' | 'left' | string;
  participant_id?: string;
  participant?: { id: string; name: string; role: string; status: string };
  passcode?: string | null;
  active_participants_count: number;
  created_at: string;
  closed_at?: string;
}

export interface JoinRoomPayload {
  guest_name: string;
  guest_role: 'buyer' | 'seller';
  passcode?: string;
}

export interface JoinRoomResult {
  room_id: string;
  guest_id: string;
  guest_token: string;
  guest_status: string;
  message: string;
}

export async function createPrivateRoom(payload: CreateRoomPayload): Promise<CreateRoomResult> {
  return request<CreateRoomResult>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getPrivateRoom(roomId: string): Promise<RoomPublicDetail> {
  const cleanId = (roomId || '').trim().toUpperCase();
  return request<RoomPublicDetail>(`/api/rooms/${encodeURIComponent(cleanId)}`);
}

export async function requestJoinPrivateRoom(
  roomId: string,
  payload: JoinRoomPayload
): Promise<JoinRoomResult> {
  const cleanId = (roomId || '').trim().toUpperCase();
  return request<JoinRoomResult>(`/api/rooms/${encodeURIComponent(cleanId)}/join`, {
    method: 'POST',
    body: JSON.stringify({
      guest_name: payload.guest_name,
      participant_name: payload.guest_name,
      guest_role: payload.guest_role,
      participant_role: payload.guest_role,
      passcode: payload.passcode?.trim() || undefined,
    }),
  });
}

export async function joinPrivateRoom(
  roomId: string,
  payload: { name?: string; role?: string; passcode?: string }
): Promise<any> {
  const cleanId = (roomId || '').trim().toUpperCase();
  return request<any>(`/api/rooms/${encodeURIComponent(cleanId)}/join`, {
    method: 'POST',
    body: JSON.stringify({
      participant_name: payload.name,
      guest_name: payload.name,
      participant_role: payload.role || 'seller',
      guest_role: payload.role || 'seller',
      passcode: payload.passcode?.trim() || undefined,
    }),
  });
}

export async function admitParticipant(
  roomId: string,
  participantId?: string,
  creatorToken?: string
): Promise<any> {
  const cleanId = (roomId || '').trim().toUpperCase();
  return request<any>(`/api/rooms/${encodeURIComponent(cleanId)}/admit`, {
    method: 'POST',
    headers: creatorToken ? { 'X-Creator-Token': creatorToken } : {},
    body: JSON.stringify({
      creator_token: creatorToken,
      participant_id: participantId,
    }),
  });
}

export async function rejectParticipant(
  roomId: string,
  participantId?: string,
  creatorToken?: string
): Promise<any> {
  const cleanId = (roomId || '').trim().toUpperCase();
  return request<any>(`/api/rooms/${encodeURIComponent(cleanId)}/reject`, {
    method: 'POST',
    headers: creatorToken ? { 'X-Creator-Token': creatorToken } : {},
    body: JSON.stringify({
      creator_token: creatorToken,
      participant_id: participantId,
    }),
  });
}

export async function approveRoomGuest(
  roomId: string,
  decision: 'approve' | 'reject',
  creatorToken: string
): Promise<{ status: string; decision: string; guest_status: string }> {
  const cleanId = (roomId || '').trim().toUpperCase();
  if (decision === 'approve') {
    return admitParticipant(cleanId, undefined, creatorToken);
  } else {
    return rejectParticipant(cleanId, undefined, creatorToken);
  }
}

export async function leavePrivateRoom(
  roomId: string,
  token: string
): Promise<{ status: string; message: string; active_participants_count: number }> {
  const cleanId = (roomId || '').trim().toUpperCase();
  return request<{ status: string; message: string; active_participants_count: number }>(
    `/api/rooms/${encodeURIComponent(cleanId)}/leave`,
    {
      method: 'POST',
      body: JSON.stringify({ token }),
    }
  );
}

export async function closePrivateRoom(
  roomId: string,
  creatorToken: string
): Promise<{ status: string; room_id: string; room_status: string }> {
  const cleanId = (roomId || '').trim().toUpperCase();
  return request<{ status: string; room_id: string; room_status: string }>(
    `/api/rooms/${encodeURIComponent(cleanId)}/close`,
    {
      method: 'POST',
      headers: creatorToken ? { 'X-Creator-Token': creatorToken } : {},
      body: JSON.stringify({ creator_token: creatorToken }),
    }
  );
}

export async function getRoomMessages(roomId: string): Promise<{ room_id: string; messages: any[] }> {
  const cleanId = (roomId || '').trim().toUpperCase();
  return request<{ room_id: string; messages: any[] }>(`/api/rooms/${encodeURIComponent(cleanId)}/messages`);
}

export function getRoomWebSocketUrl(roomId: string, token: string): string {
  const cleanId = (roomId || '').trim().toUpperCase();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Use current host which proxies /ws via Vite dev server or direct backend in production
  return `${protocol}//${window.location.host}/ws/rooms/${encodeURIComponent(cleanId)}?token=${encodeURIComponent(token)}`;
}

export function getNegotiationWebSocketUrl(
  roomId: string,
  token?: string,
  participantId?: string
): string {
  const cleanId = (roomId || '').trim().toUpperCase();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (participantId) params.set('participant_id', participantId);
  const q = params.toString() ? `?${params.toString()}` : '';
  return `${protocol}//${window.location.host}/ws/negotiation/${encodeURIComponent(cleanId)}${q}`;
}

// Default export consolidating all endpoints
const api = {
  ingestContracts,
  getMatters,
  getMatter,
  getMatterClauses,
  conformClause,
  getReport,
  submitReview,
  sealReport,
  getMatterAudit,
  verifyAuditChain,
  subscribeToPipelineStream,
  getMatterCheckpoint,
  resumeNegotiation,
  getMatterDeliberations,
  createPrivateRoom,
  getPrivateRoom,
  requestJoinPrivateRoom,
  approveRoomGuest,
  leavePrivateRoom,
  closePrivateRoom,
  getRoomMessages,
  getRoomWebSocketUrl,
};

export default api;
