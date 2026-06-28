import re
import zlib
from dataclasses import dataclass
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree


MAX_EXTRACTED_TEXT_CHARS = 12_000
SUMMARY_CHARS = 1_200
MIN_TEXT_QUALITY_SCORE = 0.55
ZERO_WIDTH_PATTERN = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]")
CONTROL_NOISE_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")


@dataclass(frozen=True)
class ExtractedBriefText:
    text: str
    summary: str
    method: str
    quality_score: float = 1.0
    rejected_reason: str | None = None


def extract_brief_text(filename: str, content_type: str, data: bytes) -> ExtractedBriefText | None:
    extension = Path(filename).suffix.lower()
    is_pdf = extension == ".pdf" or content_type == "application/pdf"
    candidates: list[tuple[str, str]] = []
    if is_pdf:
        candidates.extend(
            [
                ("pypdf", _extract_pdf_with_optional_library(data)),
                ("pdf_stream", _extract_pdf_from_streams(data)),
            ]
        )
    elif extension == ".pptx":
        candidates.append(("pptx_xml", _extract_pptx_text(data)))
    elif extension == ".ppt":
        candidates.append(("ppt_binary", _extract_printable_text(data)))

    rejected_candidates: list[ExtractedBriefText] = []
    for method, text in candidates:
        cleaned = _clean_text(text)
        if not _has_enough_signal(cleaned):
            continue
        assessment = _score_text_quality(text if is_pdf else cleaned)
        if is_pdf and not assessment.accepted:
            rejected_candidates.append(
                ExtractedBriefText(text="", summary="", method=method, quality_score=assessment.score, rejected_reason=assessment.reason)
            )
            continue
        if assessment.accepted:
            limited = cleaned[:MAX_EXTRACTED_TEXT_CHARS]
            return ExtractedBriefText(text=limited, summary=limited[:SUMMARY_CHARS], method=method, quality_score=assessment.score)
    if rejected_candidates:
        return max(rejected_candidates, key=lambda item: item.quality_score)
    return None


@dataclass(frozen=True)
class TextQualityAssessment:
    score: float
    accepted: bool
    reason: str | None = None


def _extract_pdf_with_optional_library(data: bytes) -> str:
    for module_name in ("pypdf", "PyPDF2"):
        try:
            module = __import__(module_name)
            reader_class = getattr(module, "PdfReader")
        except Exception:
            continue
        try:
            import io

            reader = reader_class(io.BytesIO(data))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            continue
    return ""


def _extract_pdf_from_streams(data: bytes) -> str:
    chunks: list[str] = []
    for stream in re.findall(rb"stream\r?\n(.*?)\r?\nendstream", data, flags=re.S):
        decoded = _decode_pdf_stream(stream.strip())
        if not decoded:
            continue
        chunks.extend(_decode_actual_text(decoded))
        chunks.extend(_decode_pdf_text_operators(decoded))
    if chunks:
        return "\n".join(chunks)
    return _extract_printable_text(data)


def _decode_pdf_stream(stream: bytes) -> bytes:
    try:
        return zlib.decompress(stream)
    except Exception:
        return stream


def _decode_actual_text(data: bytes) -> list[str]:
    values: list[str] = []
    for match in re.finditer(rb"/ActualText\s*<([0-9A-Fa-f]+)>", data):
        decoded = _decode_pdf_hex(match.group(1))
        if decoded:
            values.append(decoded)
    return values


def _decode_pdf_text_operators(data: bytes) -> list[str]:
    values: list[str] = []
    text_operands = re.findall(rb"(\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>)\s*Tj", data)
    array_operands = re.findall(rb"\[(.*?)\]\s*TJ", data, flags=re.S)

    for literal, hex_text in text_operands:
        values.append(_decode_pdf_literal(literal) if literal.startswith(b"(") else _decode_pdf_hex(hex_text))
    for array in array_operands:
        for literal in re.findall(rb"\((?:\\.|[^\\()])*\)", array):
            values.append(_decode_pdf_literal(literal))
        for hex_text in re.findall(rb"<([0-9A-Fa-f\s]+)>", array):
            values.append(_decode_pdf_hex(hex_text))
    return [value for value in values if value]


def _decode_pdf_literal(value: bytes) -> str:
    inner = value[1:-1]
    inner = inner.replace(rb"\(", b"(").replace(rb"\)", b")").replace(rb"\\", b"\\")
    for encoding in ("utf-8", "utf-16-be", "latin-1"):
        try:
            return inner.decode(encoding)
        except UnicodeDecodeError:
            continue
    return inner.decode("latin-1", errors="ignore")


def _decode_pdf_hex(value: bytes) -> str:
    compact = re.sub(rb"\s+", b"", value)
    if len(compact) % 2:
        compact += b"0"
    try:
        raw = bytes.fromhex(compact.decode("ascii"))
    except ValueError:
        return ""
    if raw.startswith(b"\xfe\xff"):
        return raw[2:].decode("utf-16-be", errors="ignore")
    for encoding in ("utf-8", "utf-16-be", "latin-1"):
        text = raw.decode(encoding, errors="ignore")
        if _has_enough_signal(text):
            return text
    return raw.decode("latin-1", errors="ignore")


def _extract_pptx_text(data: bytes) -> str:
    try:
        import io

        with ZipFile(io.BytesIO(data)) as archive:
            slide_names = sorted(name for name in archive.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml"))
            texts: list[str] = []
            for slide_name in slide_names:
                root = ElementTree.fromstring(archive.read(slide_name))
                slide_text = [node.text.strip() for node in root.iter() if node.tag.endswith("}t") and node.text and node.text.strip()]
                if slide_text:
                    texts.append(" ".join(slide_text))
            return "\n".join(texts)
    except Exception:
        return ""


def _extract_printable_text(data: bytes) -> str:
    utf16_parts = re.findall(rb"(?:[\x20-\x7e\x00][\x00]){4,}", data)
    ascii_parts = re.findall(rb"[\x20-\x7e]{4,}", data)
    values = [part.decode("utf-16-le", errors="ignore") for part in utf16_parts]
    values.extend(part.decode("utf-8", errors="ignore") for part in ascii_parts)
    return "\n".join(values)


def _clean_text(text: str) -> str:
    normalized = ZERO_WIDTH_PATTERN.sub("", text)
    normalized = CONTROL_NOISE_PATTERN.sub(" ", normalized)
    normalized = re.sub(r"[ \t\r\f\v]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def _has_enough_signal(text: str) -> bool:
    meaningful = re.findall(r"[\w\u4e00-\u9fff]", text)
    return len(meaningful) >= 8


def _score_text_quality(text: str) -> TextQualityAssessment:
    compact = text.strip()
    if not compact:
        return TextQualityAssessment(score=0.0, accepted=False, reason="low quality PDF text: empty text")

    total_chars = max(len(compact), 1)
    zero_width_ratio = len(ZERO_WIDTH_PATTERN.findall(compact)) / total_chars
    control_ratio = len(CONTROL_NOISE_PATTERN.findall(compact)) / total_chars
    extended_latin_ratio = sum(1 for char in compact if "\u00a0" <= char <= "\u00ff") / total_chars
    meaningful_chars = re.findall(r"[A-Za-z0-9\u4e00-\u9fff]", compact)
    meaningful_ratio = len(meaningful_chars) / total_chars
    lines = [line.strip() for line in compact.splitlines() if line.strip()]
    meaningful_line_lengths = [len(re.findall(r"[A-Za-z0-9\u4e00-\u9fff]", line)) for line in lines]
    single_char_line_ratio = (
        sum(1 for length in meaningful_line_lengths if length == 1) / len(meaningful_line_lengths)
        if meaningful_line_lengths
        else 0.0
    )
    avg_meaningful_line_length = sum(meaningful_line_lengths) / len(meaningful_line_lengths) if meaningful_line_lengths else 0.0

    score = 1.0
    score -= min(zero_width_ratio * 4.0, 0.35)
    score -= min(control_ratio * 5.0, 0.45)
    score -= min(max(0.0, extended_latin_ratio - 0.04) * 3.0, 0.25)
    if meaningful_ratio < 0.25:
        score -= 0.35
    if len(lines) >= 12 and single_char_line_ratio > 0.55:
        score -= 0.45
    if len(lines) >= 20 and avg_meaningful_line_length <= 2:
        score -= 0.25
    score = max(0.0, round(score, 3))

    reasons: list[str] = []
    if zero_width_ratio > 0.02:
        reasons.append("zero-width characters")
    if control_ratio > 0.01:
        reasons.append("control characters")
    if extended_latin_ratio > 0.08:
        reasons.append("embedded font encoding noise")
    if len(lines) >= 12 and single_char_line_ratio > 0.55:
        reasons.append("fragmented single-character lines")
    if meaningful_ratio < 0.25:
        reasons.append("low meaningful text ratio")

    accepted = score >= MIN_TEXT_QUALITY_SCORE and not (
        len(lines) >= 12 and single_char_line_ratio > 0.75 and (zero_width_ratio > 0.01 or avg_meaningful_line_length <= 2)
    )
    if accepted:
        return TextQualityAssessment(score=score, accepted=True)
    reason = "low quality PDF text: " + "; ".join(reasons or ["quality score below threshold"])
    return TextQualityAssessment(score=score, accepted=False, reason=reason)
