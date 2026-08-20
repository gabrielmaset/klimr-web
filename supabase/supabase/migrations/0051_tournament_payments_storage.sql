-- 0051_tournament_payments_storage.sql — private storage for payment proofs.
--
-- Payment proofs (receipts / screenshots, image or PDF) are sensitive, so they
-- live in a PRIVATE bucket: no public URLs. Supabase Storage encrypts objects at
-- rest (AES-256) and serves them only over TLS; a private bucket means the bytes
-- are reachable solely through authenticated requests or short-lived signed URLs
-- minted server-side. Path convention: <registration_id>/<file>, so access is
-- authorized per registration.
--
-- Who may touch a proof: the registration's registrant (the captain / solo
-- entrant who uploaded it) and the tournament's staff — nobody else, not even
-- teammates. Enforced by can_access_payment_proof(), a SECURITY DEFINER helper
-- that maps a registration to its tournament without tripping RLS recursion.
-- Idempotent.

-- Private bucket: not public, 10 MB cap, images + PDF only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tournament-payments',
  'tournament-payments',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = excluded.allowed_mime_types;

-- Authorize access by the first path segment (the registration id). Text comes in
-- and is safe-cast inside, so a non-uuid path can never raise during policy eval.
create or replace function public.can_access_payment_proof(reg text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rid uuid;
begin
  begin
    rid := reg::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1
    from public.tournament_registrations r
    where r.id = rid
      and (r.registrant_id = auth.uid() or public.is_tournament_staff(r.tournament_id))
  );
end;
$$;

grant execute on function public.can_access_payment_proof(text) to authenticated;

-- Storage policies: registrant or staff only, scoped to the registration folder.
drop policy if exists "tpay read" on storage.objects;
create policy "tpay read" on storage.objects
  for select to authenticated
  using (bucket_id = 'tournament-payments' and public.can_access_payment_proof((storage.foldername(name))[1]));

drop policy if exists "tpay insert" on storage.objects;
create policy "tpay insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tournament-payments' and public.can_access_payment_proof((storage.foldername(name))[1]));

drop policy if exists "tpay update" on storage.objects;
create policy "tpay update" on storage.objects
  for update to authenticated
  using (bucket_id = 'tournament-payments' and public.can_access_payment_proof((storage.foldername(name))[1]))
  with check (bucket_id = 'tournament-payments' and public.can_access_payment_proof((storage.foldername(name))[1]));

drop policy if exists "tpay delete" on storage.objects;
create policy "tpay delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tournament-payments' and public.can_access_payment_proof((storage.foldername(name))[1]));
