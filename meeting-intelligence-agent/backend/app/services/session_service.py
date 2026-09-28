import datetime
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

class MeetingSession:
    def __init__(self, meeting_id: str, title: Optional[str] = None):
        self.meeting_id = meeting_id
        self.title = title or f"Meeting {meeting_id}"
        self.start_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.captions: List[Dict[str, Any]] = []
        self.user_notes: str = ""
        self.attendees: List[str] = []
        self.status: str = "active" # active | completed
        self.last_updated = self.start_time

    def to_dict(self) -> Dict[str, Any]:
        return {
            "meeting_id": self.meeting_id,
            "title": self.title,
            "start_time": self.start_time,
            "status": self.status,
            "caption_count": len(self.captions),
            "captions": self.captions,
            "user_notes": self.user_notes,
            "attendees": self.attendees,
            "last_updated": self.last_updated
        }

class SessionService:
    def __init__(self):
        self._sessions: Dict[str, MeetingSession] = {}
        self._active_meeting_id: Optional[str] = None

    def seed_demo_session(self):
        demo_id = "meet-demo-sync"
        session = MeetingSession(meeting_id=demo_id, title="Strategy & Pricing Sync with Sarah Connor")
        session.attendees = ["sarah.connor@acme.org"]
        session.captions = [
            {
                "speaker": "Sarah Connor",
                "text": "Thanks for jumping on the call, Alex! We really like the architecture.",
                "timestamp": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10)).isoformat()
            },
            {
                "speaker": "Alex",
                "text": "Great to hear! I can send over the enterprise pricing sheet by Thursday 5 PM.",
                "timestamp": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=8)).isoformat()
            },
            {
                "speaker": "Sarah Connor",
                "text": "Thursday works even better. In return, I will send our standard security compliance questionnaire by tomorrow morning.",
                "timestamp": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=6)).isoformat()
            },
            {
                "speaker": "Alex",
                "text": "Perfect. Does next Tuesday at 2 PM work for a 30-minute sync to finalize the agreement?",
                "timestamp": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=4)).isoformat()
            },
            {
                "speaker": "Sarah Connor",
                "text": "Yes, next Tuesday 2 PM is locked in. Let's schedule that.",
                "timestamp": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=2)).isoformat()
            }
        ]
        session.user_notes = (
            "[Promise: I will deliver the updated enterprise pricing breakdown by Friday afternoon]\n"
            "[Decision: Agreed to use SSO SAML for user provisioning]\n"
            "[Action: Sarah needs to send over technical security questionnaire]\n"
            "Note: Need to confirm SLA commitments."
        )
        self._sessions[demo_id] = session
        self._active_meeting_id = demo_id

    def get_or_create_session(self, meeting_id: str) -> MeetingSession:
        if meeting_id not in self._sessions:
            self._sessions[meeting_id] = MeetingSession(meeting_id=meeting_id)
        self._active_meeting_id = meeting_id
        return self._sessions[meeting_id]

    def add_caption(self, meeting_id: str, speaker: str, text: str, timestamp: Optional[str] = None) -> Dict[str, Any]:
        session = self.get_or_create_session(meeting_id)
        ts = timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()
        caption_item = {
            "speaker": speaker or "Speaker",
            "text": text,
            "timestamp": ts
        }
        # Avoid duplicate consecutive identical captions
        if session.captions:
            last = session.captions[-1]
            if last["speaker"] == speaker and last["text"] == text:
                return last

        session.captions.append(caption_item)
        session.last_updated = ts
        return caption_item

    def update_notes(self, meeting_id: str, notes: str) -> str:
        session = self.get_or_create_session(meeting_id)
        session.user_notes = notes
        session.last_updated = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return session.user_notes

    def get_session(self, meeting_id: str) -> Optional[Dict[str, Any]]:
        session = self._sessions.get(meeting_id)
        return session.to_dict() if session else None

    def get_active_session(self) -> Optional[Dict[str, Any]]:
        if self._active_meeting_id and self._active_meeting_id in self._sessions:
            return self._sessions[self._active_meeting_id].to_dict()
        if self._sessions:
            # Return most recently updated
            sorted_s = sorted(self._sessions.values(), key=lambda s: s.last_updated, reverse=True)
            return sorted_s[0].to_dict()
        return None

    def end_session(self, meeting_id: str) -> Optional[Dict[str, Any]]:
        if meeting_id in self._sessions:
            session = self._sessions[meeting_id]
            session.status = "completed"
            session.last_updated = datetime.datetime.now(datetime.timezone.utc).isoformat()
            return session.to_dict()
        return None

    def list_sessions(self) -> List[Dict[str, Any]]:
        return [s.to_dict() for s in self._sessions.values()]

session_service = SessionService()
