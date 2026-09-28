import datetime
import logging
import time
from typing import Dict, Any, Optional, List

from app.core.config import settings

logger = logging.getLogger(__name__)

MISSION_STATEMENT = (
    "Track all meeting dialogues, commitments made by both parties, "
    "agreed deadlines, unresolved questions, and user note preferences."
)

DEFAULT_DISPOSITION = {
    "literalism": 4,
    "skepticism": 2,
    "empathy": 3
}

class HindsightService:
    def __init__(self):
        self.api_url = settings.HINDSIGHT_API_URL
        self.api_key = settings.HINDSIGHT_API_KEY
        self.client = None
        self.banks_config: Dict[str, Dict[str, Any]] = {}
        # In-memory store for seamless offline testing & reliable fallback
        self.local_memory_store: Dict[str, List[Dict[str, Any]]] = {}

        self._init_client()

    def _init_client(self):
        """Initializes the official Hindsight client SDK."""
        try:
            from hindsight_client import Hindsight
            self.client = Hindsight(
                base_url=self.api_url,
                api_key=self.api_key
            )
            logger.info(f"Hindsight SDK client initialized with base_url={self.api_url}")
        except Exception as e:
            logger.warning(f"Could not initialize Hindsight SDK: {e}. Fallback to simulated mode.")
            self.client = None

    def get_status(self) -> Dict[str, Any]:
        """Returns connection and bank status for health check."""
        return {
            "connected": self.client is not None,
            "api_url": self.api_url,
            "active_banks": list(self.banks_config.keys())
        }

    def get_or_create_bank(self, user_id: str) -> str:
        """
        Retrieves or creates a memory bank scoped to user_id.
        Configures:
        - Mission: 'Track all meeting dialogues, commitments made by both parties, agreed deadlines, unresolved questions, and user note preferences.'
        - Disposition: {'literalism': 4, 'skepticism': 2, 'empathy': 3} to prioritize accurate promise extraction.
        """
        # Normalize user id to a safe bank identifier
        safe_id = user_id.lower().replace("@", "_").replace(".", "_").replace("-", "_")
        bank_id = f"bank_{safe_id}"

        if bank_id not in self.banks_config:
            self.banks_config[bank_id] = {
                "bank_id": bank_id,
                "user_id": user_id,
                "mission": MISSION_STATEMENT,
                "disposition": dict(DEFAULT_DISPOSITION)
            }

            # Attempt to set bank configuration on Hindsight server if client is active
            if self.client:
                try:
                    if hasattr(self.client, "create_bank"):
                        self.client.create_bank(
                            bank_id=bank_id,
                            name=f"Meeting Intel for {user_id}",
                            mission=MISSION_STATEMENT,
                            disposition_literalism=DEFAULT_DISPOSITION["literalism"],
                            disposition_skepticism=DEFAULT_DISPOSITION["skepticism"],
                            disposition_empathy=DEFAULT_DISPOSITION["empathy"]
                        )
                    elif hasattr(self.client, "update_bank_config"):
                        self.client.update_bank_config(
                            bank_id=bank_id,
                            mission=MISSION_STATEMENT,
                            disposition_literalism=DEFAULT_DISPOSITION["literalism"],
                            disposition_skepticism=DEFAULT_DISPOSITION["skepticism"],
                            disposition_empathy=DEFAULT_DISPOSITION["empathy"]
                        )
                    logger.info(f"Hindsight bank '{bank_id}' configured with mission & disposition.")
                except Exception as e:
                    logger.debug(f"Hindsight bank configuration notice: {e}")

        return bank_id

    def recall_prep_context(self, user_id: str, attendee_email: str) -> Dict[str, Any]:
        """
        Recalls Hindsight memory for an upcoming meeting with attendee_email.
        Calls client.recall(bank_id, query=..., budget="mid").
        Query: 'What was discussed, promised, or left unresolved with {attendee_email}?'
        """
        bank_id = self.get_or_create_bank(user_id)
        query = f"What was discussed, promised, or left unresolved with {attendee_email}?"

        recalled_texts: List[str] = []

        if self.client:
            try:
                logger.info(f"Calling client.recall on bank '{bank_id}' with budget='mid'...")
                recall_response = self.client.recall(
                    bank_id=bank_id,
                    query=query,
                    budget="mid"
                )

                # Parse recall results
                if hasattr(recall_response, "results") and recall_response.results:
                    for item in recall_response.results:
                        if hasattr(item, "text"):
                            recalled_texts.append(item.text)
                        elif isinstance(item, dict):
                            recalled_texts.append(item.get("text") or str(item))
                        else:
                            recalled_texts.append(str(item))
                elif isinstance(recall_response, list):
                    for item in recall_response:
                        recalled_texts.append(item.get("text") if isinstance(item, dict) else str(item))
                elif isinstance(recall_response, str):
                    recalled_texts.append(recall_response)

                logger.info(f"Retrieved {len(recalled_texts)} memories from Hindsight for {attendee_email}.")
            except Exception as e:
                logger.warning(f"client.recall failed or server offline: {e}. Checking local store.")

        # Fallback to local memory store
        if not recalled_texts:
            local_memories = self.local_memory_store.get(bank_id, [])
            matching = [
                m for m in local_memories
                if attendee_email.lower() in m.get("content", "").lower()
                or attendee_email.lower() == m.get("metadata", {}).get("attendee_email", "").lower()
            ]
            for m in matching:
                recalled_texts.append(m["content"])

        # Format briefing text
        if recalled_texts:
            joined = "\n\n---\n\n".join(recalled_texts)
            briefing = (
                f"Previous Context & Commitments with {attendee_email}:\n\n"
                f"{joined}"
            )
        else:
            briefing = (
                f"No prior meetings recorded with {attendee_email} in Hindsight bank.\n"
                f"This appears to be your first interaction. Be sure to establish clear deliverables "
                f"and capture notes during the call."
            )

        return {
            "bank_id": bank_id,
            "attendee_email": attendee_email,
            "query": query,
            "count": len(recalled_texts),
            "memories": recalled_texts,
            "briefing": briefing
        }

    def retain_meeting_memory(
        self,
        user_id: str,
        attendee_email: str,
        content: str,
        meeting_id: str
    ) -> Dict[str, Any]:
        """
        Retains meeting commitments, decisions, and notes into Hindsight memory.
        Calls client.retain(bank_id, content=..., context=..., document_id=..., metadata=...).
        """
        bank_id = self.get_or_create_bank(user_id)
        doc_id = f"meet_{meeting_id}_{int(time.time())}"
        context = f"Meeting with {attendee_email} (Meeting ID: {meeting_id})"
        metadata = {
            "attendee_email": attendee_email,
            "meeting_id": meeting_id,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        retained_remote = False

        if self.client:
            try:
                logger.info(f"Calling client.retain on bank '{bank_id}' for doc '{doc_id}'...")
                self.client.retain(
                    bank_id=bank_id,
                    content=content,
                    context=context,
                    document_id=doc_id,
                    metadata=metadata
                )
                retained_remote = True
                logger.info(f"Successfully retained document '{doc_id}' in Hindsight bank '{bank_id}'.")
            except Exception as e:
                logger.warning(f"client.retain failed or server offline: {e}. Saved in local fallback store.")

        # Always record in local store for redundancy and offline validation
        self.local_memory_store.setdefault(bank_id, []).append({
            "document_id": doc_id,
            "content": content,
            "context": context,
            "metadata": metadata,
            "timestamp": metadata["timestamp"]
        })

        return {
            "status": "retained",
            "bank_id": bank_id,
            "document_id": doc_id,
            "remote_synced": retained_remote,
            "context": context,
            "metadata": metadata
        }

    def list_tracked_contacts(self, user_id: str) -> List[Dict[str, Any]]:
        """Lists all contacts and memory counts stored in the user's Hindsight memory bank."""
        bank_id = self.get_or_create_bank(user_id)
        contacts_map: Dict[str, Dict[str, Any]] = {}

        # Default seeds if empty
        if not self.local_memory_store.get(bank_id):
            self.retain_meeting_memory(
                user_id=user_id,
                attendee_email="sarah.connor@acme.org",
                content=(
                    "Initial Discovery Session:\n"
                    "• Discussed enterprise tier migration and cloud security architecture.\n"
                    "• Sarah promised to send their corporate technical compliance checklist.\n"
                    "• Alex promised to deliver enterprise pricing models with volume discounts.\n"
                    "• Key decision: Selected AWS us-east-1 for dedicated VPC tenancy."
                ),
                meeting_id="init-discovery-01"
            )
            self.retain_meeting_memory(
                user_id=user_id,
                attendee_email="marcus.wright@cyberdyne.io",
                content=(
                    "Quarterly Partnership Review:\n"
                    "• Marcus agreed to provide beta API credentials by next Monday.\n"
                    "• Agreed to schedule pilot launch demonstration for engineering leadership."
                ),
                meeting_id="pilot-review-02"
            )

        for item in self.local_memory_store.get(bank_id, []):
            email = item.get("metadata", {}).get("attendee_email")
            if email:
                if email not in contacts_map:
                    contacts_map[email] = {
                        "email": email,
                        "name": email.split("@")[0].replace(".", " ").title(),
                        "memory_count": 0,
                        "last_interaction": item.get("timestamp")
                    }
                contacts_map[email]["memory_count"] += 1
                if item.get("timestamp") and item.get("timestamp") > contacts_map[email]["last_interaction"]:
                    contacts_map[email]["last_interaction"] = item.get("timestamp")

        return list(contacts_map.values())

    def get_contact_dossier(self, user_id: str, attendee_email: str) -> Dict[str, Any]:
        """
        Recalls comprehensive dossier for attendee from Hindsight, including
        timeline logs, cumulative commitments, and relationship background.
        """
        bank_id = self.get_or_create_bank(user_id)
        prep_context = self.recall_prep_context(user_id, attendee_email)
        
        # Collect chronological logs from memory store
        items = [
            m for m in self.local_memory_store.get(bank_id, [])
            if attendee_email.lower() in m.get("content", "").lower()
            or attendee_email.lower() == m.get("metadata", {}).get("attendee_email", "").lower()
        ]

        return {
            "attendee_email": attendee_email,
            "bank_id": bank_id,
            "memory_count": len(items),
            "briefing": prep_context.get("briefing", ""),
            "timeline": [
                {
                    "document_id": m.get("document_id"),
                    "timestamp": m.get("timestamp"),
                    "context": m.get("context"),
                    "content": m.get("content")
                }
                for m in reversed(items)
            ]
        }

hindsight_service = HindsightService()

