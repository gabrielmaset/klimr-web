export const PRESENCE_MODES = ["auto", "online", "away", "offline"] as const;
export type PresenceMode = (typeof PRESENCE_MODES)[number];
