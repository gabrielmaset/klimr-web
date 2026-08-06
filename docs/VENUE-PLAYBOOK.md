# Klimr Venue Playbook — Installation, Replacement & Support

**Status:** Active · Owner: Gabriel Duran · Updated August 2026 · K2-05 (audit PROD-005)

How a courtside display gets installed at a partner venue, kept running, and
replaced when it breaks. Written for the person physically standing at the
court — during the pilot, that is Gabriel.

Companion documents: `RUNBOOKS.md` (what to do when something breaks mid-play)
and `/admin/devices` (which units are up right now).

---

## 1. Before you go — the pre-visit checklist

**Confirm with the venue contact:**
- Where the display will physically live, and whether that spot has power.
- Who at the venue can restart it when Klimr isn't there (name + phone).
- Whether their Wi-Fi is guest or private, and who holds the password.
- Which sports run open play there, and on which days.

**Bring:** the iPad, its charger and a long cable, the mount or stand, a
printed QR card as backup, and a second charged device (your phone) to run the
organizer console.

**Set up in the app before arriving:** create the venue's session so you're not
configuring in front of waiting players.

---

## 2. Installation

1. **Power first.** Mount within reach of a permanent outlet. A display on
   battery becomes a support ticket within a week. If no outlet is reachable,
   the venue is not ready — solve power before installing.
2. **Network.** Join the venue Wi-Fi and confirm it survives a device sleep.
   Guest networks that force a captive-portal re-login every few hours are the
   single most common failure — if that's the situation, ask for a private SSID
   or a device exemption.
3. **Launch and register.** Open the courtside app. It mints an **install id**
   on first run and begins heartbeating.
4. **Name it immediately** in `/admin/devices`: device name, venue, and a note
   with the mount location and the venue contact. An unnamed device is
   unidentifiable in six months.
5. **Verify the loop end to end** before you leave: scan the walk-up QR with
   your own phone, join the queue, and confirm you appear on the display.
   Untested installs fail on their first busy night.
6. **Brief the venue contact** in person: how to restart the app, how to reach
   you, and the standing rule that **paper is always an acceptable fallback**.
7. **Leave the QR card** at the desk as a backup entry path.

---

## 3. Daily operations

- **Check `/admin/devices` before peak hours.** A unit that hasn't beaten in 15
  minutes shows as **NOT SEEN**. That is your early warning — call the venue
  before players arrive, not after.
- **Watch for STALE BUILD.** A venue running an older build may be hitting a
  bug you already fixed. Update it on the next visit, sooner if the fix matters.
- **Battery readings that never reach 100%** mean the cable or outlet is failing.
  Replace the cable before it becomes an outage.

---

## 4. Replacement

When a unit is lost, stolen, or dead:
1. **Retire it** in `/admin/devices` — this is reversible, so retire on
   suspicion rather than waiting for certainty.
2. **Install the replacement** using section 2. It mints a fresh install id;
   name it with the same venue so history stays readable.
3. **Do not reuse the old install id.** Identity is per-install by design; a
   fresh id keeps device history honest.
4. If the unit may have been stolen, note it and rely on the fact that **the
   install id authorizes nothing** — no account, no admin access, no player
   data beyond what the public walk-up page already shows.

---

## 5. Support requests from venues

**Triage order — restore play first, diagnose second.**

| Venue reports | First response |
|---|---|
| "Screen is frozen / blank" | Hard-restart the app, then the iPad. Check `/admin/devices` for last-seen. |
| "Players can't join" | Verify the join code on screen matches the session. If not, the session was reset — re-enter the current code. |
| "It's showing the wrong game" | Organizer console → correct the court state. The display follows within seconds. |
| "Wi-Fi keeps dropping" | Captive portal is the usual cause; escalate to the venue for a private SSID. |
| Anything unresolved in 5 minutes | **Switch to paper.** Log results afterward. |

Full diagnostic procedures live in `RUNBOOKS.md` (Runbook 1: queue stuck).

---

## 6. When the fleet outgrows the pilot

The current model assumes one person knows every device. Past roughly ten
venues, add:
- **Scheduled build rollouts** rather than opportunistic in-person updates.
- **A venue owner per site** — a named venue-side person responsible for
  restarts, so not every issue routes to Klimr.
- **Alerting on NOT SEEN**, rather than relying on someone remembering to check
  the console.
- **Per-venue uptime reporting** (see `METRICS.md` → venue uptime), which is
  also what a venue will ask for when renewal comes up.
