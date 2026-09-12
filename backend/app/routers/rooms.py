"""
2-Party Private Negotiation Room REST & WebSocket Router for Negotia AI.

Endpoints:
  POST   /api/rooms               - Create new private room
  GET    /api/rooms/{room_id}     - Retrieve room state
  POST   /api/rooms/{room_id}/join    - Second participant requests admission
  POST   /api/rooms/{room_id}/admit   - Creator admits second participant (enforces creator-only, max 2)
  POST   /api/rooms/{room_id}/reject  - Creator rejects applicant (enforces creator-only)
  POST   /api/rooms/{room_id}/leave   - Participant leaves (preserves historical data)
  POST   /api/rooms/{room_id}/close   - Creator closes room (enforces creator-only, rejects closed)
  WS     /ws/rooms/{room_id}      - Live WebSocket bilateral communication
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import json
import logging
import secrets
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Header,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.db.models import NegotiationRoomDB
from app.services.room_service import (
    admit_participant as svc_admit_participant,
    close_room as svc_close_room,
    create_room as svc_create_room,
    execute_room_pipeline as svc_execute_room_pipeline,
    generate_collision_safe_room_id,
    get_room as svc_get_room,
    get_room_pipeline_status as svc_get_room_pipeline_status,
    leave_room as svc_leave_room,
    reject_participant as svc_reject_participant,
    request_join as svc_request_join,
    review_room_report as svc_review_room_report,
    seal_room_report as svc_seal_room_report,
    submit_room_contract_input as svc_submit_room_contract_input,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rooms", tags=["Private Negotiation Rooms"])


# ═════════════════════════════════════════════════════════════════════════════
# In-Memory WebSocket Connection Manager
# ═════════════════════════════════════════════════════════════════════════════

class RoomConnectionManager:
    def __init__(self):
        self.active_rooms: Dict[str, Dict[str, WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, room_id: str, participant_id: str, websocket: WebSocket) -> bool:
        await websocket.accept()
        async with self.lock:
            if room_id not in self.active_rooms:
                self.active_rooms[room_id] = {}

            # Strict 2-participant check
            if len(self.active_rooms[room_id]) >= 2 and participant_id not in self.active_rooms[room_id]:
                await websocket.send_json({
                    "type": "error",
                    "message": "Room has reached the maximum capacity of 2 admitted participants."
                })
                await websocket.close(code=1008)
                return False

            self.active_rooms[room_id][participant_id] = websocket
            logger.info(f"[WS Room {room_id}] Participant '{participant_id}' connected. Total: {len(self.active_rooms[room_id])}")
            return True

    async def disconnect(self, room_id: str, participant_id: str):
        async with self.lock:
            if room_id in self.active_rooms:
                self.active_rooms[room_id].pop(participant_id, None)
                if not self.active_rooms[room_id]:
                    self.active_rooms.pop(room_id, None)
            logger.info(f"[WS Room {room_id}] Participant '{participant_id}' disconnected.")

    async def broadcast_to_room(self, room_id: str, message: dict, exclude_participant: Optional[str] = None):
        async with self.lock:
            participants = list(self.active_rooms.get(room_id, {}).items())

        for pid, ws in participants:
            if exclude_participant and pid == exclude_participant:
                continue
            try:
                await ws.send_json(message)
            except Exception as ex:
                logger.warning(f"[WS Room {room_id}] Failed sending to participant {pid}: {ex}")

    async def close_room_sockets(self, room_id: str, reason: str = "Room closed by creator"):
        async with self.lock:
            participants = list(self.active_rooms.pop(room_id, {}).items())

        for pid, ws in participants:
            try:
                await ws.send_json({
                    "type": "room_closed",
                    "reason": reason,
                    "timestamp": datetime.utcnow().isoformat()
                })
                await ws.close(code=1000)
            except Exception:
                pass


ws_manager = RoomConnectionManager()


# ═════════════════════════════════════════════════════════════════════════════
# Serialization Helper
# ═════════════════════════════════════════════════════════════════════════════

def serialize_room(room: NegotiationRoomDB, include_tokens: bool = False) -> Dict[str, Any]:
    """Clean JSON representation containing room_id, status, creator, participant and relevant state."""
    rid = room.room_id or room.id
    pid = room.participant_id or room.guest_id

    data = {
        "room_id": rid,
        "status": room.status,
        "room_status": room.status,
        "creator": {
            "id": room.creator_id,
            "name": room.creator_name,
            "role": room.creator_role,
        },
        "creator_id": room.creator_id,
        "creator_name": room.creator_name,
        "creator_role": room.creator_role,
        "participant": {
            "id": pid,
            "name": room.guest_name,
            "role": room.guest_role,
            "status": room.guest_status,
        } if pid else None,
        "participant_id": pid,
        "guest_name": room.guest_name,
        "guest_role": room.guest_role,
        "guest_status": room.guest_status,
        "matter_id": room.matter_id,
        "title": room.title,
        "passcode": room.passcode if (room.passcode and room.passcode.strip()) else None,
        "active_participants_count": room.active_participants_count,
        "created_at": room.created_at.isoformat() if room.created_at else None,
        "closed_at": room.closed_at.isoformat() if room.closed_at else None,
    }

    # Pipeline & Submission state flags (party-private documents/drafting kept strictly private)
    shared_st = room.shared_state or {}
    has_a = bool(shared_st.get("has_party_a_submitted", False))
    has_b = bool(shared_st.get("has_party_b_submitted", False))
    ready = bool(shared_st.get("ready_for_pipeline", False))
    p_status = shared_st.get("pipeline_status", "idle")
    rep_id = shared_st.get("report_id")

    data["has_party_a_submitted"] = has_a
    data["has_party_b_submitted"] = has_b
    data["ready_for_pipeline"] = ready
    data["pipeline_status"] = p_status
    data["report_id"] = rep_id
    data["submissions"] = {
        "has_party_a": has_a,
        "has_party_b": has_b,
        "ready_for_pipeline": ready,
        "pipeline_status": p_status,
    }

    if include_tokens:
        data["creator_token"] = room.creator_token
        data["guest_token"] = room.guest_token

    return data


# ═════════════════════════════════════════════════════════════════════════════
# Request Schemas
# ═════════════════════════════════════════════════════════════════════════════

class CreateRoomRequest(BaseModel):
    creator_id: Optional[str] = None
    creator_name: Optional[str] = None
    creator_role: str = "buyer"
    matter_id: Optional[str] = None
    title: Optional[str] = "Bilateral Private Negotiation Room"
    passcode: Optional[str] = None


class JoinRequest(BaseModel):
    participant_id: Optional[str] = None
    guest_id: Optional[str] = None
    participant_name: Optional[str] = None
    guest_name: Optional[str] = None
    participant_role: Optional[str] = None
    guest_role: Optional[str] = None
    passcode: Optional[str] = None


class AdmitRequest(BaseModel):
    creator_id: Optional[str] = None
    creator_token: Optional[str] = None
    participant_id: Optional[str] = None


class RejectRequest(BaseModel):
    creator_id: Optional[str] = None
    creator_token: Optional[str] = None
    participant_id: Optional[str] = None


class LeaveRequest(BaseModel):
    participant_id: Optional[str] = None
    token: Optional[str] = None


class CloseRequest(BaseModel):
    creator_id: Optional[str] = None
    creator_token: Optional[str] = None


class RoomSubmitRequest(BaseModel):
    participant_id: Optional[str] = None
    token: Optional[str] = None
    party: Optional[str] = None
    text: Optional[str] = None
    clauses: Optional[List[Dict[str, Any]]] = None
    filename: Optional[str] = None
    auto_start: Optional[bool] = False


class RoomReviewRequest(BaseModel):
    action: str
    counsel_name: Optional[str] = "General Counsel"
    comments: Optional[str] = None


class RoomSealRequest(BaseModel):
    counsel_name: Optional[str] = "General Counsel"
    comments: Optional[str] = None


# ═════════════════════════════════════════════════════════════════════════════
# REST API Endpoints
# ═════════════════════════════════════════════════════════════════════════════

@router.post("", status_code=status.HTTP_201_CREATED)
def create_room_endpoint(
    payload: CreateRoomRequest,
    db: Session = Depends(get_db),
):
    """
    POST /api/rooms
    Create a new private negotiation room with collision-safe Room ID (NEG-XXXXXX).
    Creator is automatically assigned.
    """
    cid = payload.creator_id or f"counsel_{secrets.token_hex(4)}"
    cname = payload.creator_name or f"Counsel ({payload.creator_role.capitalize()})"

    room = svc_create_room(
        db=db,
        creator_id=cid,
        matter_id=payload.matter_id,
        title=payload.title,
        passcode=payload.passcode,
        creator_name=cname,
        creator_role=payload.creator_role,
    )

    return serialize_room(room, include_tokens=True)


@router.get("/{room_id}")
def get_room_endpoint(
    room_id: str,
    db: Session = Depends(get_db),
):
    """
    GET /api/rooms/{room_id}
    Retrieve current room state. Rejects invalid room IDs with 404.
    """
    clean_room_id = (room_id or "").strip().upper()
    room = svc_get_room(db, clean_room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Negotiation room '{clean_room_id}' not found."
        )

    return serialize_room(room)


@router.post("/{room_id}/join")
async def join_room_endpoint(
    room_id: str,
    payload: JoinRequest,
    db: Session = Depends(get_db),
):
    """
    POST /api/rooms/{room_id}/join
    Second participant requests to join the room.
    Enforces:
    - Maximum 2 participants (only 1 additional allowed)
    - Cannot join closed or expired room
    - Creator cannot join as second participant
    - Passcode verification
    """
    clean_room_id = (room_id or "").strip().upper()
    pid = payload.participant_id or payload.guest_id or f"guest_{secrets.token_hex(4)}"
    pname = payload.participant_name or payload.guest_name or "Counterparty Counsel"
    prole = payload.participant_role or payload.guest_role or "seller"

    room = svc_get_room(db, clean_room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Negotiation room '{clean_room_id}' not found."
        )

    if room.status in ("closed", "expired") or room.closed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This negotiation room is permanently closed or expired."
        )

    try:
        updated_room = svc_request_join(
            db=db,
            room_id=clean_room_id,
            participant_id=pid,
            passcode=payload.passcode,
            participant_name=pname,
            participant_role=prole,
        )
    except ValueError as err:
        msg = str(err)
        if "Invalid room passcode" in msg:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg)
        elif "Only one additional participant is allowed" in msg or "Room is full" in msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    # Broadcast knock over WebSocket to creator
    await ws_manager.broadcast_to_room(
        clean_room_id,
        {
            "type": "guest_knock",
            "room_id": clean_room_id,
            "guest_id": pid,
            "guest_name": pname,
            "guest_role": prole,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    return serialize_room(updated_room, include_tokens=True)


@router.post("/{room_id}/admit")
async def admit_participant_endpoint(
    room_id: str,
    payload: AdmitRequest,
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token"),
    db: Session = Depends(get_db),
):
    """
    POST /api/rooms/{room_id}/admit
    Creator admits the waiting participant into the room.
    Enforces:
    - Only creator can admit (checks creator_id or creator_token)
    - Maximum 2 participants
    - Invalid or closed rooms rejected
    """
    clean_room_id = (room_id or "").strip().upper()
    room = svc_get_room(db, clean_room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Negotiation room '{clean_room_id}' not found.")

    if room.status in ("closed", "expired") or room.closed_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot admit participants to a closed or expired room.")

    # Enforce only creator can admit
    token = payload.creator_token or x_creator_token
    cid = payload.creator_id
    is_authorized = (cid and cid == room.creator_id) or (token and token == room.creator_token)
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized: Only the creator can admit participants.")

    try:
        updated_room = svc_admit_participant(
            db=db,
            room_id=clean_room_id,
            creator_id=room.creator_id,
            participant_id=payload.participant_id,
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))

    # Broadcast admission over WebSocket
    await ws_manager.broadcast_to_room(
        clean_room_id,
        {
            "type": "guest_admitted",
            "room_id": clean_room_id,
            "guest_id": updated_room.participant_id,
            "guest_name": updated_room.guest_name,
            "guest_role": updated_room.guest_role,
            "status": "active",
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    return serialize_room(updated_room)


@router.post("/{room_id}/reject")
async def reject_participant_endpoint(
    room_id: str,
    payload: RejectRequest,
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token"),
    db: Session = Depends(get_db),
):
    """
    POST /api/rooms/{room_id}/reject
    Creator rejects the pending applicant.
    Enforces:
    - Only creator can reject
    - Invalid or closed rooms rejected
    """
    clean_room_id = (room_id or "").strip().upper()
    room = svc_get_room(db, clean_room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Negotiation room '{clean_room_id}' not found.")

    if room.status in ("closed", "expired") or room.closed_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot reject participants on a closed room.")

    # Enforce only creator can reject
    token = payload.creator_token or x_creator_token
    cid = payload.creator_id
    is_authorized = (cid and cid == room.creator_id) or (token and token == room.creator_token)
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized: Only the creator can reject participants.")

    try:
        updated_room = svc_reject_participant(
            db=db,
            room_id=clean_room_id,
            creator_id=room.creator_id,
            participant_id=payload.participant_id,
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))

    # Broadcast rejection over WebSocket
    await ws_manager.broadcast_to_room(
        clean_room_id,
        {
            "type": "guest_rejected",
            "room_id": clean_room_id,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    return serialize_room(updated_room)


@router.post("/{room_id}/leave")
async def leave_room_endpoint(
    room_id: str,
    payload: LeaveRequest,
    db: Session = Depends(get_db),
):
    """
    POST /api/rooms/{room_id}/leave
    Participant leaves the room.
    Rule: Leaving must not delete historical data.
    """
    clean_room_id = (room_id or "").strip().upper()
    room = svc_get_room(db, clean_room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Negotiation room '{clean_room_id}' not found.")

    # Resolve participant identifier
    pid = payload.participant_id
    token = payload.token
    if not pid and token:
        if token == room.creator_token:
            pid = room.creator_id
        elif token == room.guest_token:
            pid = room.participant_id or room.guest_id

    if not pid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Participant ID or auth token is required to leave.")

    try:
        updated_room = svc_leave_room(db=db, room_id=clean_room_id, participant_id=pid)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err))

    # Disconnect participant from both registries
    try:
        await ws_manager.disconnect(clean_room_id, pid)
    except Exception:
        pass
    try:
        from app.routers.negotiation_ws import registry
        await registry.unregister(clean_room_id, pid)
    except Exception:
        pass

    # Broadcast departure over WebSocket
    leave_payload = {
        "type": "participant_left",
        "room_id": clean_room_id,
        "participant_id": pid,
        "active_participants_count": updated_room.active_participants_count,
        "timestamp": datetime.utcnow().isoformat(),
    }
    await ws_manager.broadcast_to_room(clean_room_id, leave_payload)
    try:
        from app.routers.negotiation_ws import registry
        await registry.broadcast(clean_room_id, {
            "type": "leave",
            "sender_id": pid,
            "timestamp": datetime.utcnow().isoformat(),
        })
    except Exception:
        pass

    return serialize_room(updated_room)


@router.post("/{room_id}/close")
async def close_room_endpoint(
    room_id: str,
    payload: CloseRequest,
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token"),
    db: Session = Depends(get_db),
):
    """
    POST /api/rooms/{room_id}/close
    Creator stops and closes the room permanently.
    Enforces:
    - Only creator can close
    - Invalid rooms rejected
    """
    clean_room_id = (room_id or "").strip().upper()
    room = svc_get_room(db, clean_room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Negotiation room '{clean_room_id}' not found.")

    # Enforce only creator can close
    token = payload.creator_token or x_creator_token
    cid = payload.creator_id
    is_authorized = (cid and cid == room.creator_id) or (token and token == room.creator_token)
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized: Only the creator can close this room.")

    updated_room = svc_close_room(db=db, room_id=clean_room_id, creator_id=room.creator_id)

    # Disconnect sockets and broadcast across both registries
    await ws_manager.close_room_sockets(clean_room_id, reason="Negotiation room closed by creator.")
    try:
        from app.routers.negotiation_ws import registry
        await registry.close_room_and_disconnect(clean_room_id, reason="Negotiation room closed by creator.")
    except Exception:
        pass

    return serialize_room(updated_room)


# ═════════════════════════════════════════════════════════════════════════════
# Backward-Compatible Aliases for Existing UI & Tests
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/{room_id}/join-request")
async def join_request_alias(
    room_id: str,
    payload: JoinRequest,
    db: Session = Depends(get_db),
):
    clean_room_id = (room_id or "").strip().upper()
    res = await join_room_endpoint(room_id=clean_room_id, payload=payload, db=db)
    return {
        "room_id": res["room_id"],
        "guest_id": res["participant_id"],
        "guest_token": res.get("guest_token") or f"gtok_{secrets.token_hex(12)}",
        "guest_status": "pending_approval",
        "message": "Admission request sent. Waiting for room creator approval.",
    }


@router.post("/{room_id}/approve")
async def approve_alias(
    room_id: str,
    payload: Dict[str, Any] = Body(...),
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token"),
    creator_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    clean_room_id = (room_id or "").strip().upper()
    token = x_creator_token or creator_token or payload.get("creator_token")
    decision = payload.get("decision", "approve").lower()
    if decision == "approve":
        admit_req = AdmitRequest(creator_token=token)
        res = await admit_participant_endpoint(room_id=clean_room_id, payload=admit_req, x_creator_token=token, db=db)
        return {
            "status": "success",
            "decision": "approved",
            "guest_status": "admitted",
            "room_status": "active",
            "active_participants_count": 2,
            "room": res,
        }
    else:
        rej_req = RejectRequest(creator_token=token)
        res = await reject_participant_endpoint(room_id=clean_room_id, payload=rej_req, x_creator_token=token, db=db)
        return {
            "status": "success",
            "decision": "rejected",
            "guest_status": "rejected",
            "room": res,
        }


@router.get("/{room_id}/messages")
def get_room_messages(room_id: str, db: Session = Depends(get_db)):
    clean_room_id = (room_id or "").strip().upper()
    room = svc_get_room(db, clean_room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Private room not found.")
    return {
        "room_id": room.room_id or room.id,
        "messages": room.messages or [],
    }


# ═════════════════════════════════════════════════════════════════════════════
# Contract Ingestion, Pipeline Orchestration, Review & Seal Endpoints
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/{room_id}/submit")
async def submit_contract_endpoint(
    room_id: str,
    payload: RoomSubmitRequest = Body(...),
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token"),
    x_participant_token: Optional[str] = Header(None, alias="X-Participant-Token"),
    db: Session = Depends(get_db),
):
    """
    Submit contract clauses/document for Party A or Party B.
    Enforces:
    - Room must be active with both participants admitted.
    - Private documents kept private.
    - Does NOT start pipeline until both required party inputs are available.
    """
    clean_room_id = (room_id or "").strip().upper()
    token = payload.token or x_participant_token or x_creator_token
    try:
        res = svc_submit_room_contract_input(
            db=db,
            room_id=clean_room_id,
            participant_id=payload.participant_id,
            token=token,
            party=payload.party,
            text=payload.text,
            clauses=payload.clauses,
            filename=payload.filename,
            auto_start_pipeline=bool(payload.auto_start),
        )
        if res.get("ready_for_pipeline") and payload.auto_start:
            pipeline_res = await svc_execute_room_pipeline(db=db, room_id=clean_room_id)
            res["pipeline_result"] = pipeline_res
            res["pipeline_started"] = True
        return res
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except Exception as ex:
        logger.error(f"[Room {clean_room_id}] Error in submit endpoint: {ex}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(ex))


@router.post("/{room_id}/pipeline")
@router.post("/{room_id}/pipeline/start")
async def start_pipeline_endpoint(
    room_id: str,
    db: Session = Depends(get_db),
):
    """
    Start the 4-agent negotiation deliberation pipeline (Agent 1 + Agent 2 -> Arbiter -> Scrivener).
    Requires both party inputs to have been submitted.
    """
    clean_room_id = (room_id or "").strip().upper()
    try:
        return await svc_execute_room_pipeline(db=db, room_id=clean_room_id)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as ex:
        logger.error(f"[Room {clean_room_id}] Error starting pipeline: {ex}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(ex))


@router.get("/{room_id}/pipeline")
def get_pipeline_endpoint(
    room_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve deliberation pipeline progress, submission status, and report details."""
    clean_room_id = (room_id or "").strip().upper()
    try:
        return svc_get_room_pipeline_status(db=db, room_id=clean_room_id)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))


@router.post("/{room_id}/review")
def review_endpoint(
    room_id: str,
    payload: RoomReviewRequest = Body(...),
    db: Session = Depends(get_db),
):
    """
    General Counsel human review decision: 'approve', 'request_revision', or 'escalate'.
    """
    clean_room_id = (room_id or "").strip().upper()
    try:
        return svc_review_room_report(
            db=db,
            room_id=clean_room_id,
            action=payload.action,
            counsel_name=payload.counsel_name or "General Counsel",
            comments=payload.comments,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))


@router.post("/{room_id}/seal")
def seal_endpoint(
    room_id: str,
    payload: RoomSealRequest = Body(default_factory=RoomSealRequest),
    db: Session = Depends(get_db),
):
    """
    Cryptographically seal the approved report into immutable audit ledger.
    Requires prior counsel approval.
    """
    clean_room_id = (room_id or "").strip().upper()
    try:
        return svc_seal_room_report(
            db=db,
            room_id=clean_room_id,
            counsel_name=payload.counsel_name or "General Counsel",
            comments=payload.comments,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))


# ═════════════════════════════════════════════════════════════════════════════
# Live Room WebSocket Endpoint
# ═════════════════════════════════════════════════════════════════════════════

@router.websocket("/ws/{room_id}")
async def room_websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time bilateral deliberation.
    Authenticates participant token against DB.
    Enforces maximum 2 admitted connections.
    """
    clean_room_id = (room_id or "").strip().upper()
    from app.db.database import SessionLocal
    db = SessionLocal()
    try:
        room = svc_get_room(db, clean_room_id)
        if not room:
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Room not found."})
            await websocket.close(code=1008)
            return

        if room.status == "closed":
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Room is closed."})
            await websocket.close(code=1008)
            return

        is_creator = (token == room.creator_token)
        is_guest = (token == room.guest_token)

        if not is_creator and not is_guest:
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Invalid authentication token."})
            await websocket.close(code=1008)
            return

        participant_id = room.creator_id if is_creator else (room.participant_id or room.guest_id or "guest")
        sender_name = room.creator_name if is_creator else (room.guest_name or "Counterparty")
        sender_role = room.creator_role if is_creator else (room.guest_role or "guest")

        connected = await ws_manager.connect(clean_room_id, participant_id, websocket)
        if not connected:
            return

        await websocket.send_json({
            "type": "welcome",
            "room_id": clean_room_id,
            "title": room.title,
            "participant_id": participant_id,
            "name": sender_name,
            "role": sender_role,
            "is_creator": is_creator,
            "guest_status": room.guest_status,
            "room_status": room.status,
            "active_participants": list(ws_manager.active_rooms.get(clean_room_id, {}).keys()),
            "timestamp": datetime.utcnow().isoformat(),
        })

        await ws_manager.broadcast_to_room(
            clean_room_id,
            {
                "type": "presence",
                "participant_id": participant_id,
                "name": sender_name,
                "role": sender_role,
                "status": "online",
                "timestamp": datetime.utcnow().isoformat(),
            },
            exclude_participant=participant_id,
        )

        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
            except Exception:
                data = {"type": "chat_message", "text": raw_text}

            msg_type = data.get("type", "chat_message")
            now_iso = datetime.utcnow().isoformat()

            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": now_iso})
                continue

            out_msg = {
                "type": msg_type,
                "sender_id": participant_id,
                "sender_name": sender_name,
                "sender_role": sender_role,
                "text": data.get("text", ""),
                "clause_id": data.get("clause_id"),
                "proposal": data.get("proposal"),
                "action": data.get("action"),
                "timestamp": now_iso,
            }

            try:
                from sqlalchemy.orm.attributes import flag_modified
                with SessionLocal() as session:
                    current_room = svc_get_room(session, clean_room_id)
                    if current_room:
                        history = list(current_room.messages or [])
                        history.append(out_msg)
                        current_room.messages = history
                        flag_modified(current_room, "messages")
                        if data.get("proposal"):
                            current_room.shared_state = {
                                **(current_room.shared_state or {}),
                                "latest_proposal": data.get("proposal"),
                                "last_proposal_by": sender_role,
                            }
                            flag_modified(current_room, "shared_state")
                        session.commit()
            except Exception as ex:
                logger.warning(f"[WS Room {clean_room_id}] Failed persisting message: {ex}")

            await ws_manager.broadcast_to_room(clean_room_id, out_msg)

    except WebSocketDisconnect:
        await ws_manager.disconnect(clean_room_id, participant_id)
        await ws_manager.broadcast_to_room(
            clean_room_id,
            {
                "type": "presence",
                "participant_id": participant_id,
                "name": sender_name,
                "role": sender_role,
                "status": "offline",
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
    except Exception as ex:
        logger.error(f"[WS Room {clean_room_id}] Error in socket connection: {ex}")
        await ws_manager.disconnect(clean_room_id, participant_id)
    finally:
        db.close()
