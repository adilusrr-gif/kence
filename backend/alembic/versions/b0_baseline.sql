CREATE TABLE public.agent_tasks (
    id integer NOT NULL,
    org_id integer NOT NULL,
    username character varying(64) NOT NULL,
    task_type character varying(64) NOT NULL,
    status character varying(32) NOT NULL,
    session_id character varying(64),
    input_data json NOT NULL,
    output_data json,
    steps json NOT NULL,
    error text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.agent_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.agent_tasks_id_seq OWNED BY public.agent_tasks.id;

CREATE TABLE public.ai_prompts (
    prompt_type character varying(64) NOT NULL,
    content text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.api_keys (
    id integer NOT NULL,
    key_hash character varying(128) NOT NULL,
    key_prefix character varying(16) NOT NULL,
    org_id integer NOT NULL,
    created_by character varying(64) NOT NULL,
    name character varying(128),
    is_active boolean NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.api_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.api_keys_id_seq OWNED BY public.api_keys.id;

CREATE TABLE public.audit_events (
    id integer NOT NULL,
    action character varying(64) NOT NULL,
    result character varying(16) NOT NULL,
    username character varying(64),
    org_id integer,
    session_id character varying(64),
    document_name character varying(256),
    ip_address character varying(64),
    detail json,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.audit_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.audit_events_id_seq OWNED BY public.audit_events.id;

CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    session_id character varying(64) NOT NULL,
    org_id integer,
    role character varying(16) NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;

CREATE TABLE public.doc_sessions (
    session_id character varying(64) NOT NULL,
    document_name character varying(256),
    has_vector_store boolean NOT NULL,
    preview text,
    markdown_text text,
    html_text text,
    presentation_plan json,
    org_id integer,
    owner_username character varying(64),
    created_at timestamp with time zone DEFAULT now(),
    last_activity timestamp with time zone DEFAULT now()
);

CREATE TABLE public.document_contexts (
    id integer NOT NULL,
    username character varying(64) NOT NULL,
    document_name character varying(256) NOT NULL,
    context text NOT NULL,
    org_id integer,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.document_contexts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.document_contexts_id_seq OWNED BY public.document_contexts.id;

CREATE TABLE public.document_library (
    id integer NOT NULL,
    org_id integer NOT NULL,
    owner_username character varying(64) NOT NULL,
    name character varying(256) NOT NULL,
    description character varying(1024),
    file_path character varying(512) NOT NULL,
    file_size_bytes integer NOT NULL,
    mime_type character varying(128),
    is_shared boolean NOT NULL,
    tags json,
    doc_kind character varying(32) NOT NULL,
    direction character varying(128),
    issuer character varying(256),
    doc_number character varying(128),
    doc_date character varying(32),
    session_id character varying(64),
    created_at timestamp with time zone DEFAULT now(),
    last_accessed timestamp with time zone
);

CREATE SEQUENCE public.document_library_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.document_library_id_seq OWNED BY public.document_library.id;

CREATE TABLE public.graph_extraction_jobs (
    id integer NOT NULL,
    org_id integer NOT NULL,
    session_id character varying(64) NOT NULL,
    status character varying(32) NOT NULL,
    entity_count integer,
    rel_count integer,
    error text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.graph_extraction_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.graph_extraction_jobs_id_seq OWNED BY public.graph_extraction_jobs.id;

CREATE TABLE public.knowledge_graph_nodes (
    id integer NOT NULL,
    org_id integer NOT NULL,
    session_id character varying(64),
    neo4j_id character varying(128) NOT NULL,
    entity_type character varying(64) NOT NULL,
    label character varying(256) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.knowledge_graph_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.knowledge_graph_nodes_id_seq OWNED BY public.knowledge_graph_nodes.id;

CREATE TABLE public.kpi_snapshots (
    id integer NOT NULL,
    org_id integer NOT NULL,
    snapshot_at timestamp with time zone NOT NULL,
    period character varying(16) NOT NULL,
    metrics json NOT NULL
);

CREATE SEQUENCE public.kpi_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.kpi_snapshots_id_seq OWNED BY public.kpi_snapshots.id;

CREATE TABLE public.library_document_content (
    id integer NOT NULL,
    library_doc_id integer NOT NULL,
    markdown_text text,
    preview text,
    char_count integer NOT NULL,
    has_vector_store boolean NOT NULL,
    indexed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.library_document_content_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.library_document_content_id_seq OWNED BY public.library_document_content.id;

CREATE TABLE public.library_taxonomy (
    id integer NOT NULL,
    org_id integer NOT NULL,
    kind character varying(16) NOT NULL,
    value character varying(256) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.library_taxonomy_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.library_taxonomy_id_seq OWNED BY public.library_taxonomy.id;

CREATE TABLE public.org_branding (
    org_id integer NOT NULL,
    logo_url character varying(512),
    favicon_url character varying(512),
    accent_color character varying(16),
    app_name character varying(64),
    custom_css text,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.org_memberships (
    id integer NOT NULL,
    org_id integer NOT NULL,
    username character varying(64) NOT NULL,
    org_role character varying(32) NOT NULL,
    joined_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.org_memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.org_memberships_id_seq OWNED BY public.org_memberships.id;

CREATE TABLE public.org_quotas (
    id integer NOT NULL,
    org_id integer NOT NULL,
    max_storage_mb integer NOT NULL,
    max_sessions integer NOT NULL,
    max_api_calls_per_day integer NOT NULL
);

CREATE SEQUENCE public.org_quotas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.org_quotas_id_seq OWNED BY public.org_quotas.id;

CREATE TABLE public.organizations (
    id integer NOT NULL,
    slug character varying(64) NOT NULL,
    display_name character varying(128) NOT NULL,
    plan character varying(32) NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.organizations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.organizations_id_seq OWNED BY public.organizations.id;

CREATE TABLE public.translation_jobs (
    id integer NOT NULL,
    org_id integer,
    username character varying(64),
    session_id character varying(64),
    document_name character varying(256),
    source_language character varying(8),
    target_language character varying(8) NOT NULL,
    status character varying(16) NOT NULL,
    progress integer NOT NULL,
    total_chunks integer NOT NULL,
    done_chunks integer NOT NULL,
    source_chars integer NOT NULL,
    source_text text,
    translated_text text,
    error text,
    retry_count integer NOT NULL,
    max_retries integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.translation_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.translation_jobs_id_seq OWNED BY public.translation_jobs.id;

CREATE TABLE public.usage_logs (
    id integer NOT NULL,
    event_type character varying(64) NOT NULL,
    username character varying(64),
    session_id character varying(64),
    file_format character varying(32),
    org_id integer,
    extra json,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.usage_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.usage_logs_id_seq OWNED BY public.usage_logs.id;

CREATE TABLE public.user_prompts (
    id integer NOT NULL,
    username character varying(64) NOT NULL,
    prompt_type character varying(64) NOT NULL,
    content text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.user_prompts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.user_prompts_id_seq OWNED BY public.user_prompts.id;

CREATE TABLE public.user_quotas (
    id integer NOT NULL,
    username character varying(64) NOT NULL,
    org_id integer NOT NULL,
    max_sessions integer,
    max_api_calls_per_day integer
);

CREATE SEQUENCE public.user_quotas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.user_quotas_id_seq OWNED BY public.user_quotas.id;

CREATE TABLE public.users (
    username character varying(64) NOT NULL,
    hashed_password character varying(256) NOT NULL,
    role character varying(32) NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    default_org_id integer
);

CREATE TABLE public.workspace_shares (
    id integer NOT NULL,
    session_id character varying(64) NOT NULL,
    shared_by character varying(64) NOT NULL,
    shared_with character varying(64),
    org_id integer NOT NULL,
    permission character varying(16) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);

CREATE SEQUENCE public.workspace_shares_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.workspace_shares_id_seq OWNED BY public.workspace_shares.id;

ALTER TABLE ONLY public.agent_tasks ALTER COLUMN id SET DEFAULT nextval('public.agent_tasks_id_seq'::regclass);

ALTER TABLE ONLY public.api_keys ALTER COLUMN id SET DEFAULT nextval('public.api_keys_id_seq'::regclass);

ALTER TABLE ONLY public.audit_events ALTER COLUMN id SET DEFAULT nextval('public.audit_events_id_seq'::regclass);

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);

ALTER TABLE ONLY public.document_contexts ALTER COLUMN id SET DEFAULT nextval('public.document_contexts_id_seq'::regclass);

ALTER TABLE ONLY public.document_library ALTER COLUMN id SET DEFAULT nextval('public.document_library_id_seq'::regclass);

ALTER TABLE ONLY public.graph_extraction_jobs ALTER COLUMN id SET DEFAULT nextval('public.graph_extraction_jobs_id_seq'::regclass);

ALTER TABLE ONLY public.knowledge_graph_nodes ALTER COLUMN id SET DEFAULT nextval('public.knowledge_graph_nodes_id_seq'::regclass);

ALTER TABLE ONLY public.kpi_snapshots ALTER COLUMN id SET DEFAULT nextval('public.kpi_snapshots_id_seq'::regclass);

ALTER TABLE ONLY public.library_document_content ALTER COLUMN id SET DEFAULT nextval('public.library_document_content_id_seq'::regclass);

ALTER TABLE ONLY public.library_taxonomy ALTER COLUMN id SET DEFAULT nextval('public.library_taxonomy_id_seq'::regclass);

ALTER TABLE ONLY public.org_memberships ALTER COLUMN id SET DEFAULT nextval('public.org_memberships_id_seq'::regclass);

ALTER TABLE ONLY public.org_quotas ALTER COLUMN id SET DEFAULT nextval('public.org_quotas_id_seq'::regclass);

ALTER TABLE ONLY public.organizations ALTER COLUMN id SET DEFAULT nextval('public.organizations_id_seq'::regclass);

ALTER TABLE ONLY public.translation_jobs ALTER COLUMN id SET DEFAULT nextval('public.translation_jobs_id_seq'::regclass);

ALTER TABLE ONLY public.usage_logs ALTER COLUMN id SET DEFAULT nextval('public.usage_logs_id_seq'::regclass);

ALTER TABLE ONLY public.user_prompts ALTER COLUMN id SET DEFAULT nextval('public.user_prompts_id_seq'::regclass);

ALTER TABLE ONLY public.user_quotas ALTER COLUMN id SET DEFAULT nextval('public.user_quotas_id_seq'::regclass);

ALTER TABLE ONLY public.workspace_shares ALTER COLUMN id SET DEFAULT nextval('public.workspace_shares_id_seq'::regclass);

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_prompts
    ADD CONSTRAINT ai_prompts_pkey PRIMARY KEY (prompt_type);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.doc_sessions
    ADD CONSTRAINT doc_sessions_pkey PRIMARY KEY (session_id);

ALTER TABLE ONLY public.document_contexts
    ADD CONSTRAINT document_contexts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_library
    ADD CONSTRAINT document_library_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.graph_extraction_jobs
    ADD CONSTRAINT graph_extraction_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.knowledge_graph_nodes
    ADD CONSTRAINT knowledge_graph_nodes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.library_document_content
    ADD CONSTRAINT library_document_content_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.library_taxonomy
    ADD CONSTRAINT library_taxonomy_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.org_branding
    ADD CONSTRAINT org_branding_pkey PRIMARY KEY (org_id);

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.org_quotas
    ADD CONSTRAINT org_quotas_org_id_key UNIQUE (org_id);

ALTER TABLE ONLY public.org_quotas
    ADD CONSTRAINT org_quotas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.translation_jobs
    ADD CONSTRAINT translation_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.library_taxonomy
    ADD CONSTRAINT uq_library_taxonomy_org_kind_value UNIQUE (org_id, kind, value);

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT uq_org_member UNIQUE (org_id, username);

ALTER TABLE ONLY public.document_contexts
    ADD CONSTRAINT uq_user_doc_context UNIQUE (username, document_name);

ALTER TABLE ONLY public.user_prompts
    ADD CONSTRAINT uq_user_prompt UNIQUE (username, prompt_type);

ALTER TABLE ONLY public.usage_logs
    ADD CONSTRAINT usage_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_prompts
    ADD CONSTRAINT user_prompts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_quotas
    ADD CONSTRAINT user_quotas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_quotas
    ADD CONSTRAINT user_quotas_username_key UNIQUE (username);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (username);

ALTER TABLE ONLY public.workspace_shares
    ADD CONSTRAINT workspace_shares_pkey PRIMARY KEY (id);

CREATE INDEX ix_agent_tasks_org_id ON public.agent_tasks USING btree (org_id);

CREATE INDEX ix_agent_tasks_org_status ON public.agent_tasks USING btree (org_id, status);

CREATE INDEX ix_agent_tasks_session_id ON public.agent_tasks USING btree (session_id);

CREATE INDEX ix_agent_tasks_username ON public.agent_tasks USING btree (username);

CREATE INDEX ix_agent_tasks_username_status ON public.agent_tasks USING btree (username, status);

CREATE INDEX ix_api_keys_org_id ON public.api_keys USING btree (org_id);

CREATE INDEX ix_audit_events_action ON public.audit_events USING btree (action);

CREATE INDEX ix_audit_events_created_at ON public.audit_events USING btree (created_at);

CREATE INDEX ix_audit_events_org_action ON public.audit_events USING btree (org_id, action);

CREATE INDEX ix_audit_events_org_created ON public.audit_events USING btree (org_id, created_at);

CREATE INDEX ix_audit_events_org_id ON public.audit_events USING btree (org_id);

CREATE INDEX ix_audit_events_session_id ON public.audit_events USING btree (session_id);

CREATE INDEX ix_audit_events_username ON public.audit_events USING btree (username);

CREATE INDEX ix_chat_messages_org_id ON public.chat_messages USING btree (org_id);

CREATE INDEX ix_chat_messages_session_created ON public.chat_messages USING btree (session_id, created_at);

CREATE INDEX ix_chat_messages_session_id ON public.chat_messages USING btree (session_id);

CREATE INDEX ix_doc_sessions_org_activity ON public.doc_sessions USING btree (org_id, last_activity);

CREATE INDEX ix_doc_sessions_org_id ON public.doc_sessions USING btree (org_id);

CREATE INDEX ix_doc_sessions_owner_activity ON public.doc_sessions USING btree (owner_username, last_activity);

CREATE INDEX ix_doc_sessions_owner_username ON public.doc_sessions USING btree (owner_username);

CREATE INDEX ix_document_contexts_username ON public.document_contexts USING btree (username);

CREATE INDEX ix_document_library_direction ON public.document_library USING btree (direction);

CREATE INDEX ix_document_library_issuer ON public.document_library USING btree (issuer);

CREATE INDEX ix_document_library_org_id ON public.document_library USING btree (org_id);

CREATE INDEX ix_document_library_owner_username ON public.document_library USING btree (owner_username);

CREATE INDEX ix_document_library_session_id ON public.document_library USING btree (session_id);

CREATE INDEX ix_graph_extraction_jobs_org_id ON public.graph_extraction_jobs USING btree (org_id);

CREATE INDEX ix_graph_extraction_jobs_session_id ON public.graph_extraction_jobs USING btree (session_id);

CREATE INDEX ix_kg_nodes_session_id ON public.knowledge_graph_nodes USING btree (session_id);

CREATE INDEX ix_kg_org_label ON public.knowledge_graph_nodes USING btree (org_id, label);

CREATE INDEX ix_knowledge_graph_nodes_org_id ON public.knowledge_graph_nodes USING btree (org_id);

CREATE INDEX ix_kpi_snapshots_org_id ON public.kpi_snapshots USING btree (org_id);

CREATE INDEX ix_kpi_snapshots_snapshot_at ON public.kpi_snapshots USING btree (snapshot_at);

CREATE UNIQUE INDEX ix_library_document_content_library_doc_id ON public.library_document_content USING btree (library_doc_id);

CREATE INDEX ix_library_taxonomy_org_id ON public.library_taxonomy USING btree (org_id);

CREATE INDEX ix_library_taxonomy_org_kind ON public.library_taxonomy USING btree (org_id, kind);

CREATE INDEX ix_org_memberships_org_id ON public.org_memberships USING btree (org_id);

CREATE INDEX ix_org_memberships_username ON public.org_memberships USING btree (username);

CREATE UNIQUE INDEX ix_organizations_slug ON public.organizations USING btree (slug);

CREATE INDEX ix_translation_jobs_created_at ON public.translation_jobs USING btree (created_at);

CREATE INDEX ix_translation_jobs_org_id ON public.translation_jobs USING btree (org_id);

CREATE INDEX ix_translation_jobs_session_id ON public.translation_jobs USING btree (session_id);

CREATE INDEX ix_translation_jobs_status ON public.translation_jobs USING btree (status);

CREATE INDEX ix_translation_jobs_status_created ON public.translation_jobs USING btree (status, created_at);

CREATE INDEX ix_translation_jobs_user_created ON public.translation_jobs USING btree (username, created_at);

CREATE INDEX ix_translation_jobs_username ON public.translation_jobs USING btree (username);

CREATE INDEX ix_usage_logs_created_at ON public.usage_logs USING btree (created_at);

CREATE INDEX ix_usage_logs_event_type ON public.usage_logs USING btree (event_type);

CREATE INDEX ix_usage_logs_org_created ON public.usage_logs USING btree (org_id, created_at);

CREATE INDEX ix_usage_logs_org_event ON public.usage_logs USING btree (org_id, event_type);

CREATE INDEX ix_usage_logs_org_id ON public.usage_logs USING btree (org_id);

CREATE INDEX ix_usage_logs_username ON public.usage_logs USING btree (username);

CREATE INDEX ix_user_prompts_username ON public.user_prompts USING btree (username);

CREATE INDEX ix_users_default_org_id ON public.users USING btree (default_org_id);

CREATE INDEX ix_workspace_shares_org_id ON public.workspace_shares USING btree (org_id);

CREATE INDEX ix_workspace_shares_session_id ON public.workspace_shares USING btree (session_id);

CREATE INDEX ix_workspace_shares_shared_by ON public.workspace_shares USING btree (shared_by);

CREATE INDEX ix_workspace_shares_shared_with ON public.workspace_shares USING btree (shared_with);

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_username_fkey FOREIGN KEY (username) REFERENCES public.users(username) ON DELETE SET NULL;

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.doc_sessions(session_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.doc_sessions
    ADD CONSTRAINT doc_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.doc_sessions
    ADD CONSTRAINT doc_sessions_owner_username_fkey FOREIGN KEY (owner_username) REFERENCES public.users(username);

ALTER TABLE ONLY public.document_contexts
    ADD CONSTRAINT document_contexts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.document_library
    ADD CONSTRAINT document_library_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.document_library
    ADD CONSTRAINT document_library_owner_username_fkey FOREIGN KEY (owner_username) REFERENCES public.users(username);

ALTER TABLE ONLY public.graph_extraction_jobs
    ADD CONSTRAINT graph_extraction_jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.graph_extraction_jobs
    ADD CONSTRAINT graph_extraction_jobs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.doc_sessions(session_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.knowledge_graph_nodes
    ADD CONSTRAINT knowledge_graph_nodes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.knowledge_graph_nodes
    ADD CONSTRAINT knowledge_graph_nodes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.doc_sessions(session_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.library_document_content
    ADD CONSTRAINT library_document_content_library_doc_id_fkey FOREIGN KEY (library_doc_id) REFERENCES public.document_library(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.library_taxonomy
    ADD CONSTRAINT library_taxonomy_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.org_branding
    ADD CONSTRAINT org_branding_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_memberships_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_memberships_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);

ALTER TABLE ONLY public.org_quotas
    ADD CONSTRAINT org_quotas_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.translation_jobs
    ADD CONSTRAINT translation_jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.translation_jobs
    ADD CONSTRAINT translation_jobs_username_fkey FOREIGN KEY (username) REFERENCES public.users(username) ON DELETE SET NULL;

ALTER TABLE ONLY public.usage_logs
    ADD CONSTRAINT usage_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.user_prompts
    ADD CONSTRAINT user_prompts_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);

ALTER TABLE ONLY public.user_quotas
    ADD CONSTRAINT user_quotas_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.user_quotas
    ADD CONSTRAINT user_quotas_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_default_org_id_fkey FOREIGN KEY (default_org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.workspace_shares
    ADD CONSTRAINT workspace_shares_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);

ALTER TABLE ONLY public.workspace_shares
    ADD CONSTRAINT workspace_shares_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.doc_sessions(session_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_shares
    ADD CONSTRAINT workspace_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.users(username);

ALTER TABLE ONLY public.workspace_shares
    ADD CONSTRAINT workspace_shares_shared_with_fkey FOREIGN KEY (shared_with) REFERENCES public.users(username);
