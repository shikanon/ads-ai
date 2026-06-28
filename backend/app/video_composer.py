import shutil
import subprocess
import urllib.request
from pathlib import Path
from uuid import UUID

from app.errors import AppError
from app.models import GenerationTask, SegmentPlan


class VideoComposer:
    def __init__(self, storage_dir: str, transition_seconds: float):
        self.root = Path(storage_dir)
        self.transition_seconds = max(0.0, transition_seconds)

    def compose(self, project_id: UUID, segments: list[SegmentPlan], tasks: list[GenerationTask]) -> tuple[Path, float]:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise AppError("FFMPEG_NOT_FOUND", "未找到 ffmpeg，无法执行视频合成", 500)

        ordered_segments = sorted(segments, key=lambda item: item.order)
        task_by_segment_id = {task.segment_id: task for task in tasks}
        work_dir = self.root / "compositions" / str(project_id)
        input_dir = work_dir / "inputs"
        normalized_dir = work_dir / "normalized"
        input_dir.mkdir(parents=True, exist_ok=True)
        normalized_dir.mkdir(parents=True, exist_ok=True)

        normalized_paths: list[Path] = []
        total_duration = 0.0
        for index, segment in enumerate(ordered_segments, start=1):
            task = task_by_segment_id.get(segment.id)
            if not task or not task.result_url:
                raise AppError("MISSING_SEGMENT_VIDEO", f"片段 {segment.order} 缺少生成结果 URL", 409)

            input_path = self._resolve_segment_video(task.result_url, input_dir / f"{index:03d}-source.mp4")
            output_path = normalized_dir / f"{index:03d}-normalized.mp4"
            self._normalize_segment(ffmpeg, input_path, output_path, segment.duration_seconds)
            normalized_paths.append(output_path)
            total_duration += segment.duration_seconds

        concat_list = work_dir / "concat.txt"
        concat_list.write_text(
            "".join(f"file '{path.as_posix()}'\n" for path in normalized_paths),
            encoding="utf-8",
        )
        output_path = work_dir / "final-tvc.mp4"
        self._run(
            [
                ffmpeg,
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-c",
                "copy",
                str(output_path),
            ]
        )
        return output_path, total_duration

    def _resolve_segment_video(self, result_url: str, target_path: Path) -> Path:
        if result_url.startswith(("http://", "https://")):
            with urllib.request.urlopen(result_url, timeout=120) as response:
                target_path.write_bytes(response.read())
            return target_path
        if result_url.startswith("file://"):
            path = Path(result_url.removeprefix("file://"))
            if path.exists():
                return path
        path = Path(result_url)
        if path.exists():
            return path
        raise AppError("SEGMENT_VIDEO_NOT_ACCESSIBLE", f"无法读取片段视频：{result_url}", 409)

    def _normalize_segment(self, ffmpeg: str, input_path: Path, output_path: Path, duration_seconds: float) -> None:
        fade_duration = min(self.transition_seconds, max(duration_seconds / 3, 0.0))
        fade_out_start = max(duration_seconds - fade_duration, 0.0)
        video_filter = (
            "scale=1280:720:force_original_aspect_ratio=decrease,"
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2,"
            "setsar=1,fps=30,format=yuv420p"
        )
        audio_filter = "aresample=async=1:min_hard_comp=0.100:first_pts=0"
        if fade_duration > 0:
            video_filter += f",fade=t=in:st=0:d={fade_duration},fade=t=out:st={fade_out_start}:d={fade_duration}"
            audio_filter += f",afade=t=in:st=0:d={fade_duration},afade=t=out:st={fade_out_start}:d={fade_duration}"

        command = [ffmpeg, "-y", "-i", str(input_path)]
        if self._has_audio(input_path):
            command.extend(["-vf", video_filter, "-af", audio_filter])
        else:
            command.extend(
                [
                    "-f",
                    "lavfi",
                    "-t",
                    str(duration_seconds),
                    "-i",
                    "anullsrc=channel_layout=stereo:sample_rate=48000",
                    "-map",
                    "0:v:0",
                    "-map",
                    "1:a:0",
                    "-vf",
                    video_filter,
                    "-af",
                    audio_filter,
                ]
            )
        command.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-c:a",
                "aac",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-shortest",
                str(output_path),
            ]
        )
        self._run(command)

    @staticmethod
    def _has_audio(input_path: Path) -> bool:
        ffprobe = shutil.which("ffprobe")
        if not ffprobe:
            return True
        completed = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                str(input_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        return completed.returncode == 0 and "audio" in completed.stdout

    @staticmethod
    def _run(command: list[str]) -> None:
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip() or "视频处理失败"
            raise AppError("VIDEO_COMPOSITION_FAILED", message[-1000:], 500)
