from dataclasses import dataclass
from typing import Literal

from supabase import Client

from app.core.exceptions import InfraError

ProjectAssetVisualPreviewType = Literal["image", "mermaid"]


@dataclass(frozen=True)
class ProjectAssetSpec:
    table_name: str
    asset_type: str
    title: str
    preview_column: str
    visual_preview_column: str | None = None
    visual_preview_type: ProjectAssetVisualPreviewType | None = None
    processed_column: str | None = "is_processed"


PROJECT_ASSET_SPECS: tuple[ProjectAssetSpec, ...] = (
    ProjectAssetSpec(
        table_name="project_summary",
        asset_type="summary",
        title="Summary",
        preview_column="content",
        processed_column=None,
    ),
    ProjectAssetSpec(
        table_name="project_infographic",
        asset_type="infographic",
        title="Infographic",
        preview_column="infographic_text",
        visual_preview_column="image_url",
        visual_preview_type="image",
    ),
    ProjectAssetSpec(
        table_name="project_mindmap",
        asset_type="mindmap",
        title="Mindmap",
        preview_column="mermaid",
        visual_preview_column="mermaid",
        visual_preview_type="mermaid",
    ),
    ProjectAssetSpec(
        table_name="project_audio",
        asset_type="audio",
        title="Audio Narration",
        preview_column="script",
    ),
    ProjectAssetSpec(
        table_name="project_video",
        asset_type="video",
        title="Video",
        preview_column="prompt",
    ),
)


def list_project_assets(client: Client, project_id: str) -> list[dict[str, object]]:
    assets: list[dict[str, object]] = []

    for spec in PROJECT_ASSET_SPECS:
        selected_columns = ["project_id", spec.preview_column]
        if spec.visual_preview_column and spec.visual_preview_column not in selected_columns:
            selected_columns.append(spec.visual_preview_column)
        if spec.processed_column:
            selected_columns.insert(1, spec.processed_column)

        try:
            response = (
                client.schema("RoleReady")
                .table(spec.table_name)
                .select(", ".join(selected_columns))
                .eq("project_id", project_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise InfraError(
                f"Failed to fetch project asset '{spec.asset_type}' from {spec.table_name}: {exc}"
            ) from exc

        if not response.data:
            continue

        row = response.data[0]
        preview_value = row.get(spec.preview_column)
        visual_preview_value = (
            row.get(spec.visual_preview_column)
            if spec.visual_preview_column
            else None
        )
        if isinstance(preview_value, str) and len(preview_value) > 120:
            preview_value = f"{preview_value[:120]}..."

        assets.append(
            {
                "asset_type": spec.asset_type,
                "title": spec.title,
                "available": bool(row.get(spec.processed_column, True)),
                "preview": preview_value if isinstance(preview_value, str) else None,
                "visual_preview": (
                    visual_preview_value
                    if isinstance(visual_preview_value, str)
                    else None
                ),
                "visual_preview_type": (
                    spec.visual_preview_type
                    if isinstance(visual_preview_value, str) and visual_preview_value.strip()
                    else None
                ),
            }
        )

    return assets
