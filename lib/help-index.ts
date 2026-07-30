// lib/help-index.ts — curated how-to index for the AI search's help tool.
// Static and hand-written on purpose: guidance never leaks data, links are
// known-good, and the model can only echo these entries.

export type HelpEntry = { title: string; href: string; keywords: string[]; steps: string[] };

export const HELP_INDEX: HelpEntry[] = [
  {
    title: "Change your profile photo",
    href: "/settings/profile",
    keywords: ["photo", "picture", "avatar", "image"],
    steps: ["Open Settings → Profile.", "Tap your current photo.", "Choose a new image and crop it.", "Save — it updates everywhere immediately."],
  },
  {
    title: "Create a team",
    href: "/teams",
    keywords: ["create team", "new team", "start a team", "make a team"],
    steps: ["Go to Teams.", "Choose Create team.", "Pick the sport, name it, and set your area.", "Invite players from your network or share the join link."],
  },
  {
    title: "Start a Live Queue at the court",
    href: "/queue/new",
    keywords: ["live queue", "queue", "courtside", "session"],
    steps: ["Open Live Queue → New session.", "Pick the sport and, optionally, link the real court/venue.", "Share the code or QR with players at the court.", "Run games — the queue rotates winners automatically."],
  },
  {
    title: "Verify your identity",
    href: "/settings/verification",
    keywords: ["verify", "verification", "identity", "badge"],
    steps: ["Open Settings → Verification.", "Follow the steps on this device, or use the QR to continue on your phone.", "Once approved, the verified badge shows on your profile."],
  },
  {
    title: "Organize an event",
    href: "/events",
    keywords: ["create event", "organize", "host", "new event"],
    steps: ["Go to Events → Create.", "Set sport, date, capacity, and location (paste a Google Maps link for an exact pin).", "Publish — players nearby can find and join it."],
  },
  {
    title: "Change who can invite you to matches",
    href: "/settings",
    keywords: ["invites", "privacy", "who can invite", "open to invites"],
    steps: ["Open Settings.", "Find Match invites.", "Toggle whether you're open to invites — off means pickers and challenges can't target you."],
  },
  {
    title: "List something on the Marketplace",
    href: "/marketplace",
    keywords: ["sell", "list", "marketplace", "listing", "gear"],
    steps: ["Open Marketplace.", "Choose Create listing.", "Add photos, price, and details.", "Publish — buyers message you in Klimr chat."],
  },
  {
    title: "Report a court that's wrong or closed",
    href: "/courts",
    keywords: ["report court", "wrong court", "closed court"],
    steps: ["Open the court's page from Courts.", "Use Report at the bottom.", "Tell us what's wrong — a Klimr admin reviews every report."],
  },
];
