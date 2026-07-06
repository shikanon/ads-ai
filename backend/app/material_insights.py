from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.material_models import (
    MaterialAsset,
    MaterialInsight,
    MaterialLibraryType,
    MaterialTagCategory,
    MaterialTagSource,
)
from app.material_storage import MaterialStorage


HIGH_CTR_THRESHOLD = 0.08
HIGH_CVR_THRESHOLD = 0.03
HIGH_CONVERSIONS_THRESHOLD = 10.0


@dataclass(frozen=True)
class MaterialEffectUpdate:
    material: MaterialAsset
    metrics: dict[str, float]
    effect_tags: list[str]
    insight: MaterialInsight | None = None


class MaterialInsightsService:
    def __init__(self, storage: MaterialStorage):
        self.storage = storage

    def record_effects(
        self,
        material_id: UUID,
        *,
        impressions: float | None = None,
        clicks: float | None = None,
        conversions: float | None = None,
        ctr: float | None = None,
        cvr: float | None = None,
        actor: str | None = None,
    ) -> MaterialEffectUpdate:
        material = self.storage.material(material_id)
        if material is None:
            raise KeyError("material_not_found")

        metrics = normalize_effect_metrics(
            {
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "ctr": ctr,
                "cvr": cvr,
            },
            material.effect_metrics,
        )
        saved_metrics = self.storage.save_effect_metrics(material_id, metrics, actor=actor)
        effect_tags = derive_effect_tags(saved_metrics)
        for tag_name in effect_tags:
            self.storage.upsert_tag(
                material_id,
                category=MaterialTagCategory.EFFECT,
                name=tag_name,
                value=tag_name,
                confidence=1.0,
                source=MaterialTagSource.SYSTEM,
                actor=actor,
            )
        if effect_tags:
            self.storage.upsert_tag(
                material_id,
                category=MaterialTagCategory.MANAGEMENT,
                name="performance_tier",
                value=effect_tags[0],
                confidence=1.0,
                source=MaterialTagSource.SYSTEM,
                actor=actor,
            )

        updated_material = self.storage.material(material_id)
        if updated_material is None:
            raise KeyError("material_not_found")
        insight = self._create_insight_for_high_performer(updated_material, effect_tags)
        return MaterialEffectUpdate(
            material=updated_material,
            metrics=saved_metrics,
            effect_tags=effect_tags,
            insight=insight,
        )

    def list_insights(self) -> list[MaterialInsight]:
        return self.storage.list_insights()

    def _create_insight_for_high_performer(
        self,
        material: MaterialAsset,
        effect_tags: list[str],
    ) -> MaterialInsight | None:
        if material.library_type != MaterialLibraryType.FINISHED:
            return None
        if not is_high_performer(material.effect_metrics):
            return None
        existing = next(
            (insight for insight in self.storage.list_insights() if insight.material_id == material.id),
            None,
        )
        if existing:
            return existing

        insight = build_material_insight(material, effect_tags)
        return self.storage.save_insight(insight)


def normalize_effect_metrics(
    raw_metrics: dict[str, float | None],
    existing_metrics: dict[str, float] | None = None,
) -> dict[str, float]:
    metrics = dict(existing_metrics or {})
    for key, value in raw_metrics.items():
        if value is not None:
            metrics[key] = float(value)

    impressions = metrics.get("impressions", 0.0)
    clicks = metrics.get("clicks", 0.0)
    conversions = metrics.get("conversions", 0.0)
    if impressions > 0:
        metrics["ctr"] = round(clicks / impressions, 6)
    else:
        metrics["ctr"] = float(metrics.get("ctr", 0.0) or 0.0)
    if clicks > 0:
        metrics["cvr"] = round(conversions / clicks, 6)
    else:
        metrics["cvr"] = float(metrics.get("cvr", 0.0) or 0.0)
    return metrics


def derive_effect_tags(metrics: dict[str, float]) -> list[str]:
    tags: list[str] = []
    if metrics.get("ctr", 0.0) >= HIGH_CTR_THRESHOLD:
        tags.append("high_ctr")
    if metrics.get("cvr", 0.0) >= HIGH_CVR_THRESHOLD:
        tags.append("high_cvr")
    if metrics.get("conversions", 0.0) >= HIGH_CONVERSIONS_THRESHOLD:
        tags.append("high_conversion")
    if not tags and metrics.get("impressions", 0.0) > 0:
        tags.append("needs_optimization")
    return tags


def is_high_performer(metrics: dict[str, float]) -> bool:
    return any(
        (
            metrics.get("ctr", 0.0) >= HIGH_CTR_THRESHOLD,
            metrics.get("cvr", 0.0) >= HIGH_CVR_THRESHOLD,
            metrics.get("conversions", 0.0) >= HIGH_CONVERSIONS_THRESHOLD,
        )
    )


def build_material_insight(material: MaterialAsset, effect_tags: list[str]) -> MaterialInsight:
    title = material.title or material.filename or f"素材 {str(material.id)[:8]}"
    method = build_method(material, effect_tags)
    script_template = (
        "1. 用高识别度场景或利益点开场；2. 在 3 秒内露出产品与核心卖点；"
        "3. 用行动号召收束，并保留可复用标签用于后续检索。"
    )
    prompt = (
        f"Create an ad creative like '{title}', with clear product focus, "
        f"performance tags: {', '.join(effect_tags) or 'balanced performance'}, "
        "strong opening hook, benefit reveal, and conversion-oriented CTA."
    )
    return MaterialInsight(
        material_id=material.id,
        title=f"高效果素材方法论：{title}",
        method=method,
        script_template=script_template,
        prompt=prompt,
        source_material_ids=[material.id],
        metrics_snapshot=dict(material.effect_metrics),
    )


def build_method(material: MaterialAsset, effect_tags: list[str]) -> str:
    signals = ", ".join(effect_tags) if effect_tags else "stable_performance"
    description = material.description or material.title or material.filename or "finished asset"
    return f"复用“{description}”的创意结构，优先强化 {signals} 对应的开场吸引力、卖点证明和转化动作。"


def effect_payload(update: MaterialEffectUpdate) -> dict[str, Any]:
    return {
        "material": update.material.model_dump(mode="json"),
        "metrics": update.metrics,
        "effect_tags": update.effect_tags,
        "insight": update.insight.model_dump(mode="json") if update.insight else None,
    }
