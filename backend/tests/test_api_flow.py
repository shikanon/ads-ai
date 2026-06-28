from pathlib import Path
from uuid import UUID, uuid4
import zlib

import pytest
from fastapi.testclient import TestClient

from app import main
from app.brief_pdf_renderer import PdfPageRenderResult
from app.brief_parser import BriefParser
from app.models import GenerationTask, GenerationTaskStatus
from app.seedance import SeedanceClient
from app.storage import JsonRepository
from app.tvc_planner import SegmentPlanner


class LocalOnlyChatClient:
    def parse_brief(self, *_args, **_kwargs):
        return {}

    def plan_segments(self, *_args, **_kwargs):
        return {}


class FakeVideoComposer:
    def __init__(self, root: Path):
        self.root = root

    def compose(self, project_id, segments, _tasks):
        output_path = self.root / "compositions" / str(project_id) / "final-tvc.mp4"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fake-mp4")
        return output_path, sum(segment.duration_seconds for segment in segments)


@pytest.fixture()
def api_client(monkeypatch, tmp_path):
    repository = JsonRepository(str(tmp_path / "storage"))
    chat_client = LocalOnlyChatClient()
    monkeypatch.setattr(main, "repository", repository)
    monkeypatch.setattr(main, "brief_parser", BriefParser(chat_client))
    monkeypatch.setattr(main, "segment_planner", SegmentPlanner(chat_client))
    monkeypatch.setattr(main, "seedance_client", SeedanceClient("", "https://ark.example.test/api/v3", "seedance-test"))
    monkeypatch.setattr(main, "video_composer", FakeVideoComposer(tmp_path / "storage"))
    return TestClient(main.app)


def test_api_flow_parse_confirm_generate_retry_and_compose(api_client):
    created = api_client.post(
        "/api/projects",
        json={"name": "新品 TVC", "requirement_text": "生成 30 秒新品发布广告", "target_duration_seconds": 30},
    )
    assert created.status_code == 200
    project_id = created.json()["project"]["id"]

    brief_input = api_client.post(
        f"/api/projects/{project_id}/brief-input",
        data={"requirement_text": "突出新品科技感和年轻用户场景"},
    )
    assert brief_input.status_code == 200
    assert brief_input.json()["project"]["id"] == project_id

    parsed = api_client.post(f"/api/projects/{project_id}/parse-brief")
    assert parsed.status_code == 200
    assert len(parsed.json()["requirements"]) >= 1
    assert parsed.json()["parse_result"]["summary"]

    planned = api_client.post(f"/api/projects/{project_id}/segment-plan")
    assert planned.status_code == 200
    segment_plans = planned.json()["segment_plans"]
    assert len(segment_plans) == 2
    assert all(segment["duration_seconds"] <= 15 for segment in segment_plans)

    blocked = api_client.post(f"/api/projects/{project_id}/generation-tasks")
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "PLAN_NOT_CONFIRMED"

    confirmed = api_client.post(f"/api/projects/{project_id}/generation-plan/confirm", json={"confirmed_by": "qa"})
    assert confirmed.status_code == 200
    assert confirmed.json()["generation_plan"]["status"] == "confirmed"

    failed_task = GenerationTask(
        project_id=uuid4(),
        segment_id=uuid4(),
        status=GenerationTaskStatus.FAILED,
        error_message="unrelated task",
    )
    main.repository.save_generation_task(
        failed_task.model_copy(
            update={
                "project_id": UUID(project_id),
                "segment_id": UUID(segment_plans[0]["id"]),
            }
        )
    )

    retried = api_client.post(f"/api/projects/{project_id}/generation-tasks/{segment_plans[0]['id']}/retry")
    assert retried.status_code == 200
    retried_task = next(task for task in retried.json()["generation_tasks"] if task["segment_id"] == segment_plans[0]["id"])
    assert retried_task["status"] == "succeeded"
    assert retried_task["retry_count"] == 1

    generated = api_client.post(f"/api/projects/{project_id}/generation-tasks")
    assert generated.status_code == 200
    assert len(generated.json()["generation_tasks"]) == len(segment_plans)
    assert all(task["status"] == "succeeded" for task in generated.json()["generation_tasks"])

    status_payload = api_client.get(f"/api/projects/{project_id}/generation-tasks")
    assert status_payload.status_code == 200
    assert status_payload.json()["project"]["status"] == "completed"

    composed = api_client.post(f"/api/projects/{project_id}/final-result")
    assert composed.status_code == 200
    final_result = composed.json()["final_result"]
    assert final_result["status"] == "succeeded"
    assert final_result["preview_url"].endswith("/download")
    assert final_result["download_url"].endswith("/download")

    gallery = api_client.get("/api/gallery")
    assert gallery.status_code == 200
    gallery_item = next(item for item in gallery.json()["items"] if item["id"] == project_id)
    assert gallery_item["name"] == "新品 TVC"
    assert gallery_item["final_result_status"] == "succeeded"
    assert gallery_item["preview_url"] == final_result["preview_url"]
    assert gallery_item["download_url"] == final_result["download_url"]
    assert gallery_item["duration_seconds"] == final_result["duration_seconds"]

    history = api_client.get("/api/projects")
    assert history.status_code == 200
    history_item = next(item for item in history.json()["projects"] if item["id"] == project_id)
    assert history_item["name"] == "新品 TVC"
    assert history_item["status"] == "completed"
    assert history_item["segment_count"] == 2
    assert history_item["final_result_status"] == "succeeded"
    assert history_item["summary"]
    assert history_item["updated_at"] >= history_item["created_at"]

    detail = api_client.get(f"/api/projects/{project_id}/history")
    assert detail.status_code == 200
    assert detail.json()["history_summary"]["id"] == project_id
    assert len(detail.json()["segment_plans"]) == 2

    deleted = api_client.delete(f"/api/projects/{project_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True, "project_id": project_id}
    assert api_client.get(f"/api/projects/{project_id}/history").status_code == 404
    assert all(item["id"] != project_id for item in api_client.get("/api/projects").json()["projects"])


def test_submit_brief_input_extracts_pdf_text_and_pdf_page_metadata(api_client, monkeypatch):
    created = api_client.post("/api/projects", json={"name": "红果短剧 TVC", "target_duration_seconds": 30})
    assert created.status_code == 200
    project_id = created.json()["project"]["id"]
    pdf_stream = zlib.compress("BT (Hongguo short drama free viewing B-site creator brief) Tj ET".encode())
    pdf_bytes = b"%PDF-1.7\n1 0 obj\nstream\n" + pdf_stream + b"\nendstream\nendobj\n%%EOF"

    def fake_render_pdf_pages(_filename, _content_type, _data, output_dir, _max_pages, render_scale, max_image_size):
        output_dir.mkdir(parents=True, exist_ok=True)
        rendered_path = output_dir / "page-1.png"
        rendered_path.write_bytes(b"png")
        return PdfPageRenderResult(
            total_pages=2,
            rendered_pages=1,
            image_paths=[str(rendered_path)],
            truncated=True,
            render_scale=render_scale,
            max_image_size=max_image_size,
            renderer="test",
        )

    monkeypatch.setattr(main, "render_pdf_pages", fake_render_pdf_pages)

    brief_input = api_client.post(
        f"/api/projects/{project_id}/brief-input",
        files={"brief_file": ("brief.pdf", pdf_bytes, "application/pdf")},
    )

    assert brief_input.status_code == 200
    file_payload = brief_input.json()["files"][0]
    assert file_payload["metadata"]["extracted_summary"]
    assert file_payload["metadata"]["text_extraction_method"] == "pdf_stream"
    assert file_payload["metadata"]["pdf_page_images"]["total_pages"] == 2
    assert file_payload["metadata"]["pdf_page_images"]["rendered_pages"] == 1
    assert file_payload["metadata"]["pdf_page_images"]["truncated"] is True

    parsed = api_client.post(f"/api/projects/{project_id}/parse-brief")

    assert parsed.status_code == 200
    joined_requirements = "\n".join(item["content"] for item in parsed.json()["requirements"])
    assert "Hongguo short drama" in joined_requirements
    assert {item["asset_type"] for item in parsed.json()["references"] if item["is_missing"]} >= {"video", "image", "audio"}


def test_submit_brief_input_rejects_low_quality_pdf_text_but_keeps_page_images(api_client, monkeypatch):
    created = api_client.post("/api/projects", json={"name": "红果短剧 TVC", "target_duration_seconds": 30})
    assert created.status_code == 200
    project_id = created.json()["project"]["id"]
    noisy_text = "\n".join(["人", "\u200b", "一", "心", "音"] * 20)
    pdf_stream = zlib.compress(f"BT ({noisy_text}) Tj ET".encode())
    pdf_bytes = b"%PDF-1.7\n1 0 obj\nstream\n" + pdf_stream + b"\nendstream\nendobj\n%%EOF"

    def fake_render_pdf_pages(_filename, _content_type, _data, output_dir, _max_pages, render_scale, max_image_size):
        output_dir.mkdir(parents=True, exist_ok=True)
        rendered_path = output_dir / "page-1.png"
        rendered_path.write_bytes(b"png")
        return PdfPageRenderResult(
            total_pages=1,
            rendered_pages=1,
            image_paths=[str(rendered_path)],
            truncated=False,
            render_scale=render_scale,
            max_image_size=max_image_size,
            renderer="test",
        )

    monkeypatch.setattr(main, "render_pdf_pages", fake_render_pdf_pages)

    brief_input = api_client.post(
        f"/api/projects/{project_id}/brief-input",
        files={"brief_file": ("brief.pdf", pdf_bytes, "application/pdf")},
    )

    assert brief_input.status_code == 200
    metadata = brief_input.json()["files"][0]["metadata"]
    assert "extracted_text" not in metadata
    assert "extracted_summary" not in metadata
    assert "fragmented" in metadata["text_extraction_rejected_reason"]
    assert metadata["pdf_page_images"]["rendered_pages"] == 1

    parsed = api_client.post(f"/api/projects/{project_id}/parse-brief")

    assert parsed.status_code == 200
    joined_requirements = "\n".join(item["content"] for item in parsed.json()["requirements"])
    assert noisy_text.replace("\n", "") not in joined_requirements
    assert "用户尚未提供详细需求" in joined_requirements
