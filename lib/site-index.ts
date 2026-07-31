// lib/site-index.ts — the navigational map of EVERY user-facing page.
//
// Purpose: the AI search must be able to answer "where do I…" for any
// surface — including pages with no data adapter yet. Adding a future page
// to Klimr = adding one line here (and, if its data should be searchable, a
// registry entry). Static and hand-written: links are known-good and can
// never leak data.

export type PageSection = "primary" | "compete" | "community" | "discover" | "account";
export type SiteEntry = { title: string; href: string; keywords: string[]; description: string; section: PageSection };

export const SITE_INDEX: SiteEntry[] = [
  { title: "Home", href: "/", keywords: ["home", "dashboard", "start"], description: "Your Klimr home — standing, matches, around you.", section: "primary" },
  { title: "Play", href: "/play", keywords: ["play", "find match", "players", "matchmaking"], description: "Find a match and browse players near you.", section: "primary" },
  { title: "Live Queue", href: "/queue", keywords: ["live queue", "courtside", "session", "queue"], description: "Run or join a courtside rotation queue.", section: "primary" },
  { title: "Rankings", href: "/rankings", keywords: ["rankings", "leaderboard", "ladder", "standings"], description: "ZIP-to-world leaderboards for every sport.", section: "primary" },
  { title: "Challenges", href: "/challenges", keywords: ["challenges", "region", "zip vs zip"], description: "Region-vs-region sport challenges.", section: "compete" },
  { title: "Tournaments", href: "/tournaments", keywords: ["tournaments", "brackets", "compete"], description: "Find and organize tournaments.", section: "compete" },
  { title: "Events", href: "/events", keywords: ["events", "meetups", "open play"], description: "Sport events and open-play sessions near you.", section: "compete" },
  { title: "Calendar", href: "/calendar", keywords: ["calendar", "schedule", "upcoming"], description: "Everything you've joined, on one calendar.", section: "account" },
  { title: "Feed", href: "/feed", keywords: ["feed", "posts", "highlights", "social"], description: "The Klimr social feed.", section: "primary" },
  { title: "Network", href: "/network", keywords: ["network", "connections", "friends", "followers"], description: "Your connections and people you may know.", section: "community" },
  { title: "Teams", href: "/teams", keywords: ["teams", "create team", "roster"], description: "Browse, join, and create teams.", section: "community" },
  { title: "Invites", href: "/invites", keywords: ["invites", "pending", "requests"], description: "Match and team invites waiting on you.", section: "community" },
  { title: "Chats", href: "/chats", keywords: ["chats", "messages", "dm", "inbox"], description: "Your conversations.", section: "community" },
  { title: "Players", href: "/play", keywords: ["players", "find player", "partner"], description: "Discover players by sport and area.", section: "primary" },
  { title: "Courts", href: "/courts", keywords: ["courts", "where to play", "map", "venues"], description: "The court finder — real, screened places to play.", section: "discover" },
  { title: "Marketplace", href: "/marketplace", keywords: ["marketplace", "buy", "sell", "gear", "racquet", "equipment"], description: "Buy and sell gear with Klimr players.", section: "discover" },
  { title: "Classes & Coaching", href: "/classes", keywords: ["classes", "coaching", "lessons", "instructor", "coach"], description: "Classes and verified coaches.", section: "discover" },
  { title: "Health & Nutrition", href: "/health", keywords: ["health", "nutrition", "nutritionist", "wellness", "injury", "recovery", "massage"], description: "Health and nutrition resources and verified providers.", section: "discover" },
  { title: "Sponsorships", href: "/sponsorships", keywords: ["sponsorships", "sponsor", "sponsored", "brand deals"], description: "Sponsorships connecting businesses with players, teams, and tournaments.", section: "discover" },
  { title: "Playbook", href: "/resources", keywords: ["playbook", "resources", "guides", "tips", "drills", "instructions", "how to play"], description: "Guides, drills, and sport instruction resources.", section: "discover" },
  { title: "Notifications", href: "/notifications", keywords: ["notifications", "alerts", "activity"], description: "Your notification center.", section: "account" },
  { title: "My profile", href: "/me", keywords: ["my profile", "profile", "stats", "ladder"], description: "Your public profile, ladder, and stats.", section: "account" },
  { title: "Settings", href: "/settings", keywords: ["settings", "account", "preferences", "privacy"], description: "Account settings and privacy controls.", section: "account" },
  { title: "Settings · Profile", href: "/settings/profile", keywords: ["edit profile", "photo", "bio", "name"], description: "Edit your name, photo, bio, and details.", section: "account" },
  { title: "Settings · Verification", href: "/settings/verification", keywords: ["verify", "verification", "identity", "badge"], description: "Verify your identity for the badge.", section: "account" },
  { title: "Settings · Availability", href: "/settings/availability", keywords: ["availability", "when i play", "schedule"], description: "Your weekly play availability.", section: "account" },
  { title: "Support", href: "/support", keywords: ["support", "help", "contact", "problem", "bug"], description: "Get help from the Klimr team.", section: "account" },
  { title: "Help center", href: "/help", keywords: ["help", "faq", "guide"], description: "Help articles and FAQs.", section: "account" },
  { title: "Community guidelines", href: "/guidelines", keywords: ["guidelines", "rules", "conduct"], description: "Klimr's community guidelines.", section: "account" },
  { title: "Business", href: "/business", keywords: ["business", "company", "brand", "sponsor as business"], description: "Klimr for businesses — pages and sponsorships.", section: "discover" },
];

export function findPages(query: string, limit = 5): SiteEntry[] {
  const q = query.toLowerCase();
  const scored = SITE_INDEX.map((e) => {
    let s = 0;
    if (e.title.toLowerCase().includes(q)) s += 3;
    for (const k of e.keywords) if (q.includes(k) || k.includes(q)) s += 2;
    if (e.description.toLowerCase().includes(q)) s += 1;
    return { e, s };
  })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.e);
}
