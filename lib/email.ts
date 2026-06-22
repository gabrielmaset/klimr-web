import "server-only";

const FROM_DEFAULT = "Klimr <hello@notifications.klimr.com>";
const REPLY_TO_DEFAULT = "hello@klimr.com";

/** Send one transactional email via Resend. Returns false (and logs) on any failure
 *  so callers can fire-and-forget without ever breaking the user's request. */
export async function sendEmail(opts: { to: string; subject: string; html: string; from?: string; replyTo?: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not set");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: opts.from ?? FROM_DEFAULT,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        reply_to: opts.replyTo ?? REPLY_TO_DEFAULT,
      }),
    });
    if (!res.ok) {
      console.error("[email] send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] threw", e);
    return false;
  }
}
