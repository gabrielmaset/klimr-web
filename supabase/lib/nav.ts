import {
  Newspaper, Swords, Trophy, Flag, Medal, CalendarDays, Contact, Users, Inbox, ListOrdered,
  Radar, MapPin, ShoppingBag, GraduationCap, HeartPulse, Sparkles, BookOpen,
  type LucideIcon,
} from "lucide-react";

/** The one nav structure — the desktop rail and the mobile drawer both render
 *  from this, so the two menus can never drift apart. */
export type NavItem = { href: string; label: string; Icon: LucideIcon };

export const NAV_GROUPS: { header?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/feed", label: "Feed", Icon: Newspaper },
      { href: "/play", label: "Play", Icon: Swords },
      { href: "/queue", label: "Live Queue", Icon: ListOrdered },
      { href: "/rankings", label: "Rankings", Icon: Trophy },
    ],
  },
  {
    header: "Compete",
    items: [
      { href: "/challenges", label: "Challenges", Icon: Flag },
      { href: "/tournaments", label: "Tournaments", Icon: Medal },
      { href: "/events", label: "Events", Icon: CalendarDays },
    ],
  },
  {
    header: "Community",
    items: [
      { href: "/network", label: "Network", Icon: Contact },
      { href: "/teams", label: "Teams", Icon: Users },
      { href: "/invites", label: "Invites", Icon: Inbox },
    ],
  },
  {
    header: "Discover",
    items: [
      { href: "/discover", label: "Players", Icon: Radar },
      { href: "/courts", label: "Courts", Icon: MapPin },
      { href: "/marketplace", label: "Marketplace", Icon: ShoppingBag },
      { href: "/classes", label: "Classes & Coaching", Icon: GraduationCap },
      { href: "/health", label: "Health & Nutrition", Icon: HeartPulse },
      { href: "/sponsorships", label: "Sponsorships", Icon: Sparkles },
      { href: "/resources", label: "Playbook", Icon: BookOpen },
    ],
  },
];

/** Viewer signals used to order navigation (K3-03, audit UX-006). */
export type NavRoleContext = {
  isAdmin: boolean;
  isOrganizer: boolean;
  isBusinessManager: boolean;
  hasTeams: boolean;
};

/** Order the themed nav groups by what this viewer actually does.
 *
 *  Decision D3 (revised) forbids HIDING modules — every surface stays live and
 *  reachable for everyone. So role awareness expresses itself as ORDER, not
 *  visibility: an organizer meets Compete first, a business manager meets
 *  Discover first, a team player meets Community first. Same 17 destinations,
 *  same groups, nothing removed — the one a given person reaches for is simply
 *  nearer the top.
 *
 *  The always-on group (Feed / Play / Live Queue / Rankings) never moves: it is
 *  the product's spine and muscle memory matters more than relevance there.
 *
 *  Pure and unit-tested, because "which nav do I see" is exactly the kind of
 *  thing that quietly drifts once it depends on four booleans. */
export function navGroupsFor(ctx: NavRoleContext): typeof NAV_GROUPS {
  const pinned = NAV_GROUPS.filter((g) => !g.header);
  const themed = NAV_GROUPS.filter((g) => g.header);

  const priority = (header: string): number => {
    if (ctx.isOrganizer) {
      if (header === "Compete") return 0;
      if (header === "Community") return 1;
      return 2;
    }
    if (ctx.isBusinessManager) {
      if (header === "Discover") return 0;
      if (header === "Compete") return 1;
      return 2;
    }
    if (ctx.hasTeams) {
      if (header === "Community") return 0;
      if (header === "Compete") return 1;
      return 2;
    }
    // No signal yet (a brand-new account): keep the designed default order, so
    // the product introduces itself the way it was authored.
    return header === "Compete" ? 0 : header === "Community" ? 1 : 2;
  };

  return [...pinned, ...themed.sort((a, b) => priority(a.header!) - priority(b.header!))];
}
