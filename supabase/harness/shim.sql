-- Roles are CLUSTER-level, not database-level. The local harness drops and
-- recreated the whole cluster between runs, so bare `create role` worked; CI
-- runs `empty` and `upgrade` against ONE Postgres service container, so the
-- second invocation met roles the first had already made and the shim aborted
-- with `role "anon" already exists` — before a single migration ran.
--
-- That is why CI failed on a repository that passes locally: the harness encoded
-- an assumption about its environment that only one of the two environments met.
-- Guarded structurally rather than one `if not exists` per role. My first
-- attempt at this wrapped the four roles I could see in the opening block and
-- missed two more twelve lines further down, so CI failed again on
-- `supabase_auth_admin`. Fixing the instances I noticed, instead of the pattern,
-- is how a bug survives a fix — and it is the same shape as the guards in §9 of
-- the audit report, written the same afternoon.
--
-- This loop cannot miss one: a role added to the list below is created if
-- absent, and a role added ANY OTHER WAY still has to survive re-running, which
-- the comment above the list says out loud.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('anon',                   'nologin noinherit'),
      ('authenticated',          'nologin noinherit'),
      ('service_role',           'nologin noinherit bypassrls'),
      ('authenticator',          'noinherit login password ''x'''),
      ('supabase_auth_admin',    'superuser'),
      ('supabase_storage_admin', 'superuser')
    ) as t(name, opts)
  loop
    if not exists (select 1 from pg_roles where rolname = r.name) then
      execute format('create role %I %s', r.name, r.opts);
    end if;
  end loop;
end $$;

-- Idempotent: granting a role that is already granted is a no-op in Postgres.
grant anon to authenticator; grant authenticated to authenticator; grant service_role to authenticator;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm;
create extension if not exists citext;
-- some migrations may call gen_random_uuid()/crypt() unqualified
create extension if not exists pgcrypto;
create or replace function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
create or replace function auth.role() returns text language sql stable as $fn$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $fn$;
create or replace function auth.jwt() returns jsonb language sql stable as $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $fn$;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text, phone text, raw_user_meta_data jsonb, raw_app_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  encrypted_password text, email_confirmed_at timestamptz, last_sign_in_at timestamptz
);
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), metadata jsonb, path_tokens text[]
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $fn$ select string_to_array(name, '/') $fn$;
grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
grant all on all tables in schema storage to service_role;
-- pg_cron shim: capture scheduled jobs without the extension
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text, active boolean default true, nodename text default 'localhost', nodeport int default 5432, database text default 'postgres', username text default 'postgres');
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $fn$ insert into cron.job(jobname, schedule, command) values (job_name, schedule, command) returning jobid $fn$;
create or replace function cron.schedule(schedule text, command text) returns bigint language sql as $fn$ insert into cron.job(jobname, schedule, command) values (null, schedule, command) returning jobid $fn$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $fn$ delete from cron.job where jobname = job_name; select true $fn$;
create or replace function cron.unschedule(job_id bigint) returns boolean language sql as $fn$ delete from cron.job where jobid = job_id; select true $fn$;
-- Realtime: Supabase ships this publication by default; migrations alter it.
create publication supabase_realtime;
-- pg_net shim: capture outbound HTTP without the extension
create schema if not exists net;
create table if not exists net.http_request_queue (id bigserial primary key, method text, url text, headers jsonb, body jsonb, timeout_milliseconds int);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
  returns bigint language sql as $fn$ insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds) values ('POST', url, headers, body, timeout_milliseconds) returning id $fn$;
grant usage on schema net, cron to service_role;
-- Supabase platform bootstrap: the hosted project sets schema-wide default
-- privileges that no Klimr migration contains. Without these, replayed tables
-- carry only the grants the migrations issue, and the grant catalog diverges
-- from production for every table created after 0043. Fidelity, not policy.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
-- Parity with the hosted platform: Supabase's baseline grants EXECUTE on new
-- public functions to these roles via default privileges. Without this line the
-- harness modeled a stricter world than production — which produced a false
-- alarm (get_ranked_feed "denied") while hiding the true production ACL state.
-- 0239's event trigger then strips public/anon here exactly as it does hosted.
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
