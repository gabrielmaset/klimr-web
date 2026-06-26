export type SearchResultType = "player" | "court" | "team" | "event";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  avatarUrl?: string | null;
  hue?: number;
};
