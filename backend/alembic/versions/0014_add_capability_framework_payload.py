"""add capability framework metadata

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0014"
down_revision: str | Sequence[str] | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "capabilities",
        sa.Column(
            "framework_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        op.f("ck_capabilities_framework_payload_object"),
        "capabilities",
        "jsonb_typeof(framework_payload) = 'object'",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_capabilities_framework_payload_object"),
        "capabilities",
        type_="check",
    )
    op.drop_column("capabilities", "framework_payload")
