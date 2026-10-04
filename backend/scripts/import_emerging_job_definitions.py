"""Import normalized emerging-job definitions exported from the supplied workbooks.

The workbook is an offline job-definition result, not a row-level JD feed.  This
script stores it as a completed discovery run so the existing discovery and
review APIs can expose the source definitions without fabricating raw postings.
"""

import argparse
import asyncio
import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.auth.models import User
from app.catalog.models import Capability, CapabilityAlias
from app.discovery.mining import (
    CatalogEntry,
    build_catalog_index,
    map_skill_labels,
    normalize_skill_label,
)
from app.discovery.models import (
    CombinationSkill,
    DiscoveryRun,
    SkillCombinationCandidate,
)
from app.infrastructure.database import SessionFactory
from app.processing.models import ProcessingRun

PIPELINE_VERSION = "workbook_job_definitions_v1"
WORKBOOK_DISCLAIMER = "".join(
    (
        "该岗位来自提供的岗位定义数据，",
        "仍需人工审核后进入正式岗位目录。",
    )
)
FALLBACK_CAPABILITIES = {
    "algorithm": ("数学建模", "逻辑思维", "持续改进", "快速学习"),
    "data": ("数据清洗", "统计推断", "数据可视化", "逻辑思维"),
    "product": ("商业思维", "任务拆解", "创新策划", "团队协作"),
    "content": ("AI 内容生成", "图文编辑", "创新策划", "持续改进"),
    "default": ("提示工程", "任务拆解", "团队协作", "逻辑思维"),
}


def _decimal(value: float) -> Decimal:
    return Decimal(str(round(max(0.0, min(1.0, value)), 4)))


def _category(text: str) -> str:
    if any(token in text for token in ("产品", "运营", "需求", "客户", "解决方案")):
        return "product"
    if any(token in text for token in ("数据", "分析", "统计", "指标")):
        return "data"
    if any(token in text for token in ("内容", "视频", "图像", "设计", "创意")):
        return "content"
    if any(token in text for token in ("算法", "模型", "研发", "训练", "工程师")):
        return "algorithm"
    return "default"


async def _catalog(db):
    capabilities = (
        await db.scalars(select(Capability).where(Capability.status == "active"))
    ).all()
    aliases = (
        await db.scalars(
            select(CapabilityAlias).where(CapabilityAlias.status == "active")
        )
    ).all()
    aliases_by_capability: dict[UUID, list[str]] = {}
    for alias in aliases:
        aliases_by_capability.setdefault(alias.capability_id, []).append(alias.alias)
    entries = [
        CatalogEntry(
            capability_id=value.id,
            canonical_name=value.canonical_name,
            aliases=tuple(aliases_by_capability.get(value.id, [])),
        )
        for value in capabilities
    ]
    return {
        value.canonical_name: value.id for value in capabilities
    }, build_catalog_index(entries)


def _resolve_capabilities(definition: dict, name_to_id, catalog):
    labels = [
        str(item.get("skill", ""))
        for item in [
            *definition.get("required_skills", []),
            *definition.get("bonus_skills", []),
        ]
        if isinstance(item, dict)
    ]
    mappings = map_skill_labels(labels, catalog)
    required: list[UUID] = []
    bonus: list[UUID] = []
    required_labels = {
        normalize_skill_label(str(item.get("skill", "")))
        for item in definition.get("required_skills", [])
        if isinstance(item, dict)
    }
    for mapping in mappings:
        if mapping.capability_id is None:
            continue
        if mapping.normalized_name in required_labels:
            required.append(mapping.capability_id)
        else:
            bonus.append(mapping.capability_id)

    text = " ".join(
        [
            str(definition.get("role_name", "")),
            *[str(value) for value in definition.get("responsibilities", [])],
        ]
    )
    if len(required) < 2:
        for name in FALLBACK_CAPABILITIES[_category(text)]:
            capability_id = name_to_id.get(name)
            if capability_id is not None and capability_id not in required:
                required.append(capability_id)
            if len(required) >= 4:
                break
    required = list(dict.fromkeys(required))[:8]
    bonus = [value for value in dict.fromkeys(bonus) if value not in required][:8]
    return required, bonus


async def import_definitions(payload: dict, source_name: str) -> dict:
    definitions = payload.get("definitions")
    if not isinstance(definitions, list) or not definitions:
        raise ValueError("definitions must be a non-empty list")
    source_hash = (
        payload.get("source_sha256")
        or hashlib.sha256(
            json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()
    )

    async with SessionFactory() as db:
        actor = await db.scalar(
            select(User)
            .where(User.role == "admin", User.is_active.is_(True))
            .order_by(User.created_at, User.id)
        )
        if actor is None:
            raise RuntimeError("an active admin account is required")

        existing_runs = (await db.scalars(select(DiscoveryRun))).all()
        for existing in existing_runs:
            if existing.parameters.get("source_sha256") == source_hash:
                return {
                    "discovery_run_id": str(existing.id),
                    "reused": True,
                    "definition_count": existing.summary.get("definition_count", 0),
                }

        name_to_id, catalog = await _catalog(db)
        capability_names = {value: key for key, value in name_to_id.items()}
        run_id = uuid5(NAMESPACE_URL, f"{source_hash}:discovery")
        processing_id = uuid5(NAMESPACE_URL, f"{source_hash}:processing")
        processing = ProcessingRun(
            id=processing_id,
            run_type="import_emerging_job_definitions",
            subject_type="discovery_run",
            subject_id=run_id,
            created_by_user_id=actor.id,
            owner_scope_type="admin_global",
            status="completed",
            current_stage="completed",
            pipeline_version=PIPELINE_VERSION,
            total_count=len(definitions),
            processed_count=len(definitions),
            success_count=len(definitions),
            progress_percent=100,
            attempt_count=1,
            input_snapshot={"source_name": source_name, "source_sha256": source_hash},
            result_summary={"definition_count": len(definitions)},
            started_at=datetime.now(UTC),
            heartbeat_at=datetime.now(UTC),
            completed_at=datetime.now(UTC),
        )
        discovery = DiscoveryRun(
            id=run_id,
            processing_run_id=processing_id,
            input_batch_ids=[],
            current_catalog_version_id=None,
            algorithm_version=PIPELINE_VERSION,
            extraction_version="workbook_source_v1",
            parameters={
                "source_name": source_name,
                "source_sha256": source_hash,
                "source_sheets": payload.get("source_sheets", []),
                "source_summary": payload.get("source_summary", {}),
            },
            status="completed",
            summary={},
            created_by_user_id=actor.id,
            completed_at=datetime.now(UTC),
        )
        db.add(processing)
        await db.flush()
        db.add(discovery)
        created = 0
        skill_links: list[CombinationSkill] = []
        for index, definition in enumerate(definitions):
            required, bonus = _resolve_capabilities(definition, name_to_id, catalog)
            if len(required) < 2:
                continue
            jd_count = int(definition.get("jd_count") or 0)
            company_count = int(definition.get("company_count") or 0)
            mapped_count = len(required) + len(bonus)
            support_score = _decimal(min(1, jd_count / 250))
            diversity_score = _decimal(min(1, company_count / 100))
            coherence_score = _decimal(min(1, mapped_count / 8))
            evidence_score = _decimal(0.85 if definition.get("llm_refined") else 0.7)
            overall = _decimal(
                float(support_score) * 0.35
                + float(diversity_score) * 0.2
                + float(coherence_score) * 0.25
                + float(evidence_score) * 0.2
            )
            candidate_id = uuid5(
                NAMESPACE_URL,
                f"{source_hash}:candidate:{definition.get('cluster_id', index)}",
            )
            role_name = str(definition.get("role_name") or "未命名新兴岗位")[:200]
            candidate = SkillCombinationCandidate(
                id=candidate_id,
                discovery_run_id=run_id,
                suggested_name=role_name,
                normalized_name=(
                    f"{normalize_skill_label(role_name)}:"
                    f"{definition.get('cluster_id', index)}"
                )[:200],
                definition_payload={
                    "source": source_name,
                    "cluster_id": definition.get("cluster_id"),
                    "responsibilities": definition.get("responsibilities", []),
                    "required_skills": definition.get("required_skills", []),
                    "bonus_skills": definition.get("bonus_skills", []),
                    "industries": definition.get("industries", []),
                    "aliases": definition.get("aliases", []),
                    "representative_companies": definition.get(
                        "representative_companies", []
                    ),
                    "representative_cities": definition.get(
                        "representative_cities", []
                    ),
                    "required_capability_names": [
                        capability_names[value] for value in required
                    ],
                    "bonus_capability_names": [
                        capability_names[value] for value in bonus
                    ],
                    "llm_refined": bool(definition.get("llm_refined")),
                    "disclaimer": WORKBOOK_DISCLAIMER,
                },
                support_job_count=max(0, jd_count),
                source_count=1,
                company_count=max(0, company_count),
                support_score=support_score,
                diversity_score=diversity_score,
                coherence_score=coherence_score,
                novelty_score=Decimal("1.0000"),
                evidence_score=evidence_score,
                overall_candidate_score=overall,
                status="candidate",
            )
            db.add(candidate)
            for capability_id in required:
                skill_links.append(
                    CombinationSkill(
                        candidate_id=candidate_id,
                        capability_id=capability_id,
                        skill_role="core",
                        weight=Decimal("1.0000"),
                        frequency=Decimal("1.0000"),
                    )
                )
            for capability_id in bonus:
                skill_links.append(
                    CombinationSkill(
                        candidate_id=candidate_id,
                        capability_id=capability_id,
                        skill_role="bonus",
                        weight=Decimal("0.5000"),
                        frequency=Decimal("0.5000"),
                    )
                )
            created += 1

        # These models do not declare ORM relationships, so explicitly flush the
        # parent rows before inserting the foreign-key dependent skill links.
        await db.flush()
        db.add_all(skill_links)

        discovery.summary = {
            "source_name": source_name,
            "source_sha256": source_hash,
            "definition_count": created,
            "input_definition_count": len(definitions),
            "disclaimer": "岗位定义来自外部工作簿，需人工审核后进入正式目录。",
        }
        processing.result_summary = dict(discovery.summary)
        await db.commit()
        return {
            "discovery_run_id": str(run_id),
            "reused": False,
            "definition_count": created,
            "input_definition_count": len(definitions),
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("payload", type=Path)
    parser.add_argument(
        "--source-name", default="新岗位定义.xlsx + 新岗位定义_技术词.xlsx"
    )
    args = parser.parse_args()
    payload = json.loads(args.payload.read_text(encoding="utf-8"))
    result = asyncio.run(import_definitions(payload, args.source_name))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
