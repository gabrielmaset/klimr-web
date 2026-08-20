import { describe, it, expect } from "vitest";
import { hydrateItems } from "./ai-search-hydrate";
import type { AiItem } from "./ai-search";

const bank = new Map<string, AiItem>([
  ["r1", { title: "Marina Padel Night", subtitle: "Fri 7pm", href: "/events/abc" }],
  ["r2", { title: "Westside Ladder", href: "/rankings?zip=90066" }],
]);

// Audit SRCH-001 + ADD-02: the model selects server-minted IDs only; it can
// never shape a result object or smuggle a protocol-relative external.
describe("AI search hydration (IDs only)", () => {
  it("hydrates known ids from the bank", () => {
    const out = hydrateItems(["r1", " r2 "], bank);
    expect(out.map((i) => i.href)).toEqual(["/events/abc", "/rankings?zip=90066"]);
  });
  it("drops model-minted objects — including internal-looking ones", () => {
    const out = hydrateItems([
      { title: "Reset your password", href: "/settings" },
      { title: "Totally real event", href: "/events/evil" },
    ], bank);
    expect(out).toEqual([]);
  });
  it("drops protocol-relative and absolute externals even if banked", () => {
    const poisoned = new Map(bank);
    poisoned.set("rX", { title: "Phish", href: "//evil.example/login" });
    poisoned.set("rY", { title: "Phish2", href: "https://evil.example" });
    expect(hydrateItems(["rX", "rY"], poisoned)).toEqual([]);
  });
  it("drops unknown ids and non-strings; caps at 8", () => {
    expect(hydrateItems(["nope", 42 as unknown as string, null as unknown as string], bank)).toEqual([]);
    const big = new Map<string, AiItem>();
    for (let i = 0; i < 12; i++) big.set(`r${i}`, { title: `T${i}`, href: `/x/${i}` });
    expect(hydrateItems([...big.keys()], big)).toHaveLength(8);
  });
});
