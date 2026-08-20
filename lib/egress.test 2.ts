import { describe, it, expect } from "vitest";
import { isBlockedAddress } from "./egress-rules";

/* KCDX-019 — connect-time egress control.
 *
 * The allowlist in maps-url answers "is this a host we should be calling?".
 * This answers the other question: "wherever that name points, is it on the
 * public internet?" — evaluated inside the DNS lookup the socket uses, which is
 * what makes DNS rebinding a non-event rather than a race.
 *
 * Vercel's egress policy controls are Enterprise-only, so this is the control.
 * It is worth testing like one. */
describe("KCDX-019 egress address classifier", () => {
  it("blocks cloud metadata endpoints", () => {
    for (const ip of ["169.254.169.254", "169.254.170.2", "fd00:ec2::254"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("blocks loopback and every RFC1918 range", () => {
    for (const ip of [
      "127.0.0.1", "127.255.255.255", "0.0.0.0",
      "10.0.0.1", "10.255.255.254",
      "172.16.0.1", "172.31.255.254",
      "192.168.0.1", "192.168.255.254",
      "100.64.0.1",          // CGNAT — private on plenty of hosts
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("does NOT block public addresses that merely look adjacent to private ones", () => {
    for (const ip of [
      "172.15.255.255",   // just below 172.16/12
      "172.32.0.1",       // just above 172.31/12
      "11.0.0.1",         // just above 10/8
      "9.255.255.255",    // just below 10/8
      "100.63.255.255",   // just below CGNAT
      "100.128.0.1",      // just above CGNAT
      "8.8.8.8",
      "142.250.72.196",   // a real google.com address
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("blocks IPv6 loopback, unique-local, link-local and multicast", () => {
    for (const ip of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("blocks private IPv4 smuggled inside IPv6", () => {
    for (const ip of ["::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::169.254.169.254", "::ffff:10.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("permits public IPv6", () => {
    expect(isBlockedAddress("2607:f8b0:4004:c07::71")).toBe(false);
  });

  it("blocks anything it cannot classify — an address we cannot read is not one to dial", () => {
    for (const s of ["", "not-an-ip", "999.999.999.999", "10.0.0", "::gggg", "127.0.0.1.5"]) {
      expect(isBlockedAddress(s), s).toBe(true);
    }
  });

  it("blocks multicast and reserved IPv4 space", () => {
    for (const ip of ["224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });
});
