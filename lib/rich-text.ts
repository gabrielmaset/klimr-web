import sanitizeHtml from "sanitize-html";

// Strict allowlist for organizer-written rich text. Runs server-side (in actions at
// write time, and again at render time for defence-in-depth). Uses sanitize-html,
// which is pure JavaScript (htmlparser2) with no jsdom — so it bundles and runs
// reliably on serverless. Only a small set of formatting tags survive; links are
// forced to open safely; inline styles are limited to text + highlight colour.

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["b", "strong", "i", "em", "u", "s", "strike", "a", "ul", "ol", "li", "p", "br", "span", "h3", "blockquote"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["style"],
    p: ["style"],
    li: ["style"],
  },
  allowedStyles: {
    "*": {
      color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/, /^[a-z]+$/i],
      "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/, /^[a-z]+$/i],
    },
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html || !html.trim()) return "";
  try {
    return sanitizeHtml(html, OPTIONS).slice(0, 12000).trim();
  } catch {
    // Never let sanitization crash a render — degrade safely to stripped plain text.
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000);
  }
}

// True when the stored text contains real markup (vs. legacy plain-text descriptions).
export function looksLikeHtml(text: string | null | undefined): boolean {
  return !!text && /<\/?[a-z][\s\S]*>/i.test(text);
}
