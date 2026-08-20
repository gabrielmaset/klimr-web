import { describe, it, expect } from "vitest";
import { isPermittedMapsHop } from "./maps-hop-rules";

/* KCDX-019 — the redirect walker's per-hop allowlist.
 *
 * The audit proved this one with a mocked fetch: a permitted `https://goo.gl/…`
 * answered `302 Location: http://169.254.169.254/latest/meta-data/`, and the
 * walker fetched it without revalidating anything. The first case below is that
 * exact URL, and it is the reason this file exists. */
describe("KCDX-019 Maps redirect hop allowlist", () => {
  it("refuses the cloud metadata endpoint from the audit's proof", () => {
    expect(isPermittedMapsHop("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isPermittedMapsHop("https://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("refuses private and loopback addresses in every notation", () => {
    for (const u of [
      "https://127.0.0.1/",
      "https://10.0.0.1/",
      "https://192.168.1.1/",
      "https://172.16.0.1/",
      "https://[::1]/",
      "https://[fd00::1]/",
      "https://2130706433/",          // 127.0.0.1 as a decimal integer
      "https://0177.0.0.1/",          // octal
    ]) {
      expect(isPermittedMapsHop(u), u).toBe(false);
    }
  });

  it("refuses non-https schemes", () => {
    for (const u of ["http://goo.gl/x", "file:///etc/passwd", "gopher://goo.gl/x", "ftp://goo.gl/x"]) {
      expect(isPermittedMapsHop(u), u).toBe(false);
    }
  });

  it("refuses hosts that only look like Google", () => {
    for (const u of [
      "https://google.com.evil.example/maps",
      "https://evil.example/google.com",
      "https://notgoogle.com/maps",
      "https://maps.google.com.attacker.test/",
      "https://google.com@evil.example/",   // userinfo trick
      "https://goo.gl.evil.example/",
    ]) {
      expect(isPermittedMapsHop(u), u).toBe(false);
    }
  });

  it("refuses non-443 ports even on a permitted host", () => {
    expect(isPermittedMapsHop("https://goo.gl:8080/x")).toBe(false);
    expect(isPermittedMapsHop("https://www.google.com:22/maps")).toBe(false);
  });

  it("permits the hosts the chain legitimately traverses", () => {
    for (const u of [
      "https://goo.gl/maps/abc",
      "https://maps.app.goo.gl/abc",
      "https://g.co/kgs/abc",
      "https://www.google.com/maps/place/Some+Court/@34.0,-118.4,17z",
      "https://maps.google.com/maps?q=x",
      "https://consent.google.com/m?continue=https://maps.google.com",
      "https://www.google.co.uk/maps/place/x",
      "https://www.google.com.br/maps/place/x",
    ]) {
      expect(isPermittedMapsHop(u), u).toBe(true);
    }
  });

  it("refuses garbage rather than throwing", () => {
    for (const u of ["", "not a url", "///", "https://"]) {
      expect(isPermittedMapsHop(u), u).toBe(false);
    }
  });
});
