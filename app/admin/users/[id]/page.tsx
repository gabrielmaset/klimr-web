import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ShieldCheck, ExternalLink, Trash2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, atLeast } from "@/lib/admin";
import { Avatar } from "@/components/avatar";
import { sportMeta } from "@/lib/sports";
import { setVerification, setAccountStatus, removePost, recoverUser } from "../../actions";
import { ArchiveUserButton } from "./ArchiveUserButton";
import { SendSignInLinkButton } from "./SendSignInLinkButton";

export const metadata = { title: "User · Admin" };

type Profile = {
  id: string;
  display_name: string;
  avatar_hue: number;
  avatar_path: string | null;
  verification_status: string;
  account_status: string;
  archived_at: string | null;
  suspended_until: string | null;
  reliability: number;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  primary_sport: string | null;
  created_at: string;
};
type PS = { sport_key: string; points: number; matches_played: number; wins: number };
type Rep = { id: string; reporter_id: string; reason: string; status: string; created_at: string };
type PostRow = { id: string; body: string | null; moderation_status: string; created_at: string };

const REASON: Record<string, string> = {
  harassment: "Harassment",
  cheating: "Cheating",
  no_show: "No-show",
  inappropriate: "Inappropriate",
  fake_profile: "Fake profile",
  other: "Other",
};
const STATUS_TONE: Record<string, string> = { active: "#16a34a", suspended: "#b8860b", banned: "#d63a0f" };

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, userId: viewerId } = await requireAdmin("support");
  const admin = createAdminClient();

  const { data: profileRow } = await admin
    .from("profiles")
    .select(
      "id, display_name, avatar_hue, avatar_path, verification_status, account_status, archived_at, suspended_until, reliability, neighborhood, city, state, primary_sport, created_at",
    )
    .eq("id", id)
    .single();
  if (!profileRow) notFound();
  const p = profileRow as Profile;
  const canVerifyOrBan = atLeast(role, "admin");

  const [{ data: psRows }, { data: repRows }, { data: postRows }, { data: targetAdminRow }, { data: authData }] = await Promise.all([
    admin.from("player_sports").select("sport_key, points, matches_played, wins").eq("user_id", id),
    admin.from("reports").select("id, reporter_id, reason, status, created_at").eq("reported_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("posts").select("id, body, moderation_status, created_at").eq("author_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("admin_users").select("role").eq("user_id", id).maybeSingle(),
    admin.auth.admin.getUserById(id),
  ]);
  const email = authData?.user?.email ?? null;
  const sports = (psRows as PS[] | null) ?? [];
  const reports = (repRows as Rep[] | null) ?? [];
  const posts = (postRows as PostRow[] | null) ?? [];
  const canDelete = role === "superadmin";
  const isSelf = id === viewerId;
  const isTargetAdmin = !!targetAdminRow;

  const reporterIds = [...new Set(reports.map((r) => r.reporter_id))];
  const nameMap = new Map<string, string>();
  if (reporterIds.length) {
    const { data } = await admin.from("profiles").select("id, display_name").in("id", reporterIds);
    for (const x of (data as { id: string; display_name: string }[] | null) ?? []) nameMap.set(x.id, x.display_name);
  }

  const totalMatches = sports.reduce((a, s) => a + s.matches_played, 0);
  const totalWins = sports.reduce((a, s) => a + s.wins, 0);
  const avatarUrl = p.avatar_path ? admin.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;
  const place = [p.neighborhood, p.city, p.state].filter(Boolean).join(", ") || "—";
  const memberSince = new Date(p.created_at).toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <Link href="/admin/users" className="press text-sm text-mute transition-colors hover:text-ink">← Users</Link>

      {/* header */}
      <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-rule bg-surface p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar url={avatarUrl} hue={p.avatar_hue} name={p.display_name} size={64} ring />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-2xl text-ink">{p.display_name || "Player"}</h2>
              {p.verification_status === "verified" ? <BadgeCheck size={18} className="text-brand" /> : null}
              {p.account_status !== "active" ? (
                <span className="kicker rounded-full px-2 py-0.5 text-[9px]" style={{ background: "#f4f4f5", color: STATUS_TONE[p.account_status] }}>{p.account_status}</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-mute">{place} · {p.primary_sport ? sportMeta(p.primary_sport).name : "no primary sport"}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-faint">
              <ShieldCheck size={12} /> Reliability {p.reliability} · {totalWins}–{totalMatches - totalWins} record · since {memberSince}
            </p>
            {p.suspended_until ? <p className="mt-1 text-xs text-faint">Suspended until {new Date(p.suspended_until).toLocaleString("en-US")}</p> : null}
          </div>
        </div>
        <Link href={`/profile/${p.id}`} className="press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-faint">
          Public profile <ExternalLink size={13} />
        </Link>
      </div>

      {/* account actions */}
      <div className="mt-4 rounded-2xl border border-rule bg-surface p-5">
        <div className="kicker mb-3 text-faint">Account actions</div>
        <div className="flex flex-wrap items-center gap-2">
          {/* verification */}
          {canVerifyOrBan ? (
            p.verification_status === "verified" ? (
              <form action={setVerification}>
                <input type="hidden" name="userId" value={p.id} />
                <input type="hidden" name="value" value="unverified" />
                <button className="press rounded-full border border-rule px-3.5 py-2 text-sm font-semibold text-mute transition-colors hover:border-faint hover:text-ink">Remove verification</button>
              </form>
            ) : (
              <form action={setVerification}>
                <input type="hidden" name="userId" value={p.id} />
                <input type="hidden" name="value" value="verified" />
                <button className="press rounded-full bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">Verify identity</button>
              </form>
            )
          ) : (
            <span className="text-xs text-faint">Verification changes require an admin.</span>
          )}

          {/* status */}
          {p.account_status === "active" ? (
            <>
              <form action={setAccountStatus} className="flex items-center gap-1.5">
                <input type="hidden" name="userId" value={p.id} />
                <input type="hidden" name="status" value="suspended" />
                <input name="days" type="number" min={1} max={365} defaultValue={7} className="w-16 rounded-xl border border-rule bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-brand" aria-label="Suspension days" />
                <button className="press rounded-full border border-rule px-3.5 py-2 text-sm font-semibold text-mute transition-colors hover:border-faint hover:text-ink">Suspend (days)</button>
              </form>
              {canVerifyOrBan ? (
                <form action={setAccountStatus}>
                  <input type="hidden" name="userId" value={p.id} />
                  <input type="hidden" name="status" value="banned" />
                  <button className="press rounded-full px-3.5 py-2 text-sm font-semibold text-white transition-colors" style={{ background: "#d63a0f" }}>Ban</button>
                </form>
              ) : null}
            </>
          ) : (
            <form action={setAccountStatus}>
              <input type="hidden" name="userId" value={p.id} />
              <input type="hidden" name="status" value="active" />
              <button className="press rounded-full bg-ink px-3.5 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">Reinstate</button>
            </form>
          )}
        </div>
      </div>

      {/* email & passwordless access (admin+) */}
      {canVerifyOrBan ? (
        <div className="mt-4 rounded-2xl border border-rule bg-surface p-5">
          <div className="kicker mb-2 text-faint">Email &amp; access</div>
          <p className="text-sm text-ink">{email ?? "—"}</p>
          <p className="mt-1 text-xs text-faint">
            Klimr sign-in is passwordless — send a fresh magic sign-in link, the equivalent of a password reset. It goes to the account&rsquo;s own inbox.
          </p>
          <div className="mt-3">
            <SendSignInLinkButton userId={p.id} />
          </div>
        </div>
      ) : null}

      {/* reports against */}
      <div className="mt-6">
        <div className="kicker mb-3 text-faint">Reports against · {reports.length}</div>
        {reports.length === 0 ? (
          <p className="text-sm text-mute">No reports against this player.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-rule bg-surface px-4 py-2.5 text-sm">
                <span className="text-ink"><b>{REASON[r.reason] ?? r.reason}</b> · by {nameMap.get(r.reporter_id) ?? "Unknown"}</span>
                <span className="text-xs text-faint">{r.status} · {new Date(r.created_at).toLocaleDateString("en-US")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* recent posts */}
      <div className="mt-6">
        <div className="kicker mb-3 text-faint">Recent posts</div>
        {posts.length === 0 ? (
          <p className="text-sm text-mute">No posts.</p>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <div key={post.id} className="flex items-start justify-between gap-3 rounded-xl border border-rule bg-surface px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{post.body || "(image post)"}</p>
                  <p className="text-xs text-faint">{post.moderation_status} · {new Date(post.created_at).toLocaleString("en-US")}</p>
                </div>
                {post.moderation_status !== "rejected" ? (
                  <form action={removePost}>
                    <input type="hidden" name="postId" value={post.id} />
                    <input type="hidden" name="authorId" value={p.id} />
                    <button className="press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:border-faint hover:text-ink" aria-label="Remove post">
                      <Trash2 size={13} /> Remove
                    </button>
                  </form>
                ) : (
                  <span className="shrink-0 text-xs text-faint">removed</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* danger zone — archive / recover (superadmin) */}
      {canDelete ? (
        <div className="mt-8 rounded-2xl border border-brand/25 bg-brand/[0.03] p-5">
          <div className="kicker mb-1 text-brand-deep">Danger zone</div>
          {isSelf ? (
            <p className="text-sm text-faint">You can’t archive your own account from here.</p>
          ) : isTargetAdmin ? (
            <p className="text-sm text-faint">
              This is a staff account — remove its admin role in SQL before it can be archived.
            </p>
          ) : p.account_status === "archived" ? (
            <>
              <p className="mb-3 text-sm text-mute">
                Archived{p.archived_at ? ` on ${new Date(p.archived_at).toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""} —
                hidden and pending deletion. Recover it to restore full access, or purge it now from Archived accounts.
              </p>
              <form action={recoverUser}>
                <input type="hidden" name="userId" value={p.id} />
                <button className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
                  Recover account
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-mute">
                Archive this account: it’s hidden immediately and permanently deleted after 30 days, with all of its
                data — matches, posts, chats, rankings, and memberships. Recoverable until then. For test accounts and
                abuse cleanup.
              </p>
              <ArchiveUserButton userId={p.id} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
