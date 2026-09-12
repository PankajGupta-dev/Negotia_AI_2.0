import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { Button } from '../components/Button';
import { HairlineCard } from '../components/HairlineCard';
import { useAuth } from '../context/AuthContext';
import { useIntake } from '../context/IntakeContext';
import {
  createPrivateRoom,
  getPrivateRoom,
  requestJoinPrivateRoom,
  admitParticipant,
  rejectParticipant,
  closePrivateRoom,
  getRoomWebSocketUrl,
  RoomPublicDetail,
  ApiError,
} from '../services/api';

// Persistent LocalStorage Keys for resilient cross-tab and cross-page state
const STORAGE_CREATOR_ROOM = 'negotia_creator_room_id';
const STORAGE_CREATOR_TOKEN = 'negotia_creator_room_token';
const STORAGE_CREATOR_TITLE = 'negotia_creator_room_title';
const STORAGE_CREATOR_PASSCODE = 'negotia_creator_room_passcode';
const STORAGE_PARTICIPANT_ROOM = 'negotia_participant_room_id';
const STORAGE_PARTICIPANT_TOKEN = 'negotia_participant_room_token';
const STORAGE_ACTIVE_TAB = 'negotia_active_room_tab';

export const PrivateRoom: React.FC = () => {
  const { roomId: urlRoomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { matterId, matterTitle } = useIntake();

  // Active Role / Tab: 'creator' or 'participant'
  const [activeTab, setActiveTab] = useState<'creator' | 'participant'>(() => {
    if (urlRoomId) return 'participant';
    const savedTab = localStorage.getItem(STORAGE_ACTIVE_TAB);
    if (savedTab === 'creator' || savedTab === 'participant') return savedTab;
    if (localStorage.getItem(STORAGE_PARTICIPANT_ROOM) && !localStorage.getItem(STORAGE_CREATOR_ROOM)) {
      return 'participant';
    }
    return 'creator';
  });

  // Creator state restored from localStorage
  const [createdRoomId, setCreatedRoomId] = useState<string>(
    () => localStorage.getItem(STORAGE_CREATOR_ROOM) || ''
  );
  const [creatorToken, setCreatorToken] = useState<string>(
    () => localStorage.getItem(STORAGE_CREATOR_TOKEN) || ''
  );
  const [roomTitle, setRoomTitle] = useState<string>(
    () => localStorage.getItem(STORAGE_CREATOR_TITLE) || matterTitle || 'Bilateral Private Negotiation Chamber'
  );
  const [passcode, setPasscode] = useState<string>(
    () => localStorage.getItem(STORAGE_CREATOR_PASSCODE) || ''
  );
  const [isRoomClosed, setIsRoomClosed] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [roomDetails, setRoomDetails] = useState<RoomPublicDetail | null>(null);

  // Pending applicant knock seen by creator
  const [pendingApplicant, setPendingApplicant] = useState<{
    id?: string;
    name: string;
    role: string;
    timestamp?: string;
  } | null>(null);

  // Participant state restored from localStorage
  const [joinRoomId, setJoinRoomId] = useState<string>(
    () => urlRoomId || localStorage.getItem(STORAGE_PARTICIPANT_ROOM) || ''
  );
  const [joinPasscode, setJoinPasscode] = useState<string>('');
  const [isSubmittingJoin, setIsSubmittingJoin] = useState<boolean>(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState<boolean>(false);
  const [isAdmittedParticipant, setIsAdmittedParticipant] = useState<boolean>(false);
  const [rejectionNotice, setRejectionNotice] = useState<string | null>(null);

  // WebSocket reference for live knocking / admission events
  const wsRef = useRef<WebSocket | null>(null);
  const pollIntervalRef = useRef<any>(null);

  // Clear creator storage helpers
  const clearCreatorStorage = () => {
    localStorage.removeItem(STORAGE_CREATOR_ROOM);
    localStorage.removeItem(STORAGE_CREATOR_TOKEN);
    localStorage.removeItem(STORAGE_CREATOR_TITLE);
    localStorage.removeItem(STORAGE_CREATOR_PASSCODE);
  };

  // Clear participant storage helpers
  const clearParticipantStorage = () => {
    localStorage.removeItem(STORAGE_PARTICIPANT_ROOM);
    localStorage.removeItem(STORAGE_PARTICIPANT_TOKEN);
  };

  // Pre-fill URL parameter if provided
  useEffect(() => {
    if (urlRoomId) {
      setJoinRoomId(urlRoomId.toUpperCase());
      setActiveTab('participant');
      localStorage.setItem(STORAGE_ACTIVE_TAB, 'participant');
    }
  }, [urlRoomId]);

  // Handle tab switching with persistent preference
  const handleSelectTab = (tab: 'creator' | 'participant') => {
    setActiveTab(tab);
    localStorage.setItem(STORAGE_ACTIVE_TAB, tab);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // REHYDRATION & PERSISTENT SESSION RESTORATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Creator Rehydration: verify active room on mount or tab switch
  useEffect(() => {
    const savedRoomId = localStorage.getItem(STORAGE_CREATOR_ROOM);
    const savedToken = localStorage.getItem(STORAGE_CREATOR_TOKEN);

    if (savedRoomId) {
      getPrivateRoom(savedRoomId)
        .then((detail) => {
          if (detail) {
            setRoomDetails(detail);
            setCreatedRoomId(detail.room_id);
            if (savedToken) setCreatorToken(savedToken);
            if (detail.passcode) {
              setPasscode(detail.passcode);
              localStorage.setItem(STORAGE_CREATOR_PASSCODE, detail.passcode);
            } else {
              setPasscode('');
              localStorage.removeItem(STORAGE_CREATOR_PASSCODE);
            }

            if (detail.status === 'closed') {
              setIsRoomClosed(true);
            } else {
              setIsRoomClosed(false);
              // Check if applicant is pending approval
              if (detail.guest_status === 'pending_approval' && detail.guest_name) {
                setPendingApplicant({
                  id: detail.participant_id || (detail as any).guest_id,
                  name: detail.guest_name,
                  role: detail.guest_role || 'seller',
                });
              } else {
                setPendingApplicant(null);
              }

              // Reconnect live WebSocket and polling so notifications work across tabs
              if (savedToken) {
                initWebSocket(detail.room_id, savedToken, 'creator');
              }
              startPolling(detail.room_id, 'creator');
            }
          }
        })
        .catch((err) => {
          // Never wipe storage on network hiccup; only if explicitly confirmed 404
          if (err instanceof ApiError && err.status === 404) {
            clearCreatorStorage();
            setCreatedRoomId('');
            setCreatorToken('');
          }
        });
    }
  }, [activeTab]);

  // Participant Rehydration: verify join request status on mount or tab switch
  useEffect(() => {
    const savedJoinRoomId = localStorage.getItem(STORAGE_PARTICIPANT_ROOM);
    const savedJoinToken = localStorage.getItem(STORAGE_PARTICIPANT_TOKEN);

    if (savedJoinRoomId && !urlRoomId) {
      setJoinRoomId(savedJoinRoomId);
      getPrivateRoom(savedJoinRoomId)
        .then((detail) => {
          if (detail) {
            if (detail.status === 'closed') {
              clearParticipantStorage();
              setRejectionNotice('Negotiation room has been closed by the creator.');
              setIsWaitingApproval(false);
              setIsAdmittedParticipant(false);
            } else if (detail.guest_status === 'admitted' || detail.status === 'active') {
              setIsWaitingApproval(false);
              setIsAdmittedParticipant(true);
            } else if (detail.guest_status === 'pending_approval') {
              setIsWaitingApproval(true);
              setIsAdmittedParticipant(false);
              if (savedJoinToken) {
                initWebSocket(savedJoinRoomId, savedJoinToken, 'participant');
              }
              startPolling(savedJoinRoomId, 'participant');
            } else if (detail.guest_status === 'rejected') {
              clearParticipantStorage();
              setRejectionNotice('Your admission request was rejected by the room creator.');
              setIsWaitingApproval(false);
              setIsAdmittedParticipant(false);
            }
          }
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) {
            clearParticipantStorage();
          }
        });
    }
  }, [activeTab, urlRoomId]);

  // Browser Tab Switching & Focus Sync: re-check room status when returning to tab
  useEffect(() => {
    const handleWindowFocusSync = () => {
      const creatorRoomId = localStorage.getItem(STORAGE_CREATOR_ROOM);
      const creatorTok = localStorage.getItem(STORAGE_CREATOR_TOKEN);
      const partRoomId = localStorage.getItem(STORAGE_PARTICIPANT_ROOM);
      const partTok = localStorage.getItem(STORAGE_PARTICIPANT_TOKEN);

      if (creatorRoomId && activeTab === 'creator') {
        getPrivateRoom(creatorRoomId)
          .then((d) => {
            if (d) {
              setRoomDetails(d);
              if (d.status === 'closed') {
                setIsRoomClosed(true);
              } else if (d.guest_status === 'pending_approval' && d.guest_name) {
                setPendingApplicant({
                  id: d.participant_id || (d as any).guest_id,
                  name: d.guest_name,
                  role: d.guest_role || 'seller',
                });
              } else {
                setPendingApplicant(null);
              }
              // Ensure WS is alive
              if (creatorTok && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
                initWebSocket(creatorRoomId, creatorTok, 'creator');
              }
            }
          })
          .catch(() => {});
      } else if (partRoomId && activeTab === 'participant') {
        getPrivateRoom(partRoomId)
          .then((d) => {
            if (d) {
              if (d.guest_status === 'admitted' || d.status === 'active') {
                setIsWaitingApproval(false);
                setIsAdmittedParticipant(true);
              } else if (d.guest_status === 'rejected') {
                setIsWaitingApproval(false);
                setIsAdmittedParticipant(false);
                setRejectionNotice('Your admission request was rejected by the room creator.');
                clearParticipantStorage();
              }
              if (partTok && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
                initWebSocket(partRoomId, partTok, 'participant');
              }
            }
          })
          .catch(() => {});
      }
    };

    window.addEventListener('focus', handleWindowFocusSync);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleWindowFocusSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocusSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab]);

  // Clean up polling and WS on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET & POLLING LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  const startPolling = (roomId: string, userType: 'creator' | 'participant') => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const detail = await getPrivateRoom(roomId);
        if (!detail) return;
        setRoomDetails(detail);

        if (detail.status === 'closed') {
          setIsRoomClosed(true);
          return;
        }

        if (userType === 'creator') {
          if (detail.guest_status === 'pending_approval' && detail.guest_name) {
            setPendingApplicant({
              id: detail.participant_id || (detail as any).guest_id,
              name: detail.guest_name,
              role: detail.guest_role || 'seller',
            });
          } else {
            setPendingApplicant(null);
          }
        } else if (userType === 'participant') {
          if (detail.guest_status === 'admitted' || detail.status === 'active') {
            setIsWaitingApproval(false);
            setIsAdmittedParticipant(true);
          } else if (detail.guest_status === 'rejected') {
            setIsWaitingApproval(false);
            setIsAdmittedParticipant(false);
            setRejectionNotice('Your admission request was rejected by the room creator.');
            clearParticipantStorage();
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          }
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2000);
  };

  const initWebSocket = (targetRoomId: string, token: string, userType: 'creator' | 'participant') => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const wsUrl = getRoomWebSocketUrl(targetRoomId, token);
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Creator: counterparty knocked
          if (userType === 'creator' && data.type === 'guest_knock') {
            setPendingApplicant({
              id: data.guest_id,
              name: data.guest_name || 'Counterparty Counsel',
              role: data.guest_role || 'seller',
              timestamp: data.timestamp,
            });
          }

          // Participant: admitted by creator -> update state and allow opening workspace
          if (userType === 'participant' && (data.type === 'guest_admitted' || data.type === 'admit')) {
            setIsWaitingApproval(false);
            setIsAdmittedParticipant(true);
            localStorage.setItem(`room_${targetRoomId}_role`, 'participant');
            localStorage.setItem(`room_${targetRoomId}_token`, token);
            sessionStorage.setItem(`room_${targetRoomId}_role`, 'participant');
            sessionStorage.setItem(`room_${targetRoomId}_token`, token);
            navigate(`/negotiations/${targetRoomId}`);
          }

          // Participant: rejected by creator
          if (userType === 'participant' && data.type === 'guest_rejected') {
            setIsWaitingApproval(false);
            setIsAdmittedParticipant(false);
            setRejectionNotice('Your admission request was rejected by the room creator.');
            clearParticipantStorage();
          }

          // Room closed event
          if (data.type === 'room_closed') {
            setIsRoomClosed(true);
          }
        } catch (err) {
          console.error('Error handling room WebSocket message', err);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.warn('WebSocket connection not initialized, relying on REST polling', err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATOR ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleCreateRoom = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsCreating(true);
    setRejectionNotice(null);

    try {
      const creatorName = user?.name || (role === 'buyer' ? 'Elena Rostova (Buyer)' : 'Marcus Vance (Seller)');
      const creatorRole = role === 'seller' ? 'seller' : 'buyer';

      const res = await createPrivateRoom({
        title: roomTitle,
        matter_id: matterId || undefined,
        creator_name: creatorName,
        creator_role: creatorRole,
        passcode: passcode.trim() || undefined,
      });

      setCreatedRoomId(res.room_id);
      setCreatorToken(res.creator_token);
      setIsRoomClosed(false);
      setPendingApplicant(null);

      // Persist in localStorage so room never disappears on tab/page switches
      localStorage.setItem(STORAGE_CREATOR_ROOM, res.room_id);
      localStorage.setItem(STORAGE_CREATOR_TOKEN, res.creator_token);
      localStorage.setItem(STORAGE_CREATOR_TITLE, roomTitle);
      if (res.passcode) {
        setPasscode(res.passcode);
        localStorage.setItem(STORAGE_CREATOR_PASSCODE, res.passcode);
      } else {
        setPasscode('');
        localStorage.removeItem(STORAGE_CREATOR_PASSCODE);
      }
      localStorage.setItem(STORAGE_ACTIVE_TAB, 'creator');
      setActiveTab('creator');
      localStorage.setItem(`room_${res.room_id}_token`, res.creator_token);
      localStorage.setItem(`room_${res.room_id}_role`, 'creator');
      sessionStorage.setItem(`room_${res.room_id}_token`, res.creator_token);
      sessionStorage.setItem(`room_${res.room_id}_role`, 'creator');

      initWebSocket(res.room_id, res.creator_token, 'creator');
      startPolling(res.room_id, 'creator');
    } catch (err: any) {
      alert(`Failed to create private negotiation: ${err.message || err}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyRoomId = () => {
    if (!createdRoomId) return;
    navigator.clipboard.writeText(createdRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAdmitApplicant = async () => {
    if (!createdRoomId) return;
    try {
      await admitParticipant(createdRoomId, pendingApplicant?.id, creatorToken);
      setPendingApplicant(null);

      localStorage.setItem(`room_${createdRoomId}_role`, 'creator');
      localStorage.setItem(`room_${createdRoomId}_token`, creatorToken);
      sessionStorage.setItem(`room_${createdRoomId}_role`, 'creator');
      sessionStorage.setItem(`room_${createdRoomId}_token`, creatorToken);
      navigate(`/negotiations/${createdRoomId}`);
    } catch (err: any) {
      alert(`Failed to admit participant: ${err.message || err}`);
    }
  };

  const handleRejectApplicant = async () => {
    if (!createdRoomId) return;
    try {
      await rejectParticipant(createdRoomId, pendingApplicant?.id, creatorToken);
      setPendingApplicant(null);
    } catch (err: any) {
      alert(`Failed to reject participant: ${err.message || err}`);
    }
  };

  const handleStopRoom = async () => {
    if (!createdRoomId) return;
    if (window.confirm('Are you sure you want to stop and close this private room?')) {
      try {
        await closePrivateRoom(createdRoomId, creatorToken);
        setIsRoomClosed(true);
        clearCreatorStorage();
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (wsRef.current) wsRef.current.close();
      } catch (err: any) {
        alert(`Failed to close room: ${err.message || err}`);
      }
    }
  };

  const handleCreateNewRoom = () => {
    if (createdRoomId && !isRoomClosed) {
      if (!window.confirm('Start a new negotiation? The current room ID will no longer be active on this browser.')) {
        return;
      }
    }
    clearCreatorStorage();
    setCreatedRoomId('');
    setCreatorToken('');
    setPendingApplicant(null);
    setIsRoomClosed(false);
    setRoomDetails(null);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (wsRef.current) wsRef.current.close();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTICIPANT ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleSubmitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = joinRoomId.trim().toUpperCase();
    if (!cleanId) {
      alert('Please enter a valid Room ID (e.g. NEG-8K4P7M).');
      return;
    }

    setIsSubmittingJoin(true);
    setRejectionNotice(null);

    try {
      const guestName = user?.name || (role === 'seller' ? 'Marcus Vance (Seller)' : 'Elena Rostova (Buyer)');
      const guestRole = role === 'seller' ? 'seller' : 'buyer';

      const res = await requestJoinPrivateRoom(cleanId, {
        guest_name: guestName,
        guest_role: guestRole,
        passcode: joinPasscode.trim(),
      });

      const token = res.guest_token || (res as any).token || '';
      setIsWaitingApproval(true);
      setIsAdmittedParticipant(false);

      // Persist in localStorage so join request survives tab/page switching
      localStorage.setItem(STORAGE_PARTICIPANT_ROOM, cleanId);
      localStorage.setItem(STORAGE_PARTICIPANT_TOKEN, token);
      localStorage.setItem(STORAGE_ACTIVE_TAB, 'participant');
      setActiveTab('participant');
      localStorage.setItem(`room_${cleanId}_token`, token);
      localStorage.setItem(`room_${cleanId}_role`, 'participant');
      sessionStorage.setItem(`room_${cleanId}_token`, token);
      sessionStorage.setItem(`room_${cleanId}_role`, 'participant');

      initWebSocket(cleanId, token, 'participant');
      startPolling(cleanId, 'participant');
    } catch (err: any) {
      alert(`Join request failed: ${err.message || err}`);
    } finally {
      setIsSubmittingJoin(false);
    }
  };

  const handleCancelJoin = () => {
    setIsWaitingApproval(false);
    setIsAdmittedParticipant(false);
    clearParticipantStorage();
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (wsRef.current) wsRef.current.close();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const isAdmittedCreator = Boolean(
    roomDetails &&
    (roomDetails.guest_status === 'admitted' || roomDetails.status === 'active') &&
    !isRoomClosed
  );

  return (
    <div className="p-space-base md:p-space-lg max-w-4xl mx-auto space-y-6">
      {/* Header Container */}
      <div className="bg-surface-container border border-outline-variant/40 rounded-xl p-6 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <WaxSealLogo size={36} />
          <div>
            <h1 className="text-xl font-headline-md font-bold text-on-surface">
              Private Negotiation
            </h1>
            <p className="text-xs text-outline font-body-sm">
              Bilateral 2-Party Deliberation Chamber with Room ID Access & Creator Gatekeeping
            </p>
          </div>
        </div>

        {/* Role Switcher Tabs */}
        <div className="flex bg-surface-container-lowest rounded-lg p-1 border border-outline-variant/30 shrink-0">
          <button
            type="button"
            onClick={() => handleSelectTab('creator')}
            className={`px-4 py-1.5 rounded text-xs font-semibold font-mono transition-all ${
              activeTab === 'creator'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            Creator
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('participant')}
            className={`px-4 py-1.5 rounded text-xs font-semibold font-mono transition-all ${
              activeTab === 'participant'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            Participant
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CREATOR VIEW
          Flow: Create Private Negotiation → show generated Room ID → copy/share ID
                → see join request → Admit/Reject → Stop Room.
      ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'creator' && (
        <HairlineCard className="space-y-6">
          {!createdRoomId ? (
            // Step 1: Create Private Negotiation Form
            <form onSubmit={handleCreateRoom} className="space-y-5 max-w-xl">
              <div>
                <h2 className="text-base font-headline-md font-semibold text-on-surface mb-1">
                  Create Private Negotiation
                </h2>
                <p className="text-xs text-outline">
                  Generate a collision-safe Room ID (e.g. <span className="font-mono text-primary font-bold">NEG-8K4P7M</span>) to invite your counterparty.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-outline">Negotiation Title</label>
                <input
                  type="text"
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="e.g. Master Services Agreement Private Deliberation"
                  className="w-full bg-surface-container-high border border-outline-variant/50 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-outline">Room Passcode (Optional)</label>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Leave empty for auto-generated passcode"
                  className="w-full bg-surface-container-high border border-outline-variant/50 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
                />
              </div>

              <Button
                variant="primary"
                size="md"
                icon="add_circle"
                type="submit"
                disabled={isCreating}
              >
                {isCreating ? 'Generating Room...' : 'Create Private Negotiation'}
              </Button>
            </form>
          ) : (
            // Step 2: Room Created -> Show ID, Copy/Share, Stop Room, and Join Requests
            // This view is PERSISTENT and never disappears when switching tabs or pages!
            <div className="space-y-6">
              {/* Room ID Display & Actions */}
              <div className="p-5 bg-surface-container rounded-xl border border-outline-variant/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-outline">Active Room ID:</span>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                      isRoomClosed
                        ? 'bg-error-container/20 text-error border-error/40'
                        : isAdmittedCreator
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-primary-container/20 text-primary border-primary/40'
                    }`}>
                      {isRoomClosed
                        ? 'CLOSED'
                        : isAdmittedCreator
                        ? 'ACTIVE / IN PROGRESS'
                        : 'WAITING FOR COUNTERPARTY'}
                    </span>
                  </div>
                  <div className="text-2xl md:text-3xl font-mono font-bold text-primary tracking-wider">
                    {createdRoomId}
                  </div>
                  {passcode ? (
                    <div className="text-xs font-mono text-outline">
                      Passcode: <strong className="text-on-surface font-bold">{passcode}</strong>
                    </div>
                  ) : (
                    <div className="text-xs font-mono text-outline">
                      Passcode: <span className="text-emerald-400 font-semibold">None (Open Access)</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Copy / Share ID */}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={copied ? 'done' : 'content_copy'}
                    onClick={handleCopyRoomId}
                  >
                    {copied ? 'Copied ID!' : 'Copy / Share ID'}
                  </Button>

                  {/* Open Existing Workspace */}
                  <Button
                    variant="primary"
                    size="sm"
                    icon="open_in_new"
                    onClick={() => {
                      localStorage.setItem(`room_${createdRoomId}_role`, 'creator');
                      localStorage.setItem(`room_${createdRoomId}_token`, creatorToken);
                      sessionStorage.setItem(`room_${createdRoomId}_role`, 'creator');
                      sessionStorage.setItem(`room_${createdRoomId}_token`, creatorToken);
                      navigate(`/negotiations/${createdRoomId}`);
                    }}
                  >
                    Enter Chamber
                  </Button>

                  {/* Stop Room */}
                  {!isRoomClosed && (
                    <Button
                      variant="danger"
                      size="sm"
                      icon="close"
                      onClick={handleStopRoom}
                    >
                      Stop Room
                    </Button>
                  )}

                  {/* Create Another Room */}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="add"
                    onClick={handleCreateNewRoom}
                  >
                    New Room
                  </Button>
                </div>
              </div>

              {/* Counterparty Admitted Banner */}
              {isAdmittedCreator && (
                <div className="p-4 rounded-xl bg-emerald-950/25 border border-emerald-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-emerald-400 text-base">handshake</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-on-surface">
                        Counterparty Admitted & Chamber Live
                      </h4>
                      <p className="text-[11px] text-outline">
                        Both participants are connected. Enter the deliberation chamber to exchange clauses, negotiate proposals, and run AI syntheses.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon="arrow_forward"
                    onClick={() => navigate(`/negotiations/${createdRoomId}`)}
                  >
                    Open Workspace
                  </Button>
                </div>
              )}

              {/* Step 3: See Join Request -> Admit / Reject */}
              {pendingApplicant && !isRoomClosed && (
                <div className="p-5 rounded-xl bg-amber-950/30 border border-amber-500/50 space-y-3 animate-fade-in shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-amber-400 text-lg">person_add</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-on-surface">
                        Counterparty Join Request
                      </h3>
                      <p className="text-xs text-outline">
                        <strong className="text-amber-300 font-medium">{pendingApplicant.name}</strong> ({pendingApplicant.role.toUpperCase()}) entered Room ID <span className="font-mono text-primary font-bold">{createdRoomId}</span> and requested admission.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      icon="check_circle"
                      onClick={handleAdmitApplicant}
                    >
                      Admit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="cancel"
                      onClick={handleRejectApplicant}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* Waiting status helper */}
              {!pendingApplicant && !isAdmittedCreator && !isRoomClosed && (
                <div className="p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/30 flex items-center gap-3 text-xs text-outline">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                  <span>
                    Listening for join requests. Share Room ID <strong className="text-on-surface font-mono">{createdRoomId}</strong> with the counterparty. You can switch tabs or navigate across the platform freely; your room remains active.
                  </span>
                </div>
              )}

              {/* Room Closed Notice */}
              {isRoomClosed && (
                <div className="p-4 bg-error-container/10 border border-error/30 rounded-lg text-xs text-error flex items-center justify-between gap-3">
                  <span>This room has been stopped and permanently closed. Historical audit records remain preserved.</span>
                  <Button variant="secondary" size="sm" onClick={handleCreateNewRoom}>
                    Start New Room
                  </Button>
                </div>
              )}
            </div>
          )}
        </HairlineCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          PARTICIPANT VIEW
          Flow: Join Private Negotiation → enter Room ID → submit join request
                → wait for creator approval → After admission: Open workspace.
      ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'participant' && (
        <HairlineCard className="space-y-6">
          {isAdmittedParticipant ? (
            // Admitted Screen
            <div className="p-6 text-center space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl text-emerald-400">check_circle</span>
              </div>
              <div>
                <h3 className="text-base font-headline-md font-semibold text-on-surface">
                  Admission Approved
                </h3>
                <p className="text-xs text-outline mt-1">
                  You have been admitted to Room <span className="font-mono text-primary font-bold">{joinRoomId}</span> by the creator.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center gap-3">
                <Button
                  variant="primary"
                  size="md"
                  icon="login"
                  onClick={() => navigate(`/negotiations/${joinRoomId}`)}
                >
                  Enter Negotiation Chamber
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelJoin}
                >
                  Leave Room
                </Button>
              </div>
            </div>
          ) : !isWaitingApproval ? (
            // Form: Enter Room ID & Submit Join Request
            <form onSubmit={handleSubmitJoin} className="space-y-5 max-w-xl">
              <div>
                <h2 className="text-base font-headline-md font-semibold text-on-surface mb-1">
                  Join Private Negotiation
                </h2>
                <p className="text-xs text-outline">
                  Enter the 2-Party Room ID provided by the negotiation creator to submit your admission request.
                </p>
              </div>

              {rejectionNotice && (
                <div className="p-3 bg-error-container/20 border border-error/40 rounded-lg text-xs text-error">
                  {rejectionNotice}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-mono text-outline">Room ID</label>
                <input
                  type="text"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                  placeholder="e.g. NEG-8K4P7M"
                  className="w-full bg-surface-container-high border border-outline-variant/50 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-mono uppercase font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-outline">Room Passcode (If required)</label>
                <input
                  type="text"
                  value={joinPasscode}
                  onChange={(e) => setJoinPasscode(e.target.value)}
                  placeholder="Enter passcode if set by creator"
                  className="w-full bg-surface-container-high border border-outline-variant/50 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
                />
              </div>

              <Button
                variant="primary"
                size="md"
                icon="login"
                type="submit"
                disabled={isSubmittingJoin || !joinRoomId.trim()}
              >
                {isSubmittingJoin ? 'Submitting...' : 'Submit Join Request'}
              </Button>
            </form>
          ) : (
            // Waiting Screen: Wait for creator approval
            <div className="p-8 text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary-container/20 border border-primary/40 flex items-center justify-center animate-pulse">
                <span className="material-symbols-outlined text-3xl text-primary">lock_clock</span>
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-headline-md font-semibold text-on-surface">
                  Waiting for Creator Approval
                </h3>
                <p className="text-xs text-outline">
                  Join request submitted for Room <span className="font-mono text-primary font-bold">{joinRoomId}</span>.
                </p>
                <p className="text-xs text-outline-variant">
                  You can switch tabs or navigate across the platform freely; your request is preserved. You will automatically enter the negotiation workspace as soon as the creator admits you.
                </p>
              </div>

              <div className="pt-2 flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelJoin}
                >
                  Cancel Request
                </Button>
              </div>
            </div>
          )}
        </HairlineCard>
      )}
    </div>
  );
};

export default PrivateRoom;
