from __future__ import annotations

import os
import unittest
from collections.abc import Callable
from typing import TypeVar
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
os.environ.setdefault("SUPABASE_SECRET_KEY", "test-secret-key")

from app.services import worker_dispatch

T = TypeVar("T")


def _run_inline(
    *,
    job_id: str,
    job_type: str,
    project_id: str,
    runner: Callable[[], T],
) -> T:
    return runner()


class WorkerDispatchTests(unittest.TestCase):
    def test_dispatches_github_ingestion_with_token(self) -> None:
        with (
            patch.object(worker_dispatch, "run_job_with_status", side_effect=_run_inline),
            patch.object(worker_dispatch, "run_github_ingestion") as run_github_ingestion,
        ):
            worker_dispatch.dispatch_job(
                job_id="job-1",
                job_type="github_ingestion",
                project_id="project-1",
                params={
                    "repo_url": "https://github.com/example/private-repo",
                    "github_token": "secret-token",
                },
            )

        run_github_ingestion.assert_called_once_with(
            "project-1",
            "https://github.com/example/private-repo",
            "secret-token",
        )

    def test_dispatches_jira_ingestion(self) -> None:
        with (
            patch.object(worker_dispatch, "run_job_with_status", side_effect=_run_inline),
            patch.object(worker_dispatch, "run_jira_ingestion") as run_jira_ingestion,
        ):
            worker_dispatch.dispatch_job(
                job_id="job-1",
                job_type="jira_ingestion",
                project_id="project-1",
                params={"jira_project_key": "ROLE"},
            )

        run_jira_ingestion.assert_called_once_with("project-1", "ROLE")

    def test_dispatches_confluence_ingestion(self) -> None:
        with (
            patch.object(worker_dispatch, "run_job_with_status", side_effect=_run_inline),
            patch.object(worker_dispatch, "run_confluence_ingestion") as run_confluence_ingestion,
        ):
            worker_dispatch.dispatch_job(
                job_id="job-1",
                job_type="confluence_ingestion",
                project_id="project-1",
                params={"space_key": "READY"},
            )

        run_confluence_ingestion.assert_called_once_with("project-1", "READY")

    def test_project_pipeline_without_data_sources_completes_task(self) -> None:
        with (
            patch.object(worker_dispatch, "run_job_with_status", side_effect=_run_inline),
            patch.object(worker_dispatch, "run_project_pipeline", return_value="no_data_sources"),
            patch.object(worker_dispatch, "get_project_status") as get_project_status,
            patch.object(worker_dispatch, "update_project_status") as update_project_status,
        ):
            worker_dispatch.dispatch_job(
                job_id="job-1",
                job_type="project_pipeline",
                project_id="project-1",
                params={},
            )

        get_project_status.assert_not_called()
        update_project_status.assert_not_called()

    def test_missing_required_param_fails_fast(self) -> None:
        with patch.object(worker_dispatch, "run_job_with_status", side_effect=_run_inline):
            with self.assertRaisesRegex(ValueError, "repo_url is required"):
                worker_dispatch.dispatch_job(
                    job_id="job-1",
                    job_type="github_ingestion",
                    project_id="project-1",
                    params={},
                )


if __name__ == "__main__":
    unittest.main()
