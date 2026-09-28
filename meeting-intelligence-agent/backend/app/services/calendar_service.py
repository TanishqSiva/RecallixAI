import datetime
import logging
import os
import uuid
from typing import List, Dict, Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

class CalendarService:
    def __init__(self):
        self.service = None
        self._init_client()
        # In-memory store for fallback/simulation mode
        self.simulated_events: List[Dict[str, Any]] = [
            {
                "id": "mock-event-1",
                "summary": "Project Sync with Sarah Connor",
                "description": "Discussing enterprise pricing tiers, SAML SSO integration, and roadmap.",
                "start": (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5)).isoformat(),
                "end": (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=35)).isoformat(),
                "hangoutLink": "https://meet.google.com/abc-defg-hij",
                "attendees": [
                    {"email": "alex@example.com", "displayName": "Alex (Host)"},
                    {"email": "sarah.connor@acme.org", "displayName": "Sarah Connor"}
                ],
                "status": "confirmed"
            }
        ]

    def _init_client(self):
        """Initializes Google Calendar API client using OAuth2 token if present."""
        token_path = settings.GOOGLE_CALENDAR_TOKEN_FILE
        creds_path = settings.GOOGLE_CALENDAR_CREDENTIALS_FILE

        if os.path.exists(token_path):
            try:
                from google.oauth2.credentials import Credentials
                from google.auth.transport.requests import Request
                from googleapiclient.discovery import build

                creds = Credentials.from_authorized_user_file(token_path, ["https://www.googleapis.com/auth/calendar"])
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                self.service = build("calendar", "v3", credentials=creds)
                logger.info("Google Calendar API client initialized successfully with OAuth token.")
            except Exception as e:
                logger.warning(f"Could not load Google Calendar token: {e}. Fallback to simulated mode.")
                self.service = None
        else:
            logger.info("No Google Calendar token found. Running in simulated / offline calendar mode.")

    def check_upcoming_meetings(self, window_minutes: int = 15) -> List[Dict[str, Any]]:
        """
        Detects upcoming events starting within the next window_minutes that have Google Meet links.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        window_end = now + datetime.timedelta(minutes=window_minutes)

        if self.service:
            try:
                events_result = self.service.events().list(
                    calendarId="primary",
                    timeMin=now.isoformat(),
                    timeMax=window_end.isoformat(),
                    singleEvents=True,
                    orderBy="startTime"
                ).execute()

                events = events_result.get("items", [])
                meet_events = []
                for event in events:
                    # Check for Google Meet link
                    hangout_link = event.get("hangoutLink") or ""
                    conference_data = event.get("conferenceData") or {}
                    
                    # Extract attendees
                    raw_attendees = event.get("attendees", [])
                    attendees = [{"email": a.get("email"), "displayName": a.get("displayName", "")} for a in raw_attendees]

                    start_time = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date")
                    end_time = event.get("end", {}).get("dateTime") or event.get("end", {}).get("date")

                    meet_events.append({
                        "id": event.get("id"),
                        "summary": event.get("summary", "Untitled Meeting"),
                        "description": event.get("description", ""),
                        "start": start_time,
                        "end": end_time,
                        "hangoutLink": hangout_link,
                        "attendees": attendees,
                        "status": event.get("status", "confirmed")
                    })
                return meet_events
            except Exception as e:
                logger.error(f"Error fetching Google Calendar events: {e}. Falling back to simulation.")

        # Fallback simulated events
        matching = []
        for ev in self.simulated_events:
            ev_start = datetime.datetime.fromisoformat(ev["start"])
            if now <= ev_start <= window_end or (ev_start <= now <= datetime.datetime.fromisoformat(ev["end"])):
                matching.append(ev)

        # If none matched window, return sample upcoming meeting for demonstration
        if not matching:
            demo_event = dict(self.simulated_events[0])
            demo_event["start"] = (now + datetime.timedelta(minutes=5)).isoformat()
            demo_event["end"] = (now + datetime.timedelta(minutes=35)).isoformat()
            matching.append(demo_event)

        return matching

    def get_todays_meetings(self) -> List[Dict[str, Any]]:
        """
        Retrieves all scheduled calls for today.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + datetime.timedelta(days=1)

        if self.service:
            try:
                events_result = self.service.events().list(
                    calendarId="primary",
                    timeMin=start_of_day.isoformat(),
                    timeMax=end_of_day.isoformat(),
                    singleEvents=True,
                    orderBy="startTime"
                ).execute()

                events = events_result.get("items", [])
                result = []
                for event in events:
                    raw_attendees = event.get("attendees", [])
                    attendees = [{"email": a.get("email"), "displayName": a.get("displayName", "")} for a in raw_attendees]
                    result.append({
                        "id": event.get("id"),
                        "summary": event.get("summary", "Untitled Meeting"),
                        "description": event.get("description", ""),
                        "start": event.get("start", {}).get("dateTime") or event.get("start", {}).get("date"),
                        "end": event.get("end", {}).get("dateTime") or event.get("end", {}).get("date"),
                        "hangoutLink": event.get("hangoutLink", ""),
                        "attendees": attendees,
                        "status": event.get("status", "confirmed")
                    })
                return result
            except Exception as e:
                logger.error(f"Error fetching today's Google Calendar events: {e}")

        # Simulated fallback list of today's schedule
        t1 = (now - datetime.timedelta(hours=2)).isoformat()
        t1_end = (now - datetime.timedelta(hours=1, minutes=30)).isoformat()
        t2 = (now + datetime.timedelta(minutes=15)).isoformat()
        t2_end = (now + datetime.timedelta(minutes=45)).isoformat()
        t3 = (now + datetime.timedelta(hours=3)).isoformat()
        t3_end = (now + datetime.timedelta(hours=3, minutes=45)).isoformat()

        return [
            {
                "id": "cal-today-1",
                "summary": "Enterprise Pricing & Architecture Sync",
                "description": "Deep-dive with Sarah Connor on enterprise pricing tiers, VPC architecture, and compliance.",
                "start": t2,
                "end": t2_end,
                "hangoutLink": "https://meet.google.com/abc-defg-hij",
                "attendees": [
                    {"email": "alex@example.com", "displayName": "Alex (Host)"},
                    {"email": "sarah.connor@acme.org", "displayName": "Sarah Connor"}
                ],
                "status": "confirmed"
            },
            {
                "id": "cal-today-2",
                "summary": "API Integration Kickoff",
                "description": "Review webhook schemas and rate limiting policies with Marcus Wright.",
                "start": t3,
                "end": t3_end,
                "hangoutLink": "https://meet.google.com/klm-nopq-rst",
                "attendees": [
                    {"email": "alex@example.com", "displayName": "Alex (Host)"},
                    {"email": "marcus.wright@cyberdyne.io", "displayName": "Marcus Wright"}
                ],
                "status": "confirmed"
            }
        ]

    def schedule_followup(self, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Schedules a confirmed follow-up meeting using service.events().insert().
        Auto-fills agenda, attendees, and requests Google Meet conference data.
        """
        summary = event_data.get("summary", "Meeting Follow-up")
        description = event_data.get("description", "Follow-up meeting generated by Meeting Intelligence Agent.")
        start_time = event_data.get("start_time")
        end_time = event_data.get("end_time")
        attendee_emails = event_data.get("attendees", [])

        # Default times if missing
        if not start_time:
            start_dt = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3, hours=2)
            start_time = start_dt.isoformat()
        if not end_time:
            end_dt = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00")) + datetime.timedelta(minutes=30)
            end_time = end_dt.isoformat()

        body = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start_time},
            "end": {"dateTime": end_time},
            "attendees": [{"email": email} for email in attendee_emails],
            "conferenceData": {
                "createRequest": {
                    "requestId": f"meet-{uuid.uuid4().hex[:10]}",
                    "conferenceSolutionKey": {"type": "hangoutsMeet"}
                }
            }
        }

        if self.service:
            try:
                created_event = self.service.events().insert(
                    calendarId="primary",
                    body=body,
                    conferenceDataVersion=1
                ).execute()

                logger.info(f"Event created successfully in Google Calendar: {created_event.get('id')}")
                result = {
                    "status": "confirmed",
                    "event_id": created_event.get("id"),
                    "html_link": created_event.get("htmlLink"),
                    "meet_link": created_event.get("hangoutLink"),
                    "event": created_event
                }
            except Exception as e:
                logger.error(f"Failed to insert event via Google Calendar API: {e}. Returning simulated result.")
                result = None
        else:
            result = None

        if result is None:
            # Fallback simulation
            sim_id = f"evt-{uuid.uuid4().hex[:8]}"
            meet_code = f"{uuid.uuid4().hex[:3]}-{uuid.uuid4().hex[:4]}-{uuid.uuid4().hex[:3]}"
            created_sim = {
                "id": sim_id,
                "summary": summary,
                "description": description,
                "start": start_time,
                "end": end_time,
                "attendees": [{"email": e} for e in attendee_emails],
                "hangoutLink": f"https://meet.google.com/{meet_code}",
                "htmlLink": f"https://calendar.google.com/calendar/r/eventedit/{sim_id}",
                "status": "confirmed"
            }
            self.simulated_events.append(created_sim)

            result = {
                "status": "confirmed",
                "event_id": sim_id,
                "html_link": created_sim["htmlLink"],
                "meet_link": created_sim["hangoutLink"],
                "event": created_sim
            }

        # Dispatch to n8n Book a Meeting webhook if configured
        webhook_url = settings.N8N_CREATE_MEETING_WEBHOOK_URL or settings.N8N_WEBHOOK_URL
        if webhook_url:
            try:
                import httpx
                primary_attendee = attendee_emails[0] if (attendee_emails and len(attendee_emails) > 0) else "someone@example.com"
                n8n_payload = {
                    "title": summary,
                    "start_time": start_time,
                    "end_time": end_time,
                    "attendee_email": primary_attendee,
                    "agenda_notes": description
                }
                with httpx.Client(timeout=15.0, verify=False) as client:
                    resp = client.post(webhook_url, json=n8n_payload)
                    logger.info(f"n8n create-meeting webhook response: HTTP {resp.status_code}")
                    result["n8n_triggered"] = True
                    result["n8n_status_code"] = resp.status_code
                    if resp.status_code in [200, 201]:
                        try:
                            n8n_data = resp.json()
                            if isinstance(n8n_data, dict):
                                meet = n8n_data.get("meetLink") or n8n_data.get("meet_link") or n8n_data.get("hangoutLink")
                                event_url = n8n_data.get("eventLink") or n8n_data.get("html_link") or n8n_data.get("htmlLink")
                                if meet:
                                    result["meet_link"] = meet
                                if event_url:
                                    result["html_link"] = event_url
                                if n8n_data.get("eventId"):
                                    result["event_id"] = n8n_data.get("eventId")
                                result["confirmation_email_sent"] = n8n_data.get("confirmationEmailSent", False)
                        except Exception:
                            pass
            except Exception as webhook_err:
                logger.error(f"Error triggering n8n create-meeting webhook: {webhook_err}")
                result["n8n_triggered"] = False

        return result

calendar_service = CalendarService()
