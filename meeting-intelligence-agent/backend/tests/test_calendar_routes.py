import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.calendar_service import calendar_service

client = TestClient(app)

def test_calendar_upcoming_events():
    """Verify GET /api/calendar/upcoming returns events with Meet links and attendees."""
    response = client.get("/api/calendar/upcoming?window_minutes=15")
    assert response.status_code == 200
    data = response.json()
    assert "events" in data
    assert len(data["events"]) > 0
    event = data["events"][0]
    assert "summary" in event
    assert "hangoutLink" in event
    assert "attendees" in event

def test_calendar_schedule_followup_schema():
    """
    Verify scheduling follow-up aligns with Google Calendar events().insert schema.
    """
    payload = {
        "summary": "Q4 Strategy & Pricing Follow-up",
        "description": "User Deliverables: Send pricing tiers; Partner Deliverables: Security questionnaire",
        "start_time": "2026-10-06T14:00:00Z",
        "end_time": "2026-10-06T14:30:00Z",
        "attendees": ["sarah.connor@acme.org"]
    }

    # Test service directly
    result = calendar_service.schedule_followup(payload)
    assert result["status"] == "confirmed"
    assert "event_id" in result
    assert "meet_link" in result
    assert "https://meet.google.com/" in result["meet_link"]

    # Test via API endpoint
    response = client.post("/api/calendar/schedule", json=payload)
    assert response.status_code == 200
    api_data = response.json()
    assert api_data["status"] == "confirmed"
    assert api_data["event_id"] is not None

def test_end_to_end_meeting_flow():
    """
    Test full end-to-end cycle:
    1. GET /api/calendar/upcoming
    2. POST /api/meetings/prep
    3. POST /api/meetings/complete
    4. POST /api/calendar/schedule
    """
    # 1. Upcoming meetings
    cal_res = client.get("/api/calendar/upcoming")
    assert cal_res.status_code == 200

    # 2. Prep context
    prep_res = client.post("/api/meetings/prep", json={
        "user_id": "alex@example.com",
        "attendee_email": "sarah.connor@acme.org"
    })
    assert prep_res.status_code == 200
    assert "briefing" in prep_res.json()

    # 3. Complete meeting
    complete_res = client.post("/api/meetings/complete", json={
        "user_id": "alex@example.com",
        "attendee_email": "sarah.connor@acme.org",
        "transcript": "Alex: I will send the pricing sheet by Thursday.\nSarah: I will send the security questionnaire.",
        "user_notes": "[Promise: send pricing Friday]",
        "meeting_id": "meet-e2e-123"
    })
    assert complete_res.status_code == 200
    complete_data = complete_res.json()
    assert "analysis" in complete_data
    assert "hindsight_retention" in complete_data
    assert complete_data["hindsight_retention"]["status"] == "retained"

    # 4. Recall again to verify persistent memory
    prep_again = client.post("/api/meetings/prep", json={
        "user_id": "alex@example.com",
        "attendee_email": "sarah.connor@acme.org"
    })
    assert prep_again.status_code == 200
    assert prep_again.json()["memories_found"] >= 1
