import pytest
from app.services.hindsight_service import HindsightService, DEFAULT_DISPOSITION, MISSION_STATEMENT

def test_bank_creation_and_disposition():
    """Verify that get_or_create_bank initializes bank with correct mission and disposition."""
    service = HindsightService()
    user_id = "test_alex@example.com"
    bank_id = service.get_or_create_bank(user_id)

    assert bank_id.startswith("bank_")
    assert "test_alex" in bank_id

    bank_config = service.banks_config[bank_id]
    assert bank_config["mission"] == MISSION_STATEMENT
    assert bank_config["disposition"] == {"literalism": 4, "skepticism": 2, "empathy": 3}

def test_hindsight_retention_and_recall_cycle():
    """
    Unit test that retains a sample past meeting:
    'Sarah agreed to send pricing tiers by Friday'
    and verifies that recall retrieves this context when queried with Sarah's email.
    """
    service = HindsightService()
    user_id = "alex@example.com"
    attendee_email = "sarah.connor@acme.org"
    meeting_id = "meet-test-101"
    
    past_meeting_content = (
        "Project Kickoff Meeting with Sarah Connor.\n"
        "Sarah agreed to send pricing tiers by Friday afternoon.\n"
        "Alex will prepare the API authentication specification."
    )

    # 1. Retain memory
    retention_result = service.retain_meeting_memory(
        user_id=user_id,
        attendee_email=attendee_email,
        content=past_meeting_content,
        meeting_id=meeting_id
    )

    assert retention_result["status"] == "retained"
    assert retention_result["bank_id"].startswith("bank_")
    assert "document_id" in retention_result
    assert retention_result["metadata"]["attendee_email"] == attendee_email

    # 2. Recall memory with attendee email
    recall_result = service.recall_prep_context(
        user_id=user_id,
        attendee_email=attendee_email
    )

    assert recall_result["attendee_email"] == attendee_email
    assert recall_result["count"] >= 1
    assert "Sarah agreed to send pricing tiers by Friday" in recall_result["briefing"]
    assert "pricing tiers" in recall_result["memories"][0]

def test_recall_for_unknown_attendee():
    """Verify clean handling when no prior memories exist for attendee."""
    service = HindsightService()
    user_id = "alex@example.com"
    attendee_email = "new_stranger@unknowncorp.com"

    recall_result = service.recall_prep_context(user_id, attendee_email)
    assert recall_result["count"] == 0
    assert "No prior meetings recorded" in recall_result["briefing"]
