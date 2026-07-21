import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { setPostModeration, setCommentModeration } from "../actions";
import type { ModerationStatus } from "@/lib/database.types";

export const metadata = { title: "Moderation · Admin" };
export const dynamic = "force-dynamic";

type PostRow = {
  id: string;
  author_id: string;
  body: string | null;
  sport_key: string | null;
  moderation_status: ModerationStatus;
  moderation_labels: string[] | null;
  created_at: string;
};
type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  moderation_status: ModerationStatus;
  created_at: string;
};

const STATUSES: ModerationStatus[] = ["pending", "flagged", "rejected"];
const TONE: Record<string, string> = {
  pending: "var(--color-warning)",
  flagged: "var(--color-warning)",
  rejected: "var(--color-brand-deep)",
  approved: "var(--color-success)",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ModButtons({ kind, id }: { kind: "post" | "comment"; id: string }) {
  const action = kind === "post" ? setPostModeration : setCommentModeration;
  const field = kind === "post" ? "postId" : "commentId";
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <form action={action}>
        <input type="hidden" name={field} value={id} />
        <input type="hidden" name="status" value="approved" />
        <button className="press rounded-full bg-success px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95">
          Publish
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name={field} value={id} />
        <input type="hidden" name="status" value="rejected" />
        <button className="press rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink hover:border-faint">
          Reject
        </button>
      </form>
    </span>
  );
}

export default async function AdminModeration({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("support");
  const admin = createAdminClient();
  const sp = await searchParams;
  const status = (STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as ModerationStatus) : "pending";

  const [{ data: posts }, { data: comments }, counts] = await Promise.all([
    admin
      .from("posts")
      .select("id, author_id, body, sport_key, moderation_status, moderation_labels, created_at")
      .eq("moderation_status", status)
      .order("created_at", { ascending: false })
      .limit(60),
    admin
      .from("post_comments")
      .select("id, post_id, author_id, body, moderation_status, created_at")
      .eq("moderation_status", status)
      .order("created_at", { ascending: false })
      .limit(60),
    Promise.all(
      STATUSES.map(async (s) => {
        const [p, c] = await Promise.all([
          admin.from("posts").select("*", { count: "exact", head: true }).eq("moderation_status", s),
          admin.from("post_comments").select("*", { count: "exact", head: true }).eq("moderation_status", s),
        ]);
        return [s, (p.count ?? 0) + (c.count ?? 0)] as const;
      }),
    ),
  ]);

  const countOf = new Map(counts);
  const authorIds = [
    ...new Set([...((posts ?? []) as PostRow[]).map((p) => p.author_id), ...((comments ?? []) as CommentRow[]).map((c) => c.author_id)]),
  ];
  const names = new Map<string, string>();
  if (authorIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", authorIds);
    for (const p of (profs ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }
  const nameOf = (id: string) => names.get(id) ?? "Unknown";
  const postList = (posts ?? []) as PostRow[];
  const commentList = (comments ?? []) as CommentRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Moderation</h1>
        <p className="mt-1 text-sm text-mute">
          The AI gate publishes or rejects before anything surfaces; this queue is human review — appeals on rejections,
          stragglers stuck pending, and anything flagged. Publishing here emits the feed card automatically.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/moderation?status=${s}`}
            className={`press rounded-full border px-3.5 py-1.5 text-sm font-semibold capitalize transition-colors ${
              s === status ? "border-ink bg-ink text-cream" : "border-rule bg-surface text-ink hover:border-faint"
            }`}
          >
            {s} · {countOf.get(s) ?? 0}
          </Link>
        ))}
      </div>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-faint">Posts · {postList.length}</h2>
        {postList.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-mute shadow-e1">
            Nothing {status} here.
          </p>
        ) : (
          <div className="mt-2 space-y-2.5">
            {postList.map((p) => (
              <div key={p.id} className="rounded-2xl border border-rule bg-surface p-4 shadow-e1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <Link href={`/admin/users/${p.author_id}`} className="font-semibold text-ink hover:text-brand-deep">
                        {nameOf(p.author_id)}
                      </Link>{" "}
                      <span className="font-mono text-[10px] font-semibold uppercase" style={{ color: TONE[p.moderation_status] }}>
                        {p.moderation_status}
                      </span>{" "}
                      <span className="text-xs text-faint">· {fmt(p.created_at)}{p.sport_key ? ` · ${p.sport_key}` : ""}</span>
                    </p>
                    <p className="mt-1.5 max-w-2xl rounded-xl bg-bg px-3 py-2 text-sm text-ink">{p.body}</p>
                    {p.moderation_labels?.length ? (
                      <p className="mt-1.5 text-xs text-faint">AI labels: {p.moderation_labels.join(", ")}</p>
                    ) : null}
                  </div>
                  <ModButtons kind="post" id={p.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-faint">Comments · {commentList.length}</h2>
        {commentList.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-mute shadow-e1">
            Nothing {status} here.
          </p>
        ) : (
          <div className="mt-2 space-y-2.5">
            {commentList.map((c) => (
              <div key={c.id} className="rounded-2xl border border-rule bg-surface p-4 shadow-e1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <Link href={`/admin/users/${c.author_id}`} className="font-semibold text-ink hover:text-brand-deep">
                        {nameOf(c.author_id)}
                      </Link>{" "}
                      <span className="font-mono text-[10px] font-semibold uppercase" style={{ color: TONE[c.moderation_status] }}>
                        {c.moderation_status}
                      </span>{" "}
                      <span className="text-xs text-faint">· {fmt(c.created_at)} · comment</span>
                    </p>
                    <p className="mt-1.5 max-w-2xl rounded-xl bg-bg px-3 py-2 text-sm text-ink">{c.body}</p>
                  </div>
                  <ModButtons kind="comment" id={c.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
