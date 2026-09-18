from supabase import create_client, Client, ClientOptions

from app.core.config import get_settings

_settings = get_settings()

_service_role_client: Client | None = None

def get_service_role_client() -> Client:
    """Return a Supabase client authenticated with the secret key (bypasses RLS)."""
    global _service_role_client
    if _service_role_client is not None:
        return _service_role_client

    _service_role_client = create_client(
        _settings.supabase_url,
        _settings.supabase_secret_key,
        options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
        ),
    )
    return _service_role_client
