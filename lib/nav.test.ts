import { describe, it, expect } from "vitest";
import { NAV_GROUPS, navGroupsFor, type NavRoleContext } from "./nav";

const base: NavRoleContext = { isAdmin: false, isOrganizer: false, isBusinessManager: false, hasTeams: false };
const headers = (ctx: NavRoleContext) => navGroupsFor(ctx).filter((g) => g.header).map((g) => g.header);
const hrefs = (ctx: NavRoleContext) => navGroupsFor(ctx).flatMap((g) => g.items.map((i) => i.href)).sort();

describe("role-based nav ordering (K3-03 · D3: order, never hide)", () => {
  it("NEVER hides a destination, whatever the role", () => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)).sort();
    for (const ctx of [
      base,
      { ...base, isOrganizer: true },
      { ...base, isBusinessManager: true },
      { ...base, hasTeams: true },
      { isAdmin: true, isOrganizer: true, isBusinessManager: true, hasTeams: true },
    ]) {
      expect(hrefs(ctx)).toEqual(all);
    }
  });
  it("keeps the spine group pinned at the top for everyone", () => {
    for (const ctx of [base, { ...base, isOrganizer: true }, { ...base, isBusinessManager: true }]) {
      const first = navGroupsFor(ctx)[0];
      expect(first.header).toBeUndefined();
      expect(first.items.map((i) => i.href)).toEqual(["/feed", "/play", "/queue", "/rankings"]);
    }
  });
  it("organizers meet Compete first", () => {
    expect(headers({ ...base, isOrganizer: true })[0]).toBe("Compete");
  });
  it("business managers meet Discover first", () => {
    expect(headers({ ...base, isBusinessManager: true })[0]).toBe("Discover");
  });
  it("team players meet Community first", () => {
    expect(headers({ ...base, hasTeams: true })[0]).toBe("Community");
  });
  it("a brand-new account gets the authored default order", () => {
    expect(headers(base)).toEqual(["Compete", "Community", "Discover"]);
  });
  it("organizer outranks the other signals when several apply", () => {
    expect(headers({ isAdmin: true, isOrganizer: true, isBusinessManager: true, hasTeams: true })[0]).toBe("Compete");
  });
});
