import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.hindsight_service import hindsight_service
from app.services.llm_service import llm_service, MeetingAnalysis
from app.services.calendar_service import calendar_service
from app.services.session_service import session_service
from app.services.client_service import client_service

logger = logging.getLogger(__name__)

router = APIRouter()

# -------------------------------------------------------------
# Request & Response Schemas
# -------------------------------------------------------------

class StreamCaptionRequest(BaseModel):
    meeting_id: str = Field(description="Google Meet meeting code or identifier")
    speaker: str = Field(default="Participant", description="Speaker name")
    text: str = Field(description="Spoken caption sentence")
    timestamp: Optional[str] = Field(default=None, description="ISO timestamp")

class StreamNotesRequest(BaseModel):
    meeting_id: str
    user_notes: str

class PrepRequest(BaseModel):
    user_id: str = Field(default="default-user", description="Identifier for user / account")
    attendee_email: str = Field(description="Email of the upcoming meeting attendee to recall context for")

class PrepResponse(BaseModel):
    user_id: str
    attendee_email: str
    briefing: str
    memories_found: int
    bank_id: str

class CompleteMeetingRequest(BaseModel):
    user_id: str = Field(default="default-user")
    attendee_email: str
    transcript: str = Field(description="Raw spoken transcript lines captured from Google Meet captions")
    user_notes: str = Field(default="", description="Interactive scratchpad notes typed by the user")
    meeting_id: Optional[str] = Field(default=None, description="Google Meet meeting code or identifier")

class CompleteMeetingResponse(BaseModel):
    meeting_id: str
    attendee_email: str
    analysis: MeetingAnalysis
    hindsight_retention: Dict[str, Any]
    suggested_action: Dict[str, Any]

class ScheduleEventRequest(BaseModel):
    summary: str = Field(description="Title of follow-up meeting")
    description: Optional[str] = Field(default="", description="Agenda or description auto-filled from commitments")
    start_time: Optional[str] = Field(default=None, description="ISO 8601 start time")
    end_time: Optional[str] = Field(default=None, description="ISO 8601 end time")
    attendees: List[str] = Field(default_factory=list, description="List of attendee email addresses")

class ScheduleEventResponse(BaseModel):
    status: str
    event_id: str
    html_link: Optional[str] = None
    meet_link: Optional[str] = None
    event: Dict[str, Any]

class CreateClientRequest(BaseModel):
    name: str
    email: str
    company: Optional[str] = ""
    notes: Optional[str] = ""
    phone: Optional[str] = ""

# -------------------------------------------------------------
# Ingestion & Streaming Endpoints (Chrome Extension -> Backend -> Web App)
# -------------------------------------------------------------

@router.post("/stream/caption")
def ingest_stream_caption(req: StreamCaptionRequest):
    """
    Ingests live spoken captions from Chrome Extension MutationObserver scraper.
    Buffers dialogue chunks for real-time Web Dashboard display.
    """
    try:
        caption = session_service.add_caption(
            meeting_id=req.meeting_id,
            speaker=req.speaker,
            text=req.text,
            timestamp=req.timestamp
        )
        return {
            "status": "ingested",
            "meeting_id": req.meeting_id,
            "caption": caption
        }
    except Exception as e:
        logger.error(f"Error ingesting stream caption: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stream/notes")
def update_stream_notes(req: StreamNotesRequest):
    """
    Allows simultaneous real-time notes feeding from the Web App scratchpad.
    """
    try:
        updated = session_service.update_notes(req.meeting_id, req.user_notes)
        return {"status": "saved", "meeting_id": req.meeting_id, "user_notes": updated}
    except Exception as e:
        logger.error(f"Error updating stream notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stream/session/{meeting_id}")
def get_stream_session(meeting_id: str):
    """
    Fetches real-time streamed dialogue and current scratchpad notes for a meeting.
    """
    session = session_service.get_session(meeting_id)
    if not session:
        # Create empty placeholder session
        session = session_service.get_or_create_session(meeting_id).to_dict()
    return session

@router.get("/stream/active")
def get_active_meeting_stream():
    """
    Returns the currently active live meeting streamed from the Chrome extension.
    """
    active = session_service.get_active_session()
    return active or {"status": "idle", "captions": [], "user_notes": ""}

@router.post("/stream/end")
def end_meeting_stream(meeting_id: str = Query(...)):
    """
    Signals disconnect/wrap from Google Meet tab when user exits.
    """
    ended = session_service.end_session(meeting_id)
    return {"status": "ended", "session": ended}

# -------------------------------------------------------------
# Calendar & Pre-Call Intelligence Endpoints
# -------------------------------------------------------------

@router.get("/calendar/today")
def get_todays_calendar():
    """
    Lists today's scheduled calls from Google Calendar API.
    Used by Web Dashboard View 1 (Upcoming Schedule & Briefing Cards).
    """
    try:
        events = calendar_service.get_todays_meetings()
        return {
            "count": len(events),
            "events": events
        }
    except Exception as e:
        logger.error(f"Error fetching today's calendar: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/calendar/upcoming")
def get_upcoming_meetings(window_minutes: int = Query(default=15, description="Minutes window to look ahead")):
    """
    Returns calendar meetings starting within the specified window (default 15 mins).
    """
    try:
        events = calendar_service.check_upcoming_meetings(window_minutes=window_minutes)
        return {
            "window_minutes": window_minutes,
            "count": len(events),
            "events": events
        }
    except Exception as e:
        logger.error(f"Error checking upcoming meetings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/meetings/prep", response_model=PrepResponse)
def prepare_meeting_brief(req: PrepRequest):
    """
    Recalls Hindsight memory context for an attendee and returns a briefing.
    Queries Hindsight bank with budget="mid":
    'What was discussed, promised, or left unresolved with {attendee_email}?'
    """
    try:
        result = hindsight_service.recall_prep_context(
            user_id=req.user_id,
            attendee_email=req.attendee_email
        )
        return PrepResponse(
            user_id=req.user_id,
            attendee_email=req.attendee_email,
            briefing=result["briefing"],
            memories_found=result.get("count", 0),
            bank_id=result.get("bank_id", "")
        )
    except Exception as e:
        logger.error(f"Error recalling prep context from Hindsight: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------------------------------------------
# Post-Meeting Intelligence & Retention Endpoints
# -------------------------------------------------------------

@router.post("/meetings/complete", response_model=CompleteMeetingResponse)
def complete_meeting(req: CompleteMeetingRequest):
    """
    Ingests spoken transcript + user notes, runs LLM synthesis to extract promises,
    milestones, open questions, and discrepancies, stores memories in Hindsight,
    and returns follow-up suggestions for calendar scheduling.
    """
    meeting_id = req.meeting_id or f"meet-{int(import_time())}"

    try:
        # 1. LLM Ingestion & Synthesis Engine
        analysis = llm_service.synthesize_meeting(
            transcript=req.transcript,
            user_notes=req.user_notes,
            attendee_email=req.attendee_email
        )

        # 2. Retain meeting memory into Vectorize Hindsight
        memory_content = (
            f"Meeting with {req.attendee_email} (ID: {meeting_id}).\n"
            f"Summary: {analysis.summary}\n"
            f"Promises by Us: {', '.join(analysis.promises_by_us) if analysis.promises_by_us else 'None'}\n"
            f"Promises by Them: {', '.join(analysis.promises_by_them) if analysis.promises_by_them else 'None'}\n"
            f"Pending Follow-ups: {', '.join(analysis.missed_or_pending_followups) if analysis.missed_or_pending_followups else 'None'}\n"
            f"Note Discrepancies: {', '.join(analysis.note_discrepancies) if analysis.note_discrepancies else 'None'}\n"
            f"Raw Notes: {req.user_notes}\n"
        )

        retention_result = hindsight_service.retain_meeting_memory(
            user_id=req.user_id,
            attendee_email=req.attendee_email,
            content=memory_content,
            meeting_id=meeting_id
        )

        # Fetch structured captions captured from Chrome extension
        live_session = session_service.get_session(meeting_id)
        captions_list = live_session.get("captions", []) if live_session else []

        # Save meeting & full extension transcript to client service
        client_service.save_meeting(
            meeting_id=meeting_id,
            client_email=req.attendee_email,
            title=live_session.get("title") if (live_session and live_session.get("title")) else f"Meeting with {req.attendee_email}",
            captions=captions_list,
            user_notes=req.user_notes,
            summary=analysis.summary,
            promises_by_us=analysis.promises_by_us,
            promises_by_them=analysis.promises_by_them,
            open_followups=analysis.missed_or_pending_followups,
            note_discrepancies=analysis.note_discrepancies,
            suggested_followup_date=analysis.suggested_followup_date
        )

        # Mark meeting stream session as completed
        session_service.end_session(meeting_id)

        # 3. Action suggestions
        suggested_agenda = []
        if analysis.promises_by_us:
            suggested_agenda.append("Our commitments: " + "; ".join(analysis.promises_by_us))
        if analysis.promises_by_them:
            suggested_agenda.append("Their commitments: " + "; ".join(analysis.promises_by_them))
        if analysis.missed_or_pending_followups:
            suggested_agenda.append("Unresolved items: " + "; ".join(analysis.missed_or_pending_followups))

        suggested_action = {
            "title": f"Follow-up with {req.attendee_email}",
            "suggested_date": analysis.suggested_followup_date,
            "attendees": [req.attendee_email],
            "agenda": "\n".join(suggested_agenda)
        }

        # 4. Dispatch action items to n8n Google Sheets webhook if configured
        n8n_tasks_url = settings.N8N_SYNC_TASKS_WEBHOOK_URL
        if n8n_tasks_url:
            try:
                import httpx
                action_items_list = []
                for p in analysis.promises_by_us:
                    action_items_list.append({
                        "task": p,
                        "owner": "Host",
                        "due_date": analysis.suggested_followup_date or "TBD"
                    })
                for p in analysis.promises_by_them:
                    action_items_list.append({
                        "task": p,
                        "owner": req.attendee_email,
                        "due_date": analysis.suggested_followup_date or "TBD"
                    })
                for p in analysis.missed_or_pending_followups:
                    action_items_list.append({
                        "task": p,
                        "owner": "Follow-up",
                        "due_date": analysis.suggested_followup_date or "TBD"
                    })

                if action_items_list:
                    n8n_task_payload = {
                        "summary": analysis.summary or f"Meeting notes with {req.attendee_email}",
                        "action_items": action_items_list
                    }
                    with httpx.Client(timeout=15.0, verify=False) as client:
                        task_resp = client.post(n8n_tasks_url, json=n8n_task_payload)
                        logger.info(f"n8n sync-tasks webhook response: HTTP {task_resp.status_code}")
            except Exception as task_err:
                logger.error(f"Error triggering n8n sync-tasks webhook: {task_err}")

        return CompleteMeetingResponse(
            meeting_id=meeting_id,
            attendee_email=req.attendee_email,
            analysis=analysis,
            hindsight_retention=retention_result,
            suggested_action=suggested_action
        )

    except Exception as e:
        logger.error(f"Error completing meeting analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/calendar/schedule", response_model=ScheduleEventResponse)
def schedule_calendar_event(req: ScheduleEventRequest):
    """
    Inserts a confirmed follow-up event into Google Calendar via Google Calendar API,
    with agenda auto-filled from open action items and commitments.
    """
    try:
        event_payload = {
            "summary": req.summary,
            "description": req.description,
            "start_time": req.start_time,
            "end_time": req.end_time,
            "attendees": req.attendees
        }
        res = calendar_service.schedule_followup(event_payload)
        return ScheduleEventResponse(
            status=res.get("status", "confirmed"),
            event_id=res.get("event_id", ""),
            html_link=res.get("html_link"),
            meet_link=res.get("meet_link"),
            event=res.get("event", {})
        )
    except Exception as e:
        logger.error(f"Error scheduling Google Calendar event: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------------------------------------------
# Client & Past Meetings with Extension Transcripts Endpoints
# -------------------------------------------------------------

@router.get("/clients")
def list_clients():
    """Lists all saved clients with meeting counts and last meeting time."""
    return {"clients": client_service.get_clients()}

@router.post("/clients")
def create_client(req: CreateClientRequest):
    """Adds a new client or updates an existing client by email."""
    client = client_service.add_client(
        name=req.name,
        email=req.email,
        company=req.company,
        notes=req.notes,
        phone=req.phone
    )
    return {"status": "created", "client": client}

@router.delete("/clients/{client_email}")
def delete_client(client_email: str):
    """Deletes a client from the system."""
    success = client_service.delete_client(client_email)
    return {"status": "deleted" if success else "not_found"}

@router.get("/clients/{client_email}/meetings")
def get_client_meetings(client_email: str):
    """
    Returns all past meetings for a specific client, complete with
    spoken transcripts captured from the Chrome extension, notes, and AI summaries.
    """
    meetings = client_service.get_meetings_for_client(client_email)
    return {"client_email": client_email, "count": len(meetings), "meetings": meetings}

@router.get("/meetings")
def get_all_meetings():
    """Returns all past meetings across all clients."""
    meetings = client_service.get_all_meetings()
    return {"count": len(meetings), "meetings": meetings}

@router.get("/meetings/{meeting_id}")
def get_meeting_details(meeting_id: str):
    """Returns single meeting details with full dialogue transcript."""
    meeting = client_service.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"meeting": meeting}

# -------------------------------------------------------------
# Contact History & Hindsight Dossier Endpoints
# -------------------------------------------------------------

@router.get("/contacts")
def list_contacts(user_id: str = Query(default="alex@example.com")):
    """
    Returns list of contacts tracked in the user's Hindsight memory bank.
    Used by Web Dashboard View 4 (Contact History / Hindsight Dossier).
    """
    try:
        contacts = hindsight_service.list_tracked_contacts(user_id=user_id)
        return {"count": len(contacts), "contacts": contacts}
    except Exception as e:
        logger.error(f"Error listing contacts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/contacts/{attendee_email}/dossier")
def get_contact_dossier(attendee_email: str, user_id: str = Query(default="alex@example.com")):
    """
    Returns complete cumulative dossier, memories, and timeline logs saved in Hindsight Cloud.
    """
    try:
        dossier = hindsight_service.get_contact_dossier(user_id=user_id, attendee_email=attendee_email)
        return dossier
    except Exception as e:
        logger.error(f"Error fetching contact dossier: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
def health_check():
    """Health status and diagnostic checks."""
    return {
        "status": "healthy",
        "hindsight": hindsight_service.get_status(),
        "calendar_connected": calendar_service.service is not None,
        "llm_provider": "Google Gemini" if llm_service.gemini_client else "Rule-based Fallback",
        "active_stream": session_service.get_active_session() is not None
    }

def import_time():
    import time
    return time.time()
