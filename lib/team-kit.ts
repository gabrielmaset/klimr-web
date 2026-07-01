// Every team gets a stable "club kit": a colour identity derived deterministically from its
// name, so each team reads like its own franchise (jersey colours) rather than a generic card.
// Pure string hash — no randomness — so the same team always renders the same kit.

export type TeamKit = {
  hue: number;
  primary: string; // rich mid-tone, holds white text
  deep: string; // dark shade for gradient depth
  bright: string; // lighter accent for the sash / highlights
  glow: string; // translucent halo
};

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function teamKit(name: string): TeamKit {
  const hue = hashHue(name.trim() || "team");
  // Nudge muddy yellow-greens (70–150) a touch cooler so text contrast stays strong.
  const h = hue > 70 && hue < 150 ? hue + 40 : hue;
  return {
    hue: h,
    primary: `hsl(${h} 62% 38%)`,
    deep: `hsl(${h} 70% 20%)`,
    bright: `hsl(${(h + 18) % 360} 78% 56%)`,
    glow: `hsla(${(h + 18) % 360} 85% 62% / 0.35)`,
  };
}
