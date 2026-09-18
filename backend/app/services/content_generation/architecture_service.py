from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from app.core.exceptions import ExternalServiceError, InfraError
from app.core.gemini import generate_content_or_raise
from app.repositories.factory import build_content_repository
from app.services.content_generation.asset_persistence import upsert_project_asset
from app.services.content_generation.queries import get_project_summary_record
from app.services.content_generation.retrieval import build_context_text, retrieve_project_context
from app.services.project_status_service import get_project

logger = logging.getLogger(__name__)

ARCH_MODEL = "gemini-2.5-pro"
ARCH_TEMPERATURE = 0.2
ARCH_MAX_OUTPUT_TOKENS = 1800


def get_architecture_for_project(project_id: str) -> dict[str, Any]:
    return build_content_repository().get_project_asset("project_architecture", project_id)


def _safe_get_project_summary(project_id: str) -> str:
    try:
        summary_row = get_project_summary_record(build_content_repository(), project_id)
    except Exception:
        return ""

    content = summary_row.get("content")
    return content.strip() if isinstance(content, str) else ""


def _safe_get_project_context(project_id: str, project_title: str) -> str:
    try:
        docs = retrieve_project_context(
            query=f"Architecture, stack, components, APIs and data layer for {project_title}",
            project_id=project_id,
            max_docs=10,
        )
    except Exception as exc:
        logger.warning("Architecture context retrieval failed for project %s: %s", project_id, exc)
        return ""

    if not docs:
        return ""

    return build_context_text(docs)


def _build_architecture_prompt(
    *,
    project_id: str,
    project_title: str,
    project_description: str,
    summary_text: str,
    context_text: str,
) -> str:
    return "\n".join(
        [
            "You are creating an architecture deployment game payload for a software project.",
            "Infer the most relevant technical components and group them into exactly three buckets:",
            "frontend, application, data.",
            "Return valid JSON only as an object with exactly these keys:",
            '{"frontend": string[], "application": string[], "data": string[]}',
            "Rules:",
            "- Each value must be a JSON array of short component labels.",
            "- Prefer concrete components from the project (frameworks, APIs, gateways, stores, queues, services).",
            "- Do not invent components not supported by the project context.",
            "- Do not include explanations or markdown.",
            "",
            f"Project ID: {project_id}",
            f"Project title: {project_title}",
            f"Project description: {project_description}",
            "",
            "Project summary:",
            summary_text or "No summary available.",
            "",
            "Project context:",
            context_text or "No additional embedding context available.",
        ]
    )


def _parse_architecture_payload(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ExternalServiceError("Architecture generation returned invalid JSON")
        try:
            parsed = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ExternalServiceError("Architecture generation returned invalid JSON") from exc

    if not isinstance(parsed, dict):
        raise ExternalServiceError("Architecture generation must return a JSON object")
    return parsed


def _normalize_bucket(payload: dict[str, Any], key: str) -> list[str]:
    value = payload.get(key)
    if not isinstance(value, list):
        raise ExternalServiceError(f"Architecture payload must include a list for '{key}'")

    normalized: list[str] = []
    for item in value:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                normalized.append(cleaned)

    if not normalized:
        raise ExternalServiceError(f"Architecture payload list '{key}' cannot be empty")

    return normalized


def generate_and_save_architecture(project_id: str) -> dict[str, Any]:
    project = get_project(project_id)
    project_title = str(project.get("title") or "Project")
    project_description = str(project.get("description") or "").strip()
    summary_text = _safe_get_project_summary(project_id)
    context_text = _safe_get_project_context(project_id, project_title)

    prompt = _build_architecture_prompt(
        project_id=project_id,
        project_title=project_title,
        project_description=project_description,
        summary_text=summary_text,
        context_text=context_text,
    )

    try:
        raw = generate_content_or_raise(
            prompt,
            model=ARCH_MODEL,
            temperature=ARCH_TEMPERATURE,
            max_output_tokens=ARCH_MAX_OUTPUT_TOKENS,
        )
    except Exception as exc:
        logger.exception("Architecture generation failed for project %s", project_id)
        raise ExternalServiceError(f"Architecture generation failed for project {project_id}: {exc}") from exc

    parsed = _parse_architecture_payload(raw)
    frontend_items = _normalize_bucket(parsed, "frontend")
    application_items = _normalize_bucket(parsed, "application")
    data_items = _normalize_bucket(parsed, "data")

    payload = {
        "project_id": project_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "frontend": frontend_items,
        "application": application_items,
        "data": data_items,
    }

    try:
        return upsert_project_asset("project_architecture", payload)
    except InfraError:
        raise
    except Exception as exc:
        raise InfraError(f"Failed to save architecture for project {project_id}: {exc}") from exc
