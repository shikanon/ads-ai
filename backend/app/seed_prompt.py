from app.models import FileRecord, Project, ReferenceAsset, RequirementItem


BRIEF_PARSE_SYSTEM_PROMPT = """
你是广告 TVC 策略与多模态素材解析专家。请将用户 brief、需求文本和文件引用解析为严格 JSON。
必须覆盖品牌、产品、受众、核心卖点、风格调性、禁用项、目标片长和交付规格。
必须提取参考视频、参考图片、参考音频；如果 brief 描述了素材但未提供文件，请放入 missing_assets。
不要输出 Markdown，不要输出解释，只输出满足 schema 的 JSON。
""".strip()


BRIEF_PARSE_SCHEMA = {
    "type": "object",
    "required": ["summary", "requirements", "references", "missing_assets"],
    "properties": {
        "summary": {"type": "string"},
        "requirements": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["category", "title", "content", "required"],
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["brand", "product", "audience", "selling_point", "style", "constraint", "delivery", "other"],
                    },
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "required": {"type": "boolean"},
                    "source_file_id": {"type": ["string", "null"]},
                },
            },
        },
        "references": {
            "type": "array",
            "items": {"$ref": "#/$defs/reference"},
        },
        "missing_assets": {
            "type": "array",
            "items": {"$ref": "#/$defs/reference"},
        },
    },
    "$defs": {
        "reference": {
            "type": "object",
            "required": ["asset_type", "purpose", "is_missing"],
            "properties": {
                "asset_type": {"type": "string", "enum": ["video", "image", "audio"]},
                "purpose": {"type": "string"},
                "source_file_id": {"type": ["string", "null"]},
                "usage_notes": {"type": ["string", "null"]},
                "is_missing": {"type": "boolean"},
            },
        }
    },
}


def build_brief_parse_user_prompt(project: Project, files: list[FileRecord], references: list[ReferenceAsset]) -> str:
    file_lines = [
        f"- file_id={file.id}, purpose={file.purpose}, ark_file_id={file.ark_file_id or '未上传'}, "
        f"name={file.filename or file.source_url or 'unknown'}, "
        f"extracted_summary={file.metadata.get('extracted_summary') or '无'}, "
        f"text_rejected_reason={file.metadata.get('text_extraction_rejected_reason') or '无'}"
        for file in files
    ]
    brief_text_lines = [
        f"### {file.filename or file.source_url or file.id}\n{file.metadata.get('extracted_text') or file.metadata.get('extracted_summary')}"
        for file in files
        if file.purpose.value == "brief" and (file.metadata.get("extracted_text") or file.metadata.get("extracted_summary"))
    ]
    reference_lines = [
        f"- reference_id={reference.id}, type={reference.asset_type}, source_file_id={reference.source_file_id}, "
        f"purpose={reference.purpose}, notes={reference.usage_notes or '无'}"
        for reference in references
    ]
    return f"""
项目名称：{project.name}
目标片长：{project.target_duration_seconds or '未指定'} 秒
需求文本：
{project.requirement_text or '未提供'}

已上传或引用文件：
{chr(10).join(file_lines) if file_lines else '无'}

上传 brief 抽取文本：
{chr(10).join(brief_text_lines) if brief_text_lines else '无'}

已登记参考素材：
{chr(10).join(reference_lines) if reference_lines else '无'}

请输出 JSON，字段必须为 summary、requirements、references、missing_assets。
requirements 每项必须包含 category、title、content、required，可选 source_file_id。
references 与 missing_assets 每项必须包含 asset_type、purpose、is_missing，可选 source_file_id、usage_notes。
""".strip()


SEGMENT_PLAN_SYSTEM_PROMPT = """
你是广告 TVC 分镜规划导演，负责将完整广告创意拆解为 Seedance 2.0 可生成的连续视频片段。
必须遵守：
1. 每个 segment 的 duration_seconds 必须大于 0 且不超过 15 秒。
2. 不得把同一个镜头强行切成两段，只能在完整镜头结束、自然转场或情绪段落结束处拆分。
3. 每段都要保持角色、品牌资产、产品外观、色彩风格、动作方向、场景空间、音乐/旁白情绪的连续性。
4. 每段都要输出片段提示词、负向约束、参考素材映射、建议时长、镜头描述和前后衔接说明。
5. 总时长应尽量贴近目标片长；如果目标片长小于等于 15 秒，也只输出一个完整片段。
不要输出 Markdown，不要输出解释，只输出满足 schema 的 JSON。
""".strip()


SEGMENT_PLAN_SCHEMA = {
    "type": "object",
    "required": ["segments"],
    "properties": {
        "segments": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": [
                    "order",
                    "title",
                    "duration_seconds",
                    "prompt",
                    "negative_prompt",
                    "shot_description",
                    "continuity_notes",
                    "reference_video_ids",
                    "reference_image_ids",
                    "reference_audio_ids",
                ],
                "properties": {
                    "order": {"type": "integer", "minimum": 1},
                    "title": {"type": "string"},
                    "duration_seconds": {"type": "number", "exclusiveMinimum": 0, "maximum": 15},
                    "prompt": {"type": "string"},
                    "negative_prompt": {"type": ["string", "null"]},
                    "shot_description": {"type": "string"},
                    "continuity_notes": {"type": ["string", "null"]},
                    "reference_video_ids": {"type": "array", "items": {"type": "string"}},
                    "reference_image_ids": {"type": "array", "items": {"type": "string"}},
                    "reference_audio_ids": {"type": "array", "items": {"type": "string"}},
                },
            },
        }
    },
}


def build_segment_plan_user_prompt(
    project: Project,
    requirements: list[RequirementItem],
    references: list[ReferenceAsset],
) -> str:
    requirement_lines = [
        f"- requirement_id={item.id}, category={item.category}, title={item.title}, required={item.required}, content={item.content}"
        for item in requirements
    ]
    reference_lines = [
        f"- reference_id={reference.id}, type={reference.asset_type}, is_missing={reference.is_missing}, "
        f"source_file_id={reference.source_file_id}, purpose={reference.purpose}, notes={reference.usage_notes or '无'}"
        for reference in references
    ]
    return f"""
项目名称：{project.name}
目标片长：{project.target_duration_seconds or '未指定'} 秒
原始需求文本：
{project.requirement_text or '未提供'}

结构化需求：
{chr(10).join(requirement_lines) if requirement_lines else '无'}

可用参考素材：
{chr(10).join(reference_lines) if reference_lines else '无'}

请输出 JSON，根字段为 segments。
每个 segment 必须包含 order、title、duration_seconds、prompt、negative_prompt、shot_description、continuity_notes、
reference_video_ids、reference_image_ids、reference_audio_ids。
reference_*_ids 只能填写上方 reference_id；缺失素材或类型不匹配的素材不要映射。
prompt 需要描述可直接用于视频生成的画面、镜头运动、主体、品牌元素、光影、色彩、动作和节奏。
continuity_notes 需要说明与上一段和下一段的画面、动作、声音或转场衔接方式。
""".strip()
