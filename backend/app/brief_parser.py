import re
from typing import Any
from uuid import UUID

from fastapi import status
from pydantic import ValidationError

from app.errors import AppError
from app.models import (
    BriefParseResult,
    FilePurpose,
    FileRecord,
    ParsedReferenceAsset,
    Project,
    ReferenceAsset,
    ReferenceAssetType,
    RequirementCategory,
    RequirementItem,
)
from app.seed_chat import SeedChatClient
from app.seed_prompt import BRIEF_PARSE_SCHEMA, BRIEF_PARSE_SYSTEM_PROMPT, build_brief_parse_user_prompt


class BriefParser:
    def __init__(self, chat_client: SeedChatClient):
        self.chat_client = chat_client

    def parse(self, project: Project, files: list[FileRecord], references: list[ReferenceAsset]) -> BriefParseResult:
        prompt = build_brief_parse_user_prompt(project, files, references)
        raw_result = self.chat_client.parse_brief(BRIEF_PARSE_SYSTEM_PROMPT, prompt, files, BRIEF_PARSE_SCHEMA)
        if not raw_result:
            raw_result = self._build_local_result(project, files, references)
        return self.validate_result(raw_result, project.id)

    @staticmethod
    def validate_result(raw_result: dict[str, Any], project_id: UUID) -> BriefParseResult:
        normalized = {
            "summary": raw_result.get("summary", ""),
            "requirements": [
                {"project_id": str(project_id), **item}
                for item in raw_result.get("requirements", [])
                if isinstance(item, dict)
            ],
            "references": raw_result.get("references", []),
            "missing_assets": raw_result.get("missing_assets", []),
        }
        try:
            parsed = BriefParseResult.model_validate(normalized)
        except ValidationError as exc:
            raise AppError("INVALID_BRIEF_PARSE_RESULT", "解析结果 JSON Schema 校验失败", status.HTTP_502_BAD_GATEWAY) from exc
        for item in parsed.missing_assets:
            item.is_missing = True
            item.source_file_id = None
        return parsed

    @staticmethod
    def _build_local_result(project: Project, files: list[FileRecord], references: list[ReferenceAsset]) -> dict[str, Any]:
        source_text = _combined_brief_text(project, files)
        requirement_text = source_text or "用户尚未提供详细需求，请在确认页补充。"
        brief_source_file_id = _first_brief_file_id(files)
        target_duration = project.target_duration_seconds or 30
        project_keywords = _extract_keywords(requirement_text)
        project_subject = _project_subject(project, requirement_text, project_keywords)
        source_excerpt = _compact_excerpt(requirement_text)
        requirements = [
            _requirement(
                RequirementCategory.BRAND,
                "品牌与项目背景",
                f"围绕「{project_subject}」建立品牌认知；需要在画面中明确呈现品牌/产品名称、核心场景和用户价值。来源摘要：{source_excerpt}",
                brief_source_file_id,
            ),
            _requirement(RequirementCategory.PRODUCT, "产品与服务", source_excerpt, brief_source_file_id),
            _requirement(
                RequirementCategory.AUDIENCE,
                "目标受众",
                f"面向 brief 中提到的核心用户与投放渠道人群，突出 {project_keywords or project_subject} 的直接利益点和使用场景。",
                brief_source_file_id,
            ),
            _requirement(
                RequirementCategory.SELLING_POINT,
                "核心卖点",
                f"优先表达 {project_keywords or project_subject}，用 1-3 个连续镜头呈现问题、解决方案和行动号召。",
                brief_source_file_id,
            ),
            _requirement(
                RequirementCategory.STYLE,
                "风格调性",
                "画面应贴合 brief 语境，保持节奏清晰、情绪递进、信息点可读，避免与产品定位不一致的夸张演绎。",
                brief_source_file_id,
            ),
            _requirement(
                RequirementCategory.OTHER,
                "项目提示词",
                f"生成一支约 {target_duration} 秒广告 TVC：以「{project_subject}」为主体，突出 {project_keywords or 'brief 中的产品利益点'}，用真实用户场景、产品界面/关键视觉、明确行动号召串联成片。",
                brief_source_file_id,
            ),
            _requirement(
                RequirementCategory.CONSTRAINT,
                "禁用项",
                "避免虚构 brief 未提供的合作关系、价格承诺、竞品攻击、错误品牌资产和不符合投放规范的表达。",
                brief_source_file_id,
            ),
            _requirement(RequirementCategory.DELIVERY, "交付规格", f"目标成片约 {target_duration} 秒，后续拆分为不超过 15 秒的连续片段。", brief_source_file_id),
        ]
        parsed_references = [
            {
                "asset_type": reference.asset_type.value,
                "purpose": reference.purpose,
                "source_file_id": str(reference.source_file_id) if reference.source_file_id else None,
                "usage_notes": reference.usage_notes or _reference_usage(reference.asset_type),
                "is_missing": False,
            }
            for reference in references
        ]
        if not parsed_references:
            parsed_references = [
                {
                    "asset_type": _asset_type_from_file(file.purpose).value,
                    "purpose": "brief 中提供的参考素材",
                    "source_file_id": str(file.id),
                    "usage_notes": _reference_usage(_asset_type_from_file(file.purpose)),
                    "is_missing": False,
                }
                for file in files
                if file.purpose != FilePurpose.BRIEF
            ]
        missing_assets = [
            {
                "asset_type": "video",
                "purpose": f"{project_subject} 的真实使用场景或竞品/达人视频参考",
                "source_file_id": None,
                "usage_notes": "用于参考镜头节奏、开场钩子、转场方式和行动号召；若 brief 已给出视频方向，可按该方向补齐素材。",
                "is_missing": True,
            },
            {
                "asset_type": "image",
                "purpose": f"{project_subject} 的品牌 Logo、产品界面、关键视觉或主 KV",
                "source_file_id": None,
                "usage_notes": "用于保证品牌资产、产品外观和关键卖点视觉一致；如已在 brief 中提供，可在确认页删除此项。",
                "is_missing": True,
            },
            {
                "asset_type": "audio",
                "purpose": f"{project_subject} 的音乐、旁白语气或音效参考",
                "source_file_id": None,
                "usage_notes": "用于统一短剧/广告节奏、情绪推进和口播风格；参考音频用于 Seedance 时需搭配视频或图片参考。",
                "is_missing": True,
            }
        ]
        return {
            "summary": f"已基于 brief 文本生成「{project_subject}」结构化需求初稿：{source_excerpt[:180]}",
            "requirements": requirements,
            "references": parsed_references,
            "missing_assets": missing_assets,
        }


def _requirement(category: RequirementCategory, title: str, content: str, source_file_id: UUID | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"category": category.value, "title": title, "content": content, "required": True}
    if source_file_id:
        item["source_file_id"] = str(source_file_id)
    return item


def _asset_type_from_file(purpose: FilePurpose) -> ReferenceAssetType:
    return {
        FilePurpose.REFERENCE_VIDEO: ReferenceAssetType.VIDEO,
        FilePurpose.REFERENCE_IMAGE: ReferenceAssetType.IMAGE,
        FilePurpose.REFERENCE_AUDIO: ReferenceAssetType.AUDIO,
    }.get(purpose, ReferenceAssetType.IMAGE)


def _reference_usage(asset_type: ReferenceAssetType) -> str:
    return {
        ReferenceAssetType.VIDEO: "用于参考镜头运动、节奏、构图或转场。",
        ReferenceAssetType.IMAGE: "用于参考产品外观、品牌视觉、场景或色彩风格。",
        ReferenceAssetType.AUDIO: "用于参考音乐情绪、旁白语气或声音氛围。",
    }[asset_type]


def _combined_brief_text(project: Project, files: list[FileRecord]) -> str:
    parts = [project.requirement_text.strip()] if project.requirement_text and project.requirement_text.strip() else []
    parts.extend(
        str(file.metadata.get("extracted_text") or file.metadata.get("extracted_summary") or "").strip()
        for file in files
        if file.purpose == FilePurpose.BRIEF and (file.metadata.get("extracted_text") or file.metadata.get("extracted_summary"))
    )
    return "\n".join(part for part in parts if part)


def _first_brief_file_id(files: list[FileRecord]) -> UUID | None:
    brief_file = next((file for file in files if file.purpose == FilePurpose.BRIEF), None)
    return brief_file.id if brief_file else None


def _compact_excerpt(text: str, limit: int = 360) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:limit] if compact else "用户尚未提供详细需求，请在确认页补充。"


def _project_subject(project: Project, text: str, keywords: str) -> str:
    if project.name and not project.name.startswith("广告 TVC 项目"):
        return project.name[:40]
    first_line = next((line.strip(" #：:-") for line in text.splitlines() if len(line.strip()) >= 4), "")
    if first_line:
        return first_line[:40]
    if keywords:
        return keywords.split("、")[0]
    return project.name


def _extract_keywords(text: str, limit: int = 6) -> str:
    tokens = re.findall(r"[\u4e00-\u9fffA-Za-z0-9][\u4e00-\u9fffA-Za-z0-9+._-]{1,24}", text)
    stop_words = {"brief", "APP", "app", "用户", "项目", "背景", "介绍", "功能", "详细", "目标", "需要", "素材"}
    seen: list[str] = []
    for token in tokens:
        cleaned = token.strip("_-")
        if cleaned in stop_words or len(cleaned) < 2:
            continue
        if cleaned not in seen:
            seen.append(cleaned)
        if len(seen) >= limit:
            break
    return "、".join(seen)
