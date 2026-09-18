import logging
import time
from typing import Optional

from google import genai

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_settings = get_settings()

if not _settings.gemini_api_key:
    logger.warning("GEMINI_API_KEY not found in environment variables.")

# Lazy-initialized client (avoids crash at import time when key is missing)
_client: genai.Client | None = None

def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not _settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not set")
        _client = genai.Client(api_key=_settings.gemini_api_key)
    return _client

# Configuration
# Using the stable model from the new SDK documentation or standard list
MODEL_NAME = "gemini-2.5-pro"

_MAX_RETRIES = 4
_BASE_DELAY = 2  # seconds

# Thinking models consume output tokens for internal reasoning.
# We scale max_output_tokens up so the visible text still gets enough budget.
_THINKING_MODEL_PREFIXES = ("gemini-2.5-pro", "gemini-2.0-pro")
_THINKING_TOKEN_MULTIPLIER = 10  # e.g. 800 requested -> 8000 total budget


def _is_thinking_model(model: str) -> bool:
    return any(model.startswith(p) for p in _THINKING_MODEL_PREFIXES)


def generate_content_or_raise(
    prompt: str,
    *,
    model: str = MODEL_NAME,
    temperature: Optional[float] = None,
    max_output_tokens: Optional[int] = None,
    system_instruction: Optional[str] = None,
) -> str:
    """Generate text with Gemini and raise on empty/error response.

    Includes exponential-backoff retry for transient errors (503 / 429).
    For thinking models (gemini-2.5-pro), automatically scales up
    max_output_tokens so internal reasoning doesn't exhaust the budget.
    """
    config_kwargs = {}
    if temperature is not None:
        config_kwargs["temperature"] = temperature
    if system_instruction is not None:
        config_kwargs["system_instruction"] = system_instruction

    # For thinking models, scale up max_output_tokens so thinking doesn't
    # consume the entire budget and leave text empty.
    _MAX_THINKING_BUDGET = 24576  # API ceiling is 32768; keep margin
    if max_output_tokens is not None:
        if _is_thinking_model(model):
            thinking_budget = min(
                max_output_tokens * (_THINKING_TOKEN_MULTIPLIER - 1),
                _MAX_THINKING_BUDGET,
            )
            config_kwargs["max_output_tokens"] = max_output_tokens + thinking_budget
            config_kwargs["thinking_config"] = genai.types.ThinkingConfig(
                thinking_budget=thinking_budget,
            )
        else:
            config_kwargs["max_output_tokens"] = max_output_tokens

    config = (
        genai.types.GenerateContentConfig(**config_kwargs)
        if config_kwargs
        else None
    )

    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            response = _get_client().models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            text = (response.text or "").strip()
            if not text:
                # Check if thinking model exhausted tokens
                finish = None
                if response.candidates:
                    finish = response.candidates[0].finish_reason
                raise RuntimeError(
                    f"Gemini returned empty content for model {model} "
                    f"(finish_reason={finish})"
                )
            return text
        except Exception as exc:
            last_exc = exc
            err_str = str(exc)
            is_transient = any(code in err_str for code in ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED"))
            if is_transient and attempt < _MAX_RETRIES:
                delay = _BASE_DELAY * (2 ** attempt)
                logger.warning(
                    "Gemini transient error (attempt %d/%d): %s -- retrying in %ds",
                    attempt + 1, _MAX_RETRIES + 1, err_str[:120], delay,
                )
                time.sleep(delay)
            else:
                raise
    # Should not reach here, but satisfy type checker
    raise last_exc  # type: ignore[misc]


def generate_content(prompt: str) -> str:
    """
    Generates content using the google-genai SDK.
    """
    try:
        return generate_content_or_raise(prompt)
    except Exception as e:
        logger.error("Error generating content with Gemini (%s): %s", MODEL_NAME, e)
        return ""

def embed_text_or_raise(
    text: str,
    *,
    model: str,
    output_dimensionality: Optional[int] = None,
    task_type: Optional[str] = None,
) -> list[float]:
    """Embed text with Gemini and raise when embedding is unavailable."""
    if not text.strip():
        raise RuntimeError("Text for embedding is empty")
    if not model:
        raise RuntimeError("Embedding model is not configured")

    config_kwargs = {}
    if task_type is not None:
        config_kwargs["task_type"] = task_type
    if output_dimensionality is not None:
        config_kwargs["output_dimensionality"] = output_dimensionality
    config = (
        genai.types.EmbedContentConfig(**config_kwargs)
        if config_kwargs
        else None
    )

    response = _get_client().models.embed_content(
        model=model,
        contents=text,
        config=config,
    )
    embeddings = response.embeddings or []
    if not embeddings:
        raise RuntimeError(f"Gemini returned no embeddings for model {model}")

    values = embeddings[0].values or []
    if not values:
        raise RuntimeError(f"Gemini returned empty embedding vector for model {model}")
    return [float(v) for v in values]

def count_tokens(prompt: str) -> int:
    """
    Counts the number of tokens in the prompt.
    """
    try:
        response = _get_client().models.count_tokens(
            model=MODEL_NAME,
            contents=prompt
        )
        return response.total_tokens
    except Exception as e:
        logger.error("Error counting tokens: %s", e)
        return 0

def generate_image(prompt: str, output_file: str) -> str:
    """
    Generates an image using gemini-3-pro-image-preview and saves it to the output file.
    """
    IMAGE_MODEL = "gemini-3-pro-image-preview"
    try:
        response = _get_client().models.generate_content(
            model=IMAGE_MODEL,
            contents=[prompt],
            config=genai.types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=genai.types.ImageConfig(aspect_ratio="16:9", image_size="2K"),
            )
        )
        saved = False
        for part in getattr(response, "parts", None) or []:
            try:
                if getattr(part, "inline_data", None) is None:
                    continue
                img = part.as_image()
                img.save(output_file)
                saved = True
                break
            except Exception:
                continue

        if saved:
            return output_file
        return ""
    except Exception as e:
        logger.error("Error generating image: %s", e)
        return ""
