from typing import Any
from uuid import uuid4

import httpx
from fastapi import status

from app.errors import AppError
from app.models import FileSourceType


class VolcengineFilesClient:
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def upload_bytes(self, filename: str, content_type: str, data: bytes, purpose: str) -> dict[str, Any]:
        if not self.api_key:
            return self._build_local_placeholder(FileSourceType.LOCAL, purpose, {"filename": filename})

        try:
            with httpx.Client(timeout=60) as client:
                response = client.post(
                    f"{self.base_url}/files",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    data={"purpose": purpose},
                    files={"file": (filename, data, content_type)},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as exc:
            raise AppError(
                "VOLCENGINE_FILES_API_ERROR",
                "Volcengine Files API 上传失败",
                exc.response.status_code,
            ) from exc
        except httpx.HTTPError as exc:
            raise AppError(
                "VOLCENGINE_FILES_API_UNAVAILABLE",
                "Volcengine Files API 暂时不可用",
                status.HTTP_502_BAD_GATEWAY,
            ) from exc

    def upload_remote_source(self, source: str, purpose: str) -> dict[str, Any]:
        source_type = FileSourceType.TOS_URI if source.startswith("tos://") else FileSourceType.URL
        if not self.api_key:
            return self._build_local_placeholder(source_type, purpose, {"source": source})

        try:
            with httpx.Client(timeout=60) as client:
                response = client.post(
                    f"{self.base_url}/files",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={"purpose": purpose, "url": source},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as exc:
            raise AppError(
                "VOLCENGINE_FILES_API_ERROR",
                "Volcengine Files API URL 上传失败",
                exc.response.status_code,
            ) from exc
        except httpx.HTTPError as exc:
            raise AppError(
                "VOLCENGINE_FILES_API_UNAVAILABLE",
                "Volcengine Files API 暂时不可用",
                status.HTTP_502_BAD_GATEWAY,
            ) from exc

    @staticmethod
    def extract_file_id(response: dict[str, Any]) -> str | None:
        value = response.get("id") or response.get("file_id")
        return str(value) if value else None

    @staticmethod
    def _build_local_placeholder(source_type: FileSourceType, purpose: str, metadata: dict[str, str]) -> dict[str, Any]:
        return {
            "id": f"local-{uuid4()}",
            "object": "file",
            "purpose": purpose,
            "source_type": source_type.value,
            "local_only": True,
            "metadata": metadata,
        }
