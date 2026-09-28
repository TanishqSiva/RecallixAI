import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Vectorize Hindsight configuration
    HINDSIGHT_API_URL: str = "http://localhost:8888"
    HINDSIGHT_API_KEY: str = "test_hindsight_key"

    # Google Gemini LLM configuration (Primary Inference)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Google Calendar configuration
    GOOGLE_CALENDAR_CREDENTIALS_FILE: str = "credentials.json"
    GOOGLE_CALENDAR_TOKEN_FILE: str = "token.json"

    # n8n Webhook Automations (Google Calendar, Gmail, and Google Sheets)
    N8N_CREATE_MEETING_WEBHOOK_URL: Optional[str] = "https://vijaysiddhath.app.n8n.cloud/webhook/create-meeting"
    N8N_SYNC_TASKS_WEBHOOK_URL: Optional[str] = "https://vijaysiddhath.app.n8n.cloud/webhook/meeting-sync-tasks"

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

settings = Settings()
