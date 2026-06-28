from typing import Any
from uuid import UUID, uuid4

import httpx
from fastapi import status

from app.errors import AppError
from app.models import FileRecord, GenerationTaskStatus, ReferenceAsset, SegmentPlan


class SeedanceClient:
    def __init__(self, api_key: str, base_url: str, model_name: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name

    def build_segment_request(
        self,
        segment: SegmentPlan,
        references: list[ReferenceAsset],
        files: list[FileRecord],
    ) -> dict[str, Any]:
        reference_by_id = {reference.id: reference for reference in references if not reference.is_missing}
        file_by_id = {file.id: file for file in files}
        video_refs = self._build_file_refs(segment.reference_video_ids, reference_by_id, file_by_id, "video")
        image_refs = self._build_file_refs(segment.reference_image_ids, reference_by_id, file_by_id, "image")
        audio_refs = self._build_file_refs(segment.reference_audio_ids, reference_by_id, file_by_id, "audio")

        if audio_refs and not video_refs and not image_refs:
            raise AppError(
                "INVALID_SEEDANCE_REFERENCES",
                f"片段「{segment.title}」包含参考音频时，必须同时包含至少一个参考视频或参考图片",
                status.HTTP_400_BAD_REQUEST,
            )

        text_prompt = "\n".join(
            part
            for part in [
                segment.prompt.strip(),
                f"镜头描述：{segment.shot_description.strip()}",
                f"前后衔接：{segment.continuity_notes.strip()}" if segment.continuity_notes else "",
                f"负向约束：{segment.negative_prompt.strip()}" if segment.negative_prompt else "",
                f"目标时长：{segment.duration_seconds:.1f} 秒。",
            ]
            if part
        )

        return {
            "model": self.model_name,
            "content": [
                {"type": "text", "text": text_prompt},
                *video_refs,
                *image_refs,
                *audio_refs,
            ],
            "duration": segment.duration_seconds,
            "metadata": {
                "segment_id": str(segment.id),
                "segment_order": segment.order,
                "segment_title": segment.title,
            },
        }

    def create_task(self, request_payload: dict[str, Any]) -> dict[str, Any]:
        if not self.api_key:
            task_id = f"local-seedance-{uuid4()}"
            return {
                "id": task_id,
                "status": "succeeded",
                "result_url": f"local://generated-segments/{task_id}.mp4",
                "local_only": True,
            }

        try:
            with httpx.Client(timeout=60) as client:
                response = client.post(
                    f"{self.base_url}/contents/generations/tasks",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=request_payload,
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as exc:
            raise AppError("SEEDANCE_API_ERROR", "Seedance 2.0 创建任务失败", exc.response.status_code) from exc
        except httpx.HTTPError as exc:
            raise AppError("SEEDANCE_API_UNAVAILABLE", "Seedance 2.0 创建任务暂时不可用", status.HTTP_502_BAD_GATEWAY) from exc

    def get_task(self, provider_task_id: str) -> dict[str, Any]:
        if not self.api_key or provider_task_id.startswith("local-seedance-"):
            return {
                "id": provider_task_id,
                "status": "succeeded",
                "result_url": f"local://generated-segments/{provider_task_id}.mp4",
                "local_only": True,
            }

        try:
            with httpx.Client(timeout=60) as client:
                response = client.get(
                    f"{self.base_url}/contents/generations/tasks/{provider_task_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as exc:
            raise AppError("SEEDANCE_API_ERROR", "Seedance 2.0 查询任务失败", exc.response.status_code) from exc
        except httpx.HTTPError as exc:
            raise AppError("SEEDANCE_API_UNAVAILABLE", "Seedance 2.0 查询任务暂时不可用", status.HTTP_502_BAD_GATEWAY) from exc

    @staticmethod
    def extract_task_id(response: dict[str, Any]) -> str | None:
        task_id = response.get("id") or response.get("task_id")
        if not task_id and isinstance(response.get("data"), dict):
            task_id = response["data"].get("id") or response["data"].get("task_id")
        return str(task_id) if task_id else None

    @staticmethod
    def extract_status(response: dict[str, Any]) -> GenerationTaskStatus:
        raw_status = response.get("status")
        if not raw_status and isinstance(response.get("data"), dict):
            raw_status = response["data"].get("status")
        normalized = str(raw_status or "").lower()
        if normalized in {"succeeded", "success", "completed", "done"}:
            return GenerationTaskStatus.SUCCEEDED
        if normalized in {"failed", "error", "canceled", "cancelled"}:
            return GenerationTaskStatus.FAILED
        if normalized in {"running", "processing", "in_progress"}:
            return GenerationTaskStatus.RUNNING
        if normalized in {"submitted", "queued", "pending", "created"}:
            return GenerationTaskStatus.SUBMITTED
        return GenerationTaskStatus.SUBMITTED

    @staticmethod
    def extract_result_url(response: dict[str, Any]) -> str | None:
        candidates = [
            response.get("result_url"),
            response.get("video_url"),
            response.get("url"),
        ]
        data = response.get("data")
        if isinstance(data, dict):
            candidates.extend([data.get("result_url"), data.get("video_url"), data.get("url")])
            content = data.get("content") or data.get("contents")
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict):
                        candidates.extend([item.get("video_url"), item.get("url")])
        result = next((value for value in candidates if value), None)
        return str(result) if result else None

    @staticmethod
    def extract_error_message(response: dict[str, Any]) -> str | None:
        error = response.get("error") or response.get("message")
        if isinstance(error, dict):
            return str(error.get("message") or error.get("code") or error)
        if error:
            return str(error)
        data = response.get("data")
        if isinstance(data, dict):
            message = data.get("error") or data.get("message") or data.get("reason")
            return str(message) if message else None
        return None

    @staticmethod
    def summarize_request(request_payload: dict[str, Any]) -> dict[str, Any]:
        content = request_payload.get("content", [])
        return {
            "model": request_payload.get("model"),
            "duration": request_payload.get("duration"),
            "metadata": request_payload.get("metadata", {}),
            "reference_counts": {
                "video": sum(1 for item in content if item.get("type") == "video"),
                "image": sum(1 for item in content if item.get("type") == "image"),
                "audio": sum(1 for item in content if item.get("type") == "audio"),
            },
        }

    @staticmethod
    def _build_file_refs(
        reference_ids: list[UUID],
        reference_by_id: dict[UUID, ReferenceAsset],
        file_by_id: dict[UUID, FileRecord],
        content_type: str,
    ) -> list[dict[str, str]]:
        refs: list[dict[str, str]] = []
        for reference_id in reference_ids:
            reference = reference_by_id.get(reference_id)
            if not reference or not reference.source_file_id:
                continue
            file = file_by_id.get(reference.source_file_id)
            if not file or not file.ark_file_id:
                continue
            refs.append(
                {
                    "type": content_type,
                    "file_id": file.ark_file_id,
                    "purpose": reference.purpose,
                    "usage_notes": reference.usage_notes or "",
                }
            )
        return refs
