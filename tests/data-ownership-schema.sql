CREATE TABLE public.lessons (
    id text NOT NULL,
    user_id text,
    user_email text,
    kind text DEFAULT 'learning-artifact'::text,
    title text,
    prompt text,
    cards jsonb DEFAULT '{}'::jsonb,
    profile jsonb,
    blueprint jsonb,
    html text,
    upload_ids jsonb DEFAULT '[]'::jsonb,
    refer_only boolean DEFAULT false,
    rating integer,
    rating_comment text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '365 days'::interval),
    course_id text,
    course_index integer,
    course_total integer,
    course_title text
);
CREATE TABLE public.lesson_progress (
    lesson_id text NOT NULL,
    user_id text NOT NULL,
    user_email text,
    percent integer DEFAULT 0,
    visited integer DEFAULT 0,
    total integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.user_preferences (
    user_id text NOT NULL,
    user_email text,
    prefs jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.upload_docs (
    id text NOT NULL,
    title text,
    source_type text,
    chunks jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.generated_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text,
    user_email text,
    slug text,
    name text NOT NULL,
    task text,
    llm_interface text,
    grounded boolean DEFAULT false NOT NULL,
    skill jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.gen_jobs (
    id text NOT NULL,
    user_id text,
    status text,
    stage text,
    error text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.hands_on_notebooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id text,
    module_id text,
    cache_key text NOT NULL,
    notebook jsonb NOT NULL,
    source text NOT NULL,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    embed_text text,
    embedding text
);
CREATE TABLE public.credit_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    lessons_remaining numeric(10,2) NOT NULL,
    lessons_total numeric(10,2) NOT NULL,
    reason text NOT NULL,
    plan_id text,
    amount_usd numeric,
    code text,
    ls_order_id text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT credit_lots_lessons_remaining_check CHECK ((lessons_remaining >= (0)::numeric))
);
CREATE TABLE public.credit_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    delta numeric(10,2) NOT NULL,
    reason text NOT NULL,
    plan_id text,
    amount_usd numeric,
    ls_order_id text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.contributors (
    user_id text NOT NULL,
    user_email text,
    full_name text NOT NULL,
    bio text,
    expertise text,
    motivation text,
    motivation_other text,
    link text,
    agreed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.community_lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    source_lesson_id text,
    title text NOT NULL,
    description text,
    category text,
    level text,
    est_minutes integer,
    blueprint jsonb,
    html text NOT NULL,
    submitter_name text,
    submitter_user_id text,
    submitter_email text,
    likes integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    hidden boolean DEFAULT false,
    reports integer DEFAULT 0
);
ALTER TABLE public.lessons ADD PRIMARY KEY (id);
ALTER TABLE public.lesson_progress ADD PRIMARY KEY (lesson_id,user_id);
ALTER TABLE public.user_preferences ADD PRIMARY KEY (user_id);
ALTER TABLE public.upload_docs ADD PRIMARY KEY (id);
ALTER TABLE public.generated_skills ADD PRIMARY KEY (id);
ALTER TABLE public.gen_jobs ADD PRIMARY KEY (id);
ALTER TABLE public.hands_on_notebooks ADD PRIMARY KEY (cache_key);
ALTER TABLE public.credit_lots ADD PRIMARY KEY (id);
ALTER TABLE public.credit_ledger ADD PRIMARY KEY (id);
ALTER TABLE public.contributors ADD PRIMARY KEY (user_id);
ALTER TABLE public.community_lessons ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX generated_skills_owner_slug ON generated_skills(user_id,slug);
ALTER TABLE upload_docs ADD COLUMN user_id text, ADD COLUMN storage_key text;
ALTER TABLE hands_on_notebooks ADD COLUMN user_id text;
CREATE UNIQUE INDEX credit_lots_order_key ON credit_lots(ls_order_id);
CREATE UNIQUE INDEX credit_ledger_order_key ON credit_ledger(ls_order_id);
