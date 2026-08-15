#!/usr/bin/env bash
# Configuration capture (KCDX-053).
#
# A database restore plus every storage object still does not bring Klimr back.
# Neither of those contains:
#
#   · Vercel environment variables          · Supabase auth settings
#   · storage bucket policies and limits     · redirect URLs and email templates
#   · DNS records                            · the secrets themselves
#   · which pg_cron jobs exist               · RLS policies as deployed
#
# Some of that is reconstructible from the repo — RLS and cron come from
# migrations, which is why they are in git. The rest lives only in two dashboards,
# and "restore into a fresh project" means somebody rebuilding it from memory at
# the worst possible moment.
#
# This writes down what exists. It deliberately does NOT write down secret
# VALUES: a backup that contains every credential is a single file that
# compromises everything, and it will end up in more places than the secrets
# themselves ever were. It records secret NAMES, so a restorer knows exactly what
# must be set and can tell when one is missing — which is the actual failure mode.
# The values come from the password manager.
#
# Usage: PGURI=... bash supabase/harness/config-capture.sh > config-YYYY-MM-DD.json
set -uo pipefail
: "${PGURI:?set PGURI}"

q() { psql "$PGURI" -tAc "$1" 2>/dev/null; }

cat <<JSON
{
  "captured_at": "$(date -u +%FT%TZ)",
  "note": "Inventory for disaster recovery. Contains no secret values — only names. See RESILIENCE.md.",

  "schema": {
    "migrations_applied": $(q "select count(*) from supabase_migrations.schema_migrations" || echo 0),
    "latest_migration": "$(q "select max(version) from supabase_migrations.schema_migrations")",
    "boundary_checks_passing": $(q "select count(*) from public.klimr_readiness() where passed" || echo 0),
    "boundary_checks_total": $(q "select count(*) from public.klimr_readiness()" || echo 0)
  },

  "cron_jobs": $(q "select coalesce(jsonb_pretty(jsonb_agg(jsonb_build_object(
      'name', jobname, 'schedule', schedule, 'active', active,
      'calls_http', command like '%net.http_post%'))), '[]') from cron.job" || echo '[]'),

  "storage_buckets": $(q "select coalesce(jsonb_pretty(jsonb_agg(jsonb_build_object(
      'id', id, 'public', public, 'file_size_limit', file_size_limit,
      'allowed_mime_types', allowed_mime_types,
      'objects', (select count(*) from storage.objects o where o.bucket_id = b.id),
      'bytes', (select coalesce(sum((o.metadata->>'size')::bigint),0) from storage.objects o where o.bucket_id = b.id)
    ))), '[]') from storage.buckets b" || echo '[]'),

  "rls": {
    "tables_with_rls": $(q "select count(*) from pg_tables t join pg_class c on c.relname=t.tablename where t.schemaname='public' and c.relrowsecurity" || echo 0),
    "policies": $(q "select count(*) from pg_policies where schemaname='public'" || echo 0)
  },

  "auth": {
    "users": $(q "select count(*) from auth.users" || echo 0),
    "identities_by_provider": $(q "select coalesce(jsonb_object_agg(provider, n), '{}') from (select provider, count(*) n from auth.identities group by provider) t" || echo '{}'),
    "note": "Auth CONFIG (providers, redirect URLs, email templates, MFA settings) lives only in the Supabase dashboard. Screenshot Authentication > Providers, URL Configuration, and Email Templates alongside this file."
  },

  "secret_names_required": [
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET", "WAITLIST_CRON_SECRET",
    "SUPPORT_WEBHOOK_URL", "SUPPORT_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY", "RESEND_API_KEY",
    "RCLONE_CONF", "SUPABASE_DB_URI"
  ],
  "secret_values_note": "Names only, deliberately. Values live in the password manager; a backup containing them would be one file that compromises everything.",

  "manual_steps_a_restore_needs": [
    "Create the new Supabase project and note its URL and keys",
    "Apply every migration from the repo, in order",
    "Restore storage objects from the backup (see storage-backup.sh) and verify with storage_manifest_verify()",
    "Recreate auth providers, redirect URLs and email templates from the dashboard screenshots",
    "Set every secret above in Vercel from the password manager, then redeploy",
    "Re-point DNS at the new deployment",
    "Confirm: select * from public.klimr_readiness();  and  select * from public.klimr_health();"
  ]
}
JSON
