import subprocess
import sys

from sqlalchemy import func, select

from app.catalog.framework import (
    FRAMEWORK_SCHEMA_VERSION,
    bootstrap_capability_framework,
    load_framework,
)
from app.catalog.models import (
    Capability,
    CapabilityAlias,
    CatalogVersion,
    CatalogVersionItem,
    JobRole,
    JobRoleCapability,
)
from app.graph.models import GraphVersion
from app.graph.neo4j import GraphPublishResult
from app.reviews.models import GraphChangeCandidate, ReviewDecision


def test_bootstrap_script_runs_in_a_fresh_process() -> None:
    result = subprocess.run(
        [sys.executable, "scripts/bootstrap_capability_framework.py", "--help"],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_framework_file_defines_complete_canonical_model() -> None:
    data = load_framework()

    assert data["schema_version"] == FRAMEWORK_SCHEMA_VERSION
    assert len(data["capabilities"]) == 33
    assert {value["code"] for value in data["job_families"]} == {
        "J1",
        "J2",
        "J3",
        "J4",
    }
    assert data["translation_weights"] == {
        "comprehensive_quality": 0.45,
        "knowledge_foundation": 0.4,
        "education": 0.15,
        "hard_skill_gap_separate": True,
    }
    assert all(len(value["bars"]) == 5 for value in data["capabilities"])


async def test_framework_bootstrap_publishes_and_is_idempotent(
    db_session,
    make_user,
) -> None:
    admin, _password = await make_user(role="admin")

    async def publisher(snapshot: dict, version_no: int) -> GraphPublishResult:
        capabilities = snapshot["capabilities"]
        required_count = sum(
            value["requirement_type"] == "required" for value in capabilities
        )
        return GraphPublishResult(
            job_role_id=snapshot["job_role"]["id"],
            capability_count=len(capabilities),
            relation_count=len(capabilities),
            required_count=required_count,
            bonus_count=len(capabilities) - required_count,
        )

    first = await bootstrap_capability_framework(
        db_session,
        admin,
        publisher=publisher,
    )
    second = await bootstrap_capability_framework(
        db_session,
        admin,
        publisher=publisher,
    )

    assert first["capability_count"] == 33
    assert first["job_role_count"] == 4
    assert first["published_graph_version_count"] == 4
    assert second["published_graph_version_count"] == 0
    assert second["catalog_version_id"] == first["catalog_version_id"]
    assert second["graph_version_id"] == first["graph_version_id"]

    assert await db_session.scalar(select(func.count()).select_from(Capability)) == 33
    assert await db_session.scalar(select(func.count()).select_from(JobRole)) == 4
    assert (
        await db_session.scalar(select(func.count()).select_from(CapabilityAlias)) > 100
    )
    assert (
        await db_session.scalar(select(func.count()).select_from(JobRoleCapability))
        > 20
    )
    assert (
        await db_session.scalar(select(func.count()).select_from(GraphChangeCandidate))
        == 4
    )
    assert (
        await db_session.scalar(select(func.count()).select_from(ReviewDecision)) == 4
    )
    assert await db_session.scalar(select(func.count()).select_from(GraphVersion)) == 4
    assert (
        await db_session.scalar(select(func.count()).select_from(CatalogVersion)) == 4
    )

    current_catalog = await db_session.scalar(
        select(CatalogVersion).where(CatalogVersion.is_current.is_(True))
    )
    current_graph = await db_session.scalar(
        select(GraphVersion).where(GraphVersion.is_current.is_(True))
    )
    assert current_catalog is not None
    assert current_catalog.status == "published"
    assert current_graph is not None
    assert current_graph.status == "published"
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(CatalogVersionItem)
            .where(CatalogVersionItem.catalog_version_id == current_catalog.id)
        )
        == 37
    )

    react_alias = await db_session.scalar(
        select(CapabilityAlias).where(CapabilityAlias.alias == "React")
    )
    interaction = await db_session.scalar(
        select(Capability).where(Capability.canonical_name == "交互内容制作")
    )
    assert react_alias is not None
    assert interaction is not None
    assert react_alias.capability_id == interaction.id
    assert interaction.framework_payload["dual_track"] == "gap"
    assert len(interaction.framework_payload["bars"]) == 5
