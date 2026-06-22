import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, CalendarClock, Trophy, Swords, ShoppingBag, Sparkles, Megaphone, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { markAllRead } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
};

const KIND_META: Record<string, { Icon: typeof Bell; tint: string; ink: string }> = {
  match_invite: { Icon: CalendarClock, tint: "#fff1ed", ink: "#d63a0f" },
  match_join: { Icon: CalendarClock, tint: "#f0fdf4", ink: "#15803d" },
  match_confirm: { Icon: CalendarClock, tint: "#f0fdf4", ink: "#15803d" },
  ranking: { Icon: Trophy, tint: "#fff8e6", ink: "#8a6d0b" },
  region_challenge: { Icon: Swords, tint: "#fff1ed", ink: "#d63a0f" },
  marketplace: { Icon: ShoppingBag, tint: "#f4f4f5", ink: "#52525b" },
  sponsorship: { Icon: Sparkles, tint: "#fff1ed", ink: "#d63a0f" },
  system: { Icon: Megaphone, tint: "#f4f4f5", ink: "#52525b" },
};

function timeAgo(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link_url, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const items = (data as Row[] | null) ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Notifications</h1>
          <p className="mt-1 text-sm text-mute">{unread > 0 ? `${unread} unread` : "You're all caught up."}</p>
        </div>
        {unread > 0 ? (
          <form action={markAllRead}>
            <button className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-[#f4f4f5]">
              <CheckCheck size={15} /> Mark all read
            </button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center">
          <Bell className="mx-auto text-faint" size={26} />
          <p className="mt-2 text-sm font-semibold text-ink">No notifications yet</p>
          <p className="mt-1 text-sm text-mute">Match activity, ranking changes, and sponsorship offers will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const meta = KIND_META[n.kind] ?? KIND_META.system;
            const { Icon } = meta;
            const unreadItem = !n.read_at;
            const inner = (
              <div
                className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                  unreadItem ? "border-brand/20 bg-tint-brand/40" : "border-rule bg-surface"
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: meta.tint, color: meta.ink }}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{n.title}</p>
                    {unreadItem ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
                  </div>
                  {n.body ? <p className="mt-0.5 text-sm text-mute">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-faint">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            );
            return n.link_url ? (
              <Link key={n.id} href={n.link_url} className="lift block">
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
