import json
from collections.abc import Awaitable, Callable
from copy import deepcopy
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_audit
from app.auth.models import User
from app.catalog.models import (
    Capability,
    CapabilityAlias,
    CatalogVersion,
    Domain,
    JobRole,
    JobRoleAlias,
)
from app.discovery.mining import normalize_skill_label
from app.graph.models import GraphVersion
from app.graph.neo4j import GraphPublishResult, publish_job_role_snapshot
from app.graph.service import create_graph_version, publish_graph_version
from app.reviews.models import GraphChangeCandidate, ReviewDecision
from app.reviews.schemas import MatchPolicy, RoleDefinitionPayload

FRAMEWORK_PATH = Path(__file__).with_name("framework_v1.json")
FRAMEWORK_SCHEMA_VERSION = "capability_framework_v1"

GraphPublisher = Callable[[dict, int], Awaitable[GraphPublishResult]]


def load_framework() -> dict[str, Any]:
    data = json.loads(FRAMEWORK_PATH.read_text(encoding="utf-8"))
    _validate_framework(data)
    return data


def _validate_framework(data: dict[str, Any]) -> None:
    if data.get("schema_version") != FRAMEWORK_SCHEMA_VERSION:
        raise ValueError("unsupported capability framework schema")
    capabilities = data.get("capabilities")
    roles = data.get("job_families")
    if not isinstance(capabilities, list) or len(capabilities) != 33:
        raise ValueError("capability framework must contain exactly 33 capabilities")
    if not isinstance(roles, list) or len(roles) != 4:
        raise ValueError("capability framework must contain exactly four job families")

    names = [item.get("name") for item in capabilities]
    if any(not isinstance(name, str) or not name.strip() for name in names):
        raise ValueError("capability names must be non-empty strings")
    if len(names) != len(set(names)):
        raise ValueError("capability names must be unique")
    name_set = set(names)

    aliases: dict[str, str] = {}
    for item in capabilities:
        bars = item.get("bars")
        if (
            not isinstance(bars, list)
            or len(bars) != 5
            or not all(isinstance(value, str) and value.strip() for value in bars)
        ):
            raise ValueError(f"{item['name']} must define five BARS anchors")
        for alias in item.get("aliases", []):
            normalized = normalize_skill_label(alias)
            if not normalized:
                raise ValueError(f"{item['name']} contains an empty alias")
            existing = aliases.get(normalized)
            if existing is not None and existing != item["name"]:
                raise ValueError(f"alias {alias!r} maps to multiple capabilities")
            aliases[normalized] = item["name"]

    role_codes = {role.get("code") for role in roles}
    if role_codes != {"J1", "J2", "J3", "J4"}:
        raise ValueError("job family codes must be J1 through J4")
    for role in roles:
        required = role.get("required", [])
        bonus = role.get("bonus", [])
        if len(required) < 2 or set(required) & set(bonus):
            raise ValueError(f"{role['code']} has invalid capability requirements")
        if not set(required + bonus) <= name_set:
            raise ValueError(f"{role['code']} references an unknown capability")


async def bootstrap_capability_framework(
    db: AsyncSession,
    actor: User,
    *,
    publisher: GraphPublisher = publish_job_role_snapshot,
    request_id: str = "capability-framework-bootstrap",
) -> dict[str, Any]:
    if actor.role != "admin" or not actor.is_active:
        raise ValueError("an active admin user is required")

    data = load_framework()
    domain = await _upsert_domain(db, data["domain"])
    capabilities = await _upsert_capabilities(db, domain, data)
    await db.commit()

    published_versions: list[UUID] = []
    for role_value in data["job_families"]:
        role = await _find_role(db, domain.id, role_value["name"])
        if role is None:
            proposal = await _upsert_seed_proposal(
                db,
                actor,
                role_value,
                capabilities,
                data["translation_weights"],
            )
            version = await _graph_version_for_proposal(db, actor, proposal)
            version = await publish_graph_version(
                db,
                actor,
                version.id,
                request_id=request_id,
                ip_address=None,
                publisher=publisher,
            )
            published_versions.append(version.id)
            role = await db.get(JobRole, version.job_role_id)
        if role is None:
            raise RuntimeError(f"failed to publish job family {role_value['code']}")
        await _update_role_metadata(
            db,
            role,
            role_value,
            data["translation_weights"],
        )
        await _upsert_role_alias(db, role, role_value["code"])
        await db.commit()

    current_catalog = await db.scalar(
        select(CatalogVersion).where(
            CatalogVersion.status == "published",
            CatalogVersion.is_current.is_(True),
        )
    )
    current_graph = await db.scalar(
        select(GraphVersion).where(
            GraphVersion.status == "published",
            GraphVersion.is_current.is_(True),
        )
    )
    if current_catalog is None or current_graph is None:
        raise RuntimeError("framework bootstrap did not produce published versions")

    capability_count = await db.scalar(
        select(func.count())
        .select_from(Capability)
        .where(
            Capability.domain_id == domain.id,
            Capability.status == "active",
        )
    )
    role_count = await db.scalar(
        select(func.count())
        .select_from(JobRole)
        .where(
            JobRole.domain_id == domain.id,
            JobRole.status == "active",
        )
    )
    record_audit(
        db,
        action="catalog.framework.bootstrap",
        resource_type="domain",
        resource_id=domain.id,
        actor_user_id=actor.id,
        outcome="success",
        request_id=request_id,
        ip_address=None,
        metadata={
            "schema_version": FRAMEWORK_SCHEMA_VERSION,
            "capability_count": capability_count or 0,
            "job_role_count": role_count or 0,
            "published_graph_version_count": len(published_versions),
        },
    )
    await db.commit()
    return {
        "schema_version": FRAMEWORK_SCHEMA_VERSION,
        "domain_id": str(domain.id),
        "capability_count": capability_count or 0,
        "job_role_count": role_count or 0,
        "published_graph_version_count": len(published_versions),
        "catalog_version_id": str(current_catalog.id),
        "catalog_version_no": current_catalog.version_no,
        "graph_version_id": str(current_graph.id),
        "graph_version_no": current_graph.version_no,
    }


async def _upsert_domain(db: AsyncSession, value: dict[str, Any]) -> Domain:
    domain = await db.scalar(select(Domain).where(Domain.code == value["code"]))
    if domain is None:
        domain = Domain(
            id=uuid4(),
            code=value["code"],
            name=value["name"],
            description=value["description"],
            status="active",
            sort_order=0,
        )
        db.add(domain)
        await db.flush()
    else:
        domain.name = value["name"]
        domain.description = value["description"]
        domain.status = "active"
    return domain


async def _upsert_capabilities(
    db: AsyncSession,
    domain: Domain,
    data: dict[str, Any],
) -> dict[str, Capability]:
    existing = {
        value.canonical_name: value
        for value in await db.scalars(
            select(Capability).where(Capability.domain_id == domain.id)
        )
    }
    result: dict[str, Capability] = {}
    for sort_order, value in enumerate(data["capabilities"], start=1):
        capability = existing.get(value["name"])
        payload = {
            "schema_version": FRAMEWORK_SCHEMA_VERSION,
            "meta_dimension": value["meta_dimension"],
            "dual_track": value["dual_track"],
            "group": value["group"],
            "primary_job_family": value["primary"],
            "secondary_job_family": value.get("secondary"),
            "sort_order": sort_order,
            "bars": [
                {"level": index, "anchor": anchor}
                for index, anchor in enumerate(value["bars"], start=1)
            ],
        }
        if capability is None:
            capability = Capability(
                id=uuid4(),
                domain_id=domain.id,
                canonical_name=value["name"],
                description=f"{value['group']}能力；{value['bars'][2]}",
                skill_type=value["meta_dimension"],
                framework_payload=payload,
                status="active",
                source_type="manual",
            )
            db.add(capability)
            await db.flush()
        else:
            capability.description = f"{value['group']}能力；{value['bars'][2]}"
            capability.skill_type = value["meta_dimension"]
            capability.framework_payload = payload
            capability.status = "active"
            capability.source_type = "manual"
        result[value["name"]] = capability
        for alias in value.get("aliases", []):
            await _upsert_capability_alias(db, capability, alias)
    return result


async def _upsert_capability_alias(
    db: AsyncSession,
    capability: Capability,
    alias_value: str,
) -> None:
    normalized = normalize_skill_label(alias_value)
    rows = (await db.scalars(select(CapabilityAlias))).all()
    matches = [
        alias for alias in rows if normalize_skill_label(alias.alias) == normalized
    ]
    if not matches:
        db.add(
            CapabilityAlias(
                id=uuid4(),
                capability_id=capability.id,
                alias=alias_value,
                status="active",
            )
        )
        return
    if any(alias.capability_id != capability.id for alias in matches):
        raise ValueError(f"capability alias conflict: {alias_value}")
    for alias in matches:
        alias.status = "active"


async def _find_role(
    db: AsyncSession,
    domain_id: UUID,
    canonical_name: str,
) -> JobRole | None:
    return await db.scalar(
        select(JobRole).where(
            JobRole.domain_id == domain_id,
            JobRole.canonical_name == canonical_name,
            JobRole.status == "active",
        )
    )


async def _upsert_seed_proposal(
    db: AsyncSession,
    actor: User,
    role_value: dict[str, Any],
    capabilities: dict[str, Capability],
    translation_weights: dict[str, Any],
) -> GraphChangeCandidate:
    seed_key = f"{FRAMEWORK_SCHEMA_VERSION}:{role_value['code']}"
    proposals = (
        await db.scalars(
            select(GraphChangeCandidate).where(
                GraphChangeCandidate.source_candidate_id.is_(None)
            )
        )
    ).all()
    existing = next(
        (
            proposal
            for proposal in proposals
            if proposal.source_snapshot.get("seed_key") == seed_key
        ),
        None,
    )
    if existing is not None:
        if existing.review_status not in {"approved", "published"}:
            existing.review_status = "approved"
            existing.reviewed_by_user_id = actor.id
            existing.reviewed_at = datetime.now(UTC)
            await db.commit()
        return existing

    definition = RoleDefinitionPayload(
        role_name=role_value["name"],
        core_responsibilities=role_value["responsibilities"],
        required_capability_ids=[
            capabilities[name].id for name in role_value["required"]
        ],
        bonus_capability_ids=[capabilities[name].id for name in role_value["bonus"]],
        industry_scenarios=role_value["industry_scenarios"],
        match_policy=MatchPolicy(
            minimum_education_level=role_value["minimum_education_level"],
            recommended_experience_months=role_value["recommended_experience_months"],
        ),
        generation_source="human_revision",
        definition_status="reviewed",
    ).model_dump(mode="json")
    now = datetime.now(UTC)
    proposal = GraphChangeCandidate(
        id=uuid4(),
        source_candidate_id=None,
        change_type="create_job_role",
        proposed_payload=definition,
        source_snapshot={
            "seed_key": seed_key,
            "schema_version": FRAMEWORK_SCHEMA_VERSION,
            "job_family_code": role_value["code"],
            "translation_weights": deepcopy(translation_weights),
        },
        evidence_summary={
            "source_documents": [
                "11_能力权重_文献先验+JD数据校准.md",
                "12_翻译映射表_原专业到新质岗位.md",
                "13_专业大类_岗位族_总览图谱.md",
                "14_能力多维分类总表.md",
                "15_BARS行为锚定_33项能力.md",
                "16_能力抽取提示词+别名映射.md",
            ],
            "method": "literature_prior_plus_jd_directional_validation",
        },
        confidence=Decimal("1.0000"),
        review_status="approved",
        created_by_user_id=actor.id,
        reviewed_by_user_id=actor.id,
        reviewed_at=now,
    )
    db.add(proposal)
    db.add(
        ReviewDecision(
            id=uuid4(),
            graph_change_candidate_id=proposal.id,
            reviewer_user_id=actor.id,
            decision="approve",
            before_payload=deepcopy(definition),
            after_payload=deepcopy(definition),
            comment="能力翻译器 v1 文献种子审核通过",
            created_at=now,
        )
    )
    await db.commit()
    return proposal


async def _graph_version_for_proposal(
    db: AsyncSession,
    actor: User,
    proposal: GraphChangeCandidate,
) -> GraphVersion:
    version = await db.scalar(
        select(GraphVersion).where(GraphVersion.source_proposal_id == proposal.id)
    )
    if version is not None:
        return version
    return await create_graph_version(
        db,
        actor,
        proposal.id,
        request_id="capability-framework-bootstrap",
        ip_address=None,
    )


async def _update_role_metadata(
    db: AsyncSession,
    role: JobRole,
    role_value: dict[str, Any],
    translation_weights: dict[str, Any],
) -> None:
    role.description = role_value["description"]
    role.definition_payload = {
        **role.definition_payload,
        "framework": {
            "schema_version": FRAMEWORK_SCHEMA_VERSION,
            "job_family_code": role_value["code"],
            "translation_weights": deepcopy(translation_weights),
        },
    }


async def _upsert_role_alias(
    db: AsyncSession,
    role: JobRole,
    alias_value: str,
) -> None:
    alias = await db.scalar(
        select(JobRoleAlias).where(JobRoleAlias.alias == alias_value)
    )
    if alias is None:
        db.add(
            JobRoleAlias(
                id=uuid4(),
                job_role_id=role.id,
                alias=alias_value,
                status="active",
            )
        )
    elif alias.job_role_id != role.id:
        raise ValueError(f"job role alias conflict: {alias_value}")
    else:
        alias.status = "active"
