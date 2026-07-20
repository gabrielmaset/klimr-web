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
      { href: "/feed", label: "Home", Icon: Newspaper },
      { href: "/play", label: "Play", Icon: Swords },
      { href: "/q", label: "Live Queue", Icon: ListOrdered },
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
