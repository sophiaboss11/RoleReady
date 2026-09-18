from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
os.environ.setdefault("SUPABASE_SECRET_KEY", "test-secret-key")

from fastapi.testclient import TestClient

from app.worker import app


class WorkerAppTests(unittest.TestCase):
    def test_health_endpoint(self) -> None:
        response = TestClient(app).get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_execute_task_dispatches_payload(self) -> None:
        with patch("app.worker.dispatch_job") as dispatch_job:
            response = TestClient(app).post(
                "/tasks/execute",
                json={
                    "job_id": "job-1",
                    "job_type": "jira_ingestion",
                    "project_id": "project-1",
                    "params": {"jira_project_key": "ROLE"},
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "completed", "job_id": "job-1"})
        dispatch_job.assert_called_once_with(
            job_id="job-1",
            job_type="jira_ingestion",
            project_id="project-1",
            params={"jira_project_key": "ROLE"},
        )


if __name__ == "__main__":
    unittest.main()
