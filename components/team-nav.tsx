"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, IdCard, Users, CalendarClock, MessageCircle, ChevronLeft } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { sportMeta } from "@/lib/sports";

type Team = { id: string; name: string; sport_key: string; category?: string };
type Personal = { url: string | null; hue: number; name: string };

export function TeamNav({
  team,
  role,
  teams,
  personal,
}: {
  team: Team;
  role: string;
  teams: Team[];
  personal: Personal;
}) {
  const pathname = usePathname();
  const base = `/team/${team.id}`;
  const meta = sportMeta(team.sport_key);
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const others = teams.filter((t) => t.id !== team.id);

  const items = [
    { href: base, label: "Home", Icon: LayoutDashboard, exact: true },
    { href: `${base}/profile`, label: "Profile", Icon: IdCard, exact: false },
    { href: `${base}/roster`, label: "Roster", Icon: Users, exact: false },
    { href: `${base}/matches`, label: "Matches", Icon: CalendarClock, exact: false },
    { href: `${base}/chat`, label: "Chat", Icon: MessageCircle, exact: false },
  ];
  const isActive = (href: string, exact: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  return (
    <>
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 self-start p-3 md:block">
        <div className="flex h-full flex-col overflow-y-auto rounded-3xl border border-rail-border bg-[linear-gradient(180deg,#0e2c3a,#0a212c)] px-3 py-5 shadow-[0_10px_40px_-15px_rgba(10,10,11,0.5)]">
          <div className="flex items-center gap-3 rounded-2xl border border-rail-border bg-white/[0.05] p-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-2xl">{meta.emoji}</span>
            <div className="min-w-0">
              <p className="kicker text-rail-muted">Team workspace</p>
              <p className="truncate text-sm font-bold text-rail-fg">{team.name}</p>
            </div>
          </div>

          <nav className="mt-5 flex flex-col gap-1" aria-label="Team">
            {items.map(({ href, label, Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${active ? "bg-rail-activebg text-rail-active" : "text-rail-fg hover:bg-rail-hover hover:text-white"}`}
                >
                  <Icon size={18} className={active ? "text-brand" : "text-rail-muted"} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          <div className="mt-6 border-t border-rail-border pt-3">
            {others.length > 0 ? (
              <>
                <p className="kicker mb-1 px-3 text-rail-muted">Switch team</p>
                {others.map((t) => (
                  <Link key={t.id} href={t.category === "pro" ? `/team/${t.id}` : `/teams/${t.id}`} className="flex h-9 items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-rail-fg transition-colors hover:bg-rail-hover hover:text-white">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/10 text-[11px]">{sportMeta(t.sport_key).emoji}</span>
                    <span className="truncate">{t.name}</span>
                  </Link>
                ))}
                <div className="h-2" />
              </>
            ) : null}
            <Link href="/me" className="lift flex items-center gap-2.5 rounded-2xl bg-white/[0.06] p-2 transition-colors hover:bg-white/[0.10]">
              <Avatar url={personal.url} hue={personal.hue} name={personal.name} size={28} ring />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-rail-fg">{personal.name}</span>
                <span className="block text-xs text-rail-muted">{roleLabel} · back to personal</span>
              </span>
              <ChevronLeft size={15} className="shrink-0 text-rail-muted" />
            </Link>
          </div>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-rule bg-surface md:hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint-brand text-lg">{meta.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="kicker leading-tight text-brand-deep">Team</p>
            <p className="truncate text-sm font-bold leading-tight text-ink">{team.name}</p>
          </div>
          <Link href="/me" aria-label="Back to personal" className="press inline-flex items-center gap-1 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
            <ChevronLeft size={14} /> Personal
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Team">
          {items.map(({ href, label, Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-tint-brand text-brand-deep" : "text-mute hover:text-ink"}`}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
