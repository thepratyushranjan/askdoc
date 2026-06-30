"""add webhooks

Revision ID: 412b18991209
Revises: 33d7dcb2f7e4
Create Date: 2026-06-30 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '412b18991209'
down_revision = '33d7dcb2f7e4'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # create webhook event enum
    webhookevent = postgresql.ENUM('INGESTION_COMPLETED', 'INGESTION_FAILED', 'EXTRACTION_COMPLETED', 'AUDIT_COMPLETED', name='webhookevent')
    webhookevent.create(op.get_bind())

    # create webhooks table
    op.create_table('webhooks',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('url', sa.String(length=2048), nullable=False),
    sa.Column('event', postgresql.ENUM('INGESTION_COMPLETED', 'INGESTION_FAILED', 'EXTRACTION_COMPLETED', 'AUDIT_COMPLETED', name='webhookevent', create_type=False), nullable=False),
    sa.Column('secret', sa.String(length=255), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('webhooks')
    webhookevent = postgresql.ENUM('INGESTION_COMPLETED', 'INGESTION_FAILED', 'EXTRACTION_COMPLETED', 'AUDIT_COMPLETED', name='webhookevent')
    webhookevent.drop(op.get_bind())
