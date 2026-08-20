// Email-safe building blocks: table-based, inline CSS, web-safe fonts, no flexbox/grid.
// One shell + small content helpers so every Klimr email looks consistent and polished.

const INK = "#0a0a0b";
const BODY = "#3f3f46";
const MUTE = "#71717a";
const FAINT = "#a1a1aa";
const RULE = "#e4e4e7";
const BRAND = "#ff4e1b";
const DARK = "#0e2c3a";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A heading line. */
export function h(text: string): string {
  return `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:23px;line-height:1.3;font-weight:800;letter-spacing:-0.01em;color:${INK};">${text}</h1>`;
}

/** A body paragraph. `html` lets a caller pass pre-built inline markup (e.g. <strong>). */
export function p(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BODY};">${text}</p>`;
}

/** A bulletproof CTA button. */
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:10px;background:${BRAND};">
    <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr></table>`;
}

/** A bordered detail box (label/value rows) for event or payment summaries. */
export function detailBox(rows: { label: string; value: string }[]): string {
  const inner = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 0;font-family:${FONT};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:${FAINT};width:40%;vertical-align:top;">${r.label}</td>
         <td style="padding:8px 0;font-family:${FONT};font-size:14px;color:${INK};text-align:right;">${r.value}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border:1px solid ${RULE};border-radius:12px;background:#fafafa;">
    <tr><td style="padding:6px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${inner}</table></td></tr>
  </table>`;
}

/** A small muted note line. */
export function note(text: string): string {
  return `<p style="margin:0 0 4px;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTE};">${text}</p>`;
}

/** Wrap content blocks in the branded shell. `footer` is small print under the rule. */
export function emailDocument({ preheader, content, footer }: { preheader: string; content: string; footer: string }): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Klimr</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f5;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
        <tr><td style="background:${DARK};border-radius:16px 16px 0 0;padding:22px 28px;">
          <span style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">Klimr</span><span style="font-family:${FONT};font-size:22px;font-weight:800;color:${BRAND};">.</span>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px 28px 24px;">${content}</td></tr>
        <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;border-top:1px solid ${RULE};padding:18px 28px 24px;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};">
          ${footer}
          <div style="margin-top:10px;">Klimr — a verified sports network.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
