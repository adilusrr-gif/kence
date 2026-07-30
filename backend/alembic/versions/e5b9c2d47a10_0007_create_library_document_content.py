"""0007_create_library_document_content

Give library documents a home for their extracted text that is independent of
sessions. Until now the text lived in doc_sessions.markdown_text, reachable only
through the nullable document_library.session_id link, and the vector index in
chroma_db/{session_id}. session_manager.cleanup_expired drops stale doc_sessions
rows together with their chroma dir, so after SESSION_TIMEOUT a library НПА lost
both its text and its RAG index and the compliance agent could no longer read it.

The model lives in app/models/models.py:LibraryDocumentContent and is also
created at startup by Base.metadata.create_all(), so table creation here is
idempotent (same pattern as 0006).

The backfill runs unconditionally — an environment where create_all already made
the table still needs its existing rows populated. It copies markdown_text from
whichever doc_sessions rows are still alive and skips docs that already have
content, so re-running is safe. has_vector_store stays false: the old indexes sit
under chroma_db/{session_id} and are collected with the session. Those docs are
repaired by library_service.reindex_library_doc, which the compliance agent also
falls back to lazily via the stored markdown_text.

Revision ID: e5b9c2d47a10
Revises: d4f7a1b2c3e6
Create Date: 2026-07-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5b9c2d47a10'
down_revision: Union[str, Sequence[str], None] = 'd4f7a1b2c3e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "library_document_content" not in inspector.get_table_names():
        op.create_table(
            "library_document_content",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "library_doc_id", sa.Integer(),
                sa.ForeignKey("document_library.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("markdown_text", sa.Text(), nullable=True),
            sa.Column("preview", sa.Text(), nullable=True),
            sa.Column("char_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "has_vector_store", sa.Boolean(), nullable=False,
                server_default=sa.false(),
            ),
            sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(timezone=True),
                server_default=sa.func.now(), nullable=True,
            ),
            sa.Column(
                "updated_at", sa.DateTime(timezone=True),
                server_default=sa.func.now(), nullable=True,
            ),
        )
        # Name mirrors SQLAlchemy's default for index=True + unique=True so a
        # create_all-made table and a migration-made one stay equivalent.
        op.create_index(
            "ix_library_document_content_library_doc_id",
            "library_document_content", ["library_doc_id"], unique=True,
        )

    # The 0001 baseline is a no-op (schema really comes from create_all), so on a
    # database driven by alembic alone the source tables may not exist yet. Only
    # backfill when there is something to backfill from.
    tables = set(sa.inspect(bind).get_table_names())
    if not {"document_library", "doc_sessions"} <= tables:
        return

    # Backfill from still-live sessions. LEFT JOIN guard makes it re-runnable.
    op.execute(
        sa.text("""
            INSERT INTO library_document_content
                (library_doc_id, markdown_text, preview, char_count, has_vector_store)
            SELECT dl.id,
                   ds.markdown_text,
                   SUBSTR(ds.markdown_text, 1, 800),
                   LENGTH(ds.markdown_text),
                   FALSE
            FROM document_library dl
            JOIN doc_sessions ds ON ds.session_id = dl.session_id
            LEFT JOIN library_document_content c ON c.library_doc_id = dl.id
            WHERE dl.session_id IS NOT NULL
              AND ds.markdown_text IS NOT NULL
              AND ds.markdown_text <> ''
              AND c.id IS NULL
        """)
    )


def downgrade() -> None:
    op.drop_index(
        "ix_library_document_content_library_doc_id",
        table_name="library_document_content",
    )
    op.drop_table("library_document_content")
