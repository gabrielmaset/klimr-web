import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireAdmin("support");

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-pop">
            <ShieldCheck size={18} />
          </span>
          <div>
            <div className="kicker text-brand">Klimr Admin</div>
            <h1 className="font-display text-2xl leading-none text-ink">Trust &amp; Safety</h1>
          </div>
        </div>
        <span className="kicker rounded-full border border-rule px-2.5 py-1 text-faint">{role}</span>
      </div>

      <nav className="mt-5 flex flex-wrap gap-1.5 border-b border-rule pb-3" aria-label="Admin">
        {[
          { href: "/admin", label: "Overview" },
          { href: "/admin/reports", label: "Moderation" },
          { href: "/admin/support", label: "Support" },
          { href: "/admin/users", label: "Users" },
          { href: "/admin/tournaments", label: "Tournaments" },
          { href: "/admin/providers", label: "Providers" },
          { href: "/admin/codes", label: "Codes" },
          { href: "/admin/updates", label: "Post to Feed" },
          { href: "/admin/diagnostics", label: "Diagnostics" },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="press rounded-full px-3 py-1.5 text-sm font-semibold text-mute transition-colors hover:bg-[#f4f4f5] hover:text-ink"
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  );
}
