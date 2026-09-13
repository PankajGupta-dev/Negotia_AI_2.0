import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.room_service import validate_chat_message

client = TestClient(app)

def test_validate_chat_message_unit():
    # Valid messages (including normal numbers with spaces, commas, or under 10 digits)
    valid_samples = [
        "Hello counsel, we agree with the terms.",
        "We agree to Section 2 clause 4 without penalty.",
        "Our legal counsel has reviewed the indemnity provision for 30 days.",
        "The settlement price is 500 dollars.",
        "The cap is $1,000,000.",
        "Can we schedule our session for next week at 3pm?",
        "Call me at 123 456 7890 please.", # Has spaces between numbers
        "Accepted without conditions."
    ]
    for s in valid_samples:
        valid, err = validate_chat_message(s)
        assert valid is True, f"Expected '{s}' to be valid, got err: {err}"
        assert err is None

    # Invalid: 10 integers written without spaces
    ten_digit_samples = [
        "Call me at 9876543210 immediately",
        "Phone: 1234567890",
        "My contact number is 9988776655",
        "Direct line 0123456789",
        "Account 123456789012"
    ]
    for s in ten_digit_samples:
        valid, err = validate_chat_message(s)
        assert valid is False, f"Expected '{s}' to be rejected for 10 integers without spaces"
        assert "Phone numbers are not permitted" in err

    # Invalid: URLs and URIs
    url_samples = [
        "Please review the draft at https://example.com",
        "Visit http://myfirm.org/terms",
        "Visit www.google.com for info",
        "Look at our portal on partner.ai/docs",
        "Check our link app://open-chamber",
        "Email me at mailto:counsel@firm.com",
        "Check ftp://files.legal.net",
        "See ws://stream.host",
        "Open file:///C:/docs/contract.pdf",
        "Check lawyer.com",
        "Read on policy.org",
    ]
    for s in url_samples:
        valid, err = validate_chat_message(s)
        assert valid is False, f"Expected '{s}' to be rejected for URLs/URIs"
        assert "URLs and URIs are not permitted" in err


def test_post_room_message_rejections():
    # 1. Create a test room
    create_res = client.post("/api/rooms", json={
        "creator_name": "Elena Rostova",
        "creator_role": "buyer",
        "title": "Chat Validation Policy Test Room"
    })
    assert create_res.status_code in (200, 201)
    room_data = create_res.json()
    room_id = room_data["room_id"]

    # 2. Try sending message with 10 integers without spaces
    num_res = client.post(f"/api/rooms/{room_id}/messages", json={
        "text": "Call me directly on 9876543210 for terms",
        "sender_role": "buyer",
        "sender_name": "Elena Rostova"
    })
    assert num_res.status_code == 400
    assert "Policy violation" in num_res.json()["detail"]
    assert "Phone numbers are not permitted" in num_res.json()["detail"]

    # 3. Try sending message with URL
    url_res = client.post(f"/api/rooms/{room_id}/messages", json={
        "text": "Check terms at https://firm.com/clauses",
        "sender_role": "buyer",
        "sender_name": "Elena Rostova"
    })
    assert url_res.status_code == 400
    assert "Policy violation" in url_res.json()["detail"]
    assert "URLs and URIs are not permitted" in url_res.json()["detail"]

    # 4. Try sending message with URI scheme
    uri_res = client.post(f"/api/rooms/{room_id}/messages", json={
        "text": "Open chamber via customuri://chamber/enter",
        "sender_role": "buyer",
        "sender_name": "Elena Rostova"
    })
    assert uri_res.status_code == 400
    assert "Policy violation" in uri_res.json()["detail"]
    assert "URLs and URIs are not permitted" in uri_res.json()["detail"]

    # 5. Send valid text message with regular negotiation numbers
    valid_res = client.post(f"/api/rooms/{room_id}/messages", json={
        "text": "We accept your counterproposal on Section 2 with 30 days notice.",
        "sender_role": "buyer",
        "sender_name": "Elena Rostova"
    })
    assert valid_res.status_code == 200
    assert valid_res.json()["status"] == "success"
    assert valid_res.json()["message"]["text"] == "We accept your counterproposal on Section 2 with 30 days notice."


def test_ws_room_message_rejections():
    # 1. Create a test room
    create_res = client.post("/api/rooms", json={
        "creator_name": "Elena Rostova",
        "creator_role": "buyer",
        "title": "WS Policy Test Room"
    })
    room_data = create_res.json()
    room_id = room_data["room_id"]
    creator_token = room_data["creator_token"]
    creator_id = room_data["creator_id"]

    # 2. Connect via WebSocket
    with client.websocket_connect(
        f"/ws/negotiation/{room_id}?token={creator_token}&participant_id={creator_id}&role=buyer&name=Elena+Rostova"
    ) as ws:
        # Receive connect / initial event
        init_evt = ws.receive_json()
        assert init_evt["type"] in ("participant_connected", "join")

        # 3. Send message with 10 integers without spaces -> expect error
        ws.send_json({
            "type": "message",
            "text": "Contact counsel at 9876543210"
        })
        err_evt = ws.receive_json()
        assert err_evt["type"] == "room_error"
        assert "Policy violation" in err_evt["error"]
        assert "Phone numbers are not permitted" in err_evt["error"]

        # 4. Send message with URL -> expect error
        ws.send_json({
            "type": "message",
            "text": "See draft on https://portal.site.com"
        })
        err_evt2 = ws.receive_json()
        assert err_evt2["type"] == "room_error"
        assert "Policy violation" in err_evt2["error"]
        assert "URLs and URIs are not permitted" in err_evt2["error"]

        # 5. Send valid message with normal numbers -> expect message event
        ws.send_json({
            "type": "message",
            "text": "We agree with Section 3 for 500 dollars."
        })
        ok_evt = ws.receive_json()
        assert ok_evt["type"] == "message"
        assert ok_evt["text"] == "We agree with Section 3 for 500 dollars."
