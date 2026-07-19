"""add species genus column

Revision ID: a1b2c3d4e5f6
Revises: 76f50c9f9518
Create Date: 2026-07-17 18:56:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "76f50c9f9518"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("species", sa.Column("genus", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("species", "genus")
