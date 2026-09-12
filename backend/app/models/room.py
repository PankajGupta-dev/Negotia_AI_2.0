from datetime import datetime
from enum import Enum
import secrets
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


def generate_room_id(prefix: str = "NEG") -> str:
    """Generate unique room ID like NEG-8K4P7M."""
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    suffix = "".join(secrets.choice(alphabet) for _ in range(6))
    return f"{prefix}-{suffix}"


class RoomStatus(str, Enum):
    WAITING = "waiting"
    ACTIVE = "active"
    CLOSED = "closed"
    EXPIRED = "expired"


class NegotiationRoom(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    room_id: str = Field(default_factory=generate_room_id)
    matter_id: Optional[str] = None
    creator_id: str
    participant_id: Optional[str] = None
    status: RoomStatus = RoomStatus.WAITING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None
