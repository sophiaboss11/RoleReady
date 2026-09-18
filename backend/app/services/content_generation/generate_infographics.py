import logging
import os
import sys
from typing import List, Optional, Dict, Any

from app.core.exceptions import DomainError, ExternalServiceError, InfraError
from app.core.gemini import generate_content, generate_image
from app.repositories.factory import build_content_repository, build_storage_repository
from app.services.content_generation.queries import list_project_embedding_rows

logger = logging.getLogger(__name__)

MAX_CHARS = 30000
OUTPUT_DIR = "static/infographics"
BUCKET_NAME = "RoleReady"

def fetch_project_embeddings(project_id: str) -> List[str]:
    """
    Fetches all embeddings for a given project ID from Supabase.
    """
    response = list_project_embedding_rows(
        build_content_repository(),
        project_id,
        columns="content",
        page_size=500,
    )
    return [item["content"] for item in response if item.get("content")]

def generate_infographic(project_id: str) -> Optional[Dict[str, Any]]:
    """
    Generates an infographic (text outline + image) for a given project.
    Returns a dictionary containing the generated text and the image URL.
    """
    logger.info("Fetching data for project: %s", project_id)
    contents = fetch_project_embeddings(project_id)
    logger.info("fetch_project_embeddings returned %d items for project %s", len(contents), project_id)

    if not contents:
        logger.warning("No content found for project %s.", project_id)
        raise DomainError(
            "No synced data found for this project. Sync GitHub or upload documents first."
        )

    logger.info("Found %d chunks of content. Preparing prompt...", len(contents))

    full_text = "\n\n".join(contents)

    if len(full_text) > MAX_CHARS:
        logger.debug("Content length %d exceeds limit. Truncating to %d chars.", len(full_text), MAX_CHARS)
        full_text = full_text[:MAX_CHARS] + "...(truncated)"

    from app.services.content_generation.prompt_service import resolve_instruction
    instruction = resolve_instruction(project_id, "infographic_text")

    prompt_text = f"""
    {instruction}

    Project Content:
    {full_text}

    Please provide the output in the following format:

    # [Project Name] - Technical Overview

    ## 1. What is it? (Project Overview)
    [Brief, high-level description of the project's purpose and problem it solves.]

    ## 2. Key Features & Functionality
    - [Feature 1]: [Description]
    - [Feature 2]: [Description]
    - [Feature 3]: [Description]

    ## 3. Technical Architecture & Stack
    - [Component/Layer]: [Technology used]
    - [Data Flow]: [Brief description of how data moves]
    - [Key Tech]: [List major languages/frameworks found]

    ## 4. Why it matters? (Impact/Summary)
    [Concise summary of benefits]

    Make the content suitable for a technical audience but visually structured for an infographic.
    """

    # Optional: Log token count for debugging
    # tokens = count_tokens(prompt_text)
    # print(f"Input Token Count: {tokens}")

    logger.info("Calling Gemini API for Text Outline...")
    try:
        text_result = generate_content(prompt_text)
    except Exception as exc:
        raise ExternalServiceError("Failed to generate infographic text") from exc

    if not text_result:
        logger.error("Failed to generate text outline.")
        raise ExternalServiceError("AI text generation failed")

    logger.info("Successfully generated text outline.")

    logger.info("Generating visual prompt for image generation...")
    # Using a direct, strict prompt for gemini-3-pro-image-preview to avoid hallucinations
    visual_prompt = f"""
Create ONE full-bleed educational technical infographic image (16:9).

Core requirements:
- The text must be highly legible, accurate, and free of hallucinations or gibberish.
- Use a layout that distinctly separates "What it is", "Features", and "Architecture".
- Incorporate visual representations for the architecture (databases, servers, connection lines).

Composition:
- Make it a single cohesive diagram/picture that fills the whole frame.
- Place the key points as natural callout labels near relevant parts of the graphic.
- Use arrows/leader lines from callouts to the relevant parts.
- If a point is already clearly present as text in the image, do NOT duplicate it.

Typography:
- Large readable sans-serif text, high contrast, legible at 1920x1080.
- Short phrases only; no paragraphs; avoid tiny labels.
- Ensure all spelled words exactly match the provided content.

Style:
- Clean, modern, and tech-focused (e.g., blueprints, isometric diagrams, glassmorphism style).
- No faces/people. No watermarks/logos.
- Keep generous safe margins so nothing gets cropped.

Content to Visualize (use verbatim where possible):
{text_result}
"""

    logger.debug("Visual Prompt: %s...", visual_prompt[:100])

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = os.path.join(OUTPUT_DIR, f"{project_id}.png")

    logger.info("Calling Imagen API to generate image at %s...", output_path)
    try:
        image_path = generate_image(visual_prompt, output_path)
    except Exception as exc:
        raise ExternalServiceError("Failed to generate infographic image") from exc

    if not image_path:
         logger.error("Failed to generate infographic image.")
         raise ExternalServiceError("Failed to generate infographic image")

    logger.info("Successfully generated infographic image: %s", image_path)

    # Upload to Supabase Storage
    logger.info("Uploading to Supabase Storage...")
    try:
        with open(image_path, 'rb') as f:
            file_content = f.read()

        storage_path = f"infographics/{project_id}.png"
        public_url = build_storage_repository().upload_public_asset(
            bucket_name=BUCKET_NAME,
            storage_path=storage_path,
            content=file_content,
            content_type="image/png",
        )

        logger.info("Successfully uploaded to Supabase Storage: %s", storage_path)
        logger.info("Public URL: %s", public_url)

        return {
            "text": text_result,
            "image_url": public_url
        }

    except Exception as exc:
        logger.error("Error uploading to Supabase: %s", exc)
        raise InfraError(f"Failed to upload infographic for project {project_id}") from exc

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m app.services.content_generation.generate_infographics <project_id>")
        sys.exit(1)

    project_id = sys.argv[1]
    infographic = generate_infographic(project_id)

    if infographic:
        print("\n--- Generated Infographic Outline ---\n")
        print(infographic.get("text", "No text generated"))
        print(f"\nImage URL: {infographic.get('image_url', 'No image generated')}")
        print("\n-------------------------------------\n")
    else:
        print("Failed to generate infographic.")
