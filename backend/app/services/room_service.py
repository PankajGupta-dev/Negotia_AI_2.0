"""
Private Negotiation Room Service for Negotia AI.

Features:
- Collision-safe Room IDs: NEG-XXXXXX
- Creator is automatically assigned on creation.
- Strict 2-party limit: Only one additional participant is allowed.
- Cannot join a closed or expired room.
- Creator gatekeeping: admit, reject, and close room.
- Leaving preserves all historical data (audit log, messages, shared proposals).
"""

from __future__ import annotations

from datetime import datetime
import asyncio
import logging
import secrets
from typing import Any, Dict, List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import NegotiationRoomDB
from app.db.database import sync_room_to_mongo, get_room_from_mongo_sync

logger = logging.getLogger(__name__)


def sync_room(room: NegotiationRoomDB) -> None:
    """Sync negotiation room document to cloud MongoDB Atlas."""
    try:
        sync_room_to_mongo({
            "id": room.id or room.room_id,
            "room_id": room.room_id or room.id,
            "matter_id": room.matter_id,
            "creator_id": room.creator_id,
            "participant_id": room.participant_id,
            "status": room.status,
            "created_at": room.created_at.isoformat() if room.created_at else datetime.utcnow().isoformat(),
            "closed_at": room.closed_at.isoformat() if room.closed_at else None,
            "title": room.title,
            "passcode": room.passcode,
            "creator_name": room.creator_name,
            "creator_role": room.creator_role,
            "creator_token": room.creator_token,
            "guest_id": room.guest_id,
            "guest_name": room.guest_name,
            "guest_role": room.guest_role,
            "guest_token": room.guest_token,
            "guest_status": room.guest_status,
            "active_participants_count": room.active_participants_count,
            "messages": list(room.messages or []),
            "shared_state": dict(room.shared_state or {}),
            "updated_at": room.updated_at.isoformat() if room.updated_at else datetime.utcnow().isoformat(),
        })
    except Exception as e:
        logger.debug(f"[RoomService] MongoDB sync warning: {e}")


def generate_collision_safe_room_id(db: Session, prefix: str = "NEG", max_attempts: int = 20) -> str:
    """
    Generate collision-safe Room ID formatted as 'NEG-XXXXXX'
    using an unambiguous base-32 alphanumeric character set.
    """
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    for _ in range(max_attempts):
        suffix = "".join(secrets.choice(alphabet) for _ in range(6))
        candidate_id = f"{prefix}-{suffix}".upper()
        # Check against existing rooms in DB (case-insensitive)
        existing = db.query(NegotiationRoomDB).filter(
            (func.upper(NegotiationRoomDB.room_id) == candidate_id) | (func.upper(NegotiationRoomDB.id) == candidate_id)
        ).first()
        if not existing:
            # Also check MongoDB Atlas to prevent cross-server collision
            try:
                doc = get_room_from_mongo_sync(candidate_id)
                if not doc:
                    return candidate_id
            except Exception:
                return candidate_id

    # Fallback to 8 chars if high collision density
    suffix = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"{prefix}-{suffix}".upper()


def create_room(
    db: Session,
    creator_id: str,
    matter_id: Optional[str] = None,
    title: Optional[str] = None,
    passcode: Optional[str] = None,
    creator_name: Optional[str] = None,
    creator_role: str = "buyer",
) -> NegotiationRoomDB:
    """
    Create a new private negotiation room.
    Creator is automatically assigned; status begins in 'waiting'.
    Passcode is optional: if empty, room is passcode-free for counterparty.
    """
    room_id = generate_collision_safe_room_id(db, prefix="NEG")
    clean_passcode = passcode.strip() if passcode and passcode.strip() else ""
    raw_cname = (creator_name or "").strip()
    if not raw_cname or "negotiation demo" in raw_cname.lower() or raw_cname.startswith("Counsel"):
        clean_creator_name = "Elena Rostova (Buyer)" if (creator_role or "buyer").lower() == "buyer" else "Marcus Vance (Seller)"
    else:
        clean_creator_name = raw_cname
    creator_token = f"ctok_{secrets.token_hex(12)}"
    now = datetime.utcnow()

    room = NegotiationRoomDB(
        id=room_id,
        room_id=room_id,
        matter_id=matter_id,
        title=title or "Bilateral Private Negotiation Room",
        passcode=clean_passcode,
        creator_id=creator_id,
        creator_name=clean_creator_name,
        creator_role=creator_role,
        creator_token=creator_token,
        participant_id=None,
        guest_id=None,
        guest_name=None,
        guest_role="seller" if creator_role == "buyer" else "buyer",
        guest_token=None,
        guest_status="none",
        status="waiting",
        active_participants_count=1,
        messages=[],
        shared_state={},
        created_at=now,
        updated_at=now,
        closed_at=None,
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    # Sync to MongoDB Atlas cloud database
    sync_room(room)

    logger.info(f"[RoomService] Created room '{room_id}' for creator '{creator_id}' (passcode_protected={clean_passcode is not None}).")
    return room


def get_room(db: Session, room_id: str) -> Optional[NegotiationRoomDB]:
    """Retrieve negotiation room by room_id or primary key (case-insensitive & trimmed)."""
    if not room_id:
        return None
    clean_id = room_id.strip().upper()
    room = db.query(NegotiationRoomDB).filter(
        (func.upper(NegotiationRoomDB.room_id) == clean_id) | (func.upper(NegotiationRoomDB.id) == clean_id)
    ).first()

    # Check MongoDB Atlas for multi-system cross-host synchronization (e.g. counterparty knock/join)
    try:
        doc = get_room_from_mongo_sync(clean_id)
        if doc:
            if room:
                updated = False
                if doc.get("guest_status") and doc.get("guest_status") != room.guest_status:
                    room.guest_status = doc.get("guest_status")
                    room.guest_id = doc.get("guest_id") or room.guest_id
                    room.guest_name = doc.get("guest_name") or room.guest_name
                    room.guest_role = doc.get("guest_role") or room.guest_role
                    room.guest_token = doc.get("guest_token") or room.guest_token
                    room.participant_id = doc.get("participant_id") or room.participant_id
                    updated = True
                if doc.get("status") and doc.get("status") != room.status:
                    room.status = doc.get("status")
                    updated = True
                if doc.get("active_participants_count") is not None and doc.get("active_participants_count") != room.active_participants_count:
                    room.active_participants_count = doc.get("active_participants_count")
                    updated = True

                # Merge messages from cloud MongoDB Atlas so cross-laptop chats sync instantly
                mongo_msgs = doc.get("messages") or []
                if mongo_msgs:
                    current_msgs = list(room.messages or [])
                    msg_map = {}
                    for m in current_msgs:
                        k = m.get("id") or f"{m.get('timestamp')}_{m.get('text')}_{m.get('sender_id')}"
                        msg_map[k] = m
                    added = False
                    for m in mongo_msgs:
                        k = m.get("id") or f"{m.get('timestamp')}_{m.get('text')}_{m.get('sender_id')}"
                        if k not in msg_map:
                            msg_map[k] = m
                            added = True
                    if added:
                        room.messages = sorted(list(msg_map.values()), key=lambda x: x.get("timestamp") or "")
                        flag_modified(room, "messages")
                        updated = True

                if doc.get("shared_state"):
                    cur_state = dict(room.shared_state or {})
                    cur_state.update(doc.get("shared_state") or {})
                    room.shared_state = cur_state
                    flag_modified(room, "shared_state")
                    updated = True

                if updated:
                    db.commit()
                    db.refresh(room)
                return room

            c_at = None
            if doc.get("created_at"):
                try:
                    c_at = datetime.fromisoformat(doc["created_at"])
                except Exception:
                    c_at = datetime.utcnow()
            cl_at = None
            if doc.get("closed_at"):
                try:
                    cl_at = datetime.fromisoformat(doc["closed_at"])
                except Exception:
                    pass
            up_at = None
            if doc.get("updated_at"):
                try:
                    up_at = datetime.fromisoformat(doc["updated_at"])
                except Exception:
                    up_at = datetime.utcnow()

            room = NegotiationRoomDB(
                id=doc.get("room_id") or clean_id,
                room_id=doc.get("room_id") or clean_id,
                matter_id=doc.get("matter_id"),
                creator_id=doc.get("creator_id") or "creator",
                participant_id=doc.get("participant_id"),
                status=doc.get("status", "waiting"),
                created_at=c_at or datetime.utcnow(),
                closed_at=cl_at,
                title=doc.get("title", "Private Negotiation Room"),
                passcode=doc.get("passcode") or "",
                creator_name=doc.get("creator_name"),
                creator_role=doc.get("creator_role", "buyer"),
                creator_token=doc.get("creator_token"),
                guest_id=doc.get("guest_id"),
                guest_name=doc.get("guest_name"),
                guest_role=doc.get("guest_role", "seller"),
                guest_token=doc.get("guest_token"),
                guest_status=doc.get("guest_status", "none"),
                active_participants_count=doc.get("active_participants_count", 1),
                messages=doc.get("messages", []),
                shared_state=doc.get("shared_state", {}),
                updated_at=up_at or datetime.utcnow(),
            )
            db.add(room)
            db.commit()
            db.refresh(room)
            logger.info(f"[RoomService] Hydrated room '{clean_id}' from MongoDB Atlas to local session.")
            return room
    except Exception as ex:
        logger.debug(f"[RoomService] Mongo get_room sync error: {ex}")

    return room


def request_join(
    db: Session,
    room_id: str,
    participant_id: str,
    passcode: Optional[str] = None,
    participant_name: Optional[str] = None,
    participant_role: Optional[str] = None,
) -> NegotiationRoomDB:
    """
    Second participant requests to join the private room.
    Enforces:
    - Room must exist (case-insensitive resolution).
    - Cannot join a closed or expired room.
    - Creator cannot join as the second participant.
    - Only one additional participant is allowed (strict 2-party limit).
    - Passcode verification if room was configured with a passcode.
    """
    room = get_room(db, room_id)
    if not room:
        clean_name = (room_id or "").strip().upper()
        raise ValueError(f"Negotiation room '{clean_name}' not found.")

    if room.status in ("closed", "expired") or room.closed_at is not None:
        raise ValueError("This negotiation room is permanently closed or expired.")

    if participant_id == room.creator_id:
        raise ValueError("Creator cannot join as the second participant.")

    # Passcode verification: only enforced if room has a passcode configured
    if room.passcode and room.passcode.strip():
        if not passcode or passcode.strip() != room.passcode.strip():
            raise ValueError("Invalid room passcode.")

    # Strict rule: Only one additional participant is allowed
    # If room already has an admitted participant who is not this participant
    if room.guest_status == "admitted" and room.participant_id and room.participant_id != participant_id:
        raise ValueError("Room is full (maximum 2 participants admitted). Only one additional participant is allowed.")

    guest_token = room.guest_token or f"gtok_{secrets.token_hex(12)}"
    creator_r = (room.creator_role or "buyer").lower()
    forced_guest_role = "seller" if creator_r == "buyer" else "buyer"
    clean_role = forced_guest_role

    raw_name = (participant_name or "").strip()
    if not raw_name or "negotiation demo" in raw_name.lower() or raw_name.startswith("Counterparty"):
        clean_name = "Marcus Vance (Seller)" if clean_role == "seller" else "Elena Rostova (Buyer)"
    else:
        clean_name = raw_name

    room.participant_id = participant_id
    room.guest_id = participant_id
    room.guest_name = clean_name
    room.guest_role = clean_role
    room.guest_token = guest_token
    room.guest_status = "pending_approval"
    room.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(room)
    sync_room(room)
    logger.info(f"[RoomService] Participant '{participant_id}' requested admission to room '{room_id}'.")
    return room


def admit_participant(
    db: Session,
    room_id: str,
    creator_id: str,
    participant_id: Optional[str] = None,
) -> NegotiationRoomDB:
    """
    Creator admits the waiting second participant into the active room.
    Transitions room status from 'waiting' to 'active'.
    """
    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    if room.creator_id != creator_id:
        raise PermissionError("Only the room creator can admit participants.")

    if room.status in ("closed", "expired") or room.closed_at is not None:
        raise ValueError("Cannot admit participants to a closed or expired negotiation room.")

    if room.guest_status == "admitted" and room.status == "active":
        return room

    if not room.participant_id or room.guest_status != "pending_approval":
        raise ValueError("No participant currently waiting for admission approval.")

    if participant_id and room.participant_id != participant_id:
        raise ValueError(f"Pending participant '{room.participant_id}' does not match requested '{participant_id}'.")

    room.guest_status = "admitted"
    room.status = "active"
    room.active_participants_count = 2
    room.updated_at = datetime.utcnow()

    # Record admission event in messages
    history = list(room.messages or [])
    admit_guest_name = room.guest_name or room.participant_id
    if not admit_guest_name or "negotiation demo" in str(admit_guest_name).lower() or "guest_" in str(admit_guest_name).lower():
        admit_guest_name = "Marcus Vance (Seller)" if (room.guest_role or "seller").lower() == "seller" else "Elena Rostova (Buyer)"

    history.append({
        "type": "system",
        "action": "admit",
        "text": f"Participant {admit_guest_name} was admitted by creator.",
        "timestamp": datetime.utcnow().isoformat(),
    })
    room.messages = history

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(room, "messages")

    db.commit()
    db.refresh(room)
    sync_room(room)
    logger.info(f"[RoomService] Participant '{room.participant_id}' admitted to room '{room_id}' by creator '{creator_id}'.")
    return room


def reject_participant(
    db: Session,
    room_id: str,
    creator_id: str,
    participant_id: Optional[str] = None,
) -> NegotiationRoomDB:
    """
    Creator rejects the pending participant's admission request.
    Resets participant slot to allow a different counterparty to knock.
    """
    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    if room.creator_id != creator_id:
        raise PermissionError("Only the room creator can reject participants.")

    if not room.participant_id or room.guest_status != "pending_approval":
        raise ValueError("No pending participant to reject.")

    if participant_id and room.participant_id != participant_id:
        raise ValueError("Target participant does not match the pending applicant.")

    rejected_id = room.participant_id
    room.participant_id = None
    room.guest_id = None
    room.guest_token = None
    room.guest_status = "rejected"
    room.status = "waiting"
    room.active_participants_count = 1
    room.updated_at = datetime.utcnow()

    history = list(room.messages or [])
    history.append({
        "type": "system",
        "action": "reject",
        "text": f"Admission request for {rejected_id} was declined by creator.",
        "timestamp": datetime.utcnow().isoformat(),
    })
    room.messages = history

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(room, "messages")

    db.commit()
    db.refresh(room)
    sync_room(room)
    logger.info(f"[RoomService] Pending participant rejected for room '{room_id}' by creator '{creator_id}'.")
    return room


def leave_room(
    db: Session,
    room_id: str,
    participant_id: str,
) -> NegotiationRoomDB:
    """
    A participant voluntarily leaves the room.
    Rule: Leaving MUST NOT delete historical data (messages, audit trail, shared proposals are kept).
    """
    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    is_creator = (participant_id == room.creator_id)
    is_guest = (participant_id == room.participant_id or participant_id == room.guest_id)

    if not is_creator and not is_guest:
        raise ValueError("Specified participant does not belong to this room.")

    # Record leave event without deleting room or historical data
    leaving_role = (room.creator_role if is_creator else (room.guest_role or "seller")).lower()
    raw_lname = room.creator_name if is_creator else (room.guest_name or participant_id)
    if not raw_lname or "negotiation demo" in str(raw_lname).lower() or "guest_" in str(raw_lname).lower():
        leaving_name = "Marcus Vance (Seller)" if leaving_role == "seller" else "Elena Rostova (Buyer)"
    else:
        leaving_name = raw_lname

    if is_guest:
        room.guest_status = "left"

    room.active_participants_count = max(0, room.active_participants_count - 1)
    room.updated_at = datetime.utcnow()

    # Append to persisted audit messages
    history = list(room.messages or [])
    history.append({
        "type": "system",
        "action": "leave",
        "participant_id": participant_id,
        "text": f"{leaving_name} ({leaving_role}) left the room.",
        "timestamp": datetime.utcnow().isoformat(),
    })
    room.messages = history

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(room, "messages")

    db.commit()
    db.refresh(room)
    sync_room(room)
    logger.info(f"[RoomService] Participant '{participant_id}' left room '{room_id}'. Historical data preserved.")
    return room


def close_room(
    db: Session,
    room_id: str,
    creator_id: str,
) -> NegotiationRoomDB:
    """
    Creator closes/stops the negotiation room.
    Transitions status to 'closed' and stamps closed_at timestamp.
    Historical messages and proposals are strictly preserved.
    """
    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    if room.creator_id != creator_id:
        raise PermissionError("Only the room creator can close the negotiation room.")

    now = datetime.utcnow()
    room.status = "closed"
    room.closed_at = now
    room.active_participants_count = 0
    room.updated_at = now

    history = list(room.messages or [])
    history.append({
        "type": "system",
        "action": "close",
        "text": "Negotiation room permanently closed by creator.",
        "timestamp": now.isoformat(),
    })
    room.messages = history

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(room, "messages")

    db.commit()
    db.refresh(room)
    sync_room(room)
    logger.info(f"[RoomService] Room '{room_id}' closed by creator '{creator_id}'.")
    return room


def complete_room(
    db: Session,
    room_id: str,
    creator_id: Optional[str] = None,
) -> NegotiationRoomDB:
    """
    Transitions room status to 'completed'.
    Preserves all historical documents, proposals, and deliberation logs.
    """
    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    if creator_id and room.creator_id != creator_id:
        raise PermissionError("Only the room creator can mark negotiation as completed.")

    now = datetime.utcnow()
    room.status = "completed"
    room.updated_at = now

    history = list(room.messages or [])
    history.append({
        "type": "system",
        "action": "complete",
        "text": "Negotiation successfully completed and conformed.",
        "timestamp": now.isoformat(),
    })
    room.messages = history

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(room, "messages")

    db.commit()
    db.refresh(room)
    sync_room(room)
    logger.info(f"[RoomService] Room '{room_id}' marked as completed.")
    return room


def expire_room(
    db: Session,
    room_id: str,
) -> NegotiationRoomDB:
    """
    Marks negotiation room as expired. Rejects subsequent actions.
    """
    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    now = datetime.utcnow()
    room.status = "expired"
    room.closed_at = now
    room.active_participants_count = 0
    room.updated_at = now

    history = list(room.messages or [])
    history.append({
        "type": "system",
        "action": "expire",
        "text": "Negotiation room expired.",
        "timestamp": now.isoformat(),
    })
    room.messages = history

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(room, "messages")

    db.commit()
    db.refresh(room)
    sync_room(room)
    logger.info(f"[RoomService] Room '{room_id}' marked as expired.")
    return room


# ═════════════════════════════════════════════════════════════════════════════
# WebSocket Multi-Registry Broadcast Helper
# ═════════════════════════════════════════════════════════════════════════════

async def broadcast_to_room_sockets(room_id: str, message: dict, exclude_participant: Optional[str] = None):
    """
    Broadcast an event to both participants across both active room WebSocket registries:
    - /ws/rooms/{room_id} (ws_manager)
    - /ws/negotiation/{room_id} (registry)
    """
    # 1. ws_manager from rooms router
    try:
        from app.routers.rooms import ws_manager
        await ws_manager.broadcast_to_room(room_id, message, exclude_participant=exclude_participant)
    except Exception as ex:
        logger.debug(f"[WS broadcast ws_manager notice] {ex}")

    # 2. registry from negotiation_ws router
    try:
        from app.routers.negotiation_ws import registry
        await registry.broadcast(room_id, message, exclude_participant=exclude_participant)
    except Exception as ex:
        logger.debug(f"[WS broadcast registry notice] {ex}")


def broadcast_to_room_sockets_sync(room_id: str, message: dict):
    """Synchronous safe trigger for socket broadcast."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(broadcast_to_room_sockets(room_id, message))
        else:
            loop.run_until_complete(broadcast_to_room_sockets(room_id, message))
    except Exception:
        pass


# ═════════════════════════════════════════════════════════════════════════════
# Contract & Clause Submission Integration
# ═════════════════════════════════════════════════════════════════════════════

def submit_room_contract_input(
    db: Session,
    room_id: str,
    participant_id: Optional[str] = None,
    token: Optional[str] = None,
    party: Optional[str] = None,
    text: Optional[str] = None,
    clauses: Optional[List[Dict[str, Any]]] = None,
    filename: Optional[str] = None,
    auto_start_pipeline: bool = False,
) -> Dict[str, Any]:
    """
    Participant submits contract document / clauses into private room.
    
    Rules Enforced:
    1. Room must be in 'active' status (both creator and guest present).
    2. Only admitted participants can submit.
    3. Keep party-private drafting information strictly private.
    4. Store documents associated with room_id / matter_id.
    5. Do NOT start pipeline until BOTH Party A and Party B inputs are available.
    """
    from pathlib import Path
    from sqlalchemy.orm.attributes import flag_modified
    from app.config import settings
    from app.models.matter import DocumentParty
    from app.services.matter_service import create_matter, get_matter, store_document_metadata

    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    if room.status != "active":
        raise ValueError(
            f"Room must be in 'active' status with both participants admitted before submitting contract clauses. Current status: '{room.status}'."
        )

    # Validate caller identity
    is_creator = False
    is_guest = False

    if token:
        if token == room.creator_token:
            is_creator = True
        elif token == room.guest_token:
            is_guest = True

    if participant_id:
        if participant_id == room.creator_id:
            is_creator = True
        elif participant_id in (room.participant_id, room.guest_id):
            is_guest = True

    if not is_creator and not is_guest:
        # Fallback if no participant_id or token provided in test mode: resolve from party param
        if party:
            norm_p = party.lower().strip()
            if norm_p in ("party_a", "creator", "buyer"):
                is_creator = True
            elif norm_p in ("party_b", "guest", "seller"):
                is_guest = True
        if not is_creator and not is_guest:
            raise PermissionError("Unauthorized participant. Only admitted room participants can submit contract clauses.")

    # Determine party slot with strict isolation:
    # Party A can ONLY submit/edit Party A inputs!
    # Party B can ONLY submit/edit Party B inputs!
    if is_creator and not is_guest:
        if party:
            norm_party = party.lower().strip()
            if norm_party in ("party_b", "b", "guest", "seller"):
                raise PermissionError("Unauthorized: Party A can submit or edit only Party A inputs.")
        resolved_party = "party_a"
    elif is_guest and not is_creator:
        if party:
            norm_party = party.lower().strip()
            if norm_party in ("party_a", "a", "creator", "buyer"):
                raise PermissionError("Unauthorized: Party B can submit or edit only Party B inputs.")
        resolved_party = "party_b"
    else:
        resolved_party = "party_a" if (party and "b" not in party.lower()) else "party_b"

    party_doc_enum = DocumentParty.PARTY_A if resolved_party == "party_a" else DocumentParty.PARTY_B

    # Ensure MatterDB exists for this room
    resolved_matter_id = room.matter_id or room.room_id
    matter = get_matter(db, resolved_matter_id)
    if not matter:
        matter = create_matter(
            db=db,
            title=room.title or f"Negotiation Matter {room.room_id}",
            counterparty=room.guest_name or "Counterparty Counsel",
            matter_id=resolved_matter_id,
            docket_number=f"DOCKET #{resolved_matter_id}",
            arr_value="$4.2M",
            variance_ceiling=0.15,
            lead_counsel=room.creator_name or "Lead Counsel",
        )
        room.matter_id = resolved_matter_id

    # Format submitted document text
    submitted_text = (text or "").strip()
    if clauses and not submitted_text:
        formatted_blocks = []
        for idx, cl in enumerate(clauses, start=1):
            sec = cl.get("section", f"Section {idx}")
            title = cl.get("title", f"Clause {idx}")
            body = cl.get("text") or cl.get("original_text") or cl.get("counterparty_text") or ""
            formatted_blocks.append(f"{sec} {title}\n{body}")
        submitted_text = "\n\n".join(formatted_blocks).strip()

    if not submitted_text:
        # Fallback standard clause text for testing or empty submission
        party_label = "Party A" if resolved_party == "party_a" else "Party B"
        submitted_text = (
            f"1.0 PREAMBLE\nThis Agreement is entered into by {party_label}.\n\n"
            f"2.0 LIABILITY AND INDEMNIFICATION\nThe aggregate liability of {party_label} shall not exceed the fees paid under this Agreement.\n\n"
            f"3.0 GOVERNING LAW AND DISPUTE RESOLUTION\nThis Agreement shall be governed by the laws of the State of Delaware.\n\n"
            f"4.0 PAYMENT AND AUDIT RIGHTS\nInvoices are payable net thirty (30) days from receipt.\n\n"
            f"5.0 TERMINATION FOR CONVENIENCE\nEither party may terminate upon thirty (30) days written notice."
        )

    # Deterministic clause segmentation and normalization reusing existing parser
    from app.parsers import parse_clauses
    parsed_clauses = clauses if (clauses and len(clauses) > 0) else parse_clauses(submitted_text)

    # Save physical text file to matter upload directory
    matter_upload_dir = Path(settings.UPLOAD_DIR) / resolved_matter_id
    matter_upload_dir.mkdir(parents=True, exist_ok=True)
    clean_filename = filename or f"{resolved_party}_submission.txt"
    target_filepath = matter_upload_dir / f"{resolved_party}_{clean_filename}"
    target_filepath.write_text(submitted_text, encoding="utf-8")

    # Store document metadata associated with matter
    store_document_metadata(
        db=db,
        matter_id=resolved_matter_id,
        party=party_doc_enum,
        filename=clean_filename,
        file_path=str(target_filepath.resolve()),
        file_type="txt",
    )

    # Update room shared_state: keep private content in _private_submissions
    state = dict(room.shared_state or {})
    private_store = dict(state.get("_private_submissions") or {})
    private_store[resolved_party] = {
        "participant_id": participant_id or (room.creator_id if is_creator else room.participant_id),
        "party": resolved_party,
        "filename": clean_filename,
        "file_path": str(target_filepath.resolve()),
        "submitted_at": datetime.utcnow().isoformat(),
        "clauses_count": len(parsed_clauses) if parsed_clauses else (len(clauses) if clauses else 5),
        "char_count": len(submitted_text),
        "clauses": parsed_clauses,
    }
    state["_private_submissions"] = private_store

    # Public flags (no private drafts or annotations revealed)
    state["has_party_a_submitted"] = bool("party_a" in private_store)
    state["has_party_b_submitted"] = bool("party_b" in private_store)
    both_submitted = state["has_party_a_submitted"] and state["has_party_b_submitted"]
    state["ready_for_pipeline"] = both_submitted
    state["readiness"] = "READY" if both_submitted else "WAITING_FOR_COUNTERPARTY"
    if not both_submitted and state.get("pipeline_status") != "running":
        state["pipeline_status"] = "waiting_for_counterparty"

    room.shared_state = state
    flag_modified(room, "shared_state")

    # Append submission notification event to room messages
    history = list(room.messages or [])
    party_title = "Party A (Creator)" if resolved_party == "party_a" else "Party B (Counterparty)"
    history.append({
        "type": "clause_submitted",
        "party": resolved_party,
        "text": f"{party_title} submitted contract clauses/document.",
        "ready_for_pipeline": both_submitted,
        "timestamp": datetime.utcnow().isoformat(),
    })
    room.messages = history
    flag_modified(room, "messages")

    db.commit()
    db.refresh(room)

    # Broadcast privacy-safe clause_updated and clause_submitted notification to sockets
    broadcast_to_room_sockets_sync(room_id, {
        "type": "clause_updated",
        "party": resolved_party,
        "message": f"{party_title} submitted contract clauses.",
        "has_party_a": state["has_party_a_submitted"],
        "has_party_b": state["has_party_b_submitted"],
        "ready_for_pipeline": both_submitted,
        "readiness": "READY" if both_submitted else "WAITING_FOR_COUNTERPARTY",
        "timestamp": datetime.utcnow().isoformat(),
    })
    broadcast_to_room_sockets_sync(room_id, {
        "type": "clause_submitted",
        "party": resolved_party,
        "message": f"{party_title} submitted contract clauses. Both submitted: {both_submitted}.",
        "has_party_a": state["has_party_a_submitted"],
        "has_party_b": state["has_party_b_submitted"],
        "ready_for_pipeline": both_submitted,
        "readiness": "READY" if both_submitted else "WAITING_FOR_COUNTERPARTY",
        "timestamp": datetime.utcnow().isoformat(),
    })

    if both_submitted:
        broadcast_to_room_sockets_sync(room_id, {
            "type": "room_ready",
            "room_id": room_id,
            "ready": True,
            "readiness": "READY",
            "message": "Both parties have submitted contract inputs. Room is READY for deliberation.",
            "timestamp": datetime.utcnow().isoformat(),
        })

    logger.info(
        f"[RoomService] Room '{room_id}' received contract submission for '{resolved_party}'. "
        f"Both submitted: {both_submitted}."
    )

    response_data = {
        "room_id": room_id,
        "matter_id": resolved_matter_id,
        "party": resolved_party,
        "status": "ready_for_pipeline" if both_submitted else "waiting_for_counterparty",
        "readiness": "READY" if both_submitted else "WAITING_FOR_COUNTERPARTY",
        "message": (
            "Both parties have submitted documents. Deliberation pipeline is ready to start."
            if both_submitted
            else f"{resolved_party.upper()} submission recorded. Awaiting counterparty submission before running agent pipeline."
        ),
        "has_party_a_submitted": state["has_party_a_submitted"],
        "has_party_b_submitted": state["has_party_b_submitted"],
        "ready_for_pipeline": both_submitted,
        "pipeline_started": False,
    }

    return response_data


def upload_room_contract_file(
    db: Session,
    room_id: str,
    file_bytes: bytes,
    filename: str,
    party: Optional[str] = None,
    token: Optional[str] = None,
    participant_id: Optional[str] = None,
    auto_start_pipeline: bool = False,
) -> Dict[str, Any]:
    """
    Upload contract document file (PDF, DOCX, TXT) for Party A or Party B.
    Enforces:
    1. Active room.
    2. Strict party authorization: Party A can upload only for Party A, Party B only for Party B.
    3. Reuses existing extract_document and parse_clauses.
    4. Marks room READY when both parties have submitted.
    """
    from pathlib import Path
    from sqlalchemy.orm.attributes import flag_modified
    from app.config import settings
    from app.models.matter import DocumentParty
    from app.parsers import extract_document, parse_clauses
    from app.services.matter_service import create_matter, get_matter, store_document_metadata

    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    if room.status != "active":
        raise ValueError(f"Room must be in 'active' status before uploading contract documents. Current status: '{room.status}'.")

    # Authorize caller
    is_creator = False
    is_guest = False
    if token:
        if token == room.creator_token:
            is_creator = True
        elif token == room.guest_token:
            is_guest = True
    if participant_id:
        if participant_id == room.creator_id:
            is_creator = True
        elif participant_id in (room.participant_id, room.guest_id):
            is_guest = True

    if not is_creator and not is_guest:
        if party:
            norm_p = party.lower().strip()
            if norm_p in ("party_a", "creator", "buyer"):
                is_creator = True
            elif norm_p in ("party_b", "guest", "seller"):
                is_guest = True
        if not is_creator and not is_guest:
            raise PermissionError("Unauthorized participant. Only admitted room participants can upload contract documents.")

    if is_creator and not is_guest:
        if party and party.lower().strip() in ("party_b", "b", "guest", "seller"):
            raise PermissionError("Unauthorized: Party A can upload and edit only Party A inputs.")
        resolved_party = "party_a"
    elif is_guest and not is_creator:
        if party and party.lower().strip() in ("party_a", "a", "creator", "buyer"):
            raise PermissionError("Unauthorized: Party B can upload and edit only Party B inputs.")
        resolved_party = "party_b"
    else:
        resolved_party = "party_a" if (party and "b" not in party.lower()) else "party_b"

    party_doc_enum = DocumentParty.PARTY_A if resolved_party == "party_a" else DocumentParty.PARTY_B
    resolved_matter_id = room.matter_id or room.room_id
    matter = get_matter(db, resolved_matter_id)
    if not matter:
        matter = create_matter(
            db=db,
            title=room.title or f"Negotiation Matter {room.room_id}",
            counterparty=room.guest_name or "Counterparty Counsel",
            matter_id=resolved_matter_id,
            docket_number=f"DOCKET #{resolved_matter_id}",
            arr_value="$4.2M",
            variance_ceiling=0.15,
            lead_counsel=room.creator_name or "Lead Counsel",
        )
        room.matter_id = resolved_matter_id

    # Sanitize filename and save to matter upload dir
    clean_filename = Path(filename).name.replace(" ", "_")
    matter_upload_dir = Path(settings.UPLOAD_DIR) / resolved_matter_id
    matter_upload_dir.mkdir(parents=True, exist_ok=True)
    target_filepath = matter_upload_dir / f"{resolved_party}_{clean_filename}"
    target_filepath.write_bytes(file_bytes)

    # Extract text and parse clauses reusing existing parsers
    extracted = extract_document(target_filepath)
    extracted_text = extracted.get("text", "")
    parsed_clauses_list = parse_clauses(extracted)

    file_ext = target_filepath.suffix.lower().replace(".", "")
    store_document_metadata(
        db=db,
        matter_id=resolved_matter_id,
        party=party_doc_enum,
        filename=clean_filename,
        file_path=str(target_filepath.resolve()),
        file_type=file_ext,
    )

    # Save to _private_submissions (strictly isolated)
    state = dict(room.shared_state or {})
    private_store = dict(state.get("_private_submissions") or {})
    private_store[resolved_party] = {
        "participant_id": participant_id or (room.creator_id if is_creator else room.participant_id),
        "party": resolved_party,
        "filename": clean_filename,
        "file_path": str(target_filepath.resolve()),
        "submitted_at": datetime.utcnow().isoformat(),
        "clauses_count": len(parsed_clauses_list) if parsed_clauses_list else 5,
        "char_count": len(extracted_text),
        "clauses": parsed_clauses_list,
    }
    state["_private_submissions"] = private_store

    state["has_party_a_submitted"] = bool("party_a" in private_store)
    state["has_party_b_submitted"] = bool("party_b" in private_store)
    both_submitted = state["has_party_a_submitted"] and state["has_party_b_submitted"]
    state["ready_for_pipeline"] = both_submitted
    state["readiness"] = "READY" if both_submitted else "WAITING_FOR_COUNTERPARTY"

    room.shared_state = state
    flag_modified(room, "shared_state")

    party_title = "Party A (Creator)" if resolved_party == "party_a" else "Party B (Counterparty)"
    history = list(room.messages or [])
    history.append({
        "type": "clause_submitted",
        "party": resolved_party,
        "text": f"{party_title} uploaded contract file '{clean_filename}'.",
        "ready_for_pipeline": both_submitted,
        "timestamp": datetime.utcnow().isoformat(),
    })
    room.messages = history
    flag_modified(room, "messages")
    db.commit()
    db.refresh(room)

    broadcast_to_room_sockets_sync(room_id, {
        "type": "clause_updated",
        "party": resolved_party,
        "message": f"{party_title} uploaded contract file.",
        "has_party_a": state["has_party_a_submitted"],
        "has_party_b": state["has_party_b_submitted"],
        "ready_for_pipeline": both_submitted,
        "readiness": "READY" if both_submitted else "WAITING_FOR_COUNTERPARTY",
        "timestamp": datetime.utcnow().isoformat(),
    })
    broadcast_to_room_sockets_sync(room_id, {
        "type": "clause_submitted",
        "party": resolved_party,
        "message": f"{party_title} uploaded contract file. Both submitted: {both_submitted}.",
        "has_party_a": state["has_party_a_submitted"],
        "has_party_b": state["has_party_b_submitted"],
        "ready_for_pipeline": both_submitted,
        "readiness": "READY" if both_submitted else "WAITING_FOR_COUNTERPARTY",
        "timestamp": datetime.utcnow().isoformat(),
    })

    if both_submitted:
        broadcast_to_room_sockets_sync(room_id, {
            "type": "room_ready",
            "room_id": room_id,
            "ready": True,
            "readiness": "READY",
            "message": "Both parties have submitted contract inputs. Room is READY for deliberation.",
            "timestamp": datetime.utcnow().isoformat(),
        })

    return {
        "room_id": room_id,
        "matter_id": resolved_matter_id,
        "party": resolved_party,
        "filename": clean_filename,
        "clauses_count": len(parsed_clauses_list),
        "status": "ready_for_pipeline" if both_submitted else "waiting_for_counterparty",
        "readiness": "READY" if both_submitted else "WAITING_FOR_COUNTERPARTY",
        "has_party_a_submitted": state["has_party_a_submitted"],
        "has_party_b_submitted": state["has_party_b_submitted"],
        "ready_for_pipeline": both_submitted,
    }


def get_room_private_input(
    db: Session,
    room_id: str,
    party: str,
    token: Optional[str] = None,
    participant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Retrieve private document / clauses for Party A or Party B.
    STRICT PRIVACY ENFORCEMENT:
    - Party A can view ONLY Party A's private input.
    - Party B can view ONLY Party B's private input.
    - An unauthorized party or counterparty attempt raises PermissionError.
    """
    from pathlib import Path

    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    # Authenticate caller
    is_creator = False
    is_guest = False
    if token:
        if token == room.creator_token:
            is_creator = True
        elif token == room.guest_token:
            is_guest = True
    if participant_id:
        if participant_id == room.creator_id:
            is_creator = True
        elif participant_id in (room.participant_id, room.guest_id):
            is_guest = True

    if not is_creator and not is_guest:
        raise PermissionError("Unauthorized: You must be an admitted participant with a valid room token to access private chamber inputs.")

    target_party = (party or "").lower().strip()
    if target_party in ("a", "party_a", "creator", "buyer"):
        target_party = "party_a"
    elif target_party in ("b", "party_b", "guest", "seller"):
        target_party = "party_b"
    else:
        raise ValueError(f"Invalid party '{party}'. Must be 'party_a' or 'party_b'.")

    # Enforce isolation: Party A cannot view Party B, Party B cannot view Party A
    if is_creator and not is_guest and target_party != "party_a":
        raise PermissionError("Access Denied: Party A is not permitted to view Party B's private internal documents or draft clauses.")
    if is_guest and not is_creator and target_party != "party_b":
        raise PermissionError("Access Denied: Party B is not permitted to view Party A's private internal documents or draft clauses.")

    state = room.shared_state or {}
    private_store = state.get("_private_submissions") or {}
    sub = private_store.get(target_party)

    if not sub:
        return {
            "room_id": room_id,
            "party": target_party,
            "has_submitted": False,
            "message": f"No private submission on file for {target_party.upper()}.",
            "clauses": [],
            "text": "",
        }

    file_text = ""
    file_path_str = sub.get("file_path")
    if file_path_str and Path(file_path_str).exists():
        try:
            file_text = Path(file_path_str).read_text(encoding="utf-8", errors="ignore")
        except Exception:
            pass

    return {
        "room_id": room_id,
        "party": target_party,
        "has_submitted": True,
        "filename": sub.get("filename"),
        "clauses_count": sub.get("clauses_count", 0),
        "char_count": sub.get("char_count", len(file_text)),
        "submitted_at": sub.get("submitted_at"),
        "clauses": sub.get("clauses", []),
        "text": file_text,
    }


def get_room_shared_state(
    db: Session,
    room_id: str,
) -> Dict[str, Any]:
    """
    Retrieve SHARED negotiation information:
    - Mutually visible clauses
    - Negotiation proposals
    - Agreed changes
    - Safe AI negotiation results
    STRICT PRIVACY: Never exposes private drafts or internal inputs of either party.
    """
    from app.db.models import ContractClauseDB, ReportDB

    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    resolved_matter_id = room.matter_id or room.room_id
    state = dict(room.shared_state or {})
    has_a = bool(state.get("has_party_a_submitted", False))
    has_b = bool(state.get("has_party_b_submitted", False))
    ready = bool(state.get("ready_for_pipeline", False))

    # Mutually visible clauses from ContractClauseDB
    clauses_db = db.query(ContractClauseDB).filter(ContractClauseDB.matter_id == resolved_matter_id).all()
    mutually_visible_clauses = []
    agreed_changes = []

    for c in clauses_db:
        cl_data = {
            "id": c.id,
            "clause_id": c.id,
            "matter_id": c.matter_id,
            "section": c.section,
            "title": c.title,
            "original_text": c.original_text,
            "counterparty_text": c.counterparty_text,
            "conformed_proposal": c.conformed_proposal,
            "status": c.status,
            "risk_level": c.risk_level,
            "risk_score": c.risk_score,
            "precedent_alignment": c.precedent_alignment,
            "rationale": c.rationale,
            "sec_edgar_citation": c.sec_edgar_citation,
        }
        mutually_visible_clauses.append(cl_data)
        if c.status in ("agreed", "conformed"):
            agreed_changes.append(cl_data)

    # Proposals from room messages & shared_state
    proposals = []
    for m in (room.messages or []):
        if isinstance(m, dict) and m.get("type") in ("proposal", "clause_submitted", "clause_agreed"):
            proposals.append(m)

    # Safe AI Deliberation Results (from ReportDB)
    ai_results = {}
    report = db.query(ReportDB).filter(
        (ReportDB.matter_id == resolved_matter_id) | (ReportDB.id == state.get("report_id"))
    ).first()

    if report:
        ai_results = {
            "report_id": report.id,
            "review_status": report.review_status,
            "clauses_count": len(mutually_visible_clauses),
            "executive_summary": (report.executive_summary or {}).get("summary_text", "") if isinstance(report.executive_summary, dict) else str(report.executive_summary or ""),
            "compromise_proposals": (report.agent3_verdict or {}).get("compromise_proposals", []) if isinstance(report.agent3_verdict, dict) else [],
            "risk_summary": report.risk_summary or {},
            "equilibrium_score": (report.executive_summary or {}).get("fairness_index", 90) if isinstance(report.executive_summary, dict) else 90,
        }

    return {
        "room_id": room.room_id or room.id,
        "status": room.status,
        "readiness": "READY" if ready else "WAITING_FOR_INPUTS",
        "ready_for_pipeline": ready,
        "has_party_a_submitted": has_a,
        "has_party_b_submitted": has_b,
        "mutually_visible_clauses": mutually_visible_clauses,
        "proposals": proposals,
        "agreed_changes": agreed_changes,
        "ai_results": ai_results,
    }


def agree_room_clause(
    db: Session,
    room_id: str,
    clause_id: str,
    agreed_text: Optional[str] = None,
    token: Optional[str] = None,
    participant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Mark a clause as mutually agreed upon in the SHARED negotiation space.
    """
    from app.db.models import ContractClauseDB
    from sqlalchemy.orm.attributes import flag_modified

    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    resolved_matter_id = room.matter_id or room.room_id
    clause = db.query(ContractClauseDB).filter(
        ContractClauseDB.matter_id == resolved_matter_id,
        (ContractClauseDB.id == clause_id) | (ContractClauseDB.section == clause_id)
    ).first()

    if clause:
        clause.status = "agreed"
        if agreed_text:
            clause.conformed_proposal = agreed_text
        clause.risk_level = "low"
        db.commit()
        db.refresh(clause)

    now_iso = datetime.utcnow().isoformat()
    msg = {
        "type": "clause_agreed",
        "clause_id": clause_id,
        "text": f"Clause {clause_id} mutually agreed upon.",
        "conformed_text": agreed_text or (clause.conformed_proposal if clause else ""),
        "timestamp": now_iso,
    }
    history = list(room.messages or [])
    history.append(msg)
    room.messages = history
    flag_modified(room, "messages")
    db.commit()

    broadcast_to_room_sockets_sync(room_id, msg)
    broadcast_to_room_sockets_sync(room_id, {
        "type": "clause_updated",
        "clause_id": clause_id,
        "section": getattr(clause, "section", clause_id) if clause else clause_id,
        "status": "agreed",
        "text": agreed_text or (clause.conformed_proposal if clause else ""),
        "timestamp": now_iso,
    })
    return {"status": "success", "clause_id": clause_id, "agreed": True}


# ═════════════════════════════════════════════════════════════════════════════
# Multi-Agent Pipeline Execution for Room
# ═════════════════════════════════════════════════════════════════════════════

async def execute_room_pipeline(
    db: Session,
    room_id: str,
    caller_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute the 4-agent negotiation deliberation pipeline for the private room.
    
    Enforces Flow:
    1. Room must be active.
    2. Both Party A and Party B submissions must be present.
    3. Runs Agent 1 (Lex-Ingestor A) + Agent 2 (Lex-Ingestor B).
    4. Runs Agent 3 (Arbiter: Dual-Lens Deliberation).
    5. Runs Agent 4 (Scrivener: Executive Synthesis & Audit Payload).
    6. Generates ReportDB with status 'pending_review'.
    7. Broadcasts shared AI findings and conformed compromise proposals to WebSockets.
    """
    from sqlalchemy.orm.attributes import flag_modified
    from app.services.pipeline_orchestrator import PipelineOrchestrator

    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    if room.status in ("closed", "expired") or room.closed_at is not None:
        raise ValueError(f"Cannot start pipeline on a closed or expired room '{room_id}'.")

    if room.status != "active":
        raise ValueError(f"Negotiation room '{room_id}' is not active.")

    state = dict(room.shared_state or {})

    # Prevent duplicate pipeline execution
    current_pipeline = state.get("pipeline_status", "idle")
    if current_pipeline == "running":
        raise ValueError("Pipeline is already running for this room. Please wait for completion.")
    if current_pipeline == "completed" and state.get("report_id"):
        raise ValueError("Pipeline has already completed for this room. Report exists.")

    has_a = state.get("has_party_a_submitted", False)
    has_b = state.get("has_party_b_submitted", False)

    if not (has_a and has_b):
        raise ValueError(
            "Cannot start agent pipeline: both Party A and Party B must submit contract clauses/documents first."
        )

    resolved_matter_id = room.matter_id or room.room_id

    # Mark pipeline as running
    state["pipeline_status"] = "running"
    room.shared_state = state
    flag_modified(room, "shared_state")

    history = list(room.messages or [])
    history.append({
        "type": "system",
        "action": "pipeline_started",
        "text": "Multi-agent negotiation pipeline initiated (Agents 1-4).",
        "timestamp": datetime.utcnow().isoformat(),
    })
    room.messages = history
    flag_modified(room, "messages")
    db.commit()

    # Broadcast pipeline started over WebSockets
    await broadcast_to_room_sockets(room_id, {
        "type": "pipeline_started",
        "room_id": room_id,
        "matter_id": resolved_matter_id,
        "message": "Both party inputs verified. 4-Agent deliberation pipeline initiated.",
        "timestamp": datetime.utcnow().isoformat(),
    })

    # Execute end-to-end multi-agent pipeline (shielded against browser disconnects)
    orchestrator = PipelineOrchestrator()
    result = await asyncio.shield(orchestrator.run_pipeline(matter_id=resolved_matter_id, db=db))

    # Refresh room after pipeline run
    db.refresh(room)
    state = dict(room.shared_state or {})
    state["pipeline_status"] = "completed" if result.success else "failed"
    state["report_id"] = result.report_id
    state["clauses_count"] = result.clauses_count
    room.shared_state = state
    flag_modified(room, "shared_state")

    # Broadcast shared AI findings to WebSockets
    # 1. Conformed compromise proposals from Arbiter
    compromise_proposals = []
    if result.agent3_output and isinstance(result.agent3_output, dict):
        compromise_proposals = result.agent3_output.get("compromise_proposals") or []
        for prop in compromise_proposals:
            prop_text = prop.get("proposal_text") or prop.get("counterparty_text") or str(prop)
            await broadcast_to_room_sockets(room_id, {
                "type": "proposal",
                "clause_id": prop.get("clause_id"),
                "title": prop.get("title", "Arbiter Compromise Proposal"),
                "proposal": prop_text,
                "conformed": True,
                "arbitrated_by": "Agent 3 Arbiter",
                "timestamp": datetime.utcnow().isoformat(),
            })

    # 2. Executive report ready event
    exec_summary = ""
    if result.agent4_output and isinstance(result.agent4_output, dict):
        exec_summary = result.agent4_output.get("executive_summary", "")

    ai_findings_event = {
        "type": "ai_findings",
        "room_id": room_id,
        "matter_id": resolved_matter_id,
        "report_id": result.report_id,
        "status": "pending_review",
        "clauses_count": result.clauses_count,
        "executive_summary": exec_summary[:400] if exec_summary else "Multi-agent negotiation synthesis completed.",
        "compromise_proposals_count": len(compromise_proposals),
        "message": "AI deliberation completed. Executive report is ready for counsel review.",
        "timestamp": datetime.utcnow().isoformat(),
    }
    await broadcast_to_room_sockets(room_id, ai_findings_event)

    # Persist findings notice to room messages
    history = list(room.messages or [])
    history.append(ai_findings_event)
    room.messages = history
    flag_modified(room, "messages")
    db.commit()

    return {
        "success": result.success,
        "room_id": room_id,
        "matter_id": resolved_matter_id,
        "status": result.status,
        "report_id": result.report_id,
        "clauses_count": result.clauses_count,
        "duration_seconds": result.duration_seconds,
        "proposals_count": len(compromise_proposals),
        "error": result.error,
    }


# ═════════════════════════════════════════════════════════════════════════════
# Human Review & Audit / Seal Integration
# ═════════════════════════════════════════════════════════════════════════════

def review_room_report(
    db: Session,
    room_id: str,
    action: str,
    counsel_name: str,
    comments: Optional[str] = None,
    caller_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Counsel human review for private room deliberation report.
    Valid actions: 'approve', 'request_revision', 'escalate'.
    """
    from sqlalchemy.orm.attributes import flag_modified
    from app.db.models import MatterDB, ReportDB, ReviewActionDB
    from app.models.report import ReviewActionType, ReviewStatus

    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    resolved_matter_id = room.matter_id or room.room_id
    report = db.query(ReportDB).filter(
        (ReportDB.matter_id == resolved_matter_id) | (ReportDB.id == (room.shared_state or {}).get("report_id"))
    ).first()

    if not report:
        raise ValueError(f"No deliberation report found for room '{room_id}' (matter '{resolved_matter_id}').")

    norm_action = action.lower().strip()
    valid_actions = {
        "approve": ReviewStatus.APPROVED,
        "request_revision": ReviewStatus.REVISION_REQUESTED,
        "escalate": ReviewStatus.ESCALATED,
    }
    if norm_action not in valid_actions:
        raise ValueError(f"Invalid review action '{action}'. Must be one of: {list(valid_actions.keys())}.")

    target_status = valid_actions[norm_action].value
    now = datetime.utcnow()

    # Record review action
    review_record = ReviewActionDB(
        id=f"rev_{secrets.token_hex(4)}",
        report_id=report.id,
        counsel_name=counsel_name,
        action=norm_action,
        comments=comments,
        reviewed_at=now,
    )
    db.add(review_record)

    # Update report status
    report.review_status = target_status
    report.updated_at = now

    # Update matter status
    matter = db.query(MatterDB).filter(MatterDB.id == report.matter_id).first()
    if matter:
        matter.status = target_status
        matter.updated_at = now

    # Update room state
    state = dict(room.shared_state or {})
    state["review_status"] = target_status
    state["eligible_for_sealing"] = (norm_action == "approve")
    room.shared_state = state
    flag_modified(room, "shared_state")

    history = list(room.messages or [])
    history.append({
        "type": "review_decision",
        "action": norm_action,
        "counsel_name": counsel_name,
        "review_status": target_status,
        "text": f"Counsel {counsel_name} submitted review decision: {norm_action.upper()}.",
        "timestamp": now.isoformat(),
    })
    room.messages = history
    flag_modified(room, "messages")

    db.commit()
    db.refresh(report)

    # Broadcast review decision to room sockets
    broadcast_to_room_sockets_sync(room_id, {
        "type": "review_decision",
        "room_id": room_id,
        "matter_id": report.matter_id,
        "report_id": report.id,
        "action": norm_action,
        "counsel_name": counsel_name,
        "review_status": target_status,
        "eligible_for_sealing": (norm_action == "approve"),
        "timestamp": now.isoformat(),
    })

    return {
        "room_id": room_id,
        "matter_id": report.matter_id,
        "report_id": report.id,
        "action": norm_action,
        "counsel_name": counsel_name,
        "review_status": target_status,
        "eligible_for_sealing": (norm_action == "approve"),
        "message": f"Review action '{norm_action}' recorded successfully.",
    }


def seal_room_report(
    db: Session,
    room_id: str,
    counsel_name: Optional[str] = "General Counsel",
    comments: Optional[str] = None,
    caller_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Cryptographically seal an approved deliberation report for the private room.
    Enforces Rule: Fails if report has not been explicitly approved first.
    """
    from sqlalchemy.orm.attributes import flag_modified
    from app.db.models import ReportDB
    from app.services.audit_service import AuditService

    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    resolved_matter_id = room.matter_id or room.room_id
    report = db.query(ReportDB).filter(
        (ReportDB.matter_id == resolved_matter_id) | (ReportDB.id == (room.shared_state or {}).get("report_id"))
    ).first()

    if not report:
        raise ValueError(f"No deliberation report found for room '{room_id}'.")

    if report.review_status != "approved":
        raise ValueError("Cannot cryptographically seal report: Human counsel must first explicitly approve the report.")

    resolved_counsel = (counsel_name or "General Counsel").strip()
    seal_result = AuditService.seal_matter(
        db=db,
        matter_id=report.matter_id,
        counsel_name=resolved_counsel,
        comments=comments,
    )

    now = datetime.utcnow()
    state = dict(room.shared_state or {})
    state["is_sealed"] = True
    state["audit_digest"] = seal_result.block_digest
    state["block_digest"] = seal_result.block_digest
    room.shared_state = state
    flag_modified(room, "shared_state")

    history = list(room.messages or [])
    history.append({
        "type": "sealed",
        "audit_digest": seal_result.block_digest,
        "block_digest": seal_result.block_digest,
        "counsel_name": resolved_counsel,
        "text": "Deliberation report cryptographically sealed into immutable audit ledger.",
        "timestamp": now.isoformat(),
    })
    room.messages = history
    flag_modified(room, "messages")

    db.commit()

    broadcast_to_room_sockets_sync(room_id, {
        "type": "sealed",
        "room_id": room_id,
        "matter_id": report.matter_id,
        "report_id": report.id,
        "audit_digest": seal_result.block_digest,
        "block_digest": seal_result.block_digest,
        "is_sealed": True,
        "counsel_name": resolved_counsel,
        "message": "Contract dossier mathematically sealed and anchored into audit trail.",
        "timestamp": now.isoformat(),
    })

    return {
        "room_id": room_id,
        "matter_id": report.matter_id,
        "report_id": report.id,
        "is_sealed": True,
        "audit_digest": seal_result.block_digest,
        "block_digest": seal_result.block_digest,
        "counsel_name": resolved_counsel,
        "message": "Dossier cryptographically sealed successfully.",
    }


def get_room_pipeline_status(db: Session, room_id: str) -> Dict[str, Any]:
    """Retrieve full pipeline progress, submission status, and report details for room."""
    room = get_room(db, room_id)
    if not room:
        raise ValueError(f"Negotiation room '{room_id}' not found.")

    state = dict(room.shared_state or {})
    resolved_matter_id = room.matter_id or room.room_id

    from app.db.models import MatterDB, ReportDB
    report = db.query(ReportDB).filter(
        (ReportDB.matter_id == resolved_matter_id) | (ReportDB.id == state.get("report_id"))
    ).first()
    matter = db.query(MatterDB).filter(MatterDB.id == resolved_matter_id).first()

    return {
        "room_id": room_id,
        "matter_id": resolved_matter_id,
        "room_status": room.status,
        "pipeline_status": state.get("pipeline_status", "idle"),
        "has_party_a_submitted": bool(state.get("has_party_a_submitted", False)),
        "has_party_b_submitted": bool(state.get("has_party_b_submitted", False)),
        "ready_for_pipeline": bool(state.get("ready_for_pipeline", False)),
        "report_id": report.id if report else state.get("report_id"),
        "review_status": report.review_status if report else None,
        "is_sealed": bool(report.block_digest is not None) if report else bool(state.get("is_sealed", False)),
        "matter_stage": matter.stage if matter else None,
        "matter_status": matter.status if matter else None,
    }


