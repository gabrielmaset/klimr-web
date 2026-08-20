-- 0114_provider_review_console.sql — provider application review console:
-- (1) decision attribution (reviewed_by) so every admin sees who approved or
--     rejected what; (2) applicant credential documents — a PRIVATE bucket
--     (owner-scoped policies; admins read via service-role signed URLs) and
--     document_path on the application.

alter table public.provider_applications
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists document_path text;

insert into storage.buckets (id, name, public)
values ('credential-docs', 'credential-docs', false)
on conflict (id) do update set public = false;

drop policy if exists "credential docs insert own" on storage.objects;
create policy "credential docs insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'credential-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "credential docs read own" on storage.objects;
create policy "credential docs read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'credential-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "credential docs delete own" on storage.objects;
create policy "credential docs delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'credential-docs' and (storage.foldername(name))[1] = auth.uid()::text);
