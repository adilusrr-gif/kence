from sqlalchemy import Column, String, Boolean, Text, DateTime, Integer, UniqueConstraint, JSON, ForeignKey, Index, text
from sqlalchemy.sql import func
from app.core.database import Base


class AuditEvent(Base):
    """Immutable audit log — one row per significant user action.
    Append-only: never update or delete rows after insert."""
    __tablename__ = "audit_events"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    action        = Column(String(64), nullable=False, index=True)   # upload|view|briefing_view|export|delete
    result        = Column(String(16), nullable=False, default="success")  # success|failure
    username      = Column(String(64), ForeignKey("users.username", ondelete="SET NULL"), nullable=True, index=True)
    org_id        = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id    = Column(String(64), nullable=True, index=True)
    document_name = Column(String(256), nullable=True)
    ip_address    = Column(String(64), nullable=True)
    detail        = Column(JSON, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        Index("ix_audit_events_org_action", "org_id", "action"),
        Index("ix_audit_events_org_created", "org_id", "created_at"),
    )


class Organization(Base):
    __tablename__ = "organizations"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    slug         = Column(String(64), unique=True, nullable=False, index=True)
    display_name = Column(String(128), nullable=False)
    plan         = Column(String(32), nullable=False, default="free")  # free|pro|enterprise
    is_active    = Column(Boolean, nullable=False, default=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


class OrgMembership(Base):
    __tablename__ = "org_memberships"

    id       = Column(Integer, primary_key=True, autoincrement=True)
    org_id   = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    username = Column(String(64), ForeignKey("users.username"), nullable=False, index=True)
    org_role = Column(String(32), nullable=False)  # owner|admin|member|viewer
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("org_id", "username", name="uq_org_member"),
    )


class OrgQuota(Base):
    __tablename__ = "org_quotas"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    org_id                = Column(Integer, ForeignKey("organizations.id"), unique=True, nullable=False)
    max_storage_mb        = Column(Integer, nullable=False, default=5120)
    max_sessions          = Column(Integer, nullable=False, default=100)
    max_api_calls_per_day = Column(Integer, nullable=False, default=1000)


class UserQuota(Base):
    __tablename__ = "user_quotas"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    username              = Column(String(64), ForeignKey("users.username"), unique=True, nullable=False)
    org_id                = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    max_sessions          = Column(Integer, nullable=True)
    max_api_calls_per_day = Column(Integer, nullable=True)


class APIKey(Base):
    __tablename__ = "api_keys"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    key_hash     = Column(String(128), unique=True, nullable=False)
    key_prefix   = Column(String(16), nullable=False)
    org_id       = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    created_by   = Column(String(64), ForeignKey("users.username"), nullable=False)
    name         = Column(String(128), nullable=True)
    is_active    = Column(Boolean, nullable=False, default=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at   = Column(DateTime(timezone=True), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    username        = Column(String(64), primary_key=True)  # PK already creates unique index
    hashed_password = Column(String(256), nullable=False)
    role            = Column(String(32), nullable=False, default="user")
    is_active       = Column(Boolean, nullable=False, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    default_org_id  = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)


class DocSession(Base):
    __tablename__ = "doc_sessions"

    session_id        = Column(String(64), primary_key=True)  # PK creates unique index
    document_name     = Column(String(256), nullable=True)
    has_vector_store  = Column(Boolean, nullable=False, default=False)
    preview           = Column(Text, nullable=True)
    markdown_text     = Column(Text, nullable=True)
    html_text         = Column(Text, nullable=True)
    presentation_plan = Column(JSON, nullable=True)
    org_id            = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    owner_username    = Column(String(64), ForeignKey("users.username"), nullable=True, index=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    last_activity     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        # Speeds up list_sessions() which filters by owner and sorts by recency
        Index("ix_doc_sessions_owner_activity", "owner_username", "last_activity"),
        # Speeds up org-scoped session lookups
        Index("ix_doc_sessions_org_activity", "org_id", "last_activity"),
    )


class AIPrompt(Base):
    """Global (org-wide) default for each prompt type. Admin-editable; used as
    the fallback when a user has no personal override in UserPrompt."""
    __tablename__ = "ai_prompts"

    prompt_type = Column(String(64), primary_key=True)
    content     = Column(Text, nullable=False)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserPrompt(Base):
    """Per-user override of a prompt. Resolution order is personal → global
    (AIPrompt) → hardcoded default (ai_settings_service.DEFAULT_PROMPTS)."""
    __tablename__ = "user_prompts"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    username    = Column(String(64), ForeignKey("users.username"), nullable=False, index=True)
    prompt_type = Column(String(64), nullable=False)
    content     = Column(Text, nullable=False)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("username", "prompt_type", name="uq_user_prompt"),
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("doc_sessions.session_id", ondelete="CASCADE"), nullable=False, index=True)
    org_id     = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    role       = Column(String(16), nullable=False)   # "user" | "assistant"
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # Speeds up paginated history queries ordered by time within a session
        Index("ix_chat_messages_session_created", "session_id", "created_at"),
    )


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    event_type  = Column(String(64), nullable=False, index=True)
    username    = Column(String(64), nullable=True, index=True)
    session_id  = Column(String(64), nullable=True)
    file_format = Column(String(32), nullable=True)
    org_id      = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    extra       = Column(JSON, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        # Speeds up analytics queries that filter by org and aggregate by event type
        Index("ix_usage_logs_org_event", "org_id", "event_type"),
        # Speeds up timeline queries that slice by org and time window
        Index("ix_usage_logs_org_created", "org_id", "created_at"),
    )


class DocumentContext(Base):
    __tablename__ = "document_contexts"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    username      = Column(String(64), nullable=False, index=True)
    document_name = Column(String(256), nullable=False)
    context       = Column(Text, nullable=False)
    org_id        = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("username", "document_name", name="uq_user_doc_context"),
    )


# ── E2: Enterprise UX Shell ────────────────────────────────────────────────────

class DocumentLibrary(Base):
    __tablename__ = "document_library"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    org_id           = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    owner_username   = Column(String(64), ForeignKey("users.username"), nullable=False, index=True)
    name             = Column(String(256), nullable=False)
    description      = Column(String(1024), nullable=True)
    file_path        = Column(String(512), nullable=False)
    file_size_bytes  = Column(Integer, nullable=False, default=0)
    mime_type        = Column(String(128), nullable=True)
    is_shared        = Column(Boolean, nullable=False, default=False)
    tags             = Column(JSON, nullable=True)
    # Library taxonomy: doc_kind distinguishes ordinary documents from regulatory acts (НПА).
    doc_kind         = Column(String(32), nullable=False, default="document", server_default=text("'document'"))  # document | npa
    direction        = Column(String(128), nullable=True, index=True)          # направление (managed dict)
    issuer           = Column(String(256), nullable=True, index=True)          # от кого идёт документ / орган
    doc_number       = Column(String(128), nullable=True)                       # номер НПА/документа
    doc_date         = Column(String(32), nullable=True)                        # дата НПА (ISO or free text)
    # session_id links a library doc to a processed workspace session so agents can RAG-retrieve it.
    session_id       = Column(String(64), nullable=True, index=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    last_accessed    = Column(DateTime(timezone=True), nullable=True)


class LibraryDocumentContent(Base):
    """Extracted text of a library document.

    Kept out of doc_sessions on purpose: session_manager.cleanup_expired drops
    stale doc_sessions rows together with their chroma_db/{session_id} dir, which
    used to take a library document's text and RAG index with it and leave the
    library row pointing at a dead session. Library content must outlive sessions.
    """
    __tablename__ = "library_document_content"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    library_doc_id   = Column(Integer, ForeignKey("document_library.id", ondelete="CASCADE"),
                              nullable=False, unique=True, index=True)
    markdown_text    = Column(Text, nullable=True)
    preview          = Column(Text, nullable=True)
    char_count       = Column(Integer, nullable=False, default=0)
    has_vector_store = Column(Boolean, nullable=False, default=False)
    indexed_at       = Column(DateTime(timezone=True), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LibraryTaxonomy(Base):
    """Admin-managed dictionaries for library metadata (directions, issuers)."""
    __tablename__ = "library_taxonomy"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    org_id     = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    kind       = Column(String(16), nullable=False)   # direction | issuer
    value      = Column(String(256), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("org_id", "kind", "value", name="uq_library_taxonomy_org_kind_value"),
        Index("ix_library_taxonomy_org_kind", "org_id", "kind"),
    )


class WorkspaceShare(Base):
    __tablename__ = "workspace_shares"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    session_id   = Column(String(64), ForeignKey("doc_sessions.session_id", ondelete="CASCADE"), nullable=False, index=True)
    shared_by    = Column(String(64), ForeignKey("users.username"), nullable=False)
    shared_with  = Column(String(64), ForeignKey("users.username"), nullable=True)  # null = whole org
    org_id       = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    permission   = Column(String(16), nullable=False, default="view")  # view|edit|comment
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    expires_at   = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # Two partial unique indexes (handled in DB migration):
        # uq_session_share_user: UNIQUE(session_id, shared_with) WHERE shared_with IS NOT NULL
        # uq_session_share_org:  UNIQUE(session_id, org_id)      WHERE shared_with IS NULL
        Index("ix_workspace_shares_shared_by", "shared_by"),
        Index("ix_workspace_shares_shared_with", "shared_with"),
        Index("ix_workspace_shares_org_id", "org_id"),
    )


class OrgBranding(Base):
    __tablename__ = "org_branding"

    org_id       = Column(Integer, ForeignKey("organizations.id"), primary_key=True)
    logo_url     = Column(String(512), nullable=True)
    favicon_url  = Column(String(512), nullable=True)
    accent_color = Column(String(16), nullable=True)
    app_name     = Column(String(64), nullable=True)
    custom_css   = Column(Text, nullable=True)
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class KPISnapshot(Base):
    __tablename__ = "kpi_snapshots"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    org_id      = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    snapshot_at = Column(DateTime(timezone=True), nullable=False, index=True)
    period      = Column(String(16), nullable=False)  # day|week|month
    metrics     = Column(JSON, nullable=False, default=dict)


# ── E3: Knowledge Graph ────────────────────────────────────────────────────────

class KnowledgeGraphNode(Base):
    __tablename__ = "knowledge_graph_nodes"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    org_id      = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    session_id  = Column(String(64), ForeignKey("doc_sessions.session_id", ondelete="SET NULL"), nullable=True)
    neo4j_id    = Column(String(128), nullable=False)
    entity_type = Column(String(64), nullable=False)
    label       = Column(String(256), nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_kg_org_label", "org_id", "label"),
    )


class GraphExtractionJob(Base):
    __tablename__ = "graph_extraction_jobs"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    org_id       = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    session_id   = Column(String(64), ForeignKey("doc_sessions.session_id", ondelete="CASCADE"), nullable=False, index=True)
    status       = Column(String(32), nullable=False, default="pending")  # pending|running|done|failed
    entity_count = Column(Integer, nullable=True)
    rel_count    = Column(Integer, nullable=True)
    error        = Column(Text, nullable=True)
    started_at   = Column(DateTime(timezone=True), nullable=True)
    finished_at  = Column(DateTime(timezone=True), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


# ── Background Document Translation ─────────────────────────────────────────────

class TranslationJob(Base):
    """An asynchronous document-translation job.

    Lives entirely in the DB so it survives browser refresh AND backend restart:
    the background worker (app/services/translation_worker.py) polls this table,
    and on startup any job left in 'processing' is re-queued (not failed) so it
    resumes. The source text is snapshotted into source_text at creation so the
    job is independent of the source session's lifecycle.
    """
    __tablename__ = "translation_jobs"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    org_id          = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    username        = Column(String(64), ForeignKey("users.username", ondelete="SET NULL"), nullable=True, index=True)
    session_id      = Column(String(64), nullable=True, index=True)
    document_name   = Column(String(256), nullable=True)
    source_language = Column(String(8), nullable=True)
    target_language = Column(String(8), nullable=False)
    # queued | processing | completed | failed
    status          = Column(String(16), nullable=False, default="queued", index=True)
    progress        = Column(Integer, nullable=False, default=0)   # 0–100
    total_chunks    = Column(Integer, nullable=False, default=0)
    done_chunks     = Column(Integer, nullable=False, default=0)
    source_chars    = Column(Integer, nullable=False, default=0)
    source_text     = Column(Text, nullable=True)                  # snapshot of input
    translated_text = Column(Text, nullable=True)                  # result (markdown)
    error           = Column(Text, nullable=True)
    retry_count     = Column(Integer, nullable=False, default=0)
    max_retries     = Column(Integer, nullable=False, default=2)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    started_at      = Column(DateTime(timezone=True), nullable=True)
    finished_at     = Column(DateTime(timezone=True), nullable=True)
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_translation_jobs_user_created", "username", "created_at"),
        Index("ix_translation_jobs_status_created", "status", "created_at"),
    )


# ── E4: Autonomous AI Agents ───────────────────────────────────────────────────

class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    org_id      = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    username    = Column(String(64), ForeignKey("users.username"), nullable=False, index=True)
    task_type   = Column(String(64), nullable=False)
    status      = Column(String(32), nullable=False, default="queued")  # queued|running|done|failed|cancelled
    # Denormalized from input_data so tasks_by_session can filter in SQL instead
    # of scanning JSON in Python. Nullable: rows created before this column exist
    # with NULL and are matched via the JSON fallback.
    session_id  = Column(String(64), nullable=True, index=True)
    input_data  = Column(JSON, nullable=False, default=dict)
    output_data = Column(JSON, nullable=True)
    steps       = Column(JSON, nullable=False, default=list)
    error       = Column(Text, nullable=True)
    started_at  = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # Speeds up list_tasks() which filters by username and optionally by status
        Index("ix_agent_tasks_username_status", "username", "status"),
        # Speeds up org-scoped task dashboards
        Index("ix_agent_tasks_org_status", "org_id", "status"),
    )
