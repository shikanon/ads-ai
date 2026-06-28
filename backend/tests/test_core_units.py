import sys
import zlib
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi import status

from app.brief_parser import BriefParser
from app.brief_pdf_renderer import render_pdf_pages
from app.brief_text_extractor import extract_brief_text
from app.config import Settings
from app.errors import AppError
from app.file_validation import validate_brief_upload, validate_reference_upload, validate_remote_source
from app.models import (
    FileRecord,
    FilePurpose,
    FileSourceType,
    Project,
    ReferenceAsset,
    ReferenceAssetType,
    RequirementCategory,
    RequirementItem,
    SegmentPlan,
)
from app.seed_chat import SeedChatClient
from app.seed_prompt import build_brief_parse_user_prompt
from app.seedance import SeedanceClient
from app.tvc_planner import SegmentPlanner


def upload(filename: str, content_type: str) -> SimpleNamespace:
    return SimpleNamespace(filename=filename, content_type=content_type)


def test_settings_public_dict_masks_api_key_and_parses_cors_origins():
    settings = Settings(ark_api_key="secret-value", cors_origins="http://localhost:8989, https://example.test")

    public_config = settings.public_dict()

    assert public_config["ark_api_key"] == "configured"
    assert public_config["cors_origins"] == ["http://localhost:8989", "https://example.test"]


def test_settings_default_cors_origins_include_remote_domains():
    settings = Settings(_env_file=None)

    assert "http://localhost:8989" in settings.cors_origins
    assert "https://lens-rhyme.tensorbytes.com" in settings.cors_origins
    assert "https://admin.lens-rhyme.tensorbytes.com" in settings.cors_origins


def test_file_validation_accepts_supported_brief_and_rejects_invalid_remote_source():
    validated = validate_brief_upload(upload("campaign.PDF", "application/octet-stream"), b"pdf-bytes", 1024)

    assert validated.filename == "campaign.PDF"
    assert validated.size_bytes == len(b"pdf-bytes")
    assert validate_remote_source(" tos://bucket/path/ref.mp4 ") == "tos://bucket/path/ref.mp4"
    with pytest.raises(AppError) as exc_info:
        validate_remote_source("ftp://example.test/ref.mp4")
    assert exc_info.value.code == "INVALID_REMOTE_SOURCE"


def test_reference_upload_validates_asset_content_type_and_size():
    validated = validate_reference_upload(upload("shot.mp4", "video/mp4"), b"video", ReferenceAssetType.VIDEO, 10)

    assert validated.content_type == "video/mp4"
    with pytest.raises(AppError) as exc_info:
        validate_reference_upload(upload("voice.mp3", "audio/mpeg"), b"audio", ReferenceAssetType.IMAGE, 10)
    assert exc_info.value.code == "UNSUPPORTED_REFERENCE_FILE"


def test_brief_parser_validate_result_normalizes_requirements_and_missing_assets():
    project_id = uuid4()
    parsed = BriefParser.validate_result(
        {
            "summary": "新品上市广告",
            "requirements": [
                {
                    "category": "brand",
                    "title": "品牌",
                    "content": "突出年轻科技品牌",
                    "required": True,
                }
            ],
            "missing_assets": [{"asset_type": "image", "purpose": "Logo", "usage_notes": "用于片尾露出"}],
        },
        project_id,
    )

    assert parsed.summary == "新品上市广告"
    assert parsed.requirements[0].project_id == project_id
    assert parsed.requirements[0].category == RequirementCategory.BRAND
    assert parsed.missing_assets[0].is_missing is True
    assert parsed.missing_assets[0].source_file_id is None


def test_brief_parser_rejects_invalid_model_json_schema():
    with pytest.raises(AppError) as exc_info:
        BriefParser.validate_result({"summary": "   ", "requirements": []}, uuid4())

    assert exc_info.value.code == "INVALID_BRIEF_PARSE_RESULT"
    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY


def test_extract_brief_text_reads_pdf_stream_and_pptx_xml():
    pdf_stream = zlib.compress(b"BT (Hongguo short drama free viewing launch brief) Tj ET")
    pdf_bytes = b"%PDF-1.7\n1 0 obj\nstream\n" + pdf_stream + b"\nendstream\nendobj\n%%EOF"

    extracted_pdf = extract_brief_text("brief.pdf", "application/pdf", pdf_bytes)

    assert extracted_pdf is not None
    assert "Hongguo short drama" in extracted_pdf.text
    assert extracted_pdf.method == "pdf_stream"

    pptx_io = BytesIO()
    with ZipFile(pptx_io, "w") as archive:
        archive.writestr(
            "ppt/slides/slide1.xml",
            """<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><a:t>红果短剧</a:t><a:t>免费看剧增长 brief</a:t></p:spTree></p:cSld></p:sld>""",
        )

    extracted_pptx = extract_brief_text("brief.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", pptx_io.getvalue())

    assert extracted_pptx is not None
    assert "红果短剧 免费看剧增长 brief" in extracted_pptx.text
    assert extracted_pptx.method == "pptx_xml"


def test_extract_brief_text_rejects_fragmented_pdf_encoding_noise():
    noisy_text = "\n".join(["人", "\u200b", "一", "心", "音"] * 20)
    noisy_stream = zlib.compress(f"BT ({noisy_text}) Tj ET".encode())
    pdf_bytes = b"%PDF-1.7\n1 0 obj\nstream\n" + noisy_stream + b"\nendstream\nendobj\n%%EOF"

    extracted = extract_brief_text("brief.pdf", "application/pdf", pdf_bytes)

    assert extracted is not None
    assert extracted.text == ""
    assert extracted.summary == ""
    assert extracted.rejected_reason
    assert "fragmented" in extracted.rejected_reason


def test_seed_prompt_omits_rejected_pdf_text_from_user_prompt():
    project_id = uuid4()
    project = Project(id=project_id, name="红果短剧 TVC", target_duration_seconds=30)
    brief_file = FileRecord(
        project_id=project_id,
        purpose=FilePurpose.BRIEF,
        source_type=FileSourceType.LOCAL,
        filename="brief.pdf",
        metadata={
            "text_extraction_rejected_reason": "low quality PDF text: fragmented single-character lines",
            "pdf_page_images": {"total_pages": 1, "rendered_pages": 1, "image_paths": ["/tmp/page-1.png"], "truncated": False},
        },
    )

    prompt = build_brief_parse_user_prompt(project, [brief_file], [])

    assert "上传 brief 抽取文本：\n无" in prompt
    assert "fragmented single-character lines" in prompt
    assert "extracted_summary=无" in prompt


def test_render_pdf_pages_records_paths_and_truncation(monkeypatch, tmp_path):
    saved_paths: list[str] = []

    class FakePixmap:
        width = 2400
        height = 1200

        def save(self, path):
            path.write_bytes(b"png")
            saved_paths.append(str(path))

    class FakePage:
        def get_pixmap(self, matrix, alpha):
            assert alpha is False
            assert matrix is not None
            return FakePixmap()

    class FakeDocument:
        page_count = 3

        def load_page(self, page_index):
            return FakePage()

        def close(self):
            return None

    fake_fitz = SimpleNamespace(open=lambda **_kwargs: FakeDocument(), Matrix=lambda width, height: (width, height))
    monkeypatch.setitem(sys.modules, "fitz", fake_fitz)

    rendered = render_pdf_pages("brief.pdf", "application/pdf", b"pdf", tmp_path / "pages", max_pages=2, render_scale=2.0, max_image_size=1600)

    assert rendered is not None
    assert rendered.total_pages == 3
    assert rendered.rendered_pages == 2
    assert rendered.truncated is True
    assert rendered.image_paths == saved_paths
    assert all(path.endswith(".png") for path in rendered.image_paths)


def test_seed_chat_user_content_includes_pdf_images_summary_and_file_reference(tmp_path):
    image_path = tmp_path / "page-1.png"
    image_path.write_bytes(b"png")
    file_record = FileRecord(
        project_id=uuid4(),
        purpose=FilePurpose.BRIEF,
        source_type=FileSourceType.LOCAL,
        filename="brief.pdf",
        ark_file_id="ark-file-1",
        metadata={
            "extracted_summary": "红果短剧 B 站 brief",
            "pdf_page_images": {
                "total_pages": 1,
                "rendered_pages": 1,
                "image_paths": [str(image_path)],
                "truncated": False,
            },
        },
    )

    content = SeedChatClient._build_user_content("解析 brief", [file_record])

    assert content[0] == {"type": "text", "text": "解析 brief"}
    assert any(part["type"] == "text" and "红果短剧" in part["text"] for part in content)
    assert any(part["type"] == "image_url" and part["image_url"]["url"].startswith("data:image/png;base64,") for part in content)
    assert content[-1] == {"type": "file", "file_id": "ark-file-1"}


def test_brief_parser_local_fallback_uses_extracted_brief_text_for_specific_requirements():
    project_id = uuid4()
    brief_file_id = uuid4()
    project = Project(id=project_id, name="红果短剧 TVC", target_duration_seconds=30)
    brief_file = FileRecord(
        id=brief_file_id,
        project_id=project_id,
        purpose=FilePurpose.BRIEF,
        source_type=FileSourceType.LOCAL,
        filename="brief.pdf",
        metadata={
            "extracted_text": "红果短剧优质达人合作brief-B站。核心优势是免费看剧，面向短剧用户，突出免费、独家首发、海量好剧。",
            "extracted_summary": "红果短剧优质达人合作brief-B站",
        },
    )
    parser = BriefParser(SimpleNamespace(parse_brief=lambda *_args, **_kwargs: {}))

    parsed = parser.parse(project, [brief_file], [])

    contents = "\n".join(item.content for item in parsed.requirements)
    assert "红果短剧" in parsed.summary
    assert "免费看剧" in contents
    assert any(item.title == "项目提示词" and item.source_file_id == brief_file_id for item in parsed.requirements)
    assert {asset.asset_type.value for asset in parsed.missing_assets} == {"video", "image", "audio"}


def test_segment_planner_validates_duration_reorders_and_filters_reference_ids():
    project = Project(id=uuid4(), name="TVC", target_duration_seconds=30)
    video_file_id = uuid4()
    audio_file_id = uuid4()
    video_ref = ReferenceAsset(
        project_id=project.id,
        asset_type=ReferenceAssetType.VIDEO,
        purpose="镜头参考",
        source_file_id=video_file_id,
    )
    audio_ref = ReferenceAsset(
        project_id=project.id,
        asset_type=ReferenceAssetType.AUDIO,
        purpose="音乐参考",
        source_file_id=audio_file_id,
    )

    segments = SegmentPlanner.validate_segments(
        [
            {
                "order": 2,
                "title": "收束",
                "duration_seconds": 15,
                "prompt": "品牌露出",
                "shot_description": "完整片尾镜头",
                "reference_video_ids": [str(uuid4())],
            },
            {
                "order": 1,
                "title": "开场",
                "duration_seconds": 15,
                "prompt": "展示产品",
                "shot_description": "完整开场镜头",
                "reference_video_ids": [str(video_ref.id)],
                "reference_audio_ids": [str(audio_ref.id)],
            },
        ],
        project,
        [video_ref, audio_ref],
    )

    assert [segment.order for segment in segments] == [1, 2]
    assert segments[0].title == "开场"
    assert segments[0].reference_video_ids == [video_ref.id]
    assert segments[0].reference_audio_ids == [audio_ref.id]
    assert segments[1].reference_video_ids == []


def test_segment_planner_rejects_total_duration_outside_tolerance():
    project = Project(id=uuid4(), name="Long TVC", target_duration_seconds=60)

    with pytest.raises(AppError) as exc_info:
        SegmentPlanner.validate_segments(
            [
                {
                    "order": 1,
                    "title": "过短片段",
                    "duration_seconds": 15,
                    "prompt": "仅一段",
                    "shot_description": "无法覆盖目标片长",
                }
            ],
            project,
            [],
        )

    assert exc_info.value.code == "INVALID_SEGMENT_TOTAL_DURATION"


def test_seedance_request_includes_multimodal_refs_and_rejects_audio_only():
    project_id = uuid4()
    image_file = FileRecord(
        id=uuid4(),
        project_id=project_id,
        purpose=FilePurpose.REFERENCE_IMAGE,
        source_type=FileSourceType.LOCAL,
        ark_file_id="file-image",
    )
    audio_file = FileRecord(
        id=uuid4(),
        project_id=project_id,
        purpose=FilePurpose.REFERENCE_AUDIO,
        source_type=FileSourceType.LOCAL,
        ark_file_id="file-audio",
    )
    image_ref = ReferenceAsset(project_id=project_id, asset_type=ReferenceAssetType.IMAGE, purpose="产品图", source_file_id=image_file.id)
    audio_ref = ReferenceAsset(project_id=project_id, asset_type=ReferenceAssetType.AUDIO, purpose="音乐", source_file_id=audio_file.id)
    segment = SegmentPlan(
        project_id=project_id,
        order=1,
        title="开场",
        duration_seconds=10,
        prompt="展示产品",
        shot_description="完整镜头",
        continuity_notes="自然转场",
        reference_image_ids=[image_ref.id],
        reference_audio_ids=[audio_ref.id],
    )
    client = SeedanceClient("", "https://ark.example.test/api/v3", "seedance-test")

    request_payload = client.build_segment_request(segment, [image_ref, audio_ref], [image_file, audio_file])

    assert request_payload["model"] == "seedance-test"
    assert request_payload["duration"] == 10
    assert client.summarize_request(request_payload)["reference_counts"] == {"video": 0, "image": 1, "audio": 1}

    audio_only_segment = segment.model_copy(update={"reference_image_ids": []})
    with pytest.raises(AppError) as exc_info:
        client.build_segment_request(audio_only_segment, [audio_ref], [audio_file])
    assert exc_info.value.code == "INVALID_SEEDANCE_REFERENCES"
