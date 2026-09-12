"""
WebSocket Deliberation Endpoint for 2-Party Private Negotiation Rooms.

Path: /ws/negotiation/{room_id}

Requirements:
- Only admitted participants can connect.
- Maximum 2 active participants.
- In-memory connection registry.
- Persist important room state & messages in SQLAlchemy database (JSON column).
- Broadcast shared room events to both participants without exposing private credentials.
- Supported event types: join, leave, message, clause_submitted, proposal, room_closed, system.
- If creator closes the room, broadcast room_closed and disconnect both sides.
- Preserves existing SSE and other endpoints.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.db.database import SessionLocal
from app.db.models import NegotiationRoomDB

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Negotiation WebSocket"])


# ═════════════════════════════════════════════════════════════════════════════
# In-Memory Connection Registry
# ═════════════════════════════════════════════════════════════════════════════

class NegotiationConnectionRegistry:
    """
    In-memory registry managing active WebSockets for 2-party negotiation rooms.
    Enforces maximum 2 active connections and coordinates room closure.
    """

    def __init__(self):
        # room_id -> { participant_id: WebSocket }
        self._rooms: Dict[str, Dict[str, WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def register(self, room_id: str, participant_id: str, websocket: WebSocket) -> bool:
        """Register participant. Enforces max 2 active participants."""
        await websocket.accept()
        async with self._lock:
            if room_id not in self._rooms:
                self._rooms[room_id] = {}

            # Strict 2-participant limit
            if len(self._rooms[room_id]) >= 2:
                await websocket.send_json({
                    "type": "system",
                    "error": "Maximum 2 active participants reached for this negotiation room."
                })
                await websocket.close(code=1008)
                return False

            self._rooms[room_id][participant_id] = websocket
            logger.info(f"[NegotiationWS {room_id}] Participant '{participant_id}' registered. Active: {len(self._rooms[room_id])}")
            return True

    async def unregister(self, room_id: str, participant_id: str):
        """Unregister participant on leave or disconnect."""
        async with self._lock:
            if room_id in self._rooms:
                self._rooms[room_id].pop(participant_id, None)
                if not self._rooms[room_id]:
                    self._rooms.pop(room_id, None)
            logger.info(f"[NegotiationWS {room_id}] Participant '{participant_id}' unregistered.")

    def get_active_count(self, room_id: str) -> int:
        return len(self._rooms.get(room_id, {}))

    async def broadcast(self, room_id: str, event: dict, exclude_participant: Optional[str] = None):
        """Broadcast event to both participants in room."""
        async with self._lock:
            sockets = list(self._rooms.get(room_id, {}).items())

        for pid, ws in sockets:
            if exclude_participant and pid == exclude_participant:
                continue
            try:
                await ws.send_json(event)
            except Exception as ex:
                logger.warning(f"[NegotiationWS {room_id}] Error broadcasting to '{pid}': {ex}")

    async def close_room_and_disconnect(self, room_id: str, reason: str = "Room closed by creator"):
        """Broadcast room_closed to all connected sockets and disconnect both sides."""
        async with self._lock:
            sockets = list(self._rooms.pop(room_id, {}).items())

        closure_event = {
            "type": "room_closed",
            "reason": reason,
            "timestamp": datetime.utcnow().isoformat(),
        }

        for pid, ws in sockets:
            try:
                await ws.send_json(closure_event)
                await ws.close(code=1000)
            except Exception:
                pass


registry = NegotiationConnectionRegistry()


# ═════════════════════════════════════════════════════════════════════════════
# Persistence Helper
# ═════════════════════════════════════════════════════════════════════════════

def persist_event_to_db(room_id: str, event: dict, shared_state_update: Optional[dict] = None):
    """Persist event message and updated shared state to the SQLite DB."""
    clean_room_id = (room_id or "").strip().upper()
    try:
        with SessionLocal() as session:
            room = session.query(NegotiationRoomDB).filter(
                (func.upper(NegotiationRoomDB.room_id) == clean_room_id) | (func.upper(NegotiationRoomDB.id) == clean_room_id)
            ).first()
            if room:
                messages = list(room.messages or [])
                messages.append(event)
                room.messages = messages
                flag_modified(room, "messages")

                if shared_state_update:
                    current_state = dict(room.shared_state or {})
                    current_state.update(shared_state_update)
                    room.shared_state = current_state
                    flag_modified(room, "shared_state")

                session.commit()
    except Exception as ex:
        logger.warning(f"[NegotiationWS {clean_room_id}] Failed persisting event: {ex}")


# ═════════════════════════════════════════════════════════════════════════════
# WebSocket Endpoint: /ws/negotiation/{room_id}
# ═════════════════════════════════════════════════════════════════════════════

@router.websocket("/ws/negotiation/{room_id}")
async def negotiation_websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    participant_id: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
):
    """
    WebSocket deliberation endpoint for 2-party rooms.
    Only admitted participants can connect. Maximum 2 active participants.
    """
    clean_room_id = (room_id or "").strip().upper()
    with SessionLocal() as db:
        room = db.query(NegotiationRoomDB).filter(
            (func.upper(NegotiationRoomDB.room_id) == clean_room_id) | (func.upper(NegotiationRoomDB.id) == clean_room_id)
        ).first()

        if not room:
            await websocket.accept()
            await websocket.send_json({"type": "system", "error": f"Negotiation room '{clean_room_id}' not found."})
            await websocket.close(code=1008)
            return

        if room.status in ("closed", "expired") or room.closed_at is not None:
            await websocket.accept()
            await websocket.send_json({"type": "room_closed", "reason": "Negotiation room is closed."})
            await websocket.close(code=1008)
            return

        # Verification: Only admitted participants can connect
        is_creator = (token and token == room.creator_token) or (participant_id and participant_id == room.creator_id)
        is_admitted_guest = (
            ((token and token == room.guest_token) or (participant_id and participant_id in (room.participant_id, room.guest_id)))
            and (room.guest_status == "admitted")
        )

        if not is_creator and not is_admitted_guest:
            await websocket.accept()
            await websocket.send_json({
                "type": "system",
                "error": "Unauthorized: Only admitted participants can connect to this negotiation room."
            })
            await websocket.close(code=1008)
            return

        pid = room.creator_id if is_creator else (room.participant_id or room.guest_id or "guest")
        sender_name = room.creator_name if is_creator else (room.guest_name or "Counterparty Counsel")
        sender_role = room.creator_role if is_creator else (room.guest_role or "seller")

    # Connect to in-memory registry (enforces max 2 active participants)
    registered = await registry.register(clean_room_id, pid, websocket)
    if not registered:
        return

    # Broadcast shared 'join' event to both participants
    now_iso = datetime.utcnow().isoformat()
    join_event = {
        "type": "join",
        "sender_id": pid,
        "sender_name": sender_name,
        "sender_role": sender_role,
        "active_participants_count": registry.get_active_count(clean_room_id),
        "timestamp": now_iso,
    }
    persist_event_to_db(clean_room_id, join_event)
    await registry.broadcast(clean_room_id, join_event)

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
            except Exception:
                data = {"type": "message", "text": raw_text}

            event_type = data.get("type", "message").lower()
            timestamp = datetime.utcnow().isoformat()

            # 1. Ping / Heartbeat
            if event_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": timestamp})
                continue

            # 2. room_closed
            elif event_type == "room_closed":
                if not is_creator:
                    await websocket.send_json({
                        "type": "system",
                        "error": "Unauthorized: Only the creator can close the negotiation room."
                    })
                    continue

                # Close room in database
                with SessionLocal() as db:
                    cur_room = db.query(NegotiationRoomDB).filter(
                        (func.upper(NegotiationRoomDB.room_id) == clean_room_id) | (func.upper(NegotiationRoomDB.id) == clean_room_id)
                    ).first()
                    if cur_room:
                        cur_room.status = "closed"
                        cur_room.closed_at = datetime.utcnow()
                        cur_room.active_participants_count = 0
                        db.commit()

                reason = data.get("reason", "Negotiation concluded and closed by creator.")
                persist_event_to_db(clean_room_id, {
                    "type": "room_closed",
                    "sender_id": pid,
                    "reason": reason,
                    "timestamp": timestamp,
                })
                # Broadcast room_closed and disconnect both sides
                await registry.close_room_and_disconnect(clean_room_id, reason=reason)
                break

            # 3. leave
            elif event_type == "leave":
                with SessionLocal() as db:
                    cur_room = db.query(NegotiationRoomDB).filter(
                        (func.upper(NegotiationRoomDB.room_id) == clean_room_id) | (func.upper(NegotiationRoomDB.id) == clean_room_id)
                    ).first()
                    if cur_room:
                        if not is_creator:
                            cur_room.guest_status = "left"
                        cur_room.active_participants_count = max(0, cur_room.active_participants_count - 1)
                        db.commit()

                leave_event = {
                    "type": "leave",
                    "sender_id": pid,
                    "sender_name": sender_name,
                    "sender_role": sender_role,
                    "timestamp": timestamp,
                }
                persist_event_to_db(clean_room_id, leave_event)
                await registry.unregister(clean_room_id, pid)
                await registry.broadcast(clean_room_id, leave_event)
                await websocket.close(code=1000)
                break

            # 4. message
            elif event_type == "message":
                msg_event = {
                    "type": "message",
                    "sender_id": pid,
                    "sender_name": sender_name,
                    "sender_role": sender_role,
                    "text": data.get("text", ""),
                    "timestamp": timestamp,
                }
                persist_event_to_db(clean_room_id, msg_event)
                await registry.broadcast(clean_room_id, msg_event)

            # 5. clause_submitted
            elif event_type == "clause_submitted":
                clause_event = {
                    "type": "clause_submitted",
                    "sender_id": pid,
                    "sender_name": sender_name,
                    "sender_role": sender_role,
                    "clause_id": data.get("clause_id"),
                    "section": data.get("section"),
                    "text": data.get("text", ""),
                    "timestamp": timestamp,
                }
                shared_update = {
                    "last_clause_submitted": data.get("clause_id"),
                    "last_submitted_by": sender_role,
                }
                persist_event_to_db(clean_room_id, clause_event, shared_state_update=shared_update)
                await registry.broadcast(clean_room_id, clause_event)

            # 6. proposal
            elif event_type == "proposal":
                prop_event = {
                    "type": "proposal",
                    "sender_id": pid,
                    "sender_name": sender_name,
                    "sender_role": sender_role,
                    "clause_id": data.get("clause_id"),
                    "proposal": data.get("proposal"),
                    "terms": data.get("terms"),
                    "rationale": data.get("rationale"),
                    "timestamp": timestamp,
                }
                shared_update = {
                    "latest_proposal": data.get("proposal"),
                    "last_proposal_clause": data.get("clause_id"),
                    "last_proposal_by": sender_role,
                }
                persist_event_to_db(clean_room_id, prop_event, shared_state_update=shared_update)
                await registry.broadcast(clean_room_id, prop_event)

            # 7. system
            elif event_type == "system":
                sys_event = {
                    "type": "system",
                    "sender_id": pid,
                    "message": data.get("message", ""),
                    "timestamp": timestamp,
                }
                persist_event_to_db(clean_room_id, sys_event)
                await registry.broadcast(clean_room_id, sys_event)

            else:
                # Default broadcast as generic event
                gen_event = {
                    "type": event_type,
                    "sender_id": pid,
                    "sender_name": sender_name,
                    "sender_role": sender_role,
                    "data": data,
                    "timestamp": timestamp,
                }
                persist_event_to_db(clean_room_id, gen_event)
                await registry.broadcast(clean_room_id, gen_event)

    except WebSocketDisconnect:
        await registry.unregister(clean_room_id, pid)
        disc_event = {
            "type": "leave",
            "sender_id": pid,
            "sender_name": sender_name,
            "sender_role": sender_role,
            "status": "disconnected",
            "timestamp": datetime.utcnow().isoformat(),
        }
        persist_event_to_db(clean_room_id, disc_event)
        await registry.broadcast(clean_room_id, disc_event)
    except Exception as ex:
        logger.error(f"[NegotiationWS {clean_room_id}] Error in socket connection: {ex}")
        await registry.unregister(clean_room_id, pid)
