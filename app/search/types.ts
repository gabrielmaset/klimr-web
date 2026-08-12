export type SearchResultType = "player" | "court" | "team" | "event" | "tournament" | "listing" | "class" | "business";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  avatarUrl?: string | null;
  hue?: number;
};
