from __future__ import annotations

import logging
import os
import tempfile
from datetime import datetime

from google import genai
from google.genai import types

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError, InfraError
from app.repositories.factory import build_storage_repository, build_training_repository
from app.repositories.training_repository import TrainingRepository
from app.repositories.types import TrainingRow

logger = logging.getLogger(__name__)

BUCKET_NAME = "RoleReady"


def run_training_cover_generation(training_id: str) -> TrainingRow:
    repo = build_training_repository()
    training = repo.get_training(training_id)
    prompt = build_training_cover_prompt(
        title=training["title"],
        description=training.get("description"),
    )

    repo.update_training(
        training_id,
        {
            "cover_image_status": "generating",
            "cover_image_prompt": prompt,
            "cover_image_error": None,
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    try:
        image_url = generate_and_upload_training_cover(training_id, prompt)
    except Exception as exc:
        mark_training_cover_failed(repo, training_id, str(exc))
        raise

    return repo.update_training(
        training_id,
        {
            "cover_image_url": image_url,
            "cover_image_status": "ready",
            "cover_image_error": None,
            "cover_image_generated_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        },
    )


def mark_training_cover_failed(
    repo: TrainingRepository,
    training_id: str,
    error_message: str,
) -> TrainingRow:
    return repo.update_training(
        training_id,
        {
            "cover_image_status": "failed",
            "cover_image_error": error_message[:1000],
            "updated_at": datetime.utcnow().isoformat(),
        },
    )


def build_training_cover_prompt(*, title: str, description: str | None) -> str:
    normalized_description = (description or "").strip() or "No description was provided."
    return "\n".join(
        [
            "Create one present-day 16:9 educational YouTube-style thumbnail for an internal training course.",
            "The viewer should understand the course topic immediately, even at small size.",
            "Use the title and description below as the source of truth.",
            "Choose exactly 2 or 3 distinctive real-world elements from the topic.",
            "Make those elements oversized in the foreground with a simple, bold, high-contrast composition.",
            "Reserve the top and bottom 15% for simple background or negative space only.",
            "ordinary browser windows with unreadable UI blocks, printed diagrams, notebooks, or tools.",
            "Avoid generic offices, random laptops, abstract decoration, template-like layouts, and",
            "anything not clearly implied by the training topic.",
            "Strictly avoid futuristic or sci-fi imagery: neon glow, holograms, transparent floating screens,",
            "glowing network lines, robots, cyberpunk colors, unreal devices, or speculative interfaces.",
            "",
            f"Training title: {title.strip()}",
            f"Training description: {normalized_description}",
        ]
    )


def generate_and_upload_training_cover(training_id: str, prompt: str) -> str:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ExternalServiceError("GEMINI_API_KEY is not configured")

    with tempfile.TemporaryDirectory(prefix="training-cover-") as tmp_dir:
        output_path = os.path.join(tmp_dir, f"{training_id}.png")
        generate_gemini_cover_image(prompt=prompt, output_path=output_path)

        try:
            with open(output_path, "rb") as image_file:
                image_bytes = image_file.read()
        except Exception as exc:
            raise InfraError("Failed to read generated training cover image") from exc

    storage_path = f"training-covers/{training_id}.png"
    return build_storage_repository().upload_public_asset(
        bucket_name=BUCKET_NAME,
        storage_path=storage_path,
        content=image_bytes,
        content_type="image/png",
    )


def generate_gemini_cover_image(*, prompt: str, output_path: str) -> None:
    settings = get_settings()
    image_size = settings.training_cover_image_size.strip().upper() or "1K"
    if image_size not in {"1K", "2K", "4K"}:
        image_size = "1K"

    client = genai.Client(api_key=settings.gemini_api_key)
    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="16:9", image_size=image_size),
    )

    try:
        response = client.models.generate_content(
            model=settings.training_cover_image_model,
            contents=[prompt],
            config=config,
        )
    except Exception as exc:
        logger.exception("Gemini training cover generation failed for %s", output_path)
        raise ExternalServiceError("Gemini failed to generate training cover image") from exc

    for part in getattr(response, "parts", None) or []:
        if getattr(part, "inline_data", None) is None:
            continue
        image = part.as_image()
        image.save(output_path)
        return

    raise ExternalServiceError("Gemini returned no training cover image")
