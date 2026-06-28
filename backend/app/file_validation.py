from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile, status

from app.errors import AppError
from app.models import FilePurpose, ReferenceAssetType


BRIEF_EXTENSIONS = {".pdf", ".ppt", ".pptx"}
BRIEF_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
MEDIA_PREFIX_BY_ASSET_TYPE = {
    ReferenceAssetType.VIDEO: "video/",
    ReferenceAssetType.IMAGE: "image/",
    ReferenceAssetType.AUDIO: "audio/",
}


@dataclass(frozen=True)
class ValidatedUpload:
    filename: str
    content_type: str
    data: bytes
    size_bytes: int


def validate_brief_upload(file: UploadFile, data: bytes, max_size_bytes: int) -> ValidatedUpload:
    filename = _require_filename(file)
    extension = Path(filename).suffix.lower()
    content_type = file.content_type or "application/octet-stream"

    if extension not in BRIEF_EXTENSIONS and content_type not in BRIEF_CONTENT_TYPES:
        raise AppError(
            "UNSUPPORTED_BRIEF_FILE",
            "Brief 文件仅支持 PDF、PPT 或 PPTX 格式",
            status.HTTP_400_BAD_REQUEST,
        )
    return _build_validated_upload(filename, content_type, data, max_size_bytes, FilePurpose.BRIEF.value)


def validate_reference_upload(
    file: UploadFile,
    data: bytes,
    asset_type: ReferenceAssetType,
    max_size_bytes: int,
) -> ValidatedUpload:
    filename = _require_filename(file)
    content_type = file.content_type or "application/octet-stream"
    expected_prefix = MEDIA_PREFIX_BY_ASSET_TYPE[asset_type]

    if not content_type.startswith(expected_prefix):
        raise AppError(
            "UNSUPPORTED_REFERENCE_FILE",
            f"参考{_asset_type_label(asset_type)}仅支持 {expected_prefix.rstrip('/')} 类型文件",
            status.HTTP_400_BAD_REQUEST,
        )
    return _build_validated_upload(filename, content_type, data, max_size_bytes, asset_type.value)


def validate_remote_source(source: str) -> str:
    stripped = source.strip()
    if not stripped:
        raise AppError("INVALID_REMOTE_SOURCE", "远程素材 URL 不能为空", status.HTTP_400_BAD_REQUEST)
    if stripped.startswith(("http://", "https://", "tos://")):
        return stripped
    raise AppError(
        "INVALID_REMOTE_SOURCE",
        "远程素材仅支持公网 HTTP/HTTPS URL 或 TOS URI",
        status.HTTP_400_BAD_REQUEST,
    )


def _build_validated_upload(
    filename: str,
    content_type: str,
    data: bytes,
    max_size_bytes: int,
    label: str,
) -> ValidatedUpload:
    size_bytes = len(data)
    if size_bytes == 0:
        raise AppError("EMPTY_FILE", f"{label} 文件不能为空", status.HTTP_400_BAD_REQUEST)
    if size_bytes > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise AppError("FILE_TOO_LARGE", f"{label} 文件不能超过 {max_mb}MB", status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
    return ValidatedUpload(filename=filename, content_type=content_type, data=data, size_bytes=size_bytes)


def _require_filename(file: UploadFile) -> str:
    if not file.filename:
        raise AppError("MISSING_FILENAME", "上传文件缺少文件名", status.HTTP_400_BAD_REQUEST)
    return Path(file.filename).name


def _asset_type_label(asset_type: ReferenceAssetType) -> str:
    return {
        ReferenceAssetType.VIDEO: "视频",
        ReferenceAssetType.IMAGE: "图片",
        ReferenceAssetType.AUDIO: "音频",
    }[asset_type]
