import os
import json
import logging
import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
CLIENTS_FILE = os.path.join(DATA_DIR, "clients.json")
MEETINGS_FILE = os.path.join(DATA_DIR, "meetings.json")

class ClientService:
    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        self._ensure_files()

    def _ensure_files(self):
        if not os.path.exists(CLIENTS_FILE):
            with open(CLIENTS_FILE, "w", encoding="utf-8") as f:
                json.dump([], f, indent=2)
        if not os.path.exists(MEETINGS_FILE):
            with open(MEETINGS_FILE, "w", encoding="utf-8") as f:
                json.dump([], f, indent=2)

    def _load_clients(self) -> List[Dict[str, Any]]:
        try:
            with open(CLIENTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading clients.json: {e}")
            return []

    def _save_clients(self, clients: List[Dict[str, Any]]):
        try:
            with open(CLIENTS_FILE, "w", encoding="utf-8") as f:
                json.dump(clients, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving clients.json: {e}")

    def _load_meetings(self) -> List[Dict[str, Any]]:
        try:
            with open(MEETINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading meetings.json: {e}")
            return []

    def _save_meetings(self, meetings: List[Dict[str, Any]]):
        try:
            with open(MEETINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(meetings, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving meetings.json: {e}")

    def get_clients(self) -> List[Dict[str, Any]]:
        clients = self._load_clients()
        meetings = self._load_meetings()
        
        # Enrich clients with meeting counts and last meeting time
        for c in clients:
            c_email = c["email"].lower()
            client_meetings = [m for m in meetings if m.get("client_email", "").lower() == c_email]
            c["meeting_count"] = len(client_meetings)
            if client_meetings:
                sorted_m = sorted(client_meetings, key=lambda x: x.get("timestamp", ""), reverse=True)
                c["last_meeting"] = sorted_m[0].get("timestamp")
            else:
                c["last_meeting"] = None
        return clients

    def get_client(self, email: str) -> Optional[Dict[str, Any]]:
        clients = self.get_clients()
        for c in clients:
            if c["email"].lower() == email.lower():
                return c
        return None

    def add_client(self, name: str, email: str, company: Optional[str] = "", notes: Optional[str] = "", phone: Optional[str] = "") -> Dict[str, Any]:
        clients = self._load_clients()
        email_clean = email.strip().lower()

        # Check if client already exists
        for c in clients:
            if c["email"].lower() == email_clean:
                # Update existing client details
                c["name"] = name.strip() or c["name"]
                c["company"] = company.strip() if company is not None else c.get("company", "")
                c["notes"] = notes.strip() if notes is not None else c.get("notes", "")
                c["phone"] = phone.strip() if phone is not None else c.get("phone", "")
                self._save_clients(clients)
                return c

        new_client = {
            "id": f"client_{int(datetime.datetime.now().timestamp())}",
            "name": name.strip(),
            "email": email_clean,
            "company": (company or "").strip(),
            "notes": (notes or "").strip(),
            "phone": (phone or "").strip(),
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "meeting_count": 0,
            "last_meeting": None
        }
        clients.append(new_client)
        self._save_clients(clients)
        return new_client

    def delete_client(self, email: str) -> bool:
        clients = self._load_clients()
        initial_len = len(clients)
        clients = [c for c in clients if c["email"].lower() != email.strip().lower()]
        if len(clients) < initial_len:
            self._save_clients(clients)
            return True
        return False

    def save_meeting(
        self,
        meeting_id: str,
        client_email: str,
        client_name: Optional[str] = "",
        title: Optional[str] = "",
        captions: Optional[List[Dict[str, Any]]] = None,
        user_notes: Optional[str] = "",
        summary: Optional[str] = "",
        promises_by_us: Optional[List[str]] = None,
        promises_by_them: Optional[List[str]] = None,
        open_followups: Optional[List[str]] = None,
        note_discrepancies: Optional[List[str]] = None,
        suggested_followup_date: Optional[str] = None
    ) -> Dict[str, Any]:
        meetings = self._load_meetings()
        email_clean = client_email.strip().lower()

        # If client does not exist in clients list, automatically create them!
        client = self.get_client(email_clean)
        if not client:
            derived_name = client_name or email_clean.split("@")[0].replace(".", " ").title()
            self.add_client(name=derived_name, email=email_clean)

        meeting_record = {
            "meeting_id": meeting_id,
            "client_email": email_clean,
            "client_name": client_name or (client["name"] if client else email_clean),
            "title": title or f"Meeting with {client_name or email_clean}",
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "captions": captions or [],
            "caption_count": len(captions or []),
            "user_notes": user_notes or "",
            "summary": summary or "",
            "promises_by_us": promises_by_us or [],
            "promises_by_them": promises_by_them or [],
            "open_followups": open_followups or [],
            "note_discrepancies": note_discrepancies or [],
            "suggested_followup_date": suggested_followup_date
        }

        # Check if meeting already exists (update it)
        existing_idx = next((i for i, m in enumerate(meetings) if m.get("meeting_id") == meeting_id), None)
        if existing_idx is not None:
            meetings[existing_idx] = meeting_record
        else:
            meetings.insert(0, meeting_record)

        self._save_meetings(meetings)
        return meeting_record

    def get_meetings_for_client(self, client_email: str) -> List[Dict[str, Any]]:
        meetings = self._load_meetings()
        email_clean = client_email.strip().lower()
        client_meetings = [m for m in meetings if m.get("client_email", "").lower() == email_clean]
        return sorted(client_meetings, key=lambda x: x.get("timestamp", ""), reverse=True)

    def get_all_meetings(self) -> List[Dict[str, Any]]:
        meetings = self._load_meetings()
        return sorted(meetings, key=lambda x: x.get("timestamp", ""), reverse=True)

    def get_meeting(self, meeting_id: str) -> Optional[Dict[str, Any]]:
        meetings = self._load_meetings()
        for m in meetings:
            if m.get("meeting_id") == meeting_id:
                return m
        return None

client_service = ClientService()
