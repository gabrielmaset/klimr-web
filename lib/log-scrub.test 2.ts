import { describe, it, expect } from "vitest";
import { scrubText, templatePath, scrubLogRow, pseudonymize } from "./log-scrub";

/* KCDX-068 — the acceptance criterion is specific: stored telemetry keeps
 * "actionable correlation and template/error code but none of the seeded
 * sensitive markers". So these tests seed markers and assert both halves —
 * the sensitive thing is gone AND the useful thing survived. Testing only the
 * first half would pass on a scrubber that returns the empty string. */

const MARKERS = {
  email: "gduran@klimr.com",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  serviceKey: "sb_secret_9aBcDeFgHiJkLmNoPqRsTuVwXyZ012345",
  inviteCode: "K7QM-2XPL-9WZA",
  uuid: "11111111-2222-3333-4444-555555555555",
  phone: "+1 (310) 555-0142",
  geo: "34.001234, -118.412345",
};

describe("KCDX-068 log scrubber", () => {
  it("removes every seeded marker from free text", () => {
    const stack = [
      `Error: save failed for ${MARKERS.email}`,
      `  authorization: Bearer ${MARKERS.jwt}`,
      `  apiKey=${MARKERS.serviceKey}`,
      `  invite ${MARKERS.inviteCode} for user ${MARKERS.uuid}`,
      `  phone ${MARKERS.phone} at ${MARKERS.geo}`,
    ].join("\n");

    const out = scrubText(stack, 4000)!;
    for (const [name, marker] of Object.entries(MARKERS)) {
      expect(out, `${name} survived`).not.toContain(marker);
    }
  });

  it("keeps the parts that make an error actionable", () => {
    const out = scrubText(`Error: save failed for ${MARKERS.email} in updateProfile at lib/x.ts:42`, 4000)!;
    expect(out).toContain("save failed");
    expect(out).toContain("updateProfile");
    expect(out).toContain("lib/x.ts:42");
    expect(out).toContain("[email]");
  });

  it("pseudonymises identifiers instead of deleting them, so rows still correlate", () => {
    const a = scrubText(`user ${MARKERS.uuid} failed`)!;
    const b = scrubText(`later, user ${MARKERS.uuid} failed again`)!;
    const handle = pseudonymize(MARKERS.uuid);
    expect(a).toContain(handle);
    expect(b).toContain(handle);
    expect(handle).not.toContain(MARKERS.uuid);
    // a different user must not collide into the same handle
    expect(pseudonymize("99999999-8888-7777-6666-555555555555")).not.toBe(handle);
  });

  it("keeps the key and loses the value for credential-shaped pairs", () => {
    const out = scrubText("token: abc123def456 password=hunter2")!;
    expect(out).toContain("token:");
    expect(out).toContain("[redacted]");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("abc123def456");
  });

  it("templates paths that carry Klimr's codes", () => {
    expect(templatePath("/q/XK4M2P")).toBe("/q/:code");
    expect(templatePath("/q/XK4M2P/court-2")).toBe("/q/:code/court-2");
    expect(templatePath("/gate/K7QM-2XPL-9WZA")).toBe("/gate/:code");
    expect(templatePath(`/profile/${MARKERS.uuid}`)).toBe("/profile/:id");
    expect(templatePath("/tournament/42/registrations")).toBe("/tournament/:n/registrations");
  });

  it("keeps query KEYS and drops query VALUES", () => {
    const out = templatePath("/courts?zip=90066&sport=tennis&q=secret+thing");
    expect(out).toContain("zip=");
    expect(out).toContain("sport=");
    expect(out).not.toContain("90066");
    expect(out).not.toContain("tennis");
    expect(out).not.toContain("secret");
  });

  it("leaves ordinary route segments alone — a template with no words is not a template", () => {
    expect(templatePath("/settings/location")).toBe("/settings/location");
    expect(templatePath("/api/queue/snapshot")).toBe("/api/queue/snapshot");
  });

  it("bounds what it stores", () => {
    expect(scrubText("x".repeat(9000), 2000)!.length).toBe(2000);
    expect(scrubLogRow({ detail: "y".repeat(9000) }).detail!.length).toBe(2000);
  });

  it("scrubLogRow handles a realistic browser-supplied row end to end", () => {
    const row = scrubLogRow({
      message: `Failed to load /q/XK4M2P for ${MARKERS.email}`,
      detail: `TypeError: undefined\n  at Composer (app/feed/page.tsx:88)\n  session ${MARKERS.jwt}`,
      url: `/q/XK4M2P?code=XK4M2P&zip=90066`,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    expect(row.message).not.toContain(MARKERS.email);
    expect(row.detail).not.toContain(MARKERS.jwt);
    expect(row.detail).toContain("app/feed/page.tsx:88");
    expect(row.url).toBe("/q/:code?code=&zip=");
    expect(row.url).not.toContain("90066");
    expect(row.user_agent).toContain("iPhone");
  });

  it("never returns null for message — a row with no message is still a row", () => {
    expect(scrubLogRow({}).message).toBe("(no message)");
  });
});
