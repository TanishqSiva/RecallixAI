import pytest
from app.services.llm_service import LLMService, MeetingAnalysis

def test_llm_pipeline_extraction_and_reconciliation():
    """
    Feeds a synthetic transcript and manual user notes to ensure correct extraction
    of promises, discrepancies, and suggested dates in JSON format matching MeetingAnalysis.
    """
    service = LLMService()

    synthetic_transcript = """
Sarah Connor: Hello Alex, good to see you again.
Alex: Hi Sarah! So we agreed earlier on the architecture. I can send over the enterprise pricing sheet by Thursday 5 PM.
Sarah Connor: Great. In return, I will send our standard security compliance questionnaire by tomorrow morning.
Alex: Perfect. What about the 99.9% SLA commitment?
Sarah Connor: Let's discuss that in our next call. Does next Tuesday at 2 PM work for you?
Alex: Yes, next Tuesday 2 PM works.
    """.strip()

    synthetic_user_notes = """
[Promise: I will deliver the updated enterprise pricing breakdown by Friday afternoon]
[Decision: Agreed to use SSO SAML for user provisioning]
[Action: Sarah needs to send over technical security questionnaire]
Question left open: SLA commitment for 99.9% uptime.
    """.strip()

    analysis = service.synthesize_meeting(
        transcript=synthetic_transcript,
        user_notes=synthetic_user_notes,
        attendee_email="sarah.connor@acme.org"
    )

    # 1. Verify schema type
    assert isinstance(analysis, MeetingAnalysis)

    # 2. Verify summary
    assert analysis.summary is not None
    assert len(analysis.summary) > 10

    # 3. Verify promises by us
    assert len(analysis.promises_by_us) > 0
    assert any("pricing" in p.lower() for p in analysis.promises_by_us)

    # 4. Verify promises by them
    assert len(analysis.promises_by_them) > 0
    assert any("questionnaire" in p.lower() or "compliance" in p.lower() for p in analysis.promises_by_them)

    # 5. Verify pending followups
    assert len(analysis.missed_or_pending_followups) > 0
    assert any("sla" in f.lower() or "agenda" in f.lower() or "confirm" in f.lower() for f in analysis.missed_or_pending_followups)

    # 6. Verify discrepancy detection between spoken words (Thursday) and user notes (Friday)
    assert len(analysis.note_discrepancies) > 0
    discrepancy_text = " ".join(analysis.note_discrepancies).lower()
    assert "friday" in discrepancy_text or "discrepancy" in discrepancy_text or "aligned" in discrepancy_text

    # 7. Verify suggested follow-up date
    assert analysis.suggested_followup_date is not None

def test_json_parsing_resilience():
    """Verify JSON parser handles code blocks, whitespace, and formatting gracefully."""
    service = LLMService()
    
    raw_markdown_json = """```json
{
  "summary": "Agreed on enterprise terms and contract duration.",
  "promises_by_us": ["Send signed MSA by Monday"],
  "promises_by_them": ["Provide API keys by Tuesday"],
  "missed_or_pending_followups": ["Review GDPR addendum"],
  "note_discrepancies": ["Notes matched conversation exactly"],
  "suggested_followup_date": "2026-10-05T15:00:00Z"
}
```"""

    parsed = service._parse_json_response(raw_markdown_json)
    assert parsed.summary == "Agreed on enterprise terms and contract duration."
    assert parsed.promises_by_us == ["Send signed MSA by Monday"]
    assert parsed.suggested_followup_date == "2026-10-05T15:00:00Z"
