import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_serve_dashboard_page():
    """Verify that root / and /dashboard serve the web application dashboard HTML."""
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "Meeting Intelligence Agent - Central Dashboard" in res_root.text

    res_dash = client.get("/dashboard")
    assert res_dash.status_code == 200
    assert "Meeting Intel" in res_dash.text

def test_stream_caption_and_notes_ingestion():
    """
    Verify simultaneous real-time feeding:
    - Companion extension streams caption chunks to /api/stream/caption
    - Web app scratchpad syncs user notes to /api/stream/notes
    """
    meeting_id = "test-stream-room-99"

    # 1. Extension streams dialogue
    cap_res = client.post("/api/stream/caption", json={
        "meeting_id": meeting_id,
        "speaker": "Elena Fisher",
        "text": "We will finalize the data security SLA by tomorrow."
    })
    assert cap_res.status_code == 200
    assert cap_res.json()["status"] == "ingested"

    # 2. Web App updates scratchpad notes
    notes_res = client.post("/api/stream/notes", json={
        "meeting_id": meeting_id,
        "user_notes": "[Promise: send NDA to Elena]"
    })
    assert notes_res.status_code == 200
    assert notes_res.json()["status"] == "saved"

    # 3. Retrieve stream session
    session_res = client.get(f"/api/stream/session/{meeting_id}")
    assert session_res.status_code == 200
    data = session_res.json()
    assert data["meeting_id"] == meeting_id
    assert len(data["captions"]) >= 1
    assert data["captions"][0]["speaker"] == "Elena Fisher"
    assert data["user_notes"] == "[Promise: send NDA to Elena]"

def test_todays_calendar_and_contact_dossier():
    """
    Verify today's schedule retrieval and Hindsight contact dossier endpoints.
    """
    # Today's calendar
    cal_res = client.get("/api/calendar/today")
    assert cal_res.status_code == 200
    assert "events" in cal_res.json()
    assert len(cal_res.json()["events"]) >= 1

    # Contacts list
    contacts_res = client.get("/api/contacts?user_id=alex@example.com")
    assert contacts_res.status_code == 200
    contacts_data = contacts_res.json()
    assert "contacts" in contacts_data
    assert len(contacts_data["contacts"]) >= 1

    # Contact Dossier
    first_contact = contacts_data["contacts"][0]["email"]
    dossier_res = client.get(f"/api/contacts/{first_contact}/dossier?user_id=alex@example.com")
    assert dossier_res.status_code == 200
    dossier_data = dossier_res.json()
    assert "briefing" in dossier_data
    assert "timeline" in dossier_data
