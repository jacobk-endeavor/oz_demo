from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://sauron:sauron@localhost:5432/sauron"
    secret_key: str = "dev-secret-key-change-in-production"
    access_token_expire_minutes: int = 60 * 24
    apollo_api_key: str = ""
    apollo_webhook_url: str = ""
    scraping_dog_api_key: str = ""
    openrouter_api_key: str = ""
    ask_elephant_api_key: str = ""
    ask_elephant_base_url: str = "https://app.askelephant.ai/api"
    ask_elephant_sync_enabled: bool = True
    ask_elephant_sync_interval_seconds: int = 180
    calendar_sync_enabled: bool = True
    calendar_sync_interval_seconds: int = 60
    calendar_sync_lookback_days: int = 365
    hubspot_api_key: str = ""
    hubspot_sync_enabled: bool = False
    hubspot_sync_interval_seconds: int = 300
    company_summary_backfill_enabled: bool = True
    company_summary_backfill_interval_seconds: int = 60
    meeting_summary_backfill_enabled: bool = True
    meeting_summary_backfill_interval_seconds: int = 60
    company_key_facts_backfill_enabled: bool = True
    company_key_facts_backfill_interval_seconds: int = 60
    turbopuffer_api_key: str = ""
    parallel_api_key: str = ""
    graph_tools_enabled: bool = True
    graph_default_traversal_depth: int = 1
    graph_max_traversal_depth: int = 2
    graph_default_result_size: int = 10
    graph_max_result_size: int = 25
    graph_allowed_scopes: list[str] = ["all", "current"]
    enable_enrich_traces: bool = False
    turbopuffer_region: str = "gcp-us-central1"
    twilio_account_sid: str = ""
    twilio_phone_number: str = ""
    twilio_twiml_app_sid: str = ""
    twilio_api_key_sid: str = ""
    twilio_api_key_secret: str = ""
    twilio_base_url: str = ""
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_oauth_redirect_uri: str = "http://localhost:8000/api/gmail/oauth/callback"
    gmail_oauth_frontend_redirect: str = "http://localhost:5173/settings"
    gmail_oauth_state_ttl_minutes: int = 10
    email_sync_enabled: bool = True
    email_sync_interval_seconds: int = 300
    gmail_oauth_scopes: list[str] = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
    ]
    cors_origins: list[str] = [
        "http://localhost:5173",
        "https://sauron.endeavorai.com",
    ]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
