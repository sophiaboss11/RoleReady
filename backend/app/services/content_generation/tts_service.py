"""
TTS Service – Audio generation orchestration and Supabase persistence.

This module handles:
- DB CRUD for ``project_audio``
- Orchestrating summary retrieval → speech synthesis → Storage upload

The actual TTS provider call is delegated to ``app.core.tts``, keeping this
service layer provider-agnostic.
"""

import logging
from typing import Dict, Optional

from app.core.exceptions import InfraError, ValidationError
from app.core.gemini import generate_content_or_raise
from app.repositories.factory import build_content_repository, build_storage_repository
from app.core.tts import synthesize_speech
from app.services.content_generation.asset_persistence import upsert_project_asset
from app.services.content_generation.queries import (
    get_project_audio_record,
    get_project_summary_record,
)
from app.services.project_status_service import promote_failed_project_if_assets_ready

logger = logging.getLogger(__name__)

BUCKET_NAME = "RoleReady"

SCRIPT_MODEL = "gemini-2.5-pro"
SCRIPT_TEMPERATURE = 0.4
SCRIPT_MAX_OUTPUT_TOKENS = 1200
SCRIPT_MAX_CHARS = 3800  # TTS 4096 char limit with safety margin

CONTENT_TYPES = {
    "mp3": "audio/mpeg",
    "opus": "audio/opus",
    "aac": "audio/aac",
    "flac": "audio/flac",
    "wav": "audio/wav",
    "pcm": "audio/L16",
}


# ---------------------------------------------------------------------------
# Narration script generation
# ---------------------------------------------------------------------------

def _build_narration_prompt(summary: str, instruction: str) -> str:
    return (
        f"{instruction}\n\n"
        "Rules:\n"
        "- Remove all numbered headings, bullet points, and markdown formatting.\n"
        "- Use conversational connectors (e.g. 'Next,', 'Additionally,', 'In summary,').\n"
        "- Do NOT add greetings or sign-offs.\n"
        "- Keep the output under 3800 characters.\n"
        "- Output plain text only — no markdown.\n\n"
        f"Summary:\n{summary}"
    )


def generate_narration_script(summary: str, instruction: str) -> Optional[str]:
    """Generate a spoken-word narration script from a summary via Gemini.

    Returns ``None`` on failure so the caller can fall back to the raw summary.
    """
    try:
        script = generate_content_or_raise(
            _build_narration_prompt(summary, instruction),
            model=SCRIPT_MODEL,
            temperature=SCRIPT_TEMPERATURE,
            max_output_tokens=SCRIPT_MAX_OUTPUT_TOKENS,
        )
        if len(script) > SCRIPT_MAX_CHARS:
            script = script[:SCRIPT_MAX_CHARS]
            logger.warning("Narration script truncated to %d chars", SCRIPT_MAX_CHARS)
        return script
    except Exception as exc:
        logger.warning("Narration script generation failed, falling back to raw summary: %s", exc)
        return None


# ---------------------------------------------------------------------------
# DB CRUD
# ---------------------------------------------------------------------------

def get_audio_for_project(project_id: str) -> Dict:
    """Fetch the latest audio record for a project."""
    return get_project_audio_record(build_content_repository(), project_id)


def upsert_audio(
    project_id: str,
    audio_url: Optional[str],
    voice: str = "alloy",
    model: str = "tts-1",
    fmt: str = "mp3",
    script: Optional[str] = None,
) -> Dict:
    """Upsert one audio row per project."""
    saved = upsert_project_asset("project_audio", {
        "project_id": project_id,
        "audio_url": audio_url,
        "voice": voice,
        "model": model,
        "format": fmt,
        "is_processed": True,
        "script": script,
    })
    promote_failed_project_if_assets_ready(project_id)

    return saved


# ---------------------------------------------------------------------------
# Generation + upload
# ---------------------------------------------------------------------------

def generate_and_upload_audio(
    project_id: str,
    voice: str = "alloy",
    model: str = "tts-1",
    fmt: str = "mp3",
) -> Dict:
    """
    Generate TTS audio from the project summary and upload to Supabase Storage.

    Returns a dict with ``audio_url`` on success.
    Raises on missing summary or API failure.
    """
    # 1. Fetch summary text
    summary = get_project_summary_record(build_content_repository(), project_id)
    raw_summary = summary.get("content")
    if not isinstance(raw_summary, str) or not raw_summary:
        raise ValidationError("No summary found for this project. Generate a summary first.")

    raw_text = raw_summary

    # 2. Generate narration script (falls back to raw summary on failure)
    from app.services.content_generation.prompt_service import resolve_instruction
    instruction = resolve_instruction(project_id, "narration")
    script = generate_narration_script(raw_text, instruction)
    tts_input = script if script else raw_text

    # 3. Synthesize speech (provider-agnostic call)
    logger.info("Generating TTS audio for project %s (voice=%s, model=%s, format=%s)", project_id, voice, model, fmt)
    audio_bytes = synthesize_speech(
        tts_input,
        voice=voice,
        model=model,
        response_format=fmt,
    )

    # 4. Upload to Supabase Storage
    storage_path = f"audio/{project_id}.{fmt}"
    content_type = CONTENT_TYPES.get(fmt, "application/octet-stream")

    try:
        public_url = build_storage_repository().upload_public_asset(
            bucket_name=BUCKET_NAME,
            storage_path=storage_path,
            content=audio_bytes,
            content_type=content_type,
        )
        logger.info("Uploaded TTS audio to storage: %s", storage_path)
        logger.info("Public URL: %s", public_url)
    except Exception as exc:
        raise InfraError(f"Failed to upload audio for project {project_id}") from exc

    return {"audio_url": public_url, "script": script}
