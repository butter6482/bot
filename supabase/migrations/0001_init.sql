-- Unfollow AI — initial schema. Safe to re-run (idempotent where possible).
-- Users live in Supabase Auth (auth.users); every table is scoped by user_id with RLS.

-- gen_random_uuid() is built into Postgres 13+, no extension needed.

-- ───────────────────────── imports & accounts ─────────────────────────
create table if not exists public.instagram_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  source_files text[] not null default '{}',
  followers_count integer not null check (followers_count >= 0),
  following_count integer not null check (following_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists instagram_imports_user_idx on public.instagram_imports (user_id, created_at desc);

-- One row per username per import. Doubles as follower/following snapshot:
-- is_follower = appears in followers file, is_following = appears in following file.
create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null references public.instagram_imports(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  is_follower boolean not null default false,
  is_following boolean not null default false,
  created_at timestamptz not null default now(),
  unique (import_id, username)
);
create index if not exists instagram_accounts_import_idx on public.instagram_accounts (import_id);
create index if not exists instagram_accounts_user_idx on public.instagram_accounts (user_id, username);

-- ───────────────────────── classification & protection ─────────────────────────
create table if not exists public.account_classifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  category text not null check (category in
    ('celebrity','public_figure','musician','athlete','artist','creator','brand','business','verified','personal','unknown')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source text not null check (source in ('ai','manual')),
  reason text,
  updated_at timestamptz not null default now(),
  primary key (user_id, username)
);

create table if not exists public.protected_accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  kind text not null check (kind in ('favorite','friend','protected')),
  created_at timestamptz not null default now(),
  primary key (user_id, username, kind)
);

create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  filters jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists saved_filters_user_idx on public.saved_filters (user_id);

-- ───────────────────────── review workflow ─────────────────────────
create table if not exists public.review_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid references public.instagram_imports(id) on delete set null,
  name text not null,
  command text,
  filters jsonb not null,
  total integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists review_batches_user_idx on public.review_batches (user_id, created_at desc);

create table if not exists public.review_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.review_batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  category text not null default 'unknown',
  reason text,
  position integer not null,
  status text not null default 'pending' check (status in ('pending','reviewed','keep','skipped')),
  updated_at timestamptz not null default now(),
  unique (batch_id, username)
);
create index if not exists review_items_batch_idx on public.review_items (batch_id, position);

-- ───────────────────────── AI usage log (no prompt contents stored) ─────────────────────────
create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('command','classify')),
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  latency_ms integer,
  status text not null check (status in ('ok','error','rate_limited')),
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_user_idx on public.ai_requests (user_id, created_at desc);

-- ───────────────────────── Row Level Security ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'instagram_imports','instagram_accounts','account_classifications','protected_accounts',
    'saved_filters','review_batches','review_items','ai_requests'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s_owner_select" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_owner_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_owner_update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_owner_delete" on public.%1$I', t);
    execute format('create policy "%1$s_owner_select" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_owner_insert" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_owner_update" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_owner_delete" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ai_requests is an audit log: users may read and insert, never edit or delete individual rows.
drop policy if exists "ai_requests_owner_update" on public.ai_requests;
drop policy if exists "ai_requests_owner_delete" on public.ai_requests;
