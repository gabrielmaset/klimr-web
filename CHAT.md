# Klimr — encrypted match chat

One end-to-end encrypted group chat per match, ephemeral (closes **24h after the
match start**), with quick-replies — mirroring the phone demo. The app is **18+
only** for now, which is part of why end-to-end encryption is acceptable here.
Chat is **multi-device**: a user can read and send from several devices (e.g. the
web app and the future native phone app), and messages sync across them.

## How it works

- **Identity keys (per device).** On first use, each device generates an **ECDH
  P-256** keypair (`lib/crypto/e2ee.ts`) and a stable device id. The private key is
  stored **non-extractable** in IndexedDB and never leaves the browser. The public
  key (base64 SPKI) is registered per device in `user_keys` — so one user can have a
  phone key and a web key at the same time.
- **Conversation key.** The first participant to open a match's chat creates the
  `conversations` row and generates a random **AES-GCM 256** conversation key.
- **Key distribution (wrapping), per device.** The conversation key is encrypted
  ("wrapped") once for **each device of each participant**, using an ECDH shared
  secret between the wrapper's private key and that device's public key, and stored
  in `conversation_keys` keyed by (conversation, recipient, recipient_device). Every
  device unwraps it with its own private key.
- **Messages.** Each message is AES-GCM encrypted with the conversation key (random
  96-bit IV) and stored as ciphertext + IV in `messages`. Decryption happens only
  in the browser. Because all of a user's devices hold the same conversation key, a
  message sent from one device is readable on the others.
- **Self-heal.** Whenever a device that holds the key opens the chat, it wraps the
  key for any participant device that has registered a public key but doesn't yet
  have a wrapped key row (covers new devices, late joiners, waitlist promotions). A
  device that's still waiting polls and becomes ready automatically once wrapped.

## What the server can and cannot see

- **Cannot see:** message contents, private keys, the conversation key.
- **Can see (metadata):** who is in each chat, when messages are sent, message
  sizes, and which match a chat belongs to. E2EE hides contents, not metadata.

## Honest tradeoffs (by design)

- **No forward secrecy.** One conversation key per chat; if it leaks, all of that
  chat's messages are exposed. Ephemeral expiry limits the window.
- **Multi-device** is supported via per-device key wrapping (above). A newly added
  device can read **history** only after a device that holds the key opens the chat
  once and wraps the key for it; this happens automatically within seconds, but a
  device that has never been wrapped (e.g. nobody with the key has opened the chat
  since it registered) will show a brief "securing this chat" state.
- **Native phone app interop.** The phone app must implement this same scheme
  (ECDH P-256 identity per device, AES-GCM conversation key, per-device wrapping)
  against the same tables. Then a message sent on the phone is readable on the web
  and vice-versa. The web client and database are already built for this.
- **Key loss.** Losing a device's browser storage loses that device's key. Other
  devices are unaffected; that device re-registers and gets re-wrapped on next open.
  If a user loses *all* devices, their messages are unrecoverable — by design.
- **Report-only moderation.** Because the server can't read chat, automated abuse/
  CSAM screening can't run on chat the way it does on the feed. Safety is **report-
  only**: a participant must flag a message for a human to review it. CSAM reporting
  obligations still apply to anything reported — keep the reporting pipeline.
- **Web caveat.** Browser E2EE protects against passive server/database compromise,
  but a server actively serving malicious JS could exfiltrate keys. Native apps with
  verifiable builds are stronger.

## Database (migration `0011_chat.sql`)

`user_keys` (per-device public keys) · `conversations` (one per match) ·
`conversation_keys` (per-recipient-device wrapped keys) · `messages` (ciphertext).
RLS limits every table to match participants via the security-definer helpers
`is_match_participant` and `is_conversation_participant` (avoids RLS recursion).

## TODO before/after launch

- [ ] **Expiry cleanup job** — a scheduled task (Supabase cron / edge function) to
      delete expired conversations + their keys + messages, for true ephemerality.
- [ ] **Register device keys at sign-in** (not just on first chat open) so every
      device is immediately keyable and the "securing this chat" wait-state is rare.
- [ ] **Report-a-message** UI in the chat → reuses the existing `reports` /
      `safety_incidents` pipeline (the reporter's client attaches the plaintext).
- [ ] **Realtime** — currently polls every 4s; swap to Supabase Realtime on
      `messages` if desired.
- [ ] **Native phone app** must implement the same crypto scheme against these
      tables for phone↔web message sync.

## Testing (must be done in a real browser — crypto can't run in the build container)

1. Run migrations `0009 → 0010 → 0011`.
2. Open a match you're in → **Match chat**, in two contexts at once: either two
   different participants of the match, or the **same user on two devices** (e.g.
   laptop + phone browser) to verify multi-device sync.
3. Send messages; confirm they appear and read correctly across devices.
4. In Supabase, inspect the `messages` table — you should see only ciphertext.
