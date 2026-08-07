create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator noinherit login password 'x';
grant anon to authenticator; grant authenticated to authenticator; grant service_role to authenticator;
create role supabase_auth_admin superuser;
create role supabase_storage_admin superuser;
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
grant usage on schema public to anon, authenticated, service_role;
