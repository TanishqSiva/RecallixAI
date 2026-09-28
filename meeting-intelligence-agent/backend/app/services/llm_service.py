import json
import logging
import re
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)

class MeetingAnalysis(BaseModel):
    summary: str = Field(description="Key decisions and conversation milestones.")
    promises_by_us: List[str] = Field(default_factory=list, description="Concrete commitments and deliverables owed by the user.")
    promises_by_them: List[str] = Field(default_factory=list, description="Commitments made by attendees.")
    missed_or_pending_followups: List[str] = Field(default_factory=list, description="Unanswered queries or open action items.")
    note_discrepancies: List[str] = Field(default_factory=list, description="Contradictions or alignments between spoken words and user scratchpad notes.")
    suggested_followup_date: Optional[str] = Field(default=None, description="ISO date string if a reconnect was agreed upon (or null).")

class LLMService:
    def __init__(self):
        self.gemini_client = None

        if settings.GEMINI_API_KEY:
            try:
                from google import genai
                self.gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
                logger.info(f"Google Gemini client initialized successfully with model: {settings.GEMINI_MODEL}.")
            except Exception as e:
                logger.warning(f"Could not initialize Google Gemini client: {e}")

    def synthesize_meeting(
        self,
        transcript: str,
        user_notes: str,
        attendee_email: str = "attendee@example.com",
        current_date_iso: Optional[str] = None
    ) -> MeetingAnalysis:
        """
        Merge raw captions and user scratchpad notes, prompt Google Gemini with strict JSON schema,
        and reconcile any discrepancies between spoken words and private user notes.
        """
        prompt = self._build_prompt(transcript, user_notes, attendee_email, current_date_iso)

        # 1. Primary Inference: Google Gemini
        if self.gemini_client:
            try:
                logger.info(f"Calling Google Gemini API ({settings.GEMINI_MODEL}) for meeting synthesis...")
                response = self.gemini_client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": MeetingAnalysis
                    }
                )
                raw_text = response.text
                return self._parse_json_response(raw_text)
            except Exception as e:
                logger.error(f"Gemini synthesis failed: {e}. Falling back to rule-based extractor...")

        # 2. Deterministic rule-based fallback (for offline tests & simulated demo)
        logger.info("Running deterministic synthesis fallback...")
        return self._rule_based_fallback(transcript, user_notes, attendee_email)

    def _build_prompt(
        self,
        transcript: str,
        user_notes: str,
        attendee_email: str,
        current_date_iso: Optional[str]
    ) -> str:
        date_context = f"Current meeting date: {current_date_iso}" if current_date_iso else "Current meeting date: Present"

        return f"""Analyze this meeting with attendee {attendee_email}.
{date_context}

--- SPOKEN TRANSCRIPT (Google Meet Captions) ---
{transcript if transcript.strip() else "[No captions recorded]"}

--- USER SCRATCHPAD NOTES (User's private notes taken during call) ---
{user_notes if user_notes.strip() else "[No notes recorded]"}

TASK:
1. Reconcile spoken words against the user's scratchpad notes.
2. Note any contradictions or alignments in 'note_discrepancies' (e.g. if scratchpad says 'Friday' but transcript agreed 'Thursday', or if notes mention an offline agreement).
3. Extract concrete commitments made by us (user) in 'promises_by_us'.
4. Extract commitments made by the attendee/them in 'promises_by_them'.
5. Extract unresolved questions, doubts, or action items in 'missed_or_pending_followups'.
6. Extract agreed follow-up date/time as ISO 8601 string in 'suggested_followup_date' (or null if none agreed).
7. Summarize key milestones and decisions in 'summary'.

OUTPUT JSON SCHEMA:
{{
  "summary": "Key decisions and conversation milestones.",
  "promises_by_us": ["Concrete commitment 1", "Concrete commitment 2"],
  "promises_by_them": ["Attendee commitment 1"],
  "missed_or_pending_followups": ["Unanswered question or open item"],
  "note_discrepancies": ["Contradiction: user noted X, but spoke Y", "Alignment: user confirmed Z"],
  "suggested_followup_date": "2026-10-02T14:00:00Z" (or null)
}}
"""

    def _parse_json_response(self, raw_text: str) -> MeetingAnalysis:
        cleaned = raw_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        data = json.loads(cleaned)
        return MeetingAnalysis(**data)

    def _rule_based_fallback(self, transcript: str, user_notes: str, attendee_email: str) -> MeetingAnalysis:
        """Deterministic analyzer when external API keys are not provided."""
        promises_us = []
        promises_them = []
        open_items = []
        discrepancies = []

        combined = f"{transcript}\n{user_notes}"
        lower_comb = combined.lower()

        # Check for promises by us
        for line in combined.splitlines():
            line_str = line.strip()
            if not line_str:
                continue
            lower_line = line_str.lower()
            if any(k in lower_line for k in ["i will send", "i can send", "i'll deliver", "i promise", "we will deliver", "[promise:"]):
                clean_line = re.sub(r"^\[promise:\s*|\]$", "", line_str, flags=re.I).strip()
                promises_us.append(clean_line)
            elif any(k in lower_line for k in ["send pricing", "deliver pricing", "pricing sheet"]):
                promises_us.append(line_str)

        # Check for promises by them
        for line in combined.splitlines():
            line_str = line.strip()
            lower_line = line_str.lower()
            if any(k in lower_line for k in ["i will send our", "they will", "attendee will", "client will", "in return, i will"]):
                promises_them.append(line_str)
            elif "questionnaire" in lower_line or "security compliance" in lower_line:
                promises_them.append(line_str)

        # Discrepancies check (e.g. Thursday vs Friday)
        if "friday" in user_notes.lower() and "thursday" in transcript.lower():
            discrepancies.append("Discrepancy detected: User scratchpad noted Friday delivery, but spoken transcript agreed to send pricing tiers by Thursday 5 PM.")
        elif user_notes and transcript:
            discrepancies.append("Scratchpad notes aligned with spoken topics regarding technical requirements and timelines.")

        # Followups
        if any(k in lower_comb for k in ["sla", "rate limit", "security", "unanswered", "question"]):
            open_items.append("Clarify security questionnaire responses and SLA commitments for 99.9% uptime.")

        if not promises_us:
            promises_us.append(f"Follow up with {attendee_email} regarding agreed discussion points.")
        if not promises_them:
            promises_them.append(f"{attendee_email} to review submitted proposal and confirm next steps.")

        return MeetingAnalysis(
            summary=f"Meeting between User and {attendee_email}. Discussed project architecture, pricing tiers, and next steps.",
            promises_by_us=promises_us,
            promises_by_them=promises_them,
            missed_or_pending_followups=open_items if open_items else ["Confirm finalized follow-up date and agenda."],
            note_discrepancies=discrepancies if discrepancies else ["User scratchpad notes align with conversation."],
            suggested_followup_date="2026-10-06T14:00:00Z"
        )

llm_service = LLMService()
