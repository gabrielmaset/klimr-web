import { Trash2 } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { CodeGenerator } from "./CodeGenerator";
import { CopyButton } from "./CopyButton";
import {
  setInviteCodeActive,
  deleteInviteCode,
  setInvestorCodeActive,
  deleteInvestorCode,
} from "../actions";

export const metadata = { title: "Codes · Admin" };

type Invite = {
  code: string;
  max_uses: number;
  uses: number;
  note: string | null;
  active: boolean;
  sent_to_email: string | null;
  created_at: string;
  last_used_at: string | null;
};
type Investor = {
  code: string;
  label: string | null;
  active: boolean;
  expires_at: string | null;
  sent_to_email: string | null;
  created_at: string;
  last_used_at: string | null;
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

const th = "sticky top-0 z-10 border-b border-rule bg-surface px-4 py-2.5 font-semibold";
const td = "px-4 py-2.5";

export default async function AdminCodesPage() {
  const { role } = await requireAdmin("admin");
  const canDelete = role === "superadmin";
  const admin = createAdminClient();

  const [{ data: invitesData }, { data: investorsData }] = await Promise.all([
    admin
      .from("invite_codes")
      .select("code, max_uses, uses, note, active, sent_to_email, created_at, last_used_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("investor_codes")
      .select("code, label, active, expires_at, sent_to_email, created_at, last_used_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const invites = (invitesData as Invite[] | null) ?? [];
  const investors = (investorsData as Investor[] | null) ?? [];
  // Server component: renders once per request, so reading the clock here is stable.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div>
      <BackButton fallback="/admin" label="Admin" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />

      <h1 className="font-display text-3xl text-ink sm:text-4xl">Codes</h1>
      <p className="mt-1 text-sm text-mute">Generate, view, disable, and delete invite and investor codes.</p>

      <div className="mt-5">
        <CodeGenerator />
      </div>

      {/* Invite codes */}
      <h2 className="kicker mt-9 text-faint">Invite codes · site access</h2>
      {invites.length === 0 ? (
        <p className="mt-2 text-sm text-mute">No invite codes yet.</p>
      ) : (
        <div className="mt-2 max-h-[28rem] overflow-auto rounded-2xl border border-rule bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-faint">
                <th className={th}>Code</th>
                <th className={th}>Status</th>
                <th className={th}>Label</th>
                <th className={th}>Email</th>
                <th className={th}>Created</th>
                <th className={th}>Last used</th>
                <th className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((c) => {
                const remaining = c.max_uses - c.uses;
                const status = !c.active
                  ? "Disabled"
                  : remaining <= 0
                    ? "Used up"
                    : `${remaining} of ${c.max_uses} left`;
                const tone = !c.active ? "text-brand-deep" : remaining <= 0 ? "text-faint" : "text-ink";
                return (
                  <tr key={c.code} className="border-b border-rule/60 last:border-0">
                    <td className={`${td} whitespace-nowrap font-mono text-ink`}>
                      <span className="inline-flex items-center gap-2">
                        {c.code}
                        <CopyButton value={c.code} />
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className={tone}>{status}</span>
                    </td>
                    <td className={`${td} text-mute`}>{c.note ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap text-mute`}>{c.sent_to_email ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap text-mute`}>{fmt(c.created_at)}</td>
                    <td className={`${td} whitespace-nowrap text-mute`}>{fmt(c.last_used_at)}</td>
                    <td className={td}>
                      <div className="flex items-center justify-end gap-1.5">
                        <form action={setInviteCodeActive}>
                          <input type="hidden" name="code" value={c.code} />
                          <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                          <button className="press rounded-full border border-rule px-2.5 py-1 text-xs font-semibold text-mute hover:text-ink">
                            {c.active ? "Disable" : "Enable"}
                          </button>
                        </form>
                        {canDelete ? (
                          <form action={deleteInviteCode}>
                            <input type="hidden" name="code" value={c.code} />
                            <button
                              aria-label="Delete code"
                              className="press grid h-7 w-7 place-items-center rounded-full border border-rule text-mute hover:border-brand/40 hover:text-brand-deep"
                            >
                              <Trash2 size={13} />
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Investor codes */}
      <h2 className="kicker mt-9 text-faint">Investor codes · vision portal</h2>
      {investors.length === 0 ? (
        <p className="mt-2 text-sm text-mute">No investor codes yet.</p>
      ) : (
        <div className="mt-2 max-h-[28rem] overflow-auto rounded-2xl border border-rule bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-faint">
                <th className={th}>Code</th>
                <th className={th}>Status</th>
                <th className={th}>Label</th>
                <th className={th}>Email</th>
                <th className={th}>Created</th>
                <th className={th}>Last used</th>
                <th className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((c) => {
                const exp = c.expires_at ? new Date(c.expires_at).getTime() : null;
                const status = !c.active
                  ? "Disabled"
                  : exp === null
                    ? "Unused — clock starts on first entry"
                    : exp > now
                      ? `Active until ${fmt(c.expires_at)}`
                      : "Expired";
                const tone =
                  !c.active || (exp !== null && exp <= now)
                    ? "text-brand-deep"
                    : exp === null
                      ? "text-mute"
                      : "text-ink";
                return (
                  <tr key={c.code} className="border-b border-rule/60 last:border-0">
                    <td className={`${td} whitespace-nowrap font-mono text-ink`}>
                      <span className="inline-flex items-center gap-2">
                        {c.code}
                        <CopyButton value={c.code} />
                      </span>
                    </td>
                    <td className={td}>
                      <span className={tone}>{status}</span>
                    </td>
                    <td className={`${td} text-mute`}>{c.label ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap text-mute`}>{c.sent_to_email ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap text-mute`}>{fmt(c.created_at)}</td>
                    <td className={`${td} whitespace-nowrap text-mute`}>{fmt(c.last_used_at)}</td>
                    <td className={td}>
                      <div className="flex items-center justify-end gap-1.5">
                        <form action={setInvestorCodeActive}>
                          <input type="hidden" name="code" value={c.code} />
                          <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                          <button className="press rounded-full border border-rule px-2.5 py-1 text-xs font-semibold text-mute hover:text-ink">
                            {c.active ? "Disable" : "Enable"}
                          </button>
                        </form>
                        {canDelete ? (
                          <form action={deleteInvestorCode}>
                            <input type="hidden" name="code" value={c.code} />
                            <button
                              aria-label="Delete code"
                              className="press grid h-7 w-7 place-items-center rounded-full border border-rule text-mute hover:border-brand/40 hover:text-brand-deep"
                            >
                              <Trash2 size={13} />
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!canDelete ? (
        <p className="mt-4 text-xs text-faint">
          Deleting codes requires the superadmin role — you can disable codes instead.
        </p>
      ) : null}
    </div>
  );
}
