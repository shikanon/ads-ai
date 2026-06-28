from math import ceil
from typing import Any
from uuid import UUID

from fastapi import status
from pydantic import ValidationError

from app.errors import AppError
from app.models import FileRecord, Project, ReferenceAsset, ReferenceAssetType, RequirementItem, SegmentPlan
from app.seed_chat import SeedChatClient
from app.seed_prompt import SEGMENT_PLAN_SCHEMA, SEGMENT_PLAN_SYSTEM_PROMPT, build_segment_plan_user_prompt

MAX_SEGMENT_SECONDS = 15


class SegmentPlanner:
    def __init__(self, chat_client: SeedChatClient):
        self.chat_client = chat_client

    def plan(
        self,
        project: Project,
        requirements: list[RequirementItem],
        references: list[ReferenceAsset],
        files: list[FileRecord],
    ) -> list[SegmentPlan]:
        prompt = build_segment_plan_user_prompt(project, requirements, references)
        raw_result = self.chat_client.plan_segments(SEGMENT_PLAN_SYSTEM_PROMPT, prompt, files, SEGMENT_PLAN_SCHEMA)
        if not raw_result:
            raw_result = self._build_local_result(project, requirements, references)
        return self.validate_segments(raw_result.get("segments", []), project, references, status.HTTP_502_BAD_GATEWAY)

    @staticmethod
    def validate_segments(
        raw_segments: list[dict[str, Any]],
        project: Project,
        references: list[ReferenceAsset],
        error_status: int = status.HTTP_400_BAD_REQUEST,
    ) -> list[SegmentPlan]:
        if not raw_segments:
            raise AppError("INVALID_SEGMENT_PLAN", "至少需要一个视频片段", error_status)

        reference_ids_by_type = {
            ReferenceAssetType.VIDEO: {reference.id for reference in references if reference.asset_type == ReferenceAssetType.VIDEO and not reference.is_missing},
            ReferenceAssetType.IMAGE: {reference.id for reference in references if reference.asset_type == ReferenceAssetType.IMAGE and not reference.is_missing},
            ReferenceAssetType.AUDIO: {reference.id for reference in references if reference.asset_type == ReferenceAssetType.AUDIO and not reference.is_missing},
        }
        normalized_segments: list[dict[str, Any]] = []
        for index, item in enumerate(sorted(raw_segments, key=lambda value: int(value.get("order", 9999))), start=1):
            if not isinstance(item, dict):
                continue
            normalized_segments.append(
                {
                    **item,
                    "project_id": str(project.id),
                    "order": index,
                    "reference_video_ids": _filter_reference_ids(item.get("reference_video_ids", []), reference_ids_by_type[ReferenceAssetType.VIDEO]),
                    "reference_image_ids": _filter_reference_ids(item.get("reference_image_ids", []), reference_ids_by_type[ReferenceAssetType.IMAGE]),
                    "reference_audio_ids": _filter_reference_ids(item.get("reference_audio_ids", []), reference_ids_by_type[ReferenceAssetType.AUDIO]),
                }
            )

        try:
            segments = [SegmentPlan.model_validate(item) for item in normalized_segments]
        except ValidationError as exc:
            raise AppError("INVALID_SEGMENT_PLAN", "片段规划 JSON Schema 校验失败", error_status) from exc

        _validate_total_duration(segments, project, error_status)
        return segments

    @staticmethod
    def _build_local_result(project: Project, requirements: list[RequirementItem], references: list[ReferenceAsset]) -> dict[str, Any]:
        target_duration = project.target_duration_seconds or 30
        segment_count = max(1, ceil(target_duration / MAX_SEGMENT_SECONDS))
        base_duration = round(target_duration / segment_count, 1)
        requirement_summary = "；".join(item.content for item in requirements[:4]) or project.requirement_text or "广告核心需求待补充"
        reference_ids = {
            ReferenceAssetType.VIDEO: [str(item.id) for item in references if item.asset_type == ReferenceAssetType.VIDEO and not item.is_missing],
            ReferenceAssetType.IMAGE: [str(item.id) for item in references if item.asset_type == ReferenceAssetType.IMAGE and not item.is_missing],
            ReferenceAssetType.AUDIO: [str(item.id) for item in references if item.asset_type == ReferenceAssetType.AUDIO and not item.is_missing],
        }
        stage_titles = ["开场吸引", "需求铺陈", "卖点证明", "情绪升级", "品牌收束", "行动号召"]
        segments = []
        for index in range(segment_count):
            title = stage_titles[index] if index < len(stage_titles) else f"片段 {index + 1}"
            previous_note = "承接上一段的画面运动和音乐节奏" if index > 0 else "作为开场建立品牌世界观和核心视觉风格"
            next_note = "以自然转场或完整动作结束，衔接下一段" if index < segment_count - 1 else "以品牌露出和记忆点收束成片"
            segments.append(
                {
                    "order": index + 1,
                    "title": title,
                    "duration_seconds": min(base_duration, MAX_SEGMENT_SECONDS),
                    "prompt": f"{title}，围绕“{requirement_summary}”设计一个完整镜头段落，保持商业广告质感、品牌资产一致、画面节奏清晰。",
                    "negative_prompt": "不要出现错误品牌资产、竞品露出、风格突变、人物身份突变、同一镜头被硬切成两段或不自然跳接。",
                    "shot_description": f"第 {index + 1} 段为完整镜头或自然转场段落，包含明确主体、动作推进、产品或品牌信息露出。",
                    "continuity_notes": f"{previous_note}；{next_note}；保持角色、色彩、场景空间、声音氛围和转场意图连续。",
                    "reference_video_ids": reference_ids[ReferenceAssetType.VIDEO],
                    "reference_image_ids": reference_ids[ReferenceAssetType.IMAGE],
                    "reference_audio_ids": reference_ids[ReferenceAssetType.AUDIO],
                }
            )
        return {"segments": segments}


def _filter_reference_ids(values: Any, allowed_ids: set[UUID]) -> list[str]:
    if not isinstance(values, list):
        return []
    allowed = {str(value) for value in allowed_ids}
    return [str(value) for value in values if str(value) in allowed]


def _validate_total_duration(segments: list[SegmentPlan], project: Project, error_status: int) -> None:
    target = project.target_duration_seconds
    if not target:
        return
    total = sum(segment.duration_seconds for segment in segments)
    tolerance = max(3, target * 0.15)
    if abs(total - target) > tolerance:
        raise AppError(
            "INVALID_SEGMENT_TOTAL_DURATION",
            f"片段总时长 {total:g} 秒需接近目标片长 {target:g} 秒，允许误差 {tolerance:g} 秒",
            error_status,
        )
