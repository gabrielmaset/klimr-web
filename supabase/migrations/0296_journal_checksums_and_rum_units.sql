-- 0296_journal_checksums_and_rum_units.sql — the ledger learns to prove itself;
-- the metrics learn their own units.
--
-- KFU-034. Journal rows 0262–0295 carried NULL checksums — the ledger recorded
-- WHAT ran but could not prove WHICH BYTES ran. Backfilled below from the repo
-- files (plain sha256 of each file as it exists in the delivered tree). Going
-- forward every journal_migration call carries a checksum, and because a file
-- cannot contain its own hash, the convention for 0296+ is CANONICAL-ZEROS:
-- the recorded value is sha256 of the file with its own checksum literal
-- replaced by 64 '0' characters. scripts/migration-checksum.mjs computes and
-- verifies it; the rule lives in .claude/rules/database-supabase.md.
--
-- KFU-024. perf_samples.value_ms stores MILLISECONDS for lcp/inp/ttfb and
-- MILLI-CLS for cls (the client sends CLS ×1000). That contract existed only
-- as a comment in one component — the column name said ms, the DB clamp was a
-- uniform 120000, and the first p75 query written against the raw column would
-- have compared milli-CLS to 0.1 and called the site perfect. Now: the clamp
-- is per-metric, the column says so, and rum_p75_daily is THE reader — it
-- converts cls back, so every future consumer inherits the correct units
-- instead of rediscovering the trap.

begin;

-- ── KFU-034: backfill the provable ledger ──────────────────────────────────
update public.migration_journal set checksum = '4478b302b30dafd1e9bb58cd91ade868b2e51974023aaf605da06e54001ee112'
 where id = '0262' and checksum is null;
update public.migration_journal set checksum = '1b0e020e50954c1ad35b31e90b35e0837ad7551b194dc36f8b4e98c13bd0501d'
 where id = '0263' and checksum is null;
update public.migration_journal set checksum = '4522d313c8346606b4bcfd3afa75bbdedf05a316cdbe9bb59e3907ab22f06535'
 where id = '0264' and checksum is null;
update public.migration_journal set checksum = '482bec7a7ec519e54c4146abc1665676c4af15023264145b1cbc966dda169dc4'
 where id = '0265' and checksum is null;
update public.migration_journal set checksum = '101a86cf903b1a17834d1a25d7222240fcb23b608b08ac9da4cfa4833ced8eb3'
 where id = '0266' and checksum is null;
update public.migration_journal set checksum = 'cb23e8dd012d998b37867e666ee5c9756d646fe6e077955919596c52c279d78f'
 where id = '0267' and checksum is null;
update public.migration_journal set checksum = 'a5fa0be123b9e91f50f3798745c37a6982e14e706a2d38fc6e290641aeab0555'
 where id = '0268' and checksum is null;
update public.migration_journal set checksum = '0f563fc5c16f5c7a52011e695f094d1277d4ffaa193da67214fb1570dad00281'
 where id = '0269' and checksum is null;
update public.migration_journal set checksum = '70874c8d2b1538e89b3574e450cbb4bd0fb80d4e218e23ec3d0b6b6cdd8aea42'
 where id = '0270' and checksum is null;
update public.migration_journal set checksum = 'd62bb9be0e98bf1fda6ba8bf25bd1908222b408f9b55d6192d6527b1734c7baa'
 where id = '0271' and checksum is null;
update public.migration_journal set checksum = '917bef79ff3e1ce3bea9d9ddb683db4c4059627e11d657fd5685fc190b636cac'
 where id = '0272' and checksum is null;
update public.migration_journal set checksum = 'efccca4f3ba172f93bf4e102cd7aa9e6abe56d3582d51607fbb158f6dad7bde9'
 where id = '0273' and checksum is null;
update public.migration_journal set checksum = '8fa14779b473229c450929e6fbe0d8cb4c47bb810fbae798da6fae4cc8cc2b05'
 where id = '0274' and checksum is null;
update public.migration_journal set checksum = '1b8f9c55914220eca11930177216628a28854dff2d805635940f70552c528d6a'
 where id = '0275' and checksum is null;
update public.migration_journal set checksum = 'fbf9e55e0fe8dfaa60729ab93c7911d20c4a9f4c59e34dbedb229efe66080697'
 where id = '0276' and checksum is null;
update public.migration_journal set checksum = '2ee892255d75597fa760b371c1d2057a798d2b27a3cc40b72d061873652e7f4e'
 where id = '0277' and checksum is null;
update public.migration_journal set checksum = '90930592429c7044bd075b3309a501f68ddc5c3e824a232b58237edb72c3bda1'
 where id = '0278' and checksum is null;
update public.migration_journal set checksum = '8aeb9cfb034bee66d5414579f55628c16153dce6f03afcbe6f348b318306a6f4'
 where id = '0279' and checksum is null;
update public.migration_journal set checksum = 'e3062f8408614633bfa35091fa69e3bf90317cb2978018832ff4360eda2fa558'
 where id = '0280' and checksum is null;
update public.migration_journal set checksum = '0f4c260a41caf7ac401643cc6d078d37d8c10dedc2646c60b0cfa20e5bfd879b'
 where id = '0281' and checksum is null;
update public.migration_journal set checksum = '394b77b87917f8f8f5243a127f72ba17f2a324b620246ccfe392bdb651df982c'
 where id = '0282' and checksum is null;
update public.migration_journal set checksum = '9859d926ae5cc27a798bfbb1fcf1b6b90980fcb90acf04c8861b3f63a56c7ae5'
 where id = '0283' and checksum is null;
update public.migration_journal set checksum = '1c29c7150dde1fe35f881ec21fc6f348a78a83c37950a3bafef18ddf0bdaf41a'
 where id = '0284' and checksum is null;
update public.migration_journal set checksum = 'f5375f18ba67e3d7622f4214478180c29db429619a3d6266ef8085064dcce2ea'
 where id = '0285' and checksum is null;
update public.migration_journal set checksum = 'c75826ba2bd0b72ceabc171d64b8e48096932d98357875730f8f31c5f7d1aef7'
 where id = '0286' and checksum is null;
update public.migration_journal set checksum = 'b9429a9ae9a02c8c51169c6979fbce6406bf01d429838e702af4531c60053713'
 where id = '0287' and checksum is null;
update public.migration_journal set checksum = '80a8a50dadb3bd87d62cd07d151338e9623c6738126298b50cc99ad92861558f'
 where id = '0288' and checksum is null;
update public.migration_journal set checksum = '2ea965e650ac47f359c5c7c28c5f8a1d9e5bb9fb41145ca1a35c07734af39f4c'
 where id = '0289' and checksum is null;
update public.migration_journal set checksum = 'a60eabd961ba1b3fea6031db82d1a4e237b6a5686772ab9ba7836e3fc7051645'
 where id = '0290' and checksum is null;
update public.migration_journal set checksum = '1c84796e2a981b0d0172361efb581d7e0460ba451eeb142a89b33e1d5fc62d85'
 where id = '0291' and checksum is null;
update public.migration_journal set checksum = '3ab4006023f16311974df347efb9839811f26afe21ad0eedb956c9d826b59e03'
 where id = '0292' and checksum is null;
update public.migration_journal set checksum = '0a1073a898bcffea94cf08bb06ce0529a1ff8f6856dd0462fceb0baeb5d04770'
 where id = '0293' and checksum is null;
update public.migration_journal set checksum = '308a59ee449bd679d0edf3d7a7d327585a45fe1fc1dabdad1c3db9053db9799d'
 where id = '0294' and checksum is null;
update public.migration_journal set checksum = '934a4385bf9bd27a3d0ba42bb89a304ca27ae85123c3b15cf9cf85de5d353137'
 where id = '0295' and checksum is null;

-- ── KFU-024: per-metric clamp inside the admission path ───────────────────
create or replace function public.rum_ingest(
  p_metric    text,
  p_value_ms  int,
  p_route     text,
  p_is_mobile boolean,
  p_daily_cap bigint default 200000
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_accepted bigint;
begin
  insert into public.rum_budget (day, accepted)
  values (current_date, 0)
  on conflict (day) do nothing;

  select accepted into v_accepted
    from public.rum_budget where day = current_date for update;

  if v_accepted >= p_daily_cap then
    update public.rum_budget set dropped = dropped + 1, updated_at = now()
     where day = current_date;
    return 'over_budget';
  end if;

  update public.rum_budget set accepted = accepted + 1, updated_at = now()
   where day = current_date;

  -- Per-metric ceilings in the STORED unit (KFU-024): ms for time metrics,
  -- milli-CLS for cls — 10000 milli-CLS = CLS 10, already catastrophic. The
  -- old uniform 120000 was meaningless for a unitless ratio.
  insert into public.perf_samples (metric, value_ms, route, is_mobile)
  values (p_metric,
          least(greatest(p_value_ms, 0),
                case p_metric when 'cls' then 10000 when 'inp' then 60000 else 120000 end),
          p_route, coalesce(p_is_mobile, false));

  return 'ok';
end $$;

revoke all on function public.rum_ingest(text, int, text, boolean, bigint) from public, anon, authenticated;
grant execute on function public.rum_ingest(text, int, text, boolean, bigint) to service_role;

comment on function public.rum_ingest is
  'KRA-031: the only admission path for anonymous RUM — daily budget enforced in the database, drops '
  'COUNTED. KFU-024: per-metric clamps in the stored unit; value_ms carries MILLI-CLS for cls.';

comment on column public.perf_samples.value_ms is
  'Milliseconds for lcp/inp/ttfb; MILLI-CLS for cls (client sends CLS x1000, so 100 = CLS 0.1). '
  'Read cls ONLY through rum_p75_daily, which converts back. (KFU-024)';

-- ── KFU-024: the one honest reader ─────────────────────────────────────────
create or replace view public.rum_p75_daily
with (security_invoker = false)
as
select created_at::date as day,
       metric,
       route,
       is_mobile,
       count(*) as samples,
       round(percentile_cont(0.75) within group (
         order by case when metric = 'cls' then value_ms / 1000.0 else value_ms::numeric end
       )::numeric, 3) as p75
  from public.perf_samples
 where metric in ('lcp', 'inp', 'cls', 'ttfb')
 group by 1, 2, 3, 4;

revoke all on public.rum_p75_daily from public, anon, authenticated;
grant select on public.rum_p75_daily to service_role;

comment on view public.rum_p75_daily is
  'KFU-024: p75 per day/metric/route/device in HONEST units — ms for time metrics, raw CLS for cls '
  '(the stored milli-CLS is divided back here). This is the intended reader; comparing raw value_ms '
  'to the CLS<=0.1 budget is the trap this view closes.';

select public.journal_migration('0296', '0296_journal_checksums_and_rum_units.sql',
  '59f541ae55fdb6cf90038869c7e627b04d5abd76dad955382f34a561a06f1b32',
  'KFU-034: backfills sha256 checksums for journal rows 0262-0295 from the delivered files; establishes the canonical-zeros self-checksum convention for 0296+ (scripts/migration-checksum.mjs). KFU-024: per-metric clamps inside rum_ingest (milli-CLS ceiling for cls), the unit contract written on perf_samples.value_ms, and rum_p75_daily as the honest reader converting cls back. Release-side manifest tooling (scripts/release-manifest.mjs) binds file digests to each artifact per the WP-R commitment.');

commit;
