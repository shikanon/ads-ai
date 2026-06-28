import base64
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PdfPageRenderResult:
    total_pages: int
    rendered_pages: int
    image_paths: list[str]
    truncated: bool
    render_scale: float
    max_image_size: int
    renderer: str

    def metadata(self) -> dict[str, Any]:
        return {
            "total_pages": self.total_pages,
            "rendered_pages": self.rendered_pages,
            "image_paths": self.image_paths,
            "truncated": self.truncated,
            "render_scale": self.render_scale,
            "max_image_size": self.max_image_size,
            "renderer": self.renderer,
        }


def render_pdf_pages(
    filename: str,
    content_type: str,
    data: bytes,
    output_dir: Path,
    max_pages: int,
    render_scale: float,
    max_image_size: int,
) -> PdfPageRenderResult | None:
    if not _is_pdf(filename, content_type):
        return None
    try:
        import fitz
    except Exception:
        return None

    try:
        document = fitz.open(stream=data, filetype="pdf")
    except Exception:
        return None

    output_dir.mkdir(parents=True, exist_ok=True)
    total_pages = int(getattr(document, "page_count", 0) or 0)
    page_limit = max(0, min(total_pages, max_pages))
    image_paths: list[str] = []

    for page_index in range(page_limit):
        try:
            page = document.load_page(page_index)
            pixmap = _render_page_pixmap(fitz, page, render_scale, max_image_size)
            output_path = output_dir / f"page-{page_index + 1}.png"
            pixmap.save(output_path)
            image_paths.append(str(output_path))
        except Exception:
            continue

    close = getattr(document, "close", None)
    if callable(close):
        close()

    return PdfPageRenderResult(
        total_pages=total_pages,
        rendered_pages=len(image_paths),
        image_paths=image_paths,
        truncated=total_pages > page_limit,
        render_scale=render_scale,
        max_image_size=max_image_size,
        renderer="pymupdf",
    )


def build_pdf_page_image_content(files: list[Any]) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []
    for file in files:
        metadata = getattr(file, "metadata", {}) or {}
        pdf_images = metadata.get("pdf_page_images") if isinstance(metadata, dict) else None
        if not isinstance(pdf_images, dict):
            continue

        summary = metadata.get("extracted_summary")
        if summary:
            content.append(
                {
                    "type": "text",
                    "text": f"PDF brief 文本摘要（{getattr(file, 'filename', None) or getattr(file, 'source_url', None) or file.id}）：{summary}",
                }
            )

        for image_path in pdf_images.get("image_paths") or []:
            data_url = encode_image_as_data_url(str(image_path))
            if data_url:
                content.append({"type": "image_url", "image_url": {"url": data_url, "detail": "high"}})
    return content


def encode_image_as_data_url(image_path: str) -> str | None:
    path = Path(image_path)
    try:
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    except OSError:
        return None
    return f"data:image/png;base64,{encoded}"


def _render_page_pixmap(fitz: Any, page: Any, render_scale: float, max_image_size: int) -> Any:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(render_scale, render_scale), alpha=False)
    largest_side = max(int(getattr(pixmap, "width", 0) or 0), int(getattr(pixmap, "height", 0) or 0))
    if max_image_size > 0 and largest_side > max_image_size:
        constrained_scale = render_scale * (max_image_size / largest_side)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(constrained_scale, constrained_scale), alpha=False)
    return pixmap


def _is_pdf(filename: str, content_type: str) -> bool:
    return Path(filename).suffix.lower() == ".pdf" or content_type == "application/pdf"
