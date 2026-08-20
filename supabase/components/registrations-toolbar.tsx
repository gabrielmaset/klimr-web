"use client";

import { Printer, Download } from "lucide-react";

type Field = { id: string; label: string };
type Player = { name: string; isReserve: boolean; confirmed: boolean; waiver: boolean; rules: boolean; answers: Record<string, string> };
type Entry = { name: string; type: string; division: string | null; status: string; paymentStatus: string; registeredAt: string | null; teamAnswers: Record<string, string>; players: Player[] };

const REG: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", waitlisted: "Waitlisted" };
const PAY: Record<string, string> = { unpaid: "Unpaid", proof_submitted: "Under review", confirmed: "Paid", denied: "Declined" };

function esc(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function RegistrationsToolbar({ entries, perPlayerFields, perTeamFields, title }: { entries: Entry[]; perPlayerFields: Field[]; perTeamFields: Field[]; title: string }) {
  function exportCsv() {
    const headers = [
      "Entry",
      "Type",
      "Division",
      "Entry status",
      "Payment",
      "Player",
      "Reserve",
      "Confirmed",
      "Waiver accepted",
      "Rules accepted",
      ...perPlayerFields.map((f) => f.label),
      ...perTeamFields.map((f) => f.label),
    ];
    const lines = [headers.map((h) => esc(h)).join(",")];
    for (const e of entries) {
      const front = [e.name, e.type, e.division ?? "", REG[e.status] ?? e.status, PAY[e.paymentStatus] ?? e.paymentStatus];
      const team = perTeamFields.map((f) => e.teamAnswers[f.id] ?? "");
      const players: Player[] = e.players.length ? e.players : [{ name: "", isReserve: false, confirmed: false, waiver: false, rules: false, answers: {} }];
      for (const p of players) {
        const row = [
          ...front,
          p.name,
          p.isReserve ? "Yes" : "No",
          p.confirmed ? "Yes" : "No",
          p.waiver ? "Yes" : "No",
          p.rules ? "Yes" : "No",
          ...perPlayerFields.map((f) => p.answers[f.id] ?? ""),
          ...team,
        ];
        lines.push(row.map((v) => esc(String(v))).join(","));
      }
    }
    const csv = lines.join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const slug = (title || "tournament").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "tournament";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-surface shadow-e1 px-3.5 py-2 text-sm font-semibold text-ink hover:border-faint">
        <Printer size={15} /> Print
      </button>
      <button type="button" onClick={exportCsv} className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-soft">
        <Download size={15} /> Export CSV
      </button>
    </div>
  );
}
