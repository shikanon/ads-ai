import json
import shutil
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import UUID, uuid4

from app.models import (
    BriefParseResult,
    CompositionStatus,
    FileRecord,
    FilePurpose,
    FileSourceType,
    FinalResult,
    GenerationPlan,
    GenerationPlanStatus,
    GenerationTask,
    GenerationTaskStatus,
    Project,
    ProjectStatus,
    ReferenceAsset,
    RequirementItem,
    SegmentPlan,
)


MATERIAL_COLLECTION_NAMES = (
    "materials",
    "material_tags",
    "material_indexes",
    "material_effects",
    "material_insights",
    "material_audit_events",
)


class JsonRepository:
    def __init__(self, storage_dir: str):
        self.root = Path(storage_dir)
        self.metadata_path = self.root / "metadata.json"
        self.uploads_dir = self.root / "uploads"
        self._lock = Lock()

    def ensure_project(
        self,
        project_id: UUID,
        name: str | None = None,
        requirement_text: str | None = None,
        target_duration_seconds: int | None = None,
    ) -> Project:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            existing = state["projects"].get(project_key)
            if existing:
                project = Project(**existing)
                should_touch = False
                if name:
                    project.name = name
                    should_touch = True
                if requirement_text is not None:
                    project.requirement_text = requirement_text
                    should_touch = True
                if target_duration_seconds is not None:
                    project.target_duration_seconds = target_duration_seconds
                    should_touch = True
                if should_touch:
                    project.updated_at = datetime.utcnow()
            else:
                project = Project(
                    id=project_id,
                    name=name or f"广告 TVC 项目 {project_key[:8]}",
                    requirement_text=requirement_text,
                    target_duration_seconds=target_duration_seconds,
                )

            state["projects"][project_key] = project.model_dump(mode="json")
            self._write_state(state)
            return project

    def save_file_record(self, file_record: FileRecord) -> FileRecord:
        with self._lock:
            state = self._read_state()
            state["files"][str(file_record.id)] = file_record.model_dump(mode="json")
            self._touch_project(state, file_record.project_id)
            self._write_state(state)
            return file_record

    def save_reference_asset(self, reference_asset: ReferenceAsset) -> ReferenceAsset:
        with self._lock:
            state = self._read_state()
            state["references"][str(reference_asset.id)] = reference_asset.model_dump(mode="json")
            self._touch_project(state, reference_asset.project_id)
            self._write_state(state)
            return reference_asset

    def save_parse_result(self, project_id: UUID, parse_result: BriefParseResult) -> BriefParseResult:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            state["requirements"] = {
                item_id: item
                for item_id, item in state["requirements"].items()
                if item.get("project_id") != project_key
            }
            state["references"] = {
                item_id: item
                for item_id, item in state["references"].items()
                if item.get("project_id") != project_key
            }

            reference_ids: list[str] = []
            for requirement in parse_result.requirements:
                state["requirements"][str(requirement.id)] = requirement.model_dump(mode="json")

            for parsed_reference in [*parse_result.references, *parse_result.missing_assets]:
                reference = ReferenceAsset(project_id=project_id, **parsed_reference.model_dump())
                state["references"][str(reference.id)] = reference.model_dump(mode="json")
                reference_ids.append(str(reference.id))

            project = Project(**state["projects"][project_key])
            project.status = ProjectStatus.PLAN_READY
            project.updated_at = datetime.utcnow()
            state["projects"][project_key] = project.model_dump(mode="json")
            state["parse_results"][project_key] = {
                "summary": parse_result.summary,
                "requirement_ids": [str(item.id) for item in parse_result.requirements],
                "reference_ids": reference_ids,
            }
            self._write_state(state)
            return parse_result

    def replace_parsed_items(
        self,
        project_id: UUID,
        summary: str,
        requirements: list[RequirementItem],
        references: list[ReferenceAsset],
    ) -> dict[str, Any]:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            state["requirements"] = {
                item_id: item
                for item_id, item in state["requirements"].items()
                if item.get("project_id") != project_key
            }
            state["references"] = {
                item_id: item
                for item_id, item in state["references"].items()
                if item.get("project_id") != project_key
            }
            for requirement in requirements:
                state["requirements"][str(requirement.id)] = requirement.model_dump(mode="json")
            for reference in references:
                state["references"][str(reference.id)] = reference.model_dump(mode="json")

            state["parse_results"][project_key] = {
                "summary": summary,
                "requirement_ids": [str(item.id) for item in requirements],
                "reference_ids": [str(item.id) for item in references],
            }
            if project_key in state["generation_plans"]:
                plan = GenerationPlan(**state["generation_plans"][project_key])
                plan.status = GenerationPlanStatus.DRAFT
                plan.confirmed_at = None
                plan.confirmed_by = None
                state["generation_plans"][project_key] = plan.model_dump(mode="json")
            project = Project(**state["projects"][project_key])
            project.status = ProjectStatus.PLAN_READY
            project.updated_at = datetime.utcnow()
            state["projects"][project_key] = project.model_dump(mode="json")
            self._write_state(state)
            return self._project_payload_from_state(state, project_id)

    def replace_segment_plans(self, project_id: UUID, segments: list[SegmentPlan]) -> dict[str, Any]:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            state["segment_plans"] = {
                item_id: item
                for item_id, item in state["segment_plans"].items()
                if item.get("project_id") != project_key
            }
            for segment in segments:
                state["segment_plans"][str(segment.id)] = segment.model_dump(mode="json")

            project = Project(**state["projects"][project_key])
            project.status = ProjectStatus.PLAN_READY
            project.updated_at = datetime.utcnow()
            state["projects"][project_key] = project.model_dump(mode="json")
            state["generation_plans"][project_key] = self._build_next_generation_plan(state, project_id, segments).model_dump(mode="json")
            self._write_state(state)
            return self._project_payload_from_state(state, project_id)

    def confirm_generation_plan(self, project_id: UUID, confirmed_by: str | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            if project_key not in state["projects"]:
                raise KeyError("project_not_found")
            if project_key not in state["generation_plans"]:
                segments = [SegmentPlan(**item) for item in state["segment_plans"].values() if item["project_id"] == project_key]
                if not segments:
                    raise ValueError("missing_segment_plan")
                state["generation_plans"][project_key] = self._build_next_generation_plan(state, project_id, segments).model_dump(mode="json")

            plan = GenerationPlan(**state["generation_plans"][project_key])
            if not plan.segment_ids:
                raise ValueError("missing_segment_plan")
            plan.status = GenerationPlanStatus.CONFIRMED
            plan.confirmed_at = datetime.utcnow()
            plan.confirmed_by = confirmed_by or "user"
            state["generation_plans"][project_key] = plan.model_dump(mode="json")

            project = Project(**state["projects"][project_key])
            project.status = ProjectStatus.CONFIRMED
            project.updated_at = datetime.utcnow()
            state["projects"][project_key] = project.model_dump(mode="json")
            self._write_state(state)
            return self._project_payload_from_state(state, project_id)

    def start_generation_tasks(self, project_id: UUID) -> dict[str, Any]:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            if project_key not in state["projects"]:
                raise KeyError("project_not_found")

            plan_payload = state["generation_plans"].get(project_key)
            if not plan_payload or plan_payload.get("status") != GenerationPlanStatus.CONFIRMED.value:
                raise PermissionError("plan_not_confirmed")

            plan = GenerationPlan(**plan_payload)
            existing_segment_ids = {
                item["segment_id"]
                for item in state["generation_tasks"].values()
                if item["project_id"] == project_key
            }
            for segment_id in plan.segment_ids:
                segment_key = str(segment_id)
                if segment_key in existing_segment_ids:
                    continue
                task = GenerationTask(
                    id=uuid4(),
                    project_id=project_id,
                    segment_id=segment_id,
                    request_summary={"generation_plan_version": plan.version},
                )
                state["generation_tasks"][str(task.id)] = task.model_dump(mode="json")

            project = Project(**state["projects"][project_key])
            project.status = ProjectStatus.GENERATING
            project.updated_at = datetime.utcnow()
            state["projects"][project_key] = project.model_dump(mode="json")
            self._write_state(state)
            return self._project_payload_from_state(state, project_id)

    def generation_plan_for_project(self, project_id: UUID) -> GenerationPlan:
        state = self._read_state()
        project_key = str(project_id)
        if project_key not in state["projects"]:
            raise KeyError("project_not_found")
        plan_payload = state["generation_plans"].get(project_key)
        if not plan_payload or plan_payload.get("status") != GenerationPlanStatus.CONFIRMED.value:
            raise PermissionError("plan_not_confirmed")
        return GenerationPlan(**plan_payload)

    def find_generation_task_by_segment(self, project_id: UUID, segment_id: UUID) -> GenerationTask | None:
        state = self._read_state()
        project_key = str(project_id)
        segment_key = str(segment_id)
        for item in state["generation_tasks"].values():
            if item["project_id"] == project_key and item["segment_id"] == segment_key:
                return GenerationTask(**item)
        return None

    def save_generation_task(self, task: GenerationTask) -> dict[str, Any]:
        with self._lock:
            state = self._read_state()
            project_key = str(task.project_id)
            if project_key not in state["projects"]:
                raise KeyError("project_not_found")
            state["generation_tasks"][str(task.id)] = task.model_dump(mode="json")
            self._update_project_generation_status(state, task.project_id)
            self._write_state(state)
            return self._project_payload_from_state(state, task.project_id)

    def generation_tasks_for_project(self, project_id: UUID) -> list[GenerationTask]:
        state = self._read_state()
        project_key = str(project_id)
        if project_key not in state["projects"]:
            raise KeyError("project_not_found")
        return [
            GenerationTask(**item)
            for item in state["generation_tasks"].values()
            if item["project_id"] == project_key
        ]

    def begin_final_composition(self, project_id: UUID) -> FinalResult:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            if project_key not in state["projects"]:
                raise KeyError("project_not_found")

            existing = state["final_results"].get(project_key)
            result = FinalResult(**existing) if existing else FinalResult(project_id=project_id)
            result.status = CompositionStatus.RUNNING
            result.error_message = None
            result.updated_at = datetime.utcnow()
            state["final_results"][project_key] = result.model_dump(mode="json")

            project = Project(**state["projects"][project_key])
            project.status = ProjectStatus.COMPOSITING
            project.updated_at = datetime.utcnow()
            state["projects"][project_key] = project.model_dump(mode="json")
            self._write_state(state)
            return result

    def save_final_video(
        self,
        project_id: UUID,
        output_path: Path,
        preview_url: str,
        download_url: str,
        duration_seconds: float | None = None,
        file_id: UUID | None = None,
    ) -> FinalResult:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            if project_key not in state["projects"]:
                raise KeyError("project_not_found")

            file_record = FileRecord(
                id=file_id or uuid4(),
                project_id=project_id,
                purpose=FilePurpose.FINAL_VIDEO,
                source_type=FileSourceType.LOCAL,
                filename=output_path.name,
                content_type="video/mp4",
                size_bytes=output_path.stat().st_size if output_path.exists() else None,
                storage_path=str(output_path),
            )
            state["files"][str(file_record.id)] = file_record.model_dump(mode="json")

            existing = state["final_results"].get(project_key)
            result = FinalResult(**existing) if existing else FinalResult(project_id=project_id)
            result.status = CompositionStatus.SUCCEEDED
            result.output_file_id = file_record.id
            result.preview_url = preview_url
            result.download_url = download_url
            result.duration_seconds = duration_seconds
            result.error_message = None
            result.updated_at = datetime.utcnow()
            state["final_results"][project_key] = result.model_dump(mode="json")

            project = Project(**state["projects"][project_key])
            project.status = ProjectStatus.COMPLETED
            project.updated_at = datetime.utcnow()
            state["projects"][project_key] = project.model_dump(mode="json")
            self._write_state(state)
            return result

    def fail_final_composition(self, project_id: UUID, error_message: str) -> FinalResult:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            if project_key not in state["projects"]:
                raise KeyError("project_not_found")

            existing = state["final_results"].get(project_key)
            result = FinalResult(**existing) if existing else FinalResult(project_id=project_id)
            result.status = CompositionStatus.FAILED
            result.error_message = error_message
            result.updated_at = datetime.utcnow()
            state["final_results"][project_key] = result.model_dump(mode="json")

            project = Project(**state["projects"][project_key])
            project.status = ProjectStatus.FAILED
            project.updated_at = datetime.utcnow()
            state["projects"][project_key] = project.model_dump(mode="json")
            self._write_state(state)
            return result

    def file_record(self, project_id: UUID, file_id: UUID) -> FileRecord | None:
        state = self._read_state()
        item = state["files"].get(str(file_id))
        if not item or item["project_id"] != str(project_id):
            return None
        return FileRecord(**item)

    def write_upload(self, project_id: UUID, file_id: UUID, filename: str, data: bytes) -> Path:
        safe_name = Path(filename).name
        project_dir = self.uploads_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        output_path = project_dir / f"{file_id}-{safe_name}"
        output_path.write_bytes(data)
        return output_path

    def project_payload(self, project_id: UUID) -> dict[str, Any]:
        state = self._read_state()
        return self._project_payload_from_state(state, project_id)

    def project_history_payload(self, project_id: UUID) -> dict[str, Any]:
        state = self._read_state()
        payload = self._project_payload_from_state(state, project_id)
        payload["history_summary"] = self._project_history_summary_from_state(state, project_id)
        return payload

    def list_project_histories(self) -> list[dict[str, Any]]:
        state = self._read_state()
        summaries = [
            self._project_history_summary_from_state(state, UUID(project_id))
            for project_id in state["projects"]
        ]
        return sorted(summaries, key=lambda item: item["updated_at"], reverse=True)

    def list_gallery_items(self) -> list[dict[str, Any]]:
        state = self._read_state()
        items: list[dict[str, Any]] = []
        for project_key, final_result in state["final_results"].items():
            project_payload = state["projects"].get(project_key)
            if not project_payload:
                continue
            summary = self._project_history_summary_from_state(state, UUID(project_key))
            if not summary:
                continue
            items.append(
                {
                    **summary,
                    "final_result": final_result,
                    "preview_url": final_result.get("preview_url"),
                    "download_url": final_result.get("download_url"),
                    "duration_seconds": final_result.get("duration_seconds"),
                }
            )
        return sorted(items, key=lambda item: item["final_result"].get("updated_at") or item["updated_at"], reverse=True)

    def delete_project(self, project_id: UUID) -> bool:
        with self._lock:
            state = self._read_state()
            project_key = str(project_id)
            if project_key not in state["projects"]:
                return False

            state["projects"].pop(project_key, None)
            for collection in ("files", "requirements", "references", "segment_plans", "generation_tasks"):
                state[collection] = {
                    item_id: item
                    for item_id, item in state[collection].items()
                    if item.get("project_id") != project_key
                }
            for collection in ("parse_results", "generation_plans", "final_results"):
                state[collection].pop(project_key, None)

            self._write_state(state)

        shutil.rmtree(self.uploads_dir / project_key, ignore_errors=True)
        shutil.rmtree(self.root / "compositions" / project_key, ignore_errors=True)
        return True

    def _project_payload_from_state(self, state: dict[str, dict[str, Any]], project_id: UUID) -> dict[str, Any]:
        project_key = str(project_id)
        return {
            "project": state["projects"].get(project_key),
            "files": [item for item in state["files"].values() if item["project_id"] == project_key],
            "requirements": [item for item in state["requirements"].values() if item["project_id"] == project_key],
            "references": [item for item in state["references"].values() if item["project_id"] == project_key],
            "segment_plans": sorted(
                [item for item in state["segment_plans"].values() if item["project_id"] == project_key],
                key=lambda item: item["order"],
            ),
            "parse_result": state["parse_results"].get(project_key),
            "generation_plan": state["generation_plans"].get(project_key),
            "generation_tasks": [item for item in state["generation_tasks"].values() if item["project_id"] == project_key],
            "final_result": state["final_results"].get(project_key),
            "history_summary": self._project_history_summary_from_state(state, project_id),
        }

    def _project_history_summary_from_state(self, state: dict[str, dict[str, Any]], project_id: UUID) -> dict[str, Any] | None:
        project_key = str(project_id)
        project_payload = state["projects"].get(project_key)
        if not project_payload:
            return None

        segment_count = sum(1 for item in state["segment_plans"].values() if item["project_id"] == project_key)
        final_result = state["final_results"].get(project_key)
        parse_result = state["parse_results"].get(project_key) or {}
        project = Project(**project_payload)
        return {
            "id": project_key,
            "name": project.name,
            "status": project.status.value,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat(),
            "target_duration_seconds": project.target_duration_seconds,
            "segment_count": segment_count,
            "final_result_status": final_result.get("status") if final_result else CompositionStatus.NOT_STARTED.value,
            "summary": parse_result.get("summary") or project.requirement_text or "尚未生成解析摘要",
        }

    def _read_state(self) -> dict[str, dict[str, Any]]:
        self.root.mkdir(parents=True, exist_ok=True)
        if not self.metadata_path.exists():
            return self._empty_state()

        with self.metadata_path.open("r", encoding="utf-8") as file:
            data = json.load(file)
        return {
            "projects": data.get("projects", {}),
            "files": data.get("files", {}),
            "requirements": data.get("requirements", {}),
            "references": data.get("references", {}),
            "parse_results": data.get("parse_results", {}),
            "segment_plans": data.get("segment_plans", {}),
            "generation_plans": data.get("generation_plans", {}),
            "generation_tasks": data.get("generation_tasks", {}),
            "final_results": data.get("final_results", {}),
            **{collection: data.get(collection, {}) for collection in MATERIAL_COLLECTION_NAMES},
        }

    def _write_state(self, state: dict[str, dict[str, Any]]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        with self.metadata_path.open("w", encoding="utf-8") as file:
            json.dump(state, file, ensure_ascii=False, indent=2)

    def _touch_project(self, state: dict[str, dict[str, Any]], project_id: UUID) -> None:
        project_key = str(project_id)
        if project_key not in state["projects"]:
            return
        project = Project(**state["projects"][project_key])
        project.updated_at = datetime.utcnow()
        state["projects"][project_key] = project.model_dump(mode="json")

    @staticmethod
    def _empty_state() -> dict[str, dict[str, Any]]:
        return {
            "projects": {},
            "files": {},
            "requirements": {},
            "references": {},
            "parse_results": {},
            "segment_plans": {},
            "generation_plans": {},
            "generation_tasks": {},
            "final_results": {},
            **{collection: {} for collection in MATERIAL_COLLECTION_NAMES},
        }

    def _build_next_generation_plan(
        self,
        state: dict[str, dict[str, Any]],
        project_id: UUID,
        segments: list[SegmentPlan],
    ) -> GenerationPlan:
        project_key = str(project_id)
        existing = state["generation_plans"].get(project_key)
        next_version = GenerationPlan(**existing).version + 1 if existing else 1
        requirements = [item for item in state["requirements"].values() if item["project_id"] == project_key]
        references = [item for item in state["references"].values() if item["project_id"] == project_key]
        return GenerationPlan(
            project_id=project_id,
            version=next_version,
            segment_ids=[segment.id for segment in sorted(segments, key=lambda item: item.order)],
            requirement_ids=[UUID(item["id"]) for item in requirements],
            reference_ids=[UUID(item["id"]) for item in references],
            missing_reference_ids=[UUID(item["id"]) for item in references if item.get("is_missing")],
        )

    def _update_project_generation_status(self, state: dict[str, dict[str, Any]], project_id: UUID) -> None:
        project_key = str(project_id)
        if project_key not in state["projects"]:
            return
        plan_payload = state["generation_plans"].get(project_key)
        if not plan_payload:
            return
        plan = GenerationPlan(**plan_payload)
        if not plan.segment_ids:
            return

        segment_ids = {str(segment_id) for segment_id in plan.segment_ids}
        tasks = [
            GenerationTask(**item)
            for item in state["generation_tasks"].values()
            if item["project_id"] == project_key and item["segment_id"] in segment_ids
        ]
        if not tasks:
            return

        project = Project(**state["projects"][project_key])
        if len(tasks) == len(segment_ids) and all(task.status == GenerationTaskStatus.SUCCEEDED for task in tasks):
            project.status = ProjectStatus.COMPLETED
        elif any(task.status == GenerationTaskStatus.FAILED for task in tasks):
            project.status = ProjectStatus.FAILED
        else:
            project.status = ProjectStatus.GENERATING
        project.updated_at = datetime.utcnow()
        state["projects"][project_key] = project.model_dump(mode="json")
