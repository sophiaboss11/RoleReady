from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.core.exceptions import ExternalServiceError, InfraError, ValidationError
from app.core.gemini import generate_content_or_raise
from app.repositories.factory import build_content_repository
from app.services.content_generation.queries import get_project_summary_record
from app.services.content_generation.retrieval import build_context_text, retrieve_project_context
from app.services.project_status_service import get_project

logger = logging.getLogger(__name__)

PINPOINT_MODEL = "gemini-2.5-pro"
PINPOINT_TEMPERATURE = 0.3
PINPOINT_MAX_OUTPUT_TOKENS = 3200


def get_pinpoint_questions_for_project(project_id: str) -> list[dict[str, Any]]:
    rows = build_content_repository().list_project_rows(
        "project_pinpoint",
        project_id,
        columns="id,project_id,timestamp,clue_1,clue_2,clue_3,answer",
    )
    return sorted(rows, key=lambda row: str(row.get("timestamp", "")))


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
            query=f"Technical details, technologies, architecture, workflows, and APIs for {project_title}",
            project_id=project_id,
            max_docs=8,
        )
    except Exception as exc:
        logger.warning("Pinpoint context retrieval failed for project %s: %s", project_id, exc)
        return ""

    if not docs:
        return ""

    return build_context_text(docs)


def _build_pinpoint_prompt(
    *,
    project_id: str,
    project_title: str,
    project_description: str,
    summary_text: str,
    context_text: str,
    question_count: int,
) -> str:
    return "\n".join(
        [
            "You are generating a technical 'Pinpoint' challenge set for a learning platform.",
            f"Create exactly {question_count} unique questions for the project below.",
            "Each question must have exactly three clues and one answer.",
            "The clues should move from broad to specific and should clearly point to the answer.",
            "The answer should be a concise technical term, component, technology, workflow step, or concept from the project.",
            "Do not repeat the same answer or topic across questions.",
            "Do not invent technologies that are not supported by the project context.",
            "Return valid JSON only. Output must be a JSON array of objects with exactly these keys:",
            '{"clue_1": string, "clue_2": string, "clue_3": string, "answer": string}',
            "Do not wrap the JSON in markdown fences.",
            "Do not include numbering, commentary, or extra text.",
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


def _extract_json_array(text: str) -> list[dict[str, Any]]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start == -1 or end == -1 or end <= start:
            raise ExternalServiceError("Pinpoint generation returned invalid JSON")
        try:
            parsed = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ExternalServiceError("Pinpoint generation returned invalid JSON") from exc

    if not isinstance(parsed, list):
        raise ExternalServiceError("Pinpoint generation must return a JSON array")

    items: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            raise ExternalServiceError("Pinpoint generation returned a non-object question")
        items.append(item)
    return items


def _normalize_question_row(item: dict[str, Any]) -> dict[str, str]:
    required_keys = ("clue_1", "clue_2", "clue_3", "answer")
    normalized: dict[str, str] = {}

    for key in required_keys:
        value = item.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ExternalServiceError(f"Pinpoint question is missing a valid '{key}' value")
        normalized[key] = value.strip()

    return normalized


def generate_and_save_pinpoint_questions(project_id: str, question_count: int = 10) -> list[dict[str, Any]]:
    if question_count < 1:
        raise ValidationError("question_count must be at least 1")

    project = get_project(project_id)
    project_title = str(project.get("title") or "Project")
    project_description = str(project.get("description") or "").strip()
    summary_text = _safe_get_project_summary(project_id)
    context_text = _safe_get_project_context(project_id, project_title)

    prompt = _build_pinpoint_prompt(
        project_id=project_id,
        project_title=project_title,
        project_description=project_description,
        summary_text=summary_text,
        context_text=context_text,
        question_count=question_count,
    )

    try:
        raw_output = generate_content_or_raise(
            prompt,
            model=PINPOINT_MODEL,
            temperature=PINPOINT_TEMPERATURE,
            max_output_tokens=PINPOINT_MAX_OUTPUT_TOKENS,
        )
    except Exception as exc:
        logger.exception("Pinpoint generation failed for project %s", project_id)
        raise ExternalServiceError(f"Pinpoint generation failed for project {project_id}: {exc}") from exc

    parsed_items = _extract_json_array(raw_output)
    if len(parsed_items) < question_count:
        raise ExternalServiceError(
            f"Pinpoint generation returned only {len(parsed_items)} questions; expected {question_count}"
        )

    payloads: list[dict[str, Any]] = []
    for item in parsed_items[:question_count]:
        normalized = _normalize_question_row(item)
        payloads.append(
            {
                "project_id": project_id,
                **normalized,
            }
        )

    try:
        saved_rows = build_content_repository().replace_project_rows("project_pinpoint", payloads)
    except InfraError:
        raise
    except Exception as exc:
        raise InfraError(f"Failed to save pinpoint questions for project {project_id}: {exc}") from exc

    return saved_rows
