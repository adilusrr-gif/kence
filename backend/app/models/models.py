from sqlalchemy import Column, String, Boolean, Text, DateTime, Integer, BigInteger, UniqueConstraint, JSON, ForeignKey, Index
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
    __tablename__ = "ai_prompts"

    prompt_type = Column(String(64), primary_key=True)
    content     = Column(Text, nullable=False)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


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
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    last_accessed    = Column(DateTime(timezone=True), nullable=True)


class GeneratedImage(Base):
    __tablename__ = "generated_images"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    org_id           = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    owner_username   = Column(String(64), ForeignKey("users.username"), nullable=False, index=True)
    session_id       = Column(String(64), nullable=True)
    prompt           = Column(Text, nullable=False)
    negative_prompt  = Column(Text, nullable=True)
    width            = Column(Integer, nullable=False)
    height           = Column(Integer, nullable=False)
    seed             = Column(BigInteger, nullable=True)
    model_name       = Column(String(128), nullable=False)
    model_version    = Column(String(64), nullable=False)
    file_path        = Column(String(512), nullable=False)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_generated_images_owner_created", "owner_username", "created_at"),
        Index("ix_generated_images_org_created", "org_id", "created_at"),
    )


class WorkspaceShare(Base):
    __tablename__ = "workspace_shares"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    session_id   = Column(String(64), ForeignKey("doc_sessions.session_id"), nullable=False, index=True)
    shared_by    = Column(String(64), ForeignKey("users.username"), nullable=False, index=True)
    shared_with  = Column(String(64), ForeignKey("users.username"), nullable=True, index=True)  # null = whole org
    org_id       = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
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
    session_id  = Column(String(64), ForeignKey("doc_sessions.session_id"), nullable=True)
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
    session_id   = Column(String(64), ForeignKey("doc_sessions.session_id"), nullable=False, index=True)
    status       = Column(String(32), nullable=False, default="pending")  # pending|running|done|failed
    entity_count = Column(Integer, nullable=True)
    rel_count    = Column(Integer, nullable=True)
    error        = Column(Text, nullable=True)
    started_at   = Column(DateTime(timezone=True), nullable=True)
    finished_at  = Column(DateTime(timezone=True), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


# ── E4: Autonomous AI Agents ───────────────────────────────────────────────────

class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    org_id      = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    username    = Column(String(64), ForeignKey("users.username"), nullable=False, index=True)
    task_type   = Column(String(64), nullable=False)
    status      = Column(String(32), nullable=False, default="queued")  # queued|running|done|failed|cancelled
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
