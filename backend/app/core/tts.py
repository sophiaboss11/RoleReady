"""
TTS client – Thin wrapper around the text-to-speech provider.

Mirrors the pattern of ``app.core.gemini``: lazy-initialized singleton client
with a provider-specific call hidden behind a generic function signature.

When swapping providers (e.g. OpenAI → Google Cloud TTS / ElevenLabs),
only this file needs to change.  The service layer (``tts_service.py``)
remains untouched.
"""

import logging

from openai import OpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_settings = get_settings()

if not _settings.openai_api_key:
    logger.warning("OPENAI_API_KEY not found in environment variables.")

_client: OpenAI | None = None

MAX_INPUT_CHARS = 4096  # OpenAI TTS hard limit


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not _settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        _client = OpenAI(api_key=_settings.openai_api_key)
    return _client


def synthesize_speech(
    text: str,
    *,
    voice: str = "alloy",
    model: str = "tts-1",
    response_format: str = "mp3",
) -> bytes:
    """
    Convert *text* to audio bytes.

    Returns raw audio content in the requested format.
    Raises ``RuntimeError`` on empty input or API failure.
    """
    if not text.strip():
        raise RuntimeError("Text for speech synthesis is empty")

    if len(text) > MAX_INPUT_CHARS:
        logger.warning(
            "TTS input is %d chars, truncating to %d",
            len(text),
            MAX_INPUT_CHARS,
        )
        text = text[:MAX_INPUT_CHARS]

    response = _get_client().audio.speech.create(
        model=model,
        voice=voice,
        input=text,
        response_format=response_format,
    )
    return response.content
