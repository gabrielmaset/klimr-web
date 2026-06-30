import DOMPurify from "isomorphic-dompurify";

// Strict allowlist for organizer-written rich text. Runs on the server (in actions
// at write time, and again at render time for defence-in-depth). Only a small set
// of formatting tags survive; links are forced to open safely; inline styles are
// trimmed to text + highlight colour only. NOTE: keep DOMPurify out of client
// bundles — only import this from server code.

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
    const style = el.getAttribute?.("style");
    if (style) {
      const keep = style
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((rule) => {
          const prop = rule.split(":")[0]?.trim().toLowerCase();
          return prop === "color" || prop === "background-color";
        });
      if (keep.length) el.setAttribute("style", keep.join("; "));
      else el.removeAttribute("style");
    }
  });
  hooked = true;
}

const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "s", "strike", "a", "ul", "ol", "li", "p", "br", "span", "h3", "blockquote"];

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html || !html.trim()) return "";
  ensureHooks();
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "target", "rel", "style"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
  return clean.slice(0, 12000).trim();
}

// True when the stored text contains real markup (vs. legacy plain-text descriptions).
export function looksLikeHtml(text: string | null | undefined): boolean {
  return !!text && /<\/?[a-z][\s\S]*>/i.test(text);
}
