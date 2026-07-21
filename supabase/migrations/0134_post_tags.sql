-- 0134_post_tags.sql — recap tag consent, resolved decision #4:
-- tags are PENDING UNTIL THE TAGGED PLAYER APPROVES. Only the post author may
-- tag, only the tagged player may respond, one response ever (pending →
-- approved|declined, enforced by trigger), blocked pairs cannot tag each other
-- (0099's is_blocked_pair), and public visibility requires BOTH the tag being
-- approved AND the post being visible. Retract: the author may delete a tag.

create table if not exists public.post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tagged_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (post_id, user_id)
);
create index if not exists post_tags_user_pending_idx
  on public.post_tags (user_id) where status = 'pending';
create index if not exists post_tags_post_approved_idx
  on public.post_tags (post_id) where status = 'approved';

-- self-tags are meaningless; blocked pairs may not tag each other
create or replace function public.enforce_tag_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id = new.tagged_by then
    raise exception 'self_tag' using errcode = '23514';
  end if;
  if public.is_blocked_pair(new.user_id, new.tagged_by) then
    raise exception 'blocked_pair' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists post_tags_rules on public.post_tags;
create trigger post_tags_rules before insert on public.post_tags
  for each row execute function public.enforce_tag_rules();

-- one response, ever: pending → approved|declined; nothing else may change
create or replace function public.enforce_tag_response()
returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' then
    raise exception 'already_responded' using errcode = '23514';
  end if;
  if new.status not in ('approved','declined') then
    raise exception 'bad_response' using errcode = '23514';
  end if;
  if new.post_id <> old.post_id or new.user_id <> old.user_id or new.tagged_by <> old.tagged_by then
    raise exception 'immutable_fields' using errcode = '23514';
  end if;
  new.responded_at := now();
  return new;
end; $$;
drop trigger if exists post_tags_response on public.post_tags;
create trigger post_tags_response before update on public.post_tags
  for each row execute function public.enforce_tag_response();

alter table public.post_tags enable row level security;

-- approved tags are public wherever the post is; participants always see their own
create policy "tags readable" on public.post_tags
  for select to authenticated using (
    (status = 'approved' and public.post_visible(post_id))
    or user_id = auth.uid()
    or tagged_by = auth.uid()
  );
-- only the post author tags, and must sign as themselves
create policy "author tags" on public.post_tags
  for insert to authenticated with check (
    tagged_by = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );
-- only the tagged player responds (trigger constrains the transition)
create policy "tagged responds" on public.post_tags
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- the author may retract a tag at any time
create policy "author retracts" on public.post_tags
  for delete to authenticated using (tagged_by = auth.uid());

grant select, insert, update, delete on public.post_tags to authenticated;
