import { describe, it, expect } from "vitest";
import { interpretQuery } from "./search-query";
import { hydrateItems } from "./ai-search-hydrate";
import type { AiItem } from "./ai-search";

// K1-04 golden-query corpus v1 — the deterministic layer, fixed adversarial
// inputs, no DB or model. This is the provable hot path (audit SRCH-004).
describe("golden corpus — deterministic query interpretation", () => {
  const cases: { q: string; kinds: string[]; condensed: string; browse?: boolean }[] = [
    // typos & casing keep their content words (matcher handles fuzz downstream)
    { q: "tennis", kinds: [], condensed: "tennis" },
    { q: "  Pickleball  ", kinds: [], condensed: "Pickleball" },
    { q: "beach volleyball events in Santa Monica", kinds: ["event", "tournament"], condensed: "beach volleyball Santa Monica" },
    // kind routing: "events" pulls in tournaments (umbrella), never the reverse
    { q: "tournaments", kinds: ["tournament"], condensed: "", browse: true },
    { q: "events next month", kinds: ["event", "tournament"], condensed: "", browse: true },
    { q: "padel courts near me", kinds: ["court"], condensed: "padel" },
    // ZIPs and dates: ZIP is content, month/date words are stopped
    { q: "coaches 90066", kinds: ["class"], condensed: "90066" },
    { q: "any weekly beach volleyball this august", kinds: [], condensed: "beach volleyball" },
    // multi-kind
    { q: "teams and players", kinds: ["team", "player"], condensed: "" },
    // condensation caps at 4 salient words
    { q: "alpha bravo charlie delta echo foxtrot", kinds: [], condensed: "alpha bravo charlie delta" },
    // synonyms collapse to class
    { q: "nutritionist", kinds: ["class"], condensed: "", browse: true },
    { q: "gear listings", kinds: ["listing"], condensed: "", browse: true },
    // pure stopword/question shell → nothing actionable
    { q: "what is there near me", kinds: [], condensed: "" },
    // injection-ish strings must not crash and must strip to harmless tokens
    { q: "'; DROP TABLE users; --", kinds: [], condensed: "DROP TABLE users" },
    { q: "<script>alert(1)</script> courts", kinds: ["court"], condensed: "script alert 1 script" },
  ];
  for (const c of cases) {
    it(`interprets: ${JSON.stringify(c.q)}`, () => {
      const r = interpretQuery(c.q);
      expect([...r.kinds].sort()).toEqual([...c.kinds].sort());
      expect(r.condensed).toBe(c.condensed);
      if (c.browse !== undefined) expect(r.isBrowseIntent).toBe(c.browse);
    });
  }
  it("never throws on hostile input", () => {
    for (const q of ["", "\u0000", "🎾🏓", "a".repeat(5000), "\\\\", "%%%", "() {}"]) {
      expect(() => interpretQuery(q)).not.toThrow();
    }
  });
});

// AI-layer adversarials sampled deterministically against the hydration guard —
// the ADD-02 protocol-relative case and model-shaped-object rejection.
describe("golden corpus — AI hydration adversarials (ADD-02)", () => {
  const bank = new Map<string, AiItem>([
    ["r1", { title: "Marina Padel", href: "/courts?zip=90292" }],
  ]);
  const injections: unknown[][] = [
    [{ title: "Fake", href: "//evil.example/login" }],
    [{ title: "Fake", href: "https://evil.example" }],
    [{ title: "Steer", href: "/admin" }],
    ["unknown-id"],
    [42, null, {}],
  ];
  for (const inj of injections) {
    it(`drops injection: ${JSON.stringify(inj).slice(0, 40)}`, () => {
      expect(hydrateItems(inj, bank)).toEqual([]);
    });
  }
  it("still hydrates a legitimate server-minted id", () => {
    expect(hydrateItems(["r1"], bank).map((i) => i.href)).toEqual(["/courts?zip=90292"]);
  });
});
