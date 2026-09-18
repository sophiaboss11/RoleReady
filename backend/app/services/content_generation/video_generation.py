"""Deployment-focused video generator (fullbleed slide-images + narrated audio).

This is the "MVP" backend-oriented module.

Design goals (per project request):
- Use Supabase embedding context (pgvector) as grounding context.
- Generate a fixed number of slides (e.g. 8) for a target duration (e.g. 10 minutes).
- Generate ONE Gemini image per slide as a full-bleed infographic: title + natural callouts/arrows.
    (No left-column bullet list; points are integrated into the graphic.)
- Render 16:9 images full-screen; fall back to contain-fit over blurred background for non-16:9 sources.
- Generate audio using Google Cloud Text-to-Speech REST API (female voice + SSML prosody).
- Upload the final MP4 to Supabase Storage and insert a DB row; delete intermediates.

Notes on "Gemini audio": Gemini itself does not expose a reliable TTS API.
To stay on Google infrastructure, this module uses Google Cloud Text-to-Speech.

Frontend control:
- Call `generate_video_from_request_dict(...)` with a JSON-like dict.
- Or run this file as a CLI with `--request <path.json>`.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import datetime
import json
import logging
import math
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import urllib.error
import uuid
import warnings
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from moviepy import AudioFileClip, ImageClip, concatenate_videoclips


VIDEO_SIZE = (1920, 1080)
FPS = 24
DEFAULT_WPM = 155
DEFAULT_COLORS = ["#1E3A8A", "#0F766E", "#6D28D9", "#9A3412", "#0F172A"]


def _clamp_resolution(w: int, h: int) -> tuple[int, int]:
    w = _clamp_int(int(w), 640, 4096)
    h = _clamp_int(int(h), 360, 2160)
    return (w, h)


def _estimate_vertex_gemini_image_cost_usd(
    *,
    slides: int,
    width: int,
    height: int,
    avg_input_tokens_per_image: int = 2000,
) -> Dict[str, float]:
    """Estimate Vertex Gemini image-generation cost.

        Approximation for quick budgeting.

        Assumptions:
        - Gemini 2.5 Flash Image pricing (Vertex):
            - $0.30 / 1M input tokens
            - $30.00 / 1M output image tokens
        - Output image tokens scale roughly with pixel count.
            Pricing docs mention 1024x1024 ~= 1290 image tokens; we scale from that.
        """

    slides = _clamp_int(int(slides), 1, 64)
    width, height = _clamp_resolution(width, height)

    input_price_per_m = 0.30
    image_out_price_per_m = 30.00

    base_px = 1024 * 1024
    base_tokens = 1290.0
    px = float(width * height)
    est_output_image_tokens_per_image = base_tokens * (px / float(base_px))

    total_input_tokens = float(slides * max(0, int(avg_input_tokens_per_image)))
    total_output_image_tokens = float(slides) * est_output_image_tokens_per_image

    est_input_cost = (total_input_tokens / 1_000_000.0) * input_price_per_m
    est_image_cost = (total_output_image_tokens / 1_000_000.0) * image_out_price_per_m
    return {
        "est_input_cost_usd": est_input_cost,
        "est_image_cost_usd": est_image_cost,
        "est_total_cost_usd": est_input_cost + est_image_cost,
        "est_output_image_tokens_per_image": est_output_image_tokens_per_image,
    }


_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "can",
    "for",
    "from",
    "has",
    "have",
    "how",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "more",
    "not",
    "of",
    "on",
    "or",
    "our",
    "such",
    "than",
    "that",
    "the",
    "their",
    "then",
    "there",
    "these",
    "this",
    "to",
    "we",
    "what",
    "when",
    "where",
    "which",
    "with",
    "you",
}


class VideoBackendError(RuntimeError):
    pass


def load_repo_dotenv() -> None:
    """Load environment variables from the repo root `.env` if present.

    This is a tiny loader to avoid introducing dependencies.
    It does NOT override existing environment variables.
    """

    try:
        # Walk upward a few levels to find the nearest `.env`.
        here = os.path.abspath(os.path.dirname(__file__))
        env_path = ""
        cur = here
        for _ in range(8):
            candidate = os.path.join(cur, ".env")
            if os.path.isfile(candidate):
                env_path = candidate
                break
            parent = os.path.dirname(cur)
            if not parent or parent == cur:
                break
            cur = parent
        if not env_path:
            return

        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                if "=" not in s:
                    continue
                k, v = s.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if not k:
                    continue
                if k in os.environ and str(os.environ.get(k) or ""):
                    continue
                os.environ[k] = v

        # Compatibility aliasing: upstream uses SUPABASE_SECRET_KEY.
        # The generator expects SUPABASE_SERVICE_ROLE_KEY.
        if not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
            secret = str(os.environ.get("SUPABASE_SECRET_KEY") or "").strip()
            if secret:
                os.environ["SUPABASE_SERVICE_ROLE_KEY"] = secret
    except Exception:
        return


def _clamp_int(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(value)))


def _uuid_or_none(value: str) -> Optional[str]:
    v = str(value or "").strip()
    if not v:
        return None
    try:
        return str(uuid.UUID(v))
    except Exception:
        return None


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def normalize_text(raw_text: str) -> str:
    return " ".join(str(raw_text or "").split()).strip()


def _safe_relpath(path: str) -> str:
    try:
        return os.path.relpath(path, os.getcwd())
    except Exception:
        return path


def clean_for_speech(text: str) -> str:
    t = normalize_text(text)
    t = re.sub(r"\bhttps?://\S+\b", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"\bwww\.\S+\b", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"\b\S+@\S+\b", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def split_sentences(text: str) -> List[str]:
    s = normalize_text(text)
    if not s:
        return []
    parts = re.split(r"(?<=[.!?])\s+", s)
    return [p.strip() for p in parts if p.strip()]


def _tokenize_words(text: str) -> List[str]:
    t = (text or "").lower()
    t = re.sub(r"[^a-z0-9\s\-]", " ", t)
    words = [w for w in re.split(r"\s+", t) if w]
    return [w for w in words if len(w) >= 3 and w not in _STOPWORDS]


def offline_extract_concepts(text: str, *, top_k: int = 10) -> List[str]:
    words = _tokenize_words(text)
    if not words:
        return []
    freq: Dict[str, int] = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    ranked = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)
    out: List[str] = []
    for w, _ in ranked:
        if w.isdigit():
            continue
        out.append(w)
        if len(out) >= top_k:
            break
    return out


def offline_top_sentences(text: str, *, max_sentences: int = 8) -> List[str]:
    sentences = split_sentences(text)
    if not sentences:
        return []
    all_words = _tokenize_words(text)
    if not all_words:
        return sentences[:max_sentences]
    freq: Dict[str, float] = {}
    for w in all_words:
        freq[w] = freq.get(w, 0.0) + 1.0
    # Normalize
    max_f = max(freq.values()) if freq else 1.0
    for k in list(freq.keys()):
        freq[k] = freq[k] / max_f

    scored: List[tuple[float, str]] = []
    for s in sentences:
        ws = _tokenize_words(s)
        if not ws:
            continue
        score = sum(freq.get(w, 0.0) for w in ws) / max(1, len(ws))
        scored.append((score, s))
    scored.sort(key=lambda kv: kv[0], reverse=True)
    top = [s for _, s in scored[:max_sentences]]
    # Keep original order for readability.
    order = {s: i for i, s in enumerate(sentences)}
    top.sort(key=lambda s: order.get(s, 10**9))
    return top


def offline_summarize_document(filename: str, text: str) -> Dict[str, Any]:
    title = os.path.splitext(os.path.basename(filename))[0]
    concepts = offline_extract_concepts(text, top_k=10)
    outline_lines = offline_top_sentences(text, max_sentences=8)
    outline = "\n".join([f"- {normalize_text(s)[:140]}" for s in outline_lines if normalize_text(s)])
    return {"file": os.path.basename(filename), "title": title, "concepts": concepts, "outline": outline}


def offline_generate_scenes_from_doc_notes(
    *,
    prompt: str,
    notes: List[Dict[str, Any]],
    slides: int,
    words_title: int,
    words_content: int,
    narration_style: str = "podcast",
) -> List[Dict[str, str]]:
    """Create a reasonable 8-slide plan without any LLM calls."""
    slides = _clamp_int(slides, 3, 24)
    if not notes:
        raise VideoBackendError("No document notes available for offline scene generation")

    narration_style = str(narration_style or "podcast").strip().lower()
    if narration_style not in {"podcast", "lecture"}:
        narration_style = "podcast"

    # If slides match doc count, create one slide per document to ensure coverage.
    if slides == len(notes):
        scenes: List[Dict[str, str]] = []
        for idx, n in enumerate(notes):
            title = normalize_text(n.get("title", "")) or f"Document {idx+1}"
            concepts = n.get("concepts") if isinstance(n.get("concepts"), list) else []
            bullets = [normalize_text(c) for c in concepts if isinstance(c, str) and normalize_text(c)][:6]
            while len(bullets) < 3:
                bullets.append("key idea")

            outline = str(n.get("outline") or "").strip()
            outline_sentences = [
                normalize_text(x.lstrip("- "))
                for x in outline.splitlines()
                if normalize_text(x.lstrip("- "))
            ]

            core = " ".join(outline_sentences[:7])
            if narration_style == "podcast":
                question = f"Quick question: why does {bullets[0]} matter? " if bullets else "Quick question: what’s the key idea here? "
                opener = (
                    "We’re going to walk through each document and connect the pipeline end-to-end. "
                    if idx == 0
                    else ""
                )
                closer = (
                    "Finally, connect these pieces into one mental model you can explain out loud. "
                    if idx == len(notes) - 1
                    else ""
                )
                narration = clean_for_speech(question + opener + core + " " + closer + "Pause for a second and try to answer that question before moving on.")
            else:
                opener = "" if idx else "We will go through each document and connect the pipeline end-to-end. "
                closer = "" if idx != len(notes) - 1 else " Finally, connect these stages into one mental model and practice with small demos."
                narration = clean_for_speech(opener + core + closer)

            target_words = words_title if idx == 0 else words_content
            w = narration.split()
            if len(w) > target_words:
                narration = " ".join(w[:target_words]).rstrip() + "."

            scenes.append(
                {
                    "text": "\n".join([title, "", *[f"• {b}" for b in bullets]]),
                    "narration": narration,
                }
            )
        return scenes

    # Group docs across slides 2..N-1
    content_slots = max(1, slides - 2)
    groups: List[List[Dict[str, Any]]] = [[] for _ in range(content_slots)]
    for idx, n in enumerate(notes):
        groups[idx % content_slots].append(n)

    def bullets_for(group: List[Dict[str, Any]]) -> List[str]:
        bag: List[str] = []
        for n in group:
            cs = n.get("concepts") if isinstance(n.get("concepts"), list) else []
            for c in cs:
                c2 = normalize_text(c)
                if c2 and c2 not in bag:
                    bag.append(c2)
        # Turn raw tokens into short bullet phrases.
        bullets = []
        for w in bag:
            bullets.append(w.replace("-", " ").strip())
            if len(bullets) >= 6:
                break
        while len(bullets) < 3 and bag:
            bullets.append(bag[len(bullets) % len(bag)])
        return bullets[:6] if bullets else ["key ideas", "core pipeline", "practical examples"]

    def narration_for(title: str, bullets: List[str], group: List[Dict[str, Any]], target_words: int) -> str:
        # Use outlines as source sentences; keep it concise.
        sentences: List[str] = []
        for n in group:
            outline = str(n.get("outline") or "")
            for line in outline.splitlines():
                line = normalize_text(line.lstrip("- "))
                if line and len(line.split()) >= 6:
                    sentences.append(line)
        b = ", ".join(bullets[:4])
        body = " ".join(sentences[:6])
        if narration_style == "podcast":
            hook = f"Quick question: can you explain {bullets[0]} in one sentence? " if bullets else "Quick question: what’s the mental model? "
            framing = (
                f"Let’s unpack {title.lower()} like we’re debugging it together. "
                if title
                else "Let’s unpack this like we’re debugging it together. "
            )
            anchors = f"Here are the anchor points: {b}. " if b else ""
            takeaway = f"If you remember one thing, it’s this: {bullets[0]}. " if bullets else "If you remember one thing, it’s the mental model. "
            cta = "Pause for a moment and predict what happens next. "
            text = clean_for_speech(hook + framing + anchors + body + " " + takeaway + cta)
        else:
            intro = f"In this section, we focus on {title.lower()}. "
            middle = f"Key points include {b}. " if b else ""
            text = clean_for_speech(intro + middle + body)
        # Trim to approximate target word count.
        words = text.split()
        if len(words) > target_words:
            text = " ".join(words[:target_words]).rstrip() + "."
        return text

    scenes: List[Dict[str, str]] = []

    # Slide 1: title/agenda
    all_titles = [normalize_text(n.get("title", "")) for n in notes if normalize_text(n.get("title", ""))]
    agenda = []
    for t in all_titles:
        if t and t not in agenda:
            agenda.append(t)
        if len(agenda) >= 5:
            break
    title1 = "Main Concepts Overview"
    bullets1 = ["What these lectures cover", "Key graphics pipeline stages", "How transforms map geometry", "How GPUs render efficiently", "Where raymarching fits"]
    if agenda:
        bullets1 = ["Roadmap across the documents"] + agenda[:5]
        bullets1 = bullets1[:6]
    narr1 = narration_for(title1, bullets1, notes[:2], words_title)
    scenes.append({"text": "\n".join([title1, "", *[f"• {b}" for b in bullets1]]), "narration": narr1})

    # Slides 2..N-1
    for i, group in enumerate(groups, start=2):
        group_titles = [normalize_text(n.get("title", "")) for n in group if normalize_text(n.get("title", ""))]
        if len(group_titles) >= 2:
            slide_title = f"{group_titles[0]} + {group_titles[1]}"
        else:
            slide_title = group_titles[0] if group_titles else f"Topic Group {i-1}"
        bullets = bullets_for(group)
        narr = narration_for(slide_title, bullets, group, words_content)
        scenes.append({"text": "\n".join([slide_title, "", *[f"• {b}" for b in bullets]]), "narration": narr})

    # Final slide: recap
    title_last = "Wrap-up & How to Use This"
    bullets_last = ["Connect stages into one pipeline", "Common pitfalls and checks", "When to use each technique", "Practice: implement small demos", "Next: combine animation + lighting"]
    narr_last = narration_for(title_last, bullets_last, notes[-2:], words_content)
    scenes.append({"text": "\n".join([title_last, "", *[f"• {b}" for b in bullets_last]]), "narration": narr_last})

    # Ensure exact slide count.
    if len(scenes) > slides:
        scenes = scenes[:slides]
    while len(scenes) < slides:
        scenes.append(scenes[-1])
    return scenes


def escape_ssml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def apply_prosody_heuristics(narration: str) -> str:
    """Simple SSML with pauses/pitch/rate variation."""

    narration = clean_for_speech(narration)
    if not narration:
        return ""

    sentences = split_sentences(narration) or [narration]

    pitch_cycle = ["+2%", "+0%", "+4%", "-1%"]
    rate_cycle = ["+1%", "+0%", "+2%", "-1%"]

    out: List[str] = []
    for idx, s in enumerate(sentences):
        esc = escape_ssml(s)
        pitch = pitch_cycle[idx % len(pitch_cycle)]
        rate = rate_cycle[idx % len(rate_cycle)]
        if s.endswith("!"):
            out.append(f"<emphasis level=\"strong\"><prosody pitch=\"+10%\" rate=\"+5%\">{esc}</prosody></emphasis>")
            out.append('<break time="320ms"/>')
        elif s.endswith("?"):
            out.append(f"<prosody pitch=\"+6%\" rate=\"+2%\">{esc}</prosody>")
            out.append('<break time="260ms"/>')
        else:
            out.append(f"<prosody pitch=\"{pitch}\" rate=\"{rate}\">{esc}</prosody>")
            out.append('<break time="220ms"/>')

    ssml_body = " ".join(out)
    ssml_body = re.sub(r",\s+", ', <break time="140ms"/>', ssml_body)
    ssml_body = re.sub(r";\s+", '; <break time="180ms"/>', ssml_body)
    ssml_body = re.sub(r":\s+", ': <break time="180ms"/>', ssml_body)
    return ssml_body.strip()


def build_tts_ssml(text: str) -> str:
    body = apply_prosody_heuristics(text)
    if not body:
        body = escape_ssml(clean_for_speech(text))
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">'
        f"{body}"
        "</speak>"
    )


def _http_json(
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    body: Optional[dict] = None,
    timeout_s: int = 60,
) -> Any:
    data_bytes = None
    if body is not None:
        data_bytes = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data_bytes,
        method="POST",
        headers={"content-type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=int(timeout_s)) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read().decode("utf-8", errors="replace")
        except Exception:
            raw = ""
        raise VideoBackendError(f"HTTP {exc.code} calling {url}: {raw[:1600]}") from exc


def _http_json_generate(
    *,
    api_key: str,
    model: str,
    prompt: str,
    temperature: float,
    max_output_tokens: int,
    timeout_s: int,
) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(model)}:generateContent"

    # Thinking models (gemini-2.5-pro) use output tokens for internal reasoning.
    # Scale up the budget so the actual text response still has room.
    _is_thinking = any(model.startswith(p) for p in ("gemini-2.5-pro", "gemini-2.0-pro"))
    _MAX_THINKING_BUDGET = 24576  # keep well under API ceiling of 32768
    if _is_thinking:
        thinking_budget = min(max_output_tokens * 8, _MAX_THINKING_BUDGET)
        effective_max_tokens = max_output_tokens + thinking_budget
    else:
        effective_max_tokens = max_output_tokens

    generation_config: Dict[str, Any] = {
        "temperature": float(temperature),
        "maxOutputTokens": int(effective_max_tokens),
    }
    if _is_thinking:
        generation_config["thinkingConfig"] = {
            "thinkingBudget": int(thinking_budget),
        }

    data = _http_json(
        url,
        headers={"x-goog-api-key": api_key},
        body={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation_config,
        },
        timeout_s=int(timeout_s),
    )

    parts = (
        (data or {})
        .get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    # For thinking models, filter out thought parts (thought: true) and keep only text output
    raw = "".join([
        str(p.get("text", ""))
        for p in parts
        if isinstance(p, dict) and not p.get("thought", False)
    ]).strip()
    return raw


def extract_pdf_text(path: str, *, max_pages: int = 40, max_chars: int = 120_000) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception as exc:
        raise VideoBackendError("pypdf is required to read PDFs") from exc

    # pypdf can emit noisy conversion warnings for some PDFs; keep output clean.
    try:
        logging.getLogger("pypdf").setLevel(logging.ERROR)
        warnings.filterwarnings("ignore", module="pypdf")
    except Exception:
        pass

    reader = PdfReader(path)
    parts: List[str] = []
    for i, page in enumerate(reader.pages[: max(1, int(max_pages))]):
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        t = normalize_text(t)
        if t:
            parts.append(t)
        joined = "\n".join(parts)
        if len(joined) >= max_chars:
            return joined[:max_chars]
    return "\n".join(parts)[:max_chars]


def summarize_document_to_notes(
    *,
    api_key: str,
    model: str,
    filename: str,
    text: str,
) -> Dict[str, Any]:
    """Summarize a single document into compact notes for later scene generation."""
    api_key = str(api_key or "").strip()
    if not api_key:
        raise VideoBackendError("Missing GEMINI_API_KEY")

    text = (text or "").strip()
    if not text:
        return {"file": filename, "title": filename, "concepts": [], "outline": ""}

    # Keep prompt compact; we already truncated extraction.
    prompt = "\n".join(
        [
            "You summarize technical lecture notes into key concepts.",
            "Return ONLY valid JSON (no markdown, no commentary).",
            "Schema:",
            "{\"file\": string, \"title\": string, \"concepts\": [string], \"outline\": string}",
            "Rules:",
            "- concepts: 6 to 10 short phrases.",
            "- outline: 6 to 10 bullet lines separated by \n, each <= 12 words.",
            "- do not invent claims; only use what appears in the text.",
            "",
            f"FILE: {filename}",
            "TEXT:",
            text,
        ]
    )

    raw = _http_json_generate(
        api_key=api_key,
        model=model,
        prompt=prompt,
        temperature=0.2,
        max_output_tokens=700,
        timeout_s=60,
    ).strip()

    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except Exception:
        # Fall back to a minimal record.
        return {"file": filename, "title": filename, "concepts": [], "outline": raw[:2000]}

    if not isinstance(parsed, dict):
        return {"file": filename, "title": filename, "concepts": [], "outline": raw[:2000]}

    parsed.setdefault("file", filename)
    parsed.setdefault("title", filename)
    if not isinstance(parsed.get("concepts"), list):
        parsed["concepts"] = []
    parsed["concepts"] = [normalize_text(x) for x in parsed["concepts"] if isinstance(x, str) and normalize_text(x)]
    parsed["concepts"] = parsed["concepts"][:10]
    parsed["outline"] = str(parsed.get("outline") or "")
    return parsed


def build_context_from_documents_dir(
    *,
    api_key: str,
    model: str,
    documents_dir: str,
    summarizer: str = "auto",
) -> Dict[str, Any]:
    documents_dir = os.path.abspath(documents_dir)
    if not os.path.isdir(documents_dir):
        raise VideoBackendError(f"documents_dir not found: {documents_dir}")

    pdfs = []
    for name in sorted(os.listdir(documents_dir)):
        p = os.path.join(documents_dir, name)
        if os.path.isfile(p) and name.lower().endswith(".pdf"):
            pdfs.append(p)

    if not pdfs:
        raise VideoBackendError(f"No PDFs found in documents_dir: {documents_dir}")

    notes: List[Dict[str, Any]] = []
    for p in pdfs:
        fname = os.path.basename(p)
        text = extract_pdf_text(p)
        s = str(summarizer or "auto").strip().lower()
        if s not in {"auto", "gemini", "offline"}:
            s = "auto"
        if s == "offline":
            notes.append(offline_summarize_document(fname, text))
            continue

        try:
            notes.append(
                summarize_document_to_notes(
                    api_key=api_key,
                    model=model,
                    filename=fname,
                    text=text,
                )
            )
        except VideoBackendError as exc:
            msg = str(exc)
            # Quota/rate-limit fallback.
            if s == "auto" and ("HTTP 429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower()):
                notes.append(offline_summarize_document(fname, text))
                continue
            raise

    # Build a compact combined context.
    chunks: List[str] = []
    for n in notes:
        title = normalize_text(n.get("title", "")) or str(n.get("file", ""))
        concepts = n.get("concepts") if isinstance(n.get("concepts"), list) else []
        outline = str(n.get("outline") or "").strip()
        concept_line = "; ".join([normalize_text(c) for c in concepts if isinstance(c, str) and normalize_text(c)])
        chunks.append(
            "\n".join(
                [
                    f"DOC: {n.get('file', '')}",
                    f"TITLE: {title}",
                    (f"CONCEPTS: {concept_line}" if concept_line else "CONCEPTS:"),
                    (f"OUTLINE:\n{outline}" if outline else "OUTLINE:"),
                ]
            ).strip()
        )

    return {"notes": notes, "context": "\n\n".join(chunks).strip(), "count": len(pdfs)}


def gemini_embed(
    prompt: str,
    *,
    api_key: str,
    model: str = "gemini-embedding-001",
    gemini_backend: str = "ai_studio",
    vertex_project: Optional[str] = None,
    vertex_location: Optional[str] = None,
) -> List[float]:
    backend = str(gemini_backend or "ai_studio").strip().lower()
    if backend not in {"ai_studio", "vertex"}:
        backend = "ai_studio"

    model = str(model or "").strip() or "gemini-embedding-001"

    if backend == "vertex":
        try:
            from google import genai  # type: ignore
        except Exception as exc:
            raise VideoBackendError("Install google-genai to generate embeddings via Vertex") from exc

        project = (vertex_project or os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
        location = (
            vertex_location
            or os.getenv("GOOGLE_CLOUD_LOCATION")
            or os.getenv("GOOGLE_CLOUD_REGION")
            or ""
        ).strip()
        if not project or not location:
            raise VideoBackendError(
                "Vertex embedding requires vertex_project/vertex_location (or env GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION)"
            )

        client = genai.Client(vertexai=True, project=project, location=location)
        try:
            resp = client.models.embed_content(model=model, contents=[str(prompt or "")])
        except Exception as exc:
            raise VideoBackendError(f"Vertex embedContent failed: {exc}") from exc

        values = None
        if getattr(resp, "embedding", None) is not None:
            values = getattr(getattr(resp, "embedding"), "values", None)
        if values is None and getattr(resp, "embeddings", None):
            try:
                values = getattr(resp.embeddings[0], "values", None)
            except Exception:
                values = None

        if not isinstance(values, list) or not values:
            raise VideoBackendError("Vertex embedContent returned no embedding values")
        return [float(v) for v in values]

    api_key = str(api_key or "").strip()
    if not api_key:
        raise VideoBackendError("Missing GEMINI_API_KEY")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(model)}:embedContent"
    data = _http_json(
        url,
        headers={"x-goog-api-key": api_key},
        body={"content": {"parts": [{"text": str(prompt or "")}]}} ,
        timeout_s=40,
    )
    values = (data or {}).get("embedding", {}).get("values")
    if not isinstance(values, list) or not values:
        raise VideoBackendError("Gemini embedContent returned no embedding values")
    return [float(v) for v in values]


@dataclass(frozen=True)
class MatchDoc:
    id: str
    content: str
    source: Optional[str]
    document_id: Optional[str]
    chunk_index: Optional[int]
    metadata: Any
    similarity: float


class SupabaseHTTP:
    def __init__(self, *, url: str, service_key: str):
        self.url = str(url or "").rstrip("/")
        self.key = str(service_key or "").strip()
        if not self.url or not self.key:
            raise VideoBackendError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    def _headers(self) -> Dict[str, str]:
        return {"apikey": self.key, "authorization": f"Bearer {self.key}"}

    def rpc(self, fn: str, payload: dict) -> Any:
        url = f"{self.url}/rest/v1/rpc/{urllib.parse.quote(str(fn))}"
        return _http_json(url, headers=self._headers(), body=payload, timeout_s=50)

    def insert_row(self, table: str, row: dict) -> dict:
        url = f"{self.url}/rest/v1/{urllib.parse.quote(str(table))}"
        headers = {**self._headers(), "prefer": "return=representation"}
        data = _http_json(url, headers=headers, body=[row], timeout_s=40)
        if isinstance(data, list) and data:
            return data[0]
        return {} if data is None else data

    def upload_storage(self, *, bucket: str, object_path: str, local_file_path: str, content_type: str) -> None:
        bucket = str(bucket or "").strip()
        object_path = str(object_path or "").lstrip("/")
        if not bucket or not object_path:
            raise VideoBackendError("bucket/object_path required")
        with open(local_file_path, "rb") as f:
            payload = f.read()
        url = f"{self.url}/storage/v1/object/{urllib.parse.quote(bucket)}/{urllib.parse.quote(object_path)}"
        req = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                **self._headers(),
                "content-type": content_type,
                "x-upsert": "true",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                _ = resp.read()
        except urllib.error.HTTPError as exc:
            try:
                raw = exc.read().decode("utf-8", errors="replace")
            except Exception:
                raw = ""
            raise VideoBackendError(f"HTTP {exc.code} uploading to Storage: {raw[:1200]}") from exc

    def public_url(self, *, bucket: str, object_path: str) -> str:
        bucket = str(bucket or "").strip()
        object_path = str(object_path or "").lstrip("/")
        return f"{self.url}/storage/v1/object/public/{bucket}/{object_path}"


def match_embedding_context(
    *,
    supabase: SupabaseHTTP,
    gemini_api_key: str,
    query: str,
    project_id: Optional[str],
    match_count: int,
    rpc_name: str = "match_embedding",
    embedding_model: str = "gemini-embedding-001",
    gemini_backend: str = "ai_studio",
    vertex_project: Optional[str] = None,
    vertex_location: Optional[str] = None,
) -> List[MatchDoc]:
    vec = gemini_embed(
        query,
        api_key=gemini_api_key,
        model=embedding_model,
        gemini_backend=gemini_backend,
        vertex_project=vertex_project,
        vertex_location=vertex_location,
    )
    payload: Dict[str, Any] = {"query_embedding": vec, "match_count": _clamp_int(match_count, 1, 20)}
    if project_id:
        payload["filter_project_id"] = project_id
    rows = supabase.rpc(rpc_name, payload)
    if not isinstance(rows, list):
        raise VideoBackendError(f"Supabase RPC {rpc_name} returned non-list: {rows!r}")
    out: List[MatchDoc] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        out.append(
            MatchDoc(
                id=str(r.get("id", "")),
                content=str(r.get("content", "") or ""),
                source=None if r.get("source") is None else str(r.get("source")),
                document_id=None if r.get("document_id") is None else str(r.get("document_id")),
                chunk_index=None if r.get("chunk_index") is None else int(r.get("chunk_index")),
                metadata=r.get("metadata"),
                similarity=float(r.get("similarity", 0.0) or 0.0),
            )
        )
    return out


def build_context_text(matches: List[MatchDoc]) -> str:
    parts: List[str] = []
    for idx, d in enumerate(matches, start=1):
        header_bits: List[str] = []
        if d.source:
            header_bits.append(f"src:{d.source}")
        if d.document_id:
            header_bits.append(f"doc:{d.document_id}")
        if d.chunk_index is not None:
            header_bits.append(f"chunk:{d.chunk_index}")
        header = " ".join(header_bits) if header_bits else d.id
        parts.append(f"[{idx}] {header}\n{d.content}")
    return "\n\n".join(parts).strip()


def compute_words_per_slide(*, target_minutes: float, wpm: int, slides: int) -> Dict[str, int]:
    slides = _clamp_int(slides, 3, 24)
    wpm = _clamp_int(wpm, 120, 190)
    target_minutes = max(1.0, min(40.0, float(target_minutes)))

    total_words = int(round(target_minutes * wpm))
    # Keep title slide shorter; allocate remaining evenly.
    title_words = _clamp_int(int(round(total_words * 0.06)), 45, 120)
    remaining = max(0, total_words - title_words)
    per_content = int(round(remaining / max(1, slides - 1)))
    per_content = _clamp_int(per_content, 110, 260)
    return {"total": total_words, "title": title_words, "content": per_content}


def gemini_generate_scenes(
    *,
    api_key: str,
    model: str,
    prompt: str,
    context: str,
    slides: int,
    words_title: int,
    words_content: int,
    gemini_backend: str = "ai_studio",
    vertex_project: Optional[str] = None,
    vertex_location: Optional[str] = None,
) -> List[Dict[str, str]]:
    """Returns list of scenes: {text, narration}. Text contains title + bullets."""

    backend = str(gemini_backend or "ai_studio").strip().lower()
    if backend not in {"ai_studio", "vertex"}:
        backend = "ai_studio"

    slides = _clamp_int(slides, 3, 24)

    instruction = "\n".join(
        [
            "You are generating a narrated slideshow script for a 16:9 educational video.",
            "Return ONLY valid JSON (no markdown).",
            "Output must be a JSON array of EXACTLY N objects (one per slide) in order.",
            "Each object must have keys:",
            "  - title: string (<= 8 words)",
            "  - bullets: array of 3 to 6 strings (each <= 9 words)",
            "  - narration: string (podcast-like monologue; natural, engaging, ask 1–2 thoughtful questions)",
            "Constraints:",
            "- Slide 1 is a title slide: bullets should describe the agenda/key themes.",
            "- All facts must be grounded in the provided context snippets; do not invent specifics.",
            "Tone rules:",
            "- Avoid saying 'in this slide' or sounding like a lecture.",
            "- Use second-person prompts like 'pause and think' or 'try to predict'.",
        ]
    )

    user = "\n".join(
        [
            f"N = {slides}",
            f"Target narration length: slide 1 about {words_title} words; slides 2..N about {words_content} words each.",
            "",
            f"User prompt: {prompt}",
            "",
            "Context snippets:",
            context or "(no context)",
        ]
    )

    full_prompt = (instruction + "\n\n" + user).strip()

    if backend == "vertex":
        try:
            from google import genai  # type: ignore
            from google.genai import types  # type: ignore
        except Exception as exc:
            raise VideoBackendError("Install google-genai to generate scenes via Vertex") from exc

        # For Vertex AI, some SDK versions require fully-qualified model names.
        model = str(model or "").strip() or "gemini-2.5-pro"
        if "/" not in model:
            model = f"publishers/google/models/{model}"

        project = (vertex_project or os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
        location = (
            vertex_location
            or os.getenv("GOOGLE_CLOUD_LOCATION")
            or os.getenv("GOOGLE_CLOUD_REGION")
            or ""
        ).strip()
        if not project or not location:
            raise VideoBackendError(
                "Vertex scenes require vertex_project/vertex_location (or env GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION)"
            )

        client = genai.Client(vertexai=True, project=project, location=location)

        # Scene generation returns a fairly large JSON payload (8 slides x narration).
        # 2400 tokens is sometimes not enough and can lead to truncated/invalid JSON.
        config = types.GenerateContentConfig(
            temperature=0.35,
            max_output_tokens=8192,
            response_mime_type="application/json",
        )

        def _extract_text(resp: object) -> str:
            t = getattr(resp, "text", None)
            if isinstance(t, str) and t.strip():
                return t
            candidates = getattr(resp, "candidates", None)
            if isinstance(candidates, list) and candidates:
                try:
                    content = candidates[0].content
                    parts = getattr(content, "parts", None) or []
                    for p in parts:
                        txt = getattr(p, "text", None)
                        if isinstance(txt, str) and txt.strip():
                            return txt
                except Exception:
                    pass
            return ""

        def _is_transient_quota_error(exc: Exception) -> bool:
            msg = str(exc or "")
            return (
                "RESOURCE_EXHAUSTED" in msg
                or "429" in msg
                or "rate" in msg.lower()
                or "quota" in msg.lower()
            )

        # First, retry transient quota/rate errors on the Vertex call itself.
        resp = None
        last_exc: Optional[Exception] = None
        for attempt in range(1, 7):
            try:
                if attempt > 1:
                    time.sleep(min(2.0 * attempt, 10.0))
                resp = client.models.generate_content(model=model, contents=[full_prompt], config=config)
                last_exc = None
                break
            except Exception as exc:
                last_exc = exc
                if not _is_transient_quota_error(exc) or attempt >= 6:
                    raise VideoBackendError(f"Vertex scenes generation failed: {exc}") from exc
                backoff = min(4.0 * (2 ** (attempt - 1)), 48.0)
                time.sleep(backoff)

        if resp is None:
            raise VideoBackendError(f"Vertex scenes generation failed: {last_exc}")

        raw = _extract_text(resp).strip()
        if not raw:
            raise VideoBackendError("Vertex returned no text for scenes")

        # Second, if the model still returns invalid/truncated JSON, retry once with a
        # stricter “JSON only” nudge.
        raw_clean = raw.replace("```json", "").replace("```", "").strip()
        try:
            parsed = json.loads(raw_clean)
        except Exception:
            retry_prompt = (
                full_prompt
                + "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a complete, valid JSON array."
                + " Do not include markdown fences. Do not include unescaped newlines inside strings."
            )
            try:
                resp2 = client.models.generate_content(model=model, contents=[retry_prompt], config=config)
                raw2 = _extract_text(resp2).strip()
                if raw2:
                    raw = raw2
            except Exception:
                # Fall back to original raw; error message below will show the prefix.
                pass
    else:
        api_key = str(api_key or "").strip()
        if not api_key:
            raise VideoBackendError("Missing GEMINI_API_KEY")
        raw = _http_json_generate(
            api_key=api_key,
            model=model,
            prompt=full_prompt,
            temperature=0.35,
            max_output_tokens=4096,
            timeout_s=90,
        ).strip()

    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
    except Exception as exc:
        raise VideoBackendError(f"Gemini scenes JSON parse failed: {raw[:600]}") from exc

    if not isinstance(parsed, list) or len(parsed) != slides:
        raise VideoBackendError(f"Gemini must return exactly {slides} slides")

    scenes: List[Dict[str, str]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        title = normalize_text(item.get("title", ""))
        bullets = item.get("bullets")
        narration = clean_for_speech(item.get("narration", ""))
        if not isinstance(bullets, list):
            bullets = []
        bullets_clean = [normalize_text(b) for b in bullets if isinstance(b, str) and normalize_text(b)]
        bullets_clean = bullets_clean[:6]
        if not title or len(bullets_clean) < 3 or not narration:
            continue

        text = "\n".join([title, "", *[f"• {b}" for b in bullets_clean]])
        scenes.append({"text": text, "narration": narration})

    if len(scenes) != slides:
        raise VideoBackendError("Gemini scenes JSON had unusable slides")

    return scenes


def google_tts_synthesize_mp3(
    *,
    api_key: str,
    ssml: str,
    voice_name: str = "en-US-Neural2-F",
    speaking_rate: float = 1.02,
    pitch: float = 1.5,
) -> bytes:
    """Google Cloud Text-to-Speech via REST API key. Returns MP3 bytes."""

    api_key = str(api_key or "").strip()
    if not api_key:
        raise VideoBackendError("Missing GOOGLE_TTS_API_KEY (Google Cloud Text-to-Speech)")

    url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={urllib.parse.quote(api_key)}"
    payload = {
        "input": {"ssml": ssml},
        "voice": {"languageCode": "en-US", "name": voice_name},
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate": float(speaking_rate),
            "pitch": float(pitch),
            "effectsProfileId": ["handset-class-device"],
        },
    }

    data = _http_json(url, body=payload, timeout_s=60)
    audio_b64 = (data or {}).get("audioContent")
    if not isinstance(audio_b64, str) or not audio_b64.strip():
        raise VideoBackendError("Google TTS returned no audioContent")
    return base64.b64decode(audio_b64)


async def synthesize_scene_audio_files(
    scenes: List[Dict[str, str]],
    out_dir: str,
    *,
    tts_provider: str,
    google_tts_api_key: str,
    voice_name: str,
    speaking_rate: float,
    pitch: float,
    concurrency: int = 3,
) -> List[str]:
    ensure_dir(out_dir)
    sem = asyncio.Semaphore(max(1, int(concurrency)))
    paths: List[str] = [""] * len(scenes)

    tts_provider = str(tts_provider or "auto").strip().lower()
    if tts_provider not in {"auto", "google", "edge"}:
        tts_provider = "auto"

    async def edge_synth_mp3(text: str, out_path: str) -> None:
        try:
            import edge_tts  # type: ignore
        except Exception as exc:
            raise VideoBackendError("edge-tts is required for Edge TTS fallback") from exc

        # edge-tts wants plain text; SSML is not guaranteed to be supported.
        clean = clean_for_speech(text)
        communicate = edge_tts.Communicate(
            clean,
            voice=voice_name,
            rate="+2%",
            pitch="+2Hz",
        )
        await communicate.save(out_path)

    async def one(i: int, scene: Dict[str, str]) -> None:
        async with sem:
            p = os.path.join(out_dir, f"scene_{i+1:03d}.mp3")

            provider = tts_provider
            if provider == "auto":
                provider = "google" if str(google_tts_api_key or "").strip() else "edge"

            if provider == "google":
                ssml = build_tts_ssml(scene.get("narration", ""))
                mp3_bytes = await asyncio.to_thread(
                    google_tts_synthesize_mp3,
                    api_key=google_tts_api_key,
                    ssml=ssml,
                    voice_name=voice_name,
                    speaking_rate=float(speaking_rate),
                    pitch=float(pitch),
                )
                with open(p, "wb") as f:
                    f.write(mp3_bytes)
            else:
                await edge_synth_mp3(scene.get("narration", ""), p)
            paths[i] = p

    await asyncio.gather(*(one(i, s) for i, s in enumerate(scenes)))
    return paths


def hex_to_rgb(color: str) -> tuple[int, int, int]:
    color = str(color or "").lstrip("#")
    if len(color) != 6:
        return (15, 23, 42)
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))


def _render_fullbleed_from_image(*, image_path: str, out_png: str) -> None:
    try:
        from PIL import Image, ImageFilter  # type: ignore
    except Exception as exc:
        raise VideoBackendError("Pillow is required") from exc

    w, h = VIDEO_SIZE
    im = Image.open(image_path).convert("RGB")

    sw, sh = im.size
    src_ar = sw / max(1.0, float(sh))
    target_ar = w / max(1.0, float(h))

    # If the source is already ~16:9, render it full-screen directly.
    # This avoids the "presentation template" look (blurred background + centered slide).
    if abs(src_ar - target_ar) <= 0.03:
        canvas = im.resize((w, h), resample=Image.Resampling.LANCZOS)
        ensure_dir(os.path.dirname(out_png))
        canvas.save(out_png, format="PNG", optimize=True)
        return

    def fit_cover(src: Image.Image, tw: int, th: int) -> Image.Image:
        sw, sh = src.size
        scale = max(tw / max(1, sw), th / max(1, sh))
        nw, nh = max(1, int(sw * scale)), max(1, int(sh * scale))
        im2 = src.resize((nw, nh), resample=Image.Resampling.LANCZOS)
        left = max(0, (nw - tw) // 2)
        top = max(0, (nh - th) // 2)
        return im2.crop((left, top, left + tw, top + th))

    def fit_contain(src: Image.Image, tw: int, th: int) -> Image.Image:
        sw, sh = src.size
        scale = min(tw / max(1, sw), th / max(1, sh))
        nw, nh = max(1, int(sw * scale)), max(1, int(sh * scale))
        return src.resize((nw, nh), resample=Image.Resampling.LANCZOS)

    bg = fit_cover(im, w, h)
    try:
        bg = bg.filter(ImageFilter.GaussianBlur(radius=18))
        bg = Image.blend(bg, Image.new("RGB", (w, h), (0, 0, 0)), alpha=0.22)
    except Exception:
        pass

    fg = fit_contain(im, w, h)
    canvas = bg.copy()
    ox = max(0, (w - fg.size[0]) // 2)
    oy = max(0, (h - fg.size[1]) // 2)
    canvas.paste(fg, (ox, oy))

    ensure_dir(os.path.dirname(out_png))
    canvas.save(out_png, format="PNG", optimize=True)


def _render_text_slide_png(*, slide_text: str, out_png: str) -> None:
    """Render a simple 16:9 slide with title + bullets.

    This is the fallback path when Gemini image generation is unavailable.
    """

    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore
    except Exception as exc:
        raise VideoBackendError("Pillow is required to render text slides") from exc

    w, h = VIDEO_SIZE
    img = Image.new("RGB", (w, h), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Fonts: try common Windows fonts, then default.
    def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
        candidates = []
        if os.name == "nt":
            candidates += [
                ("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
                ("C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf"),
                ("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
            ]
        for p in candidates:
            try:
                return ImageFont.truetype(p, size=size)
            except Exception:
                continue
        try:
            return ImageFont.truetype("DejaVuSans.ttf", size=size)
        except Exception:
            return ImageFont.load_default()

    scale = max(1.0, float(h) / 720.0)
    title_font = load_font(max(18, int(54 * scale)), bold=True)
    bullet_font = load_font(max(14, int(36 * scale)), bold=False)
    small_font = load_font(max(12, int(24 * scale)), bold=False)

    # Parse slide text: first line is title; remaining bullet lines start with .
    lines = [ln.rstrip() for ln in str(slide_text or "").splitlines()]
    lines = [ln for ln in lines if ln.strip()]
    title = lines[0].strip() if lines else "Slide"
    bullets = []
    for ln in lines[1:]:
        s = ln.strip()
        if s.startswith(""):
            s = s.lstrip("").strip()
        if s:
            bullets.append(s)

    # Layout
    margin = 70
    top = 55
    left_col_w = int(w * 0.60)
    right_col_x = margin + left_col_w + 30

    # Title
    draw.text((margin, top), title, fill=(10, 10, 10), font=title_font)
    top += 85

    # Bullets (wrapped)
    import textwrap

    y = top
    for b in bullets[:6]:
        wrapped = textwrap.wrap(b, width=32)
        for j, line in enumerate(wrapped[:2]):
            prefix = " " if j == 0 else "   "
            draw.text((margin, y), prefix + line, fill=(25, 25, 25), font=bullet_font)
            y += 46
        y += 10

    # Diagram placeholder box
    box_top = top
    box_left = right_col_x
    box_right = w - margin
    box_bottom = h - margin
    draw.rounded_rectangle(
        (box_left, box_top, box_right, box_bottom),
        radius=24,
        outline=(80, 80, 80),
        width=4,
        fill=(245, 245, 245),
    )
    draw.text(
        (box_left + 20, box_top + 20),
        "Diagram (placeholder)",
        fill=(60, 60, 60),
        font=small_font,
    )
    if bullets:
        kws = ", ".join([normalize_text(x) for x in bullets[:3]])
        draw.text(
            (box_left + 20, box_top + 60),
            normalize_text(kws)[:90],
            fill=(80, 80, 80),
            font=small_font,
        )

    ensure_dir(os.path.dirname(out_png))
    img.save(out_png, format="PNG", optimize=True)


def generate_gemini_slide_images(
    *,
    scenes: List[Dict[str, str]],
    out_dir: str,
    gemini_api_key: str,
    model: str = "gemini-3-pro-image-preview",
    image_size: str = "1K",
    gemini_backend: str = "ai_studio",
    vertex_project: Optional[str] = None,
    vertex_location: Optional[str] = None,
) -> List[str]:
    """Generate ONE image per slide using google-genai SDK."""

    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore
    except Exception as exc:
        raise VideoBackendError("Install google-genai to generate images") from exc

    ensure_dir(out_dir)

    backend = str(gemini_backend or "ai_studio").strip().lower()
    if backend not in {"ai_studio", "vertex"}:
        backend = "ai_studio"

    model = str(model or "").strip() or "gemini-3-pro-image-preview"
    if backend == "vertex":
        # For Vertex AI, some SDK versions require fully-qualified model names.
        # Example: publishers/google/models/gemini-3-pro-image-preview
        if "/" not in model:
            model = f"publishers/google/models/{model}"

    if backend == "vertex":
        project = (vertex_project or os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
        location = (
            vertex_location
            or os.getenv("GOOGLE_CLOUD_LOCATION")
            or os.getenv("GOOGLE_CLOUD_REGION")
            or ""
        ).strip()
        if not project or not location:
            raise VideoBackendError(
                "Vertex backend requires vertex_project/vertex_location (or env GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION)"
            )
        client = genai.Client(vertexai=True, project=project, location=location)
    else:
        client = genai.Client(api_key=gemini_api_key) if gemini_api_key else genai.Client()

    image_size = str(image_size or "1K").strip().upper()
    if image_size not in {"1K", "2K", "4K"}:
        image_size = "1K"

    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="16:9", image_size=image_size),
    )

    def _is_transient_quota_error(exc: Exception) -> bool:
        msg = str(exc or "")
        return (
            "RESOURCE_EXHAUSTED" in msg
            or "429" in msg
            or "rate" in msg.lower()
            or "quota" in msg.lower()
        )

    image_paths: List[str] = []
    for idx, scene in enumerate(scenes, start=1):
        slide_dir = os.path.join(out_dir, f"slide_{idx:03d}")
        ensure_dir(slide_dir)
        out_path = os.path.join(slide_dir, "gemini_1.png")
        if os.path.exists(out_path):
            image_paths.append(out_path)
            continue

        # Extract title + bullets from scene text
        lines = str(scene.get("text") or "").splitlines()
        title = normalize_text(lines[0] if lines else f"Slide {idx}")
        bullets = []
        for ln in lines[1:]:
            ln = ln.strip()
            if ln.startswith("•"):
                bullets.append(normalize_text(ln.lstrip("•").strip()))
        bullets = [b for b in bullets if b][:6]

        points_str = "\n".join([f"- {b}" for b in bullets]) if bullets else "- (no points)"

        prompt = "\n".join(
            [
                "Create ONE full-bleed educational infographic image (16:9).",
                "Core requirements:",
                "- The title must be visible as text INSIDE the image.",
                "- Do NOT use a slide template and do NOT use a left-column bullet list.",
                "Composition:",
                "- Make it a single cohesive diagram/picture that fills the whole frame.",
                "- Place the key points as natural callout labels near relevant parts of the graphic.",
                "- Use arrows/leader lines from callouts to the relevant parts.",
                "- Do NOT use bullet characters (•, -, etc.) in the rendered image.",
                "- If a point is already clearly present as text in the image, do NOT duplicate it.",
                "Typography:",
                f"- Large readable sans-serif text, high contrast, legible at {VIDEO_SIZE[0]}×{VIDEO_SIZE[1]}.",
                "- Short phrases only; no paragraphs; avoid tiny labels.",
                "Style:",
                "- Clean, modern, flat/diagrammatic style (not photorealistic).",
                "- No faces/people.",
                "- No watermarks/logos.",
                "- Keep generous safe margins so nothing gets cropped.",
                "",
                f"TITLE (verbatim): {title}",
                "POINTS (use as callouts; paraphrase allowed if it improves placement, keep meaning):",
                points_str,
            ]
        ).strip()

        # Vertex can occasionally return transient 429 RESOURCE_EXHAUSTED.
        # Retry with exponential backoff rather than failing the entire run.
        resp = None
        last_exc: Optional[Exception] = None
        for attempt in range(1, 7):
            try:
                if backend == "vertex" and attempt > 1:
                    # Gentle throttle between retries.
                    time.sleep(min(2.0 * attempt, 10.0))
                resp = client.models.generate_content(model=model, contents=[prompt], config=config)
                last_exc = None
                break
            except Exception as exc:
                last_exc = exc
                if not _is_transient_quota_error(exc) or attempt >= 6:
                    raise
                # Exponential backoff: 4, 8, 16, 32, 48 seconds
                backoff = min(4.0 * (2 ** (attempt - 1)), 48.0)
                time.sleep(backoff)

        if resp is None:
            raise VideoBackendError(f"Gemini image generation failed for slide {idx}: {last_exc}")

        saved = False
        for part in getattr(resp, "parts", None) or []:
            try:
                if getattr(part, "inline_data", None) is None:
                    continue
                img = part.as_image()
                img.save(out_path)
                saved = True
                break
            except Exception:
                continue

        if not saved:
            raise VideoBackendError(f"Gemini did not return an image for slide {idx}")

        image_paths.append(out_path)

    return image_paths


def generate_slide_images(
    *,
    scenes: List[Dict[str, str]],
    out_dir: str,
    provider: str,
    gemini_api_key: str,
    gemini_model: str,
    gemini_image_size: str,
    gemini_backend: str,
    vertex_project: Optional[str],
    vertex_location: Optional[str],
) -> List[str]:
    provider = str(provider or "auto").strip().lower()
    if provider not in {"auto", "gemini", "text"}:
        provider = "auto"

    if provider == "text":
        ensure_dir(out_dir)
        out: List[str] = []
        for idx, scene in enumerate(scenes, start=1):
            slide_dir = os.path.join(out_dir, f"slide_{idx:03d}")
            ensure_dir(slide_dir)
            p = os.path.join(slide_dir, "text_slide.png")
            _render_text_slide_png(slide_text=scene.get("text", ""), out_png=p)
            out.append(p)
        return out

    if provider in {"auto", "gemini"}:
        try:
            return generate_gemini_slide_images(
                scenes=scenes,
                out_dir=out_dir,
                gemini_api_key=gemini_api_key,
                model=gemini_model,
                image_size=gemini_image_size,
                gemini_backend=gemini_backend,
                vertex_project=vertex_project,
                vertex_location=vertex_location,
            )
        except Exception as exc:
            if provider == "gemini":
                raise
            # Auto fallback
            ensure_dir(out_dir)
            out: List[str] = []
            for idx, scene in enumerate(scenes, start=1):
                slide_dir = os.path.join(out_dir, f"slide_{idx:03d}")
                ensure_dir(slide_dir)
                p = os.path.join(slide_dir, "text_slide.png")
                _render_text_slide_png(slide_text=scene.get("text", ""), out_png=p)
                out.append(p)
            return out

    raise VideoBackendError(f"Unknown image provider: {provider}")


def render_video_from_assets(
    *,
    scenes: List[Dict[str, str]],
    audio_paths: List[str],
    image_paths: List[str],
    out_mp4: str,
    work_dir: str,
    encode_preset: str = "veryfast",
    crf: int = 20,
) -> None:
    if len(scenes) != len(audio_paths) or len(scenes) != len(image_paths):
        raise VideoBackendError("Mismatched scenes/audio/images")

    slides_dir = os.path.join(work_dir, "slides")
    ensure_dir(slides_dir)

    clips = []
    try:
        for idx, (audio, img) in enumerate(zip(audio_paths, image_paths), start=1):
            slide_png = os.path.join(slides_dir, f"slide_{idx:03d}.png")
            _render_fullbleed_from_image(image_path=img, out_png=slide_png)

            audio_clip = AudioFileClip(audio)
            dur = float(audio_clip.duration or 0.0)
            if dur <= 0:
                dur = 4.0
            clip = ImageClip(slide_png).with_duration(dur).with_audio(audio_clip)
            clips.append(clip)

        final = concatenate_videoclips(clips, method="compose")
        try:
            final.write_videofile(
                out_mp4,
                fps=FPS,
                codec="libx264",
                audio_codec="aac",
                preset=str(encode_preset),
                ffmpeg_params=["-crf", str(int(crf))],
            )
        finally:
            final.close()
    finally:
        for c in clips:
            try:
                c.close()
            except Exception:
                pass


@dataclass
class VideoRequest:
    prompt: str
    project_id: Optional[str] = None

    slides: int = 8
    target_minutes: float = 10.0
    wpm: int = DEFAULT_WPM

    # Output resolution (affects final MP4 size + legibility target in image prompt).
    video_width: int = 1920
    video_height: int = 1080

    max_docs: int = 6
    require_context: bool = True

    # Local documents mode (uses all PDFs in folder instead of Supabase embedding search)
    documents_dir: Optional[str] = None
    documents_summarizer: str = "auto"  # auto|gemini|offline
    scenes_provider: str = "auto"  # auto|gemini|offline

    # Narration style for offline scene generation. (Gemini scene generation is guided separately.)
    narration_style: str = "podcast"  # podcast|lecture

    gemini_embed_model: str = "gemini-embedding-001"
    gemini_text_model: str = "gemini-2.5-pro"
    gemini_image_model: str = "gemini-3-pro-image-preview"

    # Gemini image output size tier. Higher sizes cost more.
    gemini_image_size: str = "2K"  # 1K|2K|4K

    # Gemini backend selection:
    # - ai_studio: uses GEMINI_API_KEY against ai.google.dev endpoints (often free-tier quota)
    # - vertex: uses Google Cloud Vertex AI (bills to your GCP project)
    gemini_backend: str = "ai_studio"  # ai_studio|vertex
    vertex_project: Optional[str] = None
    vertex_location: Optional[str] = None

    image_provider: str = "auto"  # auto|gemini|text

    # Audio (Google Cloud TTS)
    tts_provider: str = "auto"  # auto|google|edge
    google_tts_voice: str = "en-US-Neural2-F"  # for google
    google_tts_speaking_rate: float = 1.02
    google_tts_pitch: float = 1.5

    # For Edge TTS fallback (female voice default)
    edge_tts_voice: str = "en-US-JennyNeural"

    # Supabase persistence
    store: bool = True
    videos_bucket: str = "rr-videos"
    videos_prefix: str = "generated"
    videos_table: str = "rr_videos"

    # If store=False, copy final MP4 to this path (required).
    local_output_path: Optional[str] = None

    # If true, generate ONLY a single slide image and stop (no audio/video).
    images_only: bool = False
    # Where to write the single test image (PNG). Defaults to outputs/one_image_test.png.
    local_image_output_path: Optional[str] = None

    # If true, stop after generating scenes (no audio/images/video).
    dry_run: bool = False


@dataclass
class VideoResult:
    video_id: str
    video_url: str
    retrieved_count: int
    scenes: Optional[List[Dict[str, str]]] = None
    image_paths: Optional[List[str]] = None


def generate_video_from_request_dict(payload: Dict[str, Any]) -> VideoResult:
    """Main entrypoint for backend use (frontend-controlled JSON payload)."""

    load_repo_dotenv()

    req = VideoRequest(
        prompt=str(payload.get("prompt", "") or "").strip(),
        project_id=_uuid_or_none(str(payload.get("project_id", "") or "")),
        slides=int(payload.get("slides", 8) or 8),
        target_minutes=float(payload.get("target_minutes", 10.0) or 10.0),
        wpm=int(payload.get("wpm", DEFAULT_WPM) or DEFAULT_WPM),
        video_width=int(payload.get("video_width", 1920) or 1920),
        video_height=int(payload.get("video_height", 1080) or 1080),
        max_docs=int(payload.get("max_docs", 6) or 6),
        require_context=bool(payload.get("require_context", True)),
        documents_dir=(
            None
            if payload.get("documents_dir") in (None, "")
            else str(payload.get("documents_dir"))
        ),
        documents_summarizer=str(payload.get("documents_summarizer", "auto") or "auto"),
        scenes_provider=str(payload.get("scenes_provider", "auto") or "auto"),
        narration_style=str(payload.get("narration_style", "podcast") or "podcast"),
        gemini_embed_model=str(payload.get("gemini_embed_model", "gemini-embedding-001") or "gemini-embedding-001"),
        gemini_text_model=str(payload.get("gemini_text_model", "gemini-2.5-pro") or "gemini-2.5-pro"),
        gemini_image_model=str(payload.get("gemini_image_model", "gemini-3-pro-image-preview") or "gemini-3-pro-image-preview"),
        gemini_image_size=str(payload.get("gemini_image_size", "2K") or "2K"),
        image_provider=str(payload.get("image_provider", "auto") or "auto"),
        gemini_backend=str(payload.get("gemini_backend", "ai_studio") or "ai_studio"),
        vertex_project=(None if payload.get("vertex_project") in (None, "") else str(payload.get("vertex_project"))),
        vertex_location=(None if payload.get("vertex_location") in (None, "") else str(payload.get("vertex_location"))),
        tts_provider=str(payload.get("tts_provider", "auto") or "auto"),
        google_tts_voice=str(payload.get("google_tts_voice", "en-US-Neural2-F") or "en-US-Neural2-F"),
        google_tts_speaking_rate=float(payload.get("google_tts_speaking_rate", 1.02) or 1.02),
        google_tts_pitch=float(payload.get("google_tts_pitch", 1.5) or 1.5),
        edge_tts_voice=str(payload.get("edge_tts_voice", "en-US-JennyNeural") or "en-US-JennyNeural"),
        store=bool(payload.get("store", True)),
        videos_bucket=str(payload.get("videos_bucket", "rr-videos") or "rr-videos"),
        videos_prefix=str(payload.get("videos_prefix", "generated") or "generated"),
        videos_table=str(payload.get("videos_table", "rr_videos") or "rr_videos"),
        local_output_path=(
            None
            if payload.get("local_output_path") in (None, "")
            else str(payload.get("local_output_path"))
        ),
        dry_run=bool(payload.get("dry_run", False)),
        images_only=bool(payload.get("images_only", False)),
        local_image_output_path=(
            None
            if payload.get("local_image_output_path") in (None, "")
            else str(payload.get("local_image_output_path"))
        ),
    )

    if not req.prompt:
        raise VideoBackendError("Missing prompt")

    # Apply request-scoped output resolution.
    global VIDEO_SIZE
    VIDEO_SIZE = _clamp_resolution(req.video_width, req.video_height)

    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    google_tts_key = os.getenv("GOOGLE_TTS_API_KEY", "").strip()

    if not gemini_key:
        raise VideoBackendError("Missing GEMINI_API_KEY")

    supabase: Optional[SupabaseHTTP] = None

    matches: List[MatchDoc] = []
    retrieved_count = 0
    context = ""

    if req.documents_dir:
        docs_dir = os.path.abspath(req.documents_dir)
        ctx_obj = build_context_from_documents_dir(
            api_key=gemini_key,
            model=req.gemini_text_model,
            documents_dir=docs_dir,
            summarizer=req.documents_summarizer,
        )
        context = str(ctx_obj.get("context") or "")
        retrieved_count = int(ctx_obj.get("count") or 0)
        if req.require_context and not context:
            raise VideoBackendError("No context built from documents_dir")
    else:
        if not req.project_id:
            raise VideoBackendError(
                "Missing project_id. Supabase embedding retrieval is project-scoped; pass project_id in the request JSON."
            )

        supabase_url = os.getenv("SUPABASE_URL", "").strip()
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not (supabase_url and supabase_key):
            raise VideoBackendError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

        supabase = SupabaseHTTP(url=supabase_url, service_key=supabase_key)
        matches = match_embedding_context(
            supabase=supabase,
            gemini_api_key=gemini_key,
            query=req.prompt,
            project_id=req.project_id,
            match_count=req.max_docs,
            rpc_name=os.getenv("RR_MATCH_RPC", "match_embedding"),
            embedding_model=req.gemini_embed_model,
            gemini_backend=req.gemini_backend,
            vertex_project=req.vertex_project,
            vertex_location=req.vertex_location,
        )
        retrieved_count = len(matches)
        if req.require_context and not matches:
            raise VideoBackendError("No embedding context found")
        context = build_context_text(matches)

    pacing = compute_words_per_slide(target_minutes=req.target_minutes, wpm=req.wpm, slides=req.slides)

    scenes_provider = str(req.scenes_provider or "auto").strip().lower()
    if scenes_provider not in {"auto", "gemini", "offline"}:
        scenes_provider = "auto"

    scenes: List[Dict[str, str]]
    if scenes_provider == "offline":
        if not req.documents_dir:
            raise VideoBackendError("offline scenes_provider requires documents_dir")
        notes = ctx_obj.get("notes") if isinstance(ctx_obj, dict) else None
        notes_list = notes if isinstance(notes, list) else []
        scenes = offline_generate_scenes_from_doc_notes(
            prompt=req.prompt,
            notes=notes_list,
            slides=req.slides,
            words_title=pacing["title"],
            words_content=pacing["content"],
            narration_style=req.narration_style,
        )
    else:
        try:
            scenes = gemini_generate_scenes(
                api_key=gemini_key,
                model=req.gemini_text_model,
                prompt=req.prompt,
                context=context,
                slides=req.slides,
                words_title=pacing["title"],
                words_content=pacing["content"],
                gemini_backend=req.gemini_backend,
                vertex_project=req.vertex_project,
                vertex_location=req.vertex_location,
            )
        except VideoBackendError as exc:
            if scenes_provider == "auto" and req.documents_dir and ("HTTP 429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc)):
                notes = ctx_obj.get("notes") if isinstance(ctx_obj, dict) else None
                notes_list = notes if isinstance(notes, list) else []
                scenes = offline_generate_scenes_from_doc_notes(
                    prompt=req.prompt,
                    notes=notes_list,
                    slides=req.slides,
                    words_title=pacing["title"],
                    words_content=pacing["content"],
                    narration_style=req.narration_style,
                )
            else:
                raise

    video_id = str(uuid.uuid4())

    if req.dry_run:
        return VideoResult(
            video_id=video_id,
            video_url="dry-run",
            retrieved_count=retrieved_count,
            scenes=scenes,
        )

    if req.images_only:
        work_dir = tempfile.mkdtemp(prefix="rr_images_only_")
        try:
            images_dir = os.path.join(work_dir, "images")
            ensure_dir(images_dir)

            one_scene = scenes[:1]
            raw_image_paths = generate_slide_images(
                scenes=one_scene,
                out_dir=images_dir,
                provider=req.image_provider,
                gemini_api_key=gemini_key,
                gemini_model=req.gemini_image_model,
                gemini_image_size=req.gemini_image_size,
                gemini_backend=req.gemini_backend,
                vertex_project=req.vertex_project,
                vertex_location=req.vertex_location,
            )
            src = raw_image_paths[0] if raw_image_paths else ""
            if not src or not os.path.isfile(src):
                raise VideoBackendError("images_only mode did not produce an image")

            dst = (req.local_image_output_path or "outputs/one_image_test.png").strip()
            if not dst:
                dst = "outputs/one_image_test.png"
            dst_abs = os.path.abspath(dst)
            ensure_dir(os.path.dirname(dst_abs))
            shutil.copyfile(src, dst_abs)

            return VideoResult(
                video_id=video_id,
                video_url=dst_abs,
                retrieved_count=retrieved_count,
                scenes=one_scene,
                image_paths=[dst_abs],
            )
        finally:
            try:
                shutil.rmtree(work_dir, ignore_errors=True)
            except Exception:
                pass

    with tempfile.TemporaryDirectory() as tmp:
        audio_dir = os.path.join(tmp, "audio")
        images_dir = os.path.join(tmp, "gemini_images")

        # Pricing estimate (stderr only so stdout JSON remains parseable).
        if str(req.image_provider or "").strip().lower() in {"auto", "gemini"} and str(req.gemini_backend or "").strip().lower() == "vertex":
            est = _estimate_vertex_gemini_image_cost_usd(
                slides=int(req.slides),
                width=int(VIDEO_SIZE[0]),
                height=int(VIDEO_SIZE[1]),
            )
            lo = est["est_total_cost_usd"] * 0.7
            hi = est["est_total_cost_usd"] * 1.3
            print(
                (
                    f"[pricing] Vertex estimate for {req.slides} images at {VIDEO_SIZE[0]}x{VIDEO_SIZE[1]} (gemini_image_size={req.gemini_image_size}): "
                    f"~${est['est_total_cost_usd']:.3f} (likely ${lo:.3f}–${hi:.3f}). "
                    "Image-output dominates; Edge TTS is not billed to GCP. "
                    "Assumption: output image tokens scale with pixels (1024x1024≈1290 tokens)."
                ),
                file=sys.stderr,
            )

        chosen_voice = req.google_tts_voice
        provider = str(req.tts_provider or "auto").strip().lower()
        if provider == "edge" or (provider == "auto" and not google_tts_key):
            chosen_voice = req.edge_tts_voice

        def synth_all(rate: float) -> List[str]:
            return asyncio.run(
                synthesize_scene_audio_files(
                    scenes,
                    audio_dir,
                    tts_provider=req.tts_provider,
                    google_tts_api_key=google_tts_key,
                    voice_name=chosen_voice,
                    speaking_rate=float(rate),
                    pitch=float(req.google_tts_pitch),
                    concurrency=3,
                )
            )

        # First pass audio synthesis.
        audio_paths = synth_all(req.google_tts_speaking_rate)

        # Calibrate duration once by adjusting speakingRate (kept within safe bounds).
        # Only applies to Google TTS.
        target_s = float(req.target_minutes) * 60.0
        try:
            total_s = 0.0
            for p in audio_paths:
                ac = AudioFileClip(p)
                try:
                    total_s += float(ac.duration or 0.0)
                finally:
                    try:
                        ac.close()
                    except Exception:
                        pass
        except Exception:
            total_s = 0.0

        if provider in {"google", "auto"} and google_tts_key and target_s > 0 and total_s > 0:
            ratio = total_s / target_s
            if ratio < 0.92 or ratio > 1.08:
                # speakingRate > 1.0 means faster (shorter). Approximate linear adjustment.
                new_rate = float(req.google_tts_speaking_rate) * ratio
                new_rate = max(0.85, min(1.15, new_rate))

                # Clear out previous audio and re-synthesize once.
                try:
                    shutil.rmtree(audio_dir)
                except Exception:
                    pass
                ensure_dir(audio_dir)

                audio_paths = synth_all(new_rate)

        image_paths = generate_slide_images(
            scenes=scenes,
            out_dir=images_dir,
            provider=req.image_provider,
            gemini_api_key=gemini_key,
            gemini_model=req.gemini_image_model,
            gemini_image_size=req.gemini_image_size,
            gemini_backend=req.gemini_backend,
            vertex_project=req.vertex_project,
            vertex_location=req.vertex_location,
        )

        out_mp4 = os.path.join(tmp, f"{video_id}.mp4")
        render_video_from_assets(
            scenes=scenes,
            audio_paths=audio_paths,
            image_paths=image_paths,
            out_mp4=out_mp4,
            work_dir=tmp,
        )

        if not req.store:
            if not req.local_output_path:
                raise VideoBackendError(
                    "store=false requires local_output_path (temp files are deleted after generation)"
                )
            local_path = os.path.abspath(req.local_output_path)
            ensure_dir(os.path.dirname(local_path) or ".")
            shutil.copyfile(out_mp4, local_path)
            return VideoResult(video_id=video_id, video_url=local_path, retrieved_count=retrieved_count)

        # Ensure Supabase client exists whenever we need to store.
        if supabase is None:
            supabase_url = os.getenv("SUPABASE_URL", "").strip()
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
            if not (supabase_url and supabase_key):
                raise VideoBackendError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (required for store=true)")
            supabase = SupabaseHTTP(url=supabase_url, service_key=supabase_key)

        bucket = req.videos_bucket
        prefix = str(req.videos_prefix or "").strip().strip("/")
        object_path = f"{prefix}/{video_id}.mp4" if prefix else f"{video_id}.mp4"
        ctype, _ = mimetypes.guess_type(out_mp4)

        supabase.upload_storage(
            bucket=bucket,
            object_path=object_path,
            local_file_path=out_mp4,
            content_type=ctype or "video/mp4",
        )

        video_url = supabase.public_url(bucket=bucket, object_path=object_path)

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        context_payload = [
            {
                "id": m.id,
                "document_id": m.document_id,
                "source": m.source,
                "chunk_index": m.chunk_index,
                "similarity": m.similarity,
            }
            for m in matches
        ]

        supabase.insert_row(
            req.videos_table,
            {
                "id": video_id,
                "project_id": req.project_id,
                "prompt": req.prompt,
                "video_bucket": bucket,
                "video_path": object_path,
                "video_url": video_url,
                "status": "ready",
                "context": context_payload,
                "metadata": {
                    "created_at_client": now_iso,
                    "retrieved_count": len(matches),
                    "slides": req.slides,
                    "target_minutes": req.target_minutes,
                    "wpm": req.wpm,
                    "audio_provider": provider,
                    "voice": chosen_voice,
                    "image_provider": "gemini",
                    "image_model": req.gemini_image_model,
                },
            },
        )

        return VideoResult(video_id=video_id, video_url=video_url, retrieved_count=len(matches))


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fullbleed backend video generator (JSON request in/out)")
    p.add_argument("--request", required=True, help="Path to request JSON file")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    load_repo_dotenv()
    with open(args.request, "r", encoding="utf-8") as f:
        payload = json.load(f)
    result = generate_video_from_request_dict(payload)
    out: Dict[str, Any] = {
        "video_id": result.video_id,
        "video_url": result.video_url,
        "retrieved_count": result.retrieved_count,
    }
    if result.scenes is not None:
        out["scenes"] = result.scenes
    print(json.dumps(out, indent=2))


def generate_and_upload_video_presentation(
    *,
    project_id: str,
    prompt: str,
    max_docs: int = 6,
    require_context: bool = True,
    max_slides: int = 10,
    voice: str = "alloy",
    tts_model: str = "tts-1",
    tts_format: str = "mp3",
) -> Dict[str, Any]:
    """Adapter used by the upstream backend pipeline.

    This keeps the upstream endpoint/worker contract stable while delegating the
    actual generation to `generate_video_from_request_dict`.

    Notes:
    - `voice` is only forwarded if it looks like an Edge voice name.
    - `tts_model` and `tts_format` are accepted for signature compatibility.
    """

    # The fullbleed generator reads environment variables directly.
    # In the upstream backend, secrets are typically configured via `Settings`.
    # To keep deployment configuration simple, map Settings -> env vars when missing.
    def _set_env_if_missing(key: str, value: str) -> None:
        if value and not os.environ.get(key):
            os.environ[key] = value

    try:
        from app.core.config import get_settings

        settings = get_settings()
        _set_env_if_missing("SUPABASE_URL", getattr(settings, "supabase_url", "") or "")
        _set_env_if_missing(
            "SUPABASE_SERVICE_ROLE_KEY",
            getattr(settings, "supabase_secret_key", "") or "",
        )
        _set_env_if_missing("GEMINI_API_KEY", getattr(settings, "gemini_api_key", "") or "")
    except Exception:
        pass

    # For upstream: generate locally, then upload using the upstream StorageRepository.
    # This keeps all project assets in the same Storage bucket/prefix convention.
    tmp_out = tempfile.NamedTemporaryFile(prefix=f"rr_video_{project_id}_", suffix=".mp4", delete=False)
    tmp_out_path = tmp_out.name
    tmp_out.close()

    payload: Dict[str, Any] = {
        "prompt": prompt,
        "project_id": project_id,
        "max_docs": int(max_docs),
        "require_context": bool(require_context),
        "slides": int(max_slides),
        "store": False,
        "local_output_path": tmp_out_path,
        "tts_provider": "auto",
    }

    if isinstance(voice, str) and ("Neural" in voice or voice.startswith("en-")):
        payload["edge_tts_voice"] = voice

    try:
        result = generate_video_from_request_dict(payload)

        from app.repositories.factory import build_storage_repository

        storage_path = f"video/{project_id}.mp4"
        with open(tmp_out_path, "rb") as f:
            video_bytes = f.read()

        public_url = build_storage_repository().upload_public_asset(
            bucket_name="RoleReady",
            storage_path=storage_path,
            content=video_bytes,
            content_type="video/mp4",
        )

        return {
            "video_url": public_url,
            "retrieved_count": int(result.retrieved_count),
            "slide_count": int(max_slides),
            "warning": None,
        }
    finally:
        try:
            os.remove(tmp_out_path)
        except Exception:
            pass


if __name__ == "__main__":
    main()
