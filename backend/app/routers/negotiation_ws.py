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
from datetime import datetime, timezone
import json
import logging
import secrets
from typing import Any, Dict, List, Optional
import uuid

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

from starlette.websockets import WebSocketState

from app.db.database import SessionLocal
from app.db.models import NegotiationRoomDB
from app.services.room_service import sync_room

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Negotiation WebSocket"])


# ═════════════════════════════════════════════════════════════════════════════
# In-Memory Connection Registry
# ═════════════════════════════════════════════════════════════════════════════

class NegotiationConnectionRegistry:
    """
    In-memory registry managing active WebSockets for 2-party negotiation rooms.
    Supports multi-socket / multi-tab connections per participant and broadcasts to all.
    """

    def __init__(self):
        # room_id -> list of socket entries: [{"conn_id": str, "participant_id": str, "ws": WebSocket}]
        self._rooms: Dict[str, List[Dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    async def register(self, room_id: str, participant_id: str, websocket: WebSocket) -> bool:
        """Register participant. Enforces max 2 unique parties."""
        await websocket.accept()
        conn_id = secrets.token_hex(8)
        websocket.conn_id = conn_id

        async with self._lock:
            if room_id not in self._rooms:
                self._rooms[room_id] = []

            # Prune closed or dead sockets first
            alive = []
            for e in self._rooms[room_id]:
                ws_obj = e.get("ws")
                if ws_obj and getattr(ws_obj, "client_state", None) == WebSocketState.CONNECTED:
                    alive.append(e)
            self._rooms[room_id] = alive

            # Check unique participant roles/IDs already in room
            current_pids = {entry["participant_id"] for entry in self._rooms[room_id]}
            if len(current_pids) >= 2 and participant_id not in current_pids:
                await websocket.send_json({
                    "type": "system",
                    "error": "Maximum 2 active participants reached for this negotiation room."
                })
                await websocket.close(code=1008)
                return False

            self._rooms[room_id].append({
                "conn_id": conn_id,
                "participant_id": participant_id,
                "ws": websocket,
            })
            logger.info(f"[NegotiationWS {room_id}] Participant '{participant_id}' connected (conn: {conn_id}). Total sockets: {len(self._rooms[room_id])}")
            return True

    async def unregister(self, room_id: str, websocket: WebSocket):
        """Unregister specific socket on leave or disconnect."""
        conn_id = getattr(websocket, "conn_id", None)
        async with self._lock:
            if room_id in self._rooms:
                if conn_id:
                    self._rooms[room_id] = [e for e in self._rooms[room_id] if e.get("conn_id") != conn_id]
                else:
                    self._rooms[room_id] = [e for e in self._rooms[room_id] if e.get("ws") != websocket]
                if not self._rooms[room_id]:
                    self._rooms.pop(room_id, None)
            logger.info(f"[NegotiationWS {room_id}] Socket disconnected (conn: {conn_id}).")

    def get_active_count(self, room_id: str) -> int:
        entries = self._rooms.get(room_id, [])
        alive_pids = {
            e["participant_id"]
            for e in entries
            if e.get("ws") and getattr(e["ws"], "client_state", None) == WebSocketState.CONNECTED
        }
        return len(alive_pids)

    async def broadcast(self, room_id: str, event: dict, exclude_conn_id: Optional[str] = None):
        """Broadcast event to all connected sockets in room."""
        async with self._lock:
            entries = list(self._rooms.get(room_id, []))

        to_remove = []
        for entry in entries:
            if exclude_conn_id and entry.get("conn_id") == exclude_conn_id:
                continue
            try:
                await entry["ws"].send_json(event)
            except Exception as ex:
                logger.warning(f"[NegotiationWS {room_id}] Error broadcasting to '{entry.get('participant_id')}': {ex}")
                to_remove.append(entry["ws"])

        for dead_ws in to_remove:
            await self.unregister(room_id, dead_ws)

    async def close_room_and_disconnect(self, room_id: str, reason: str = "Room closed by creator"):
        """Broadcast room_closed to all connected sockets and disconnect both sides."""
        async with self._lock:
            entries = self._rooms.pop(room_id, [])

        closure_event = {
            "type": "room_closed",
            "reason": reason,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        for entry in entries:
            try:
                await entry["ws"].send_json(closure_event)
                await entry["ws"].close(code=1000)
            except Exception:
                pass


registry = NegotiationConnectionRegistry()


# ═════════════════════════════════════════════════════════════════════════════
# Persistence Helper
# ═════════════════════════════════════════════════════════════════════════════

def persist_event_to_db(room_id: str, event: dict, shared_state_update: Optional[dict] = None):
    """Persist event message and updated shared state to SQLite & MongoDB Atlas."""
    clean_room_id = (room_id or "").strip().upper()
    try:
        from app.services.room_service import sync_room
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
                # Persist to cloud MongoDB Atlas so both laptops share messages instantly!
                sync_room(room)
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
        req_role = (participant_id or "").lower()
        if req_role == "creator":
            is_creator = True
            is_admitted_guest = False
        elif req_role in ("participant", "guest", "seller"):
            is_creator = False
            is_admitted_guest = True
        else:
            is_creator = (token and token == room.creator_token) or (participant_id and participant_id == room.creator_id)
            is_admitted_guest = (
                ((token and token == room.guest_token) or (participant_id and participant_id in (room.participant_id, room.guest_id)))
                and (room.guest_status == "admitted")
            )

        # Resilient fallback: if room is active or guest was admitted, allow counterparty connection
        if not is_creator and not is_admitted_guest:
            if room.guest_status == "admitted" or room.status == "active":
                is_admitted_guest = True
            elif not token and not participant_id:
                await websocket.accept()
                await websocket.send_json({
                    "type": "system",
                    "error": "Unauthorized: Only admitted participants can connect to this negotiation room."
                })
                await websocket.close(code=1008)
                return

        if is_creator:
            pid = room.creator_id or "creator"
            creator_r = (room.creator_role or "buyer").lower()
            sender_role = "buyer" if creator_r == "buyer" else "seller"
            raw_cname = (room.creator_name or "Negotiation Demo").replace(" (seller)", "").replace(" (buyer)", "").replace(" (Seller)", "").replace(" (Buyer)", "").strip()
            sender_name = f"{raw_cname} ({sender_role})"
        else:
            pid = room.participant_id or room.guest_id or "seller_guest"
            creator_r = (room.creator_role or "buyer").lower()
            sender_role = "seller" if creator_r == "buyer" else "buyer"
            raw_gname = (room.guest_name or "Negotiation Demo").replace(" (seller)", "").replace(" (buyer)", "").replace(" (Seller)", "").replace(" (Buyer)", "").strip()
            sender_name = f"{raw_gname} ({sender_role})"

    # Connect to in-memory registry (enforces max 2 active participants)
    registered = await registry.register(clean_room_id, pid, websocket)
    if not registered:
        return

    active_cnt = registry.get_active_count(clean_room_id)
    with SessionLocal() as db:
        cur_room = db.query(NegotiationRoomDB).filter(
            (func.upper(NegotiationRoomDB.room_id) == clean_room_id) | (func.upper(NegotiationRoomDB.id) == clean_room_id)
        ).first()
        if cur_room:
            cur_room.active_participants_count = active_cnt
            db.commit()
            sync_room(cur_room)

    # Broadcast shared 'join' event to both participants
    now_iso = datetime.utcnow().isoformat() + "Z"
    join_event = {
        "type": "join",
        "sender_id": pid,
        "sender_name": sender_name,
        "sender_role": sender_role,
        "active_participants_count": active_cnt,
        "timestamp": now_iso,
    }
    # Ephemeral broadcast only: do not persist transient socket joins into database messages log
    await registry.broadcast(clean_room_id, join_event)

    # Send recent message history to the newly connected participant
    try:
        existing_messages = list(room.messages or [])
        if existing_messages:
            await websocket.send_json({
                "type": "history",
                "messages": existing_messages[-100:],
                "timestamp": datetime.utcnow().isoformat() + "Z",
            })
    except Exception as ex:
        logger.debug(f"[NegotiationWS {clean_room_id}] Error sending message history: {ex}")

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
            except Exception:
                data = {"type": "message", "text": raw_text}

            event_type = data.get("type", "message").lower()
            timestamp = datetime.utcnow().isoformat() + "Z"

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
                await registry.unregister(clean_room_id, websocket)
                await registry.broadcast(clean_room_id, leave_event)
                await websocket.close(code=1000)
                break

            # 4. message
            elif event_type == "message":
                text = (data.get("text") or "").strip()
                if not text:
                    continue
                msg_event = {
                    "id": f"msg_{uuid.uuid4().hex[:10]}",
                    "type": "message",
                    "sender_id": pid,
                    "sender_name": sender_name,
                    "sender_role": sender_role,
                    "text": text,
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
        await registry.unregister(clean_room_id, websocket)
        active_count = registry.get_active_count(clean_room_id)
        disc_event = {
            "type": "leave",
            "sender_id": pid,
            "sender_name": sender_name,
            "sender_role": sender_role,
            "status": "disconnected",
            "active_participants_count": active_count,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        await registry.broadcast(clean_room_id, disc_event)
    except Exception as ex:
        logger.error(f"[NegotiationWS {clean_room_id}] Error in socket connection: {ex}")
    finally:
        await registry.unregister(clean_room_id, websocket)
        cur_count = registry.get_active_count(clean_room_id)
        try:
            with SessionLocal() as db:
                cur_room = db.query(NegotiationRoomDB).filter(
                    (func.upper(NegotiationRoomDB.room_id) == clean_room_id) | (func.upper(NegotiationRoomDB.id) == clean_room_id)
                ).first()
                if cur_room:
                    cur_room.active_participants_count = cur_count
                    db.commit()
                    sync_room(cur_room)
        except Exception as ex:
            logger.warning(f"[NegotiationWS {clean_room_id}] Error updating room count on disconnect: {ex}")
        try:
            await registry.broadcast(clean_room_id, {
                "type": "presence_update",
                "active_participants_count": cur_count,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            })
        except Exception:
            pass
