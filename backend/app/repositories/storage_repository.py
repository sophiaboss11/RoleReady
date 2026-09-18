from __future__ import annotations

from supabase import Client

from app.core.exceptions import InfraError


class StorageRepository:
    def __init__(self, client: Client):
        self.client = client

    def upload_public_asset(
        self,
        *,
        bucket_name: str,
        storage_path: str,
        content: bytes,
        content_type: str,
    ) -> str:
        try:
            self.client.storage.from_(bucket_name).upload(
                file=content,
                path=storage_path,
                file_options={
                    "content-type": content_type,
                    "upsert": "true",
                },
            )
            return self.client.storage.from_(bucket_name).get_public_url(storage_path)
        except Exception as exc:
            raise InfraError(f"Failed to upload asset to {bucket_name}/{storage_path}: {exc}") from exc
