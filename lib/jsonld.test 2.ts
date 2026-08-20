import { describe, it, expect } from "vitest";
import { safeJsonLd } from "./jsonld";

// Audit SEC-005: user-controlled labels must not break out of <script type="application/ld+json">.
describe("safeJsonLd", () => {
  it("escapes </script> breakouts", () => {
    const out = safeJsonLd({ name: 'Pool A </script><script>alert(1)</script>' });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
  });
  it("escapes U+2028/U+2029 (valid JSON, illegal JS source)", () => {
    const out = safeJsonLd({ name: "line\u2028sep\u2029end" });
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    expect(out).not.toMatch(/[\u2028\u2029]/);
  });
  it("round-trips identical data", () => {
    const val = { a: "<b>&</b>", list: [1, "two"] };
    expect(JSON.parse(safeJsonLd(val))).toEqual(val);
  });
});
