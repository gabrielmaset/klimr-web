/* Opens a clean, self-contained print window. Styles are embedded (the print
 * window has no access to the app's stylesheet), tuned to match Klimr's look. */
export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function openPrintWindow(title: string, subtitle: string | null, bodyHtml: string) {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return;
  const css = `
    *{box-sizing:border-box}
    body{margin:0;padding:32px 36px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18181b;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    h1{font-size:24px;margin:0;font-weight:800;letter-spacing:-.01em}
    .sub{color:#71717a;font-size:13px;margin:4px 0 0}
    .div{margin-top:28px;page-break-inside:avoid}
    .div > h2{font-size:17px;font-weight:800;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #ff4e1b}
    .pools{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
    .pool{border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}
    .pool h3{margin:0;background:#ff4e1b;color:#fff;font-size:13px;font-weight:700;padding:8px 12px;letter-spacing:.02em}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #f1f1f3}
    th{color:#71717a;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
    td.n,th.n{text-align:center;font-variant-numeric:tabular-nums}
    .rank{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:999px;background:#fff1ec;color:#cc3e15;font-weight:700;font-size:10px}
    .rounds{display:flex;gap:18px;align-items:flex-start;overflow:visible;flex-wrap:wrap}
    .round{min-width:200px}
    .round > .rh{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#71717a;margin:0 0 8px}
    .m{border:1px solid #e4e4e7;border-radius:10px;padding:8px 10px;margin-bottom:8px;page-break-inside:avoid}
    .mr{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:2px 0}
    .mr.win{font-weight:700}
    .mr + .mr{border-top:1px solid #f1f1f3;margin-top:2px;padding-top:4px}
    .sc{font-variant-numeric:tabular-nums;color:#3f3f46}
    @media print{body{padding:0}@page{margin:14mm}}
  `;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head>` +
      `<body><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}${bodyHtml}` +
      `<script>window.onload=function(){setTimeout(function(){window.print()},120)}</script></body></html>`,
  );
  w.document.close();
}

/** Build the inner HTML for one or more bracket rounds. */
export function bracketRoundsHtml(rounds: { label: string; matches: { a: string; b: string; sa: number | null; sb: number | null; done: boolean }[] }[]): string {
  const cols = rounds
    .map((rd) => {
      const ms = rd.matches
        .map((m) => {
          const aWin = m.done && m.sa != null && m.sb != null && m.sa > m.sb;
          const bWin = m.done && m.sa != null && m.sb != null && m.sb > m.sa;
          return (
            `<div class="m">` +
            `<div class="mr${aWin ? " win" : ""}"><span>${escapeHtml(m.a)}</span><span class="sc">${m.sa ?? ""}</span></div>` +
            `<div class="mr${bWin ? " win" : ""}"><span>${escapeHtml(m.b)}</span><span class="sc">${m.sb ?? ""}</span></div>` +
            `</div>`
          );
        })
        .join("");
      return `<div class="round"><p class="rh">${escapeHtml(rd.label)}</p>${ms}</div>`;
    })
    .join("");
  return `<div class="rounds">${cols}</div>`;
}
