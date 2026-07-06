import json
from typing import Any

import httpx
from fastapi import status

from app.brief_pdf_renderer import build_pdf_page_image_content
from app.errors import AppError
from app.models import FileRecord


class SeedChatClient:
    def __init__(self, api_key: str, base_url: str, model_name: str, timeout_seconds: int = 90):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds

    def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        files: list[FileRecord],
        response_schema: dict[str, Any],
        schema_name: str,
    ) -> dict[str, Any]:
        if not self.api_key:
            return {}

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={
                        "model": self.model_name,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": self._build_user_content(user_prompt, files)},
                        ],
                        "response_format": {
                            "type": "json_schema",
                            "json_schema": {"name": schema_name, "schema": response_schema, "strict": True},
                        },
                    },
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise AppError("SEED_CHAT_API_ERROR", "Seed 2.1 Chat API 调用失败", exc.response.status_code) from exc
        except httpx.HTTPError as exc:
            raise AppError("SEED_CHAT_API_UNAVAILABLE", "Seed 2.1 Chat API 暂时不可用", status.HTTP_502_BAD_GATEWAY) from exc

        return self._extract_json(response.json())

    def parse_brief(self, system_prompt: str, user_prompt: str, files: list[FileRecord], response_schema: dict[str, Any]) -> dict[str, Any]:
        return self.complete_json(system_prompt, user_prompt, files, response_schema, "brief_parse_result")

    def plan_segments(self, system_prompt: str, user_prompt: str, files: list[FileRecord], response_schema: dict[str, Any]) -> dict[str, Any]:
        return self.complete_json(system_prompt, user_prompt, files, response_schema, "segment_plan_result")

    @staticmethod
    def _build_user_content(user_prompt: str, files: list[FileRecord]) -> list[dict[str, Any]]:
        content = [{"type": "text", "text": user_prompt}]
        content.extend(build_pdf_page_image_content(files))
        for file in files:
            if file.ark_file_id:
                content.append({"type": "file", "file_id": file.ark_file_id})
        return content

    @staticmethod
    def _extract_json(payload: dict[str, Any]) -> dict[str, Any]:
        content = payload.get("choices", [{}])[0].get("message", {}).get("content")
        if isinstance(content, list):
            text = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        else:
            text = str(content or "")
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise AppError("INVALID_SEED_RESPONSE", "Seed 2.1 返回的 JSON 无法解析", status.HTTP_502_BAD_GATEWAY) from exc
        if not isinstance(parsed, dict):
            raise AppError("INVALID_SEED_RESPONSE", "Seed 2.1 返回的 JSON 根节点必须是对象", status.HTTP_502_BAD_GATEWAY)
        return parsed
