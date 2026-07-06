// Single source of truth for the help center's articles. The help page renders
// and searches this, and the AI support assistant's knowledge base embeds it —
// update an answer here and both surfaces stay in sync.
// Style rule (deliberate): every question reads as the user would ask it, and
// the first sentence of every answer stands alone as a complete answer.

export type HelpArticle = { id: string; q: string; a: string };
export type HelpCategory = {
  key: string;
  name: string;
  blurb: string;
  articles: HelpArticle[];
};

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    key: "getting-started",
    name: "Getting started",
    blurb: "What Klimr is, invites, and signing in",
    articles: [
      {
        id: "what-is-klimr",
        q: "What is Klimr?",
        a: "Klimr is an invite-only, identity-verified social network for racquet and beach sports — tennis, pickleball, padel, racquetball, and beach volleyball. You build a real profile, get ranked in your area, find matches and players near you, join teams, enter tournaments, take classes, and run live court queues. Every member is a verified person, so rankings and matches reflect real play.",
      },
      {
        id: "invite-codes",
        q: "How do invite codes work?",
        a: "Joining Klimr during the beta requires a valid invite code, entered on the entry gate together with your email. Each code has a limited number of uses, and codes can expire once full. If your code doesn't work, double-check the dashes and characters — codes look like XXXX-XXXX-XXXX. Still stuck? Write hello@klimr.com or ask the assistant on this page.",
      },
      {
        id: "existing-account-access",
        q: "I already have an account — how do I get past the invite gate on a new device?",
        a: "Members with an active account can request a one-time access code from the entry gate instead of using an invite code. Enter the email your account uses and we'll send a short-lived access code to it; entering that code opens the gate and takes you to sign-in. If no email arrives within a couple of minutes, check spam and confirm you typed the address your account actually uses.",
      },
      {
        id: "sign-in",
        q: "How do I sign in? (There's no password.)",
        a: "Klimr signs you in with a magic link — enter your email, open the link we send, and confirm the quick two-factor check. The link is single-use and short-lived, and it works even if you open it on a different device than the one you requested it from. If a link says it's already used, request a fresh one; email apps that preview links can sometimes consume them.",
      },
      {
        id: "two-factor",
        q: "How does two-factor authentication (TOTP) work?",
        a: "After your magic link, Klimr asks for a 6-digit code from your authenticator app (like Google Authenticator or 1Password). You set this up once during onboarding by scanning a QR code. If you've lost access to your authenticator, contact support from this page and an admin will help you recover your account after verifying your identity.",
      },
      {
        id: "profile-setup",
        q: "How do I set up my profile and sports?",
        a: "Your profile is your player card: name, photo, home ZIP, bio, and the sports you play. Add or remove sports any time from your profile or settings — each sport you activate gets its own ranking, skill level, and match history. Your home ZIP anchors where your local rankings and nearby matches start.",
      },
    ],
  },
  {
    key: "verification-rankings",
    name: "Verification & rankings",
    blurb: "Verified identity and how points work",
    articles: [
      {
        id: "what-is-verified",
        q: "What does \u201cverified\u201d mean on Klimr?",
        a: "A verified player has confirmed their identity with Klimr. Because everyone here is verified, the people you match with and compete against are real — that's what keeps leaderboards honest. Verification status shows on your profile, and some features (like organizing certain events) may require it.",
      },
      {
        id: "ranking-points",
        q: "How do ranking points work?",
        a: "Only verified matches count toward your ranking. A match verifies when both players confirm the result and Klimr confirms you were at the same court; until then, points are held as pending. If a match can't be verified — no confirmation, or locations don't line up — the points don't count. No rank without actually playing.",
      },
      {
        id: "geo-levels",
        q: "What are the geographic ranking levels?",
        a: "You're ranked per sport at every level of geography: ZIP, neighborhood, city, state, national, and world. Rankings start at your home ZIP, so your local board fills in first and widens as more players join around you.",
      },
      {
        id: "pending-points",
        q: "Why are my points still pending?",
        a: "Points stay pending until the match fully verifies — both players confirming the result is the usual missing step. Nudge your opponent to confirm from their match card. If they never confirm, the match simply won't count; pending points that can't verify eventually expire rather than convert.",
      },
      {
        id: "skill-levels",
        q: "How do skill levels work per sport?",
        a: "Each sport on your profile carries its own skill level, which you set when activating the sport and can adjust as you improve. Skill level helps matching — organizers and open matches can aim for compatible players — while your ranking reflects verified results.",
      },
    ],
  },
  {
    key: "matches-play",
    name: "Matches & play",
    blurb: "Finding games, organizing, confirming results",
    articles: [
      {
        id: "find-match",
        q: "How do I find a match?",
        a: "Open Play lists open matches near you that still need players. Filter by sport, see who's organizing and how many spots are left, and tap any match to request a spot. You can also organize your own match and let verified players nearby fill it.",
      },
      {
        id: "organize-match",
        q: "How do I organize a match (including recurring ones)?",
        a: "Tap Organize from Play, pick the sport, format, court, and time, and publish — nearby players can then request spots. You can mark a match as repeating weekly, every two weeks, or monthly. As organizer you approve requests and confirm the final result.",
      },
      {
        id: "confirm-results",
        q: "How do I confirm a match result?",
        a: "After a match, the reported result appears on your match card for confirmation. Both players confirming is what verifies the match and releases ranking points. If a result was entered wrong, dispute it from the same card instead of confirming.",
      },
      {
        id: "match-chat",
        q: "Where do I talk to my match group?",
        a: "Every match has its own chat room, available from the match card under Chats. Use it to coordinate time changes, court details, or who brings balls. Chats stay available after the match ends.",
      },
    ],
  },
  {
    key: "live-queue",
    name: "Live queue",
    blurb: "Running courts with live rotation",
    articles: [
      {
        id: "what-is-queue",
        q: "What is the live queue?",
        a: "The live queue runs open-court rotation digitally: players join a session from their phone, teams form, and the queue advances as matches finish — no more paper lists or shouting \u201cwho's next.\u201d Organizers start a session for a court or event; a big courtside display shows who's up.",
      },
      {
        id: "join-queue",
        q: "How do I join a live queue?",
        a: "Scan the session's QR code or enter its short code from the Play area, then join solo or with a partner. If the organizer enabled location checks, you'll need to be at the court to join. Sessions can also require organizer approval or be limited to an event's attendees.",
      },
      {
        id: "queue-turns",
        q: "How do turns and matches work in the queue?",
        a: "The queue orders teams and starts the next match automatically as courts free up. Winners can stay on depending on the session's win cap; the organizer can also pause the whole session (joins and new matches hold) or turn it off, which resets the queue. Watch the courtside display or your phone to see when you're up.",
      },
      {
        id: "courtside-display",
        q: "What is the courtside display?",
        a: "The courtside display is a full-screen view of the live queue made for a tablet or TV at the court — current matches, who's next, and the session code for joining. Organizers open it from the session's manage page.",
      },
    ],
  },
  {
    key: "teams",
    name: "Teams",
    blurb: "Clubs, rosters, and team matches",
    articles: [
      {
        id: "how-teams-work",
        q: "How do teams work?",
        a: "A verified player creates a team and becomes its owner, then organizes it like a real club — owner, manager, staff, and members, including captains, co-captains, and subs. Every team gets a unique generated kit and crest. Only verified players can join, so rosters carry the same identity guarantee as matches.",
      },
      {
        id: "add-team-players",
        q: "How do I add players to my team?",
        a: "You add players you're connected with on Klimr. Connections are mutual and require approval, which prevents random or unwanted team invites. Manage your roster and roles from the team's page.",
      },
      {
        id: "team-matches",
        q: "Can teams play matches against other teams?",
        a: "Yes — teams can record team matches against other teams, and results show on both teams' pages with the scoreboard treatment. Team matches follow the same confirm-to-verify principle as player matches.",
      },
    ],
  },
  {
    key: "events-classes",
    name: "Events & classes",
    blurb: "Social events, classes, and pros",
    articles: [
      {
        id: "event-types",
        q: "What kinds of events can I create or join?",
        a: "Events cover organized play beyond a single match — socials, clinics, meetups, round robins, and sport-specific formats; each sport offers its own relevant event types with plain-language explanations when creating. Events have a public page with details, attendees, and registration.",
      },
      {
        id: "classes",
        q: "How do classes work?",
        a: "Classes are recurring or one-off instruction listed by approved providers — coaches, instructors, and academies. Browse classes near you from Discover, see the provider's verified professional status, and sign up from the class page.",
      },
      {
        id: "become-provider",
        q: "How do I become a coach or class provider on Klimr?",
        a: "Apply for professional status from Settings → Professional status: pick your role (like coach or instructor), add your credentials, and submit. An admin reviews applications against the issuing body's registry before approving. Once approved, you can list classes and appear as a professional.",
      },
      {
        id: "cancel-event",
        q: "I cancelled an event by mistake — can I get it back?",
        a: "Yes — cancelled or deleted events, tournaments, and teams can be recovered for 90 days. Open your Archive page, find the item, and restore it; after 90 days it's archived for good. Cancelling always asks you to type a confirmation, so it can't happen with a stray tap.",
      },
    ],
  },
  {
    key: "tournaments",
    name: "Tournaments",
    blurb: "Registering, paying, draws, and results",
    articles: [
      {
        id: "tournament-register",
        q: "How do I register for a tournament?",
        a: "Open the tournament's public page and tap Sign up — individual events register you directly, and team events walk you through entering your team and roster. Team entries may need each teammate to confirm their spot from their own account. Your entry and payment status always show at the top of the tournament page once you're in.",
      },
      {
        id: "divisions-fees",
        q: "How do divisions and fees work?",
        a: "Tournaments are organized into divisions (like Competitive or Social tiers), each with its own entry fee — charged per player or per team depending on the event. You pick your division during signup. The tournament page lists every division's fee and any notes from the organizer.",
      },
      {
        id: "payment-proof",
        q: "How do I pay my tournament entry fee?",
        a: "Organizers currently collect payment outside Klimr (like Venmo or Zelle) and you upload proof of payment on the tournament page after registering. The organizer reviews it and confirms; if it's declined you'll see the reason and can resubmit. Your payment status shows as pending, submitted, confirmed, or denied.",
      },
      {
        id: "waitlist",
        q: "The tournament is sold out — what does the waitlist do?",
        a: "Joining the waitlist puts your completed entry in line for any spot that opens. If the organizer accepts your entry off the waitlist, you'll be notified and just need to submit payment to lock it in. Waitlist position doesn't require payment up front.",
      },
      {
        id: "draws",
        q: "How are tournament draws made?",
        a: "Pools are drawn completely at random, and every draw is logged on the tournament's public page for transparency — including redraws. Once the organizer publishes the schedule and results, you'll see your matches, standings, and bracket right on the tournament page.",
      },
      {
        id: "tournament-cancelled",
        q: "A tournament I registered for was cancelled — what happens?",
        a: "When an organizer cancels a tournament, sign-ups close and a notice appears on its page. Refunds for fees paid outside Klimr are handled by the organizer — reach out to them directly. Organizers can also recover a cancelled tournament within 90 days, in which case entries come back with it.",
      },
    ],
  },
  {
    key: "courts",
    name: "Courts",
    blurb: "Finding places to play",
    articles: [
      {
        id: "court-data",
        q: "Where does court information come from?",
        a: "Klimr keeps a catalog of places to play, built from a public directory and from courts players add. Court reviews come only from verified players who checked in and played there — real signal, no drive-by complaints. Each court page links straight to directions.",
      },
      {
        id: "add-court",
        q: "Can I add a missing court?",
        a: "Yes — from the Courts explorer you can submit a court that's missing, with its location and details. Submissions are reviewed to keep the catalog accurate.",
      },
    ],
  },
  {
    key: "marketplace-sponsorships",
    name: "Marketplace & sponsorships",
    blurb: "Gear, services, and local sponsors",
    articles: [
      {
        id: "marketplace",
        q: "What is the marketplace?",
        a: "The marketplace is where players and providers list gear and services — from rackets to stringing to lessons. Listings come from verified members. Payments happen between you and the seller during the beta.",
      },
      {
        id: "sponsorships",
        q: "How do sponsorships work?",
        a: "Local businesses and brands can sponsor players, courts, and challenges in their area. Sponsorships show up as clearly labeled placements. If you're a business interested in sponsoring, reach out via hello@klimr.com.",
      },
    ],
  },
  {
    key: "account-privacy",
    name: "Account, privacy & safety",
    blurb: "Your data, blocking, and account recovery",
    articles: [
      {
        id: "block-report",
        q: "How do I block or report someone?",
        a: "Block a player from their profile — blocking hides them from your feed and stops them from inviting you. To report behavior, use the report option or contact support from this page; our team reviews every report. For anything urgent or a safety concern, say so explicitly so it's prioritized.",
      },
      {
        id: "data-rights",
        q: "How do I download or delete my data?",
        a: "From Settings → Data & account you can download a JSON copy of your profile, sports, posts, and settings, or delete your account. Deletion is permanent after the recovery window. See the Privacy policy for full details on how your data is handled.",
      },
      {
        id: "archive-recovery",
        q: "What is the Archive page?",
        a: "Your Archive collects events, classes, and tournaments you organized or joined that ended, were cancelled, or were deleted. Cancelled and deleted items you own can be recovered there for 90 days.",
      },
      {
        id: "notifications",
        q: "How do notifications work?",
        a: "Klimr notifies you in-app about match invites, confirmations, ranking changes, and important account events — the bell shows what's new. Transactional emails (like magic links and access codes) come from notifications.klimr.com; add it to your contacts if they land in spam.",
      },
      {
        id: "change-email",
        q: "Can I change the email on my account?",
        a: "Email changes are handled by support during the beta to protect account security. Contact support from this page with the email you'd like to switch to, and we'll verify it's really you before making the change.",
      },
    ],
  },
];

/** Quick-access chips under the help search — the questions people actually ask most. */
export const POPULAR_ARTICLE_IDS = [
  "invite-codes",
  "sign-in",
  "ranking-points",
  "payment-proof",
  "join-queue",
  "cancel-event",
];

export function findArticle(id: string): { cat: HelpCategory; article: HelpArticle } | null {
  for (const cat of HELP_CATEGORIES) {
    const article = cat.articles.find((a) => a.id === id);
    if (article) return { cat, article };
  }
  return null;
}
