from sqlalchemy import Column, String, Boolean, Text, DateTime, Integer, UniqueConstraint, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    username        = Column(String(64), primary_key=True, index=True)
    hashed_password = Column(String(256), nullable=False)
    role            = Column(String(32), nullable=False, default="user")
    is_active       = Column(Boolean, nullable=False, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


class DocSession(Base):
    __tablename__ = "doc_sessions"

    session_id        = Column(String(64), primary_key=True, index=True)
    document_name     = Column(String(256), nullable=True)
    has_vector_store  = Column(Boolean, nullable=False, default=False)
    preview           = Column(Text, nullable=True)
    markdown_text     = Column(Text, nullable=True)
    presentation_plan = Column(JSON, nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    last_activity     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AIPrompt(Base):
    __tablename__ = "ai_prompts"

    prompt_type = Column(String(64), primary_key=True)
    content     = Column(Text, nullable=False)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DocumentContext(Base):
    __tablename__ = "document_contexts"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    username      = Column(String(64), nullable=False, index=True)
    document_name = Column(String(256), nullable=False)
    context       = Column(Text, nullable=False)
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("username", "document_name", name="uq_user_doc_context"),
    )
