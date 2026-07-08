import { SPORT_TONES } from "@/components/sport-chip";
import { sportSlug } from "@/lib/sports";

/** Labeled, to-scale schematic court diagrams for the Playbook (Daylight style:
 *  paper ground, ink lines, sport-tone accents, mono labels). Pure SVG. */

const INK = "#201B12";
const LINE = { stroke: INK, strokeWidth: 2, fill: "none" } as const;
const THIN = { stroke: INK, strokeWidth: 1.2, fill: "none" } as const;
const label = { fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".14em", fill: "#8A8069" } as const;

function Dim({ x, y, children, anchor = "middle" }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={label}>
      {children}
    </text>
  );
}

export function CourtDiagram({ sport }: { sport: string }) {
  const slug = sportSlug(sport);
  const tone = SPORT_TONES[slug] ?? { fg: "#C2410C", bg: "#FEF0E4", bd: "#F9DAC0" };

  if (slug === "tennis") {
    // 78ft × 36ft doubles; singles 27ft; service line 21ft from net.
    return (
      <svg viewBox="0 0 520 300" role="img" aria-label="Tennis court diagram" className="h-auto w-full">
        <rect x="70" y="40" width="390" height="180" fill={tone.bg} stroke={INK} strokeWidth="2.5" />
        <line x1="70" y1="62.5" x2="460" y2="62.5" {...THIN} /> {/* doubles alley */}
        <line x1="70" y1="197.5" x2="460" y2="197.5" {...THIN} />
        <line x1="265" y1="40" x2="265" y2="220" stroke={tone.fg} strokeWidth="3" /> {/* net */}
        <line x1="160" y1="62.5" x2="160" y2="197.5" {...LINE} /> {/* service lines */}
        <line x1="370" y1="62.5" x2="370" y2="197.5" {...LINE} />
        <line x1="160" y1="130" x2="370" y2="130" {...LINE} /> {/* center service line */}
        <line x1="70" y1="130" x2="78" y2="130" {...LINE} /> {/* center marks */}
        <line x1="452" y1="130" x2="460" y2="130" {...LINE} />
        <Dim x={265} y={28}>NET</Dim>
        <Dim x={212} y={100}>SERVICE BOX</Dim>
        <Dim x={265} y={248}>78 FT BASELINE TO BASELINE</Dim>
        <Dim x={44} y={134} anchor="middle">36 FT</Dim>
        <Dim x={488} y={70} anchor="middle">ALLEY</Dim>
      </svg>
    );
  }

  if (slug === "pickleball") {
    // 44ft × 20ft; kitchen 7ft each side of net.
    return (
      <svg viewBox="0 0 520 260" role="img" aria-label="Pickleball court diagram" className="h-auto w-full">
        <rect x="80" y="50" width="360" height="164" fill="#FFFFFF" stroke={INK} strokeWidth="2.5" />
        <rect x="202.7" y="50" width="57.3" height="164" fill={tone.bg} stroke={tone.fg} strokeWidth="1.5" /> {/* kitchen left */}
        <rect x="260" y="50" width="57.3" height="164" fill={tone.bg} stroke={tone.fg} strokeWidth="1.5" /> {/* kitchen right */}
        <line x1="260" y1="42" x2="260" y2="222" stroke={tone.fg} strokeWidth="3.5" /> {/* net */}
        <line x1="80" y1="132" x2="202.7" y2="132" {...LINE} /> {/* centerlines outside kitchen */}
        <line x1="317.3" y1="132" x2="440" y2="132" {...LINE} />
        <Dim x={260} y={34}>NET · 34 IN</Dim>
        <Dim x={260} y={244}>44 FT</Dim>
        <Dim x={56} y={136}>20 FT</Dim>
        <Dim x={231} y={100}>KITCHEN</Dim>
        <Dim x={231} y={112}>7 FT</Dim>
        <Dim x={141} y={95}>SERVICE COURT</Dim>
      </svg>
    );
  }

  if (slug === "padel") {
    // 20m × 10m; glass walls; service line 6.95m from net.
    return (
      <svg viewBox="0 0 520 280" role="img" aria-label="Padel court diagram" className="h-auto w-full">
        <rect x="72" y="46" width="376" height="188" fill={tone.bg} stroke={tone.fg} strokeWidth="7" opacity="0.9" /> {/* glass */}
        <rect x="72" y="46" width="376" height="188" fill="none" stroke={INK} strokeWidth="2" />
        <line x1="260" y1="46" x2="260" y2="234" stroke={INK} strokeWidth="3" /> {/* net */}
        <line x1="129.3" y1="46" x2="129.3" y2="234" {...LINE} /> {/* service lines 6.95m */}
        <line x1="390.7" y1="46" x2="390.7" y2="234" {...LINE} />
        <line x1="129.3" y1="140" x2="390.7" y2="140" {...LINE} /> {/* center line */}
        <Dim x={260} y={34}>NET · 88 CM</Dim>
        <Dim x={260} y={262}>20 M · GLASS BACK WALLS IN PLAY</Dim>
        <Dim x={46} y={144}>10 M</Dim>
        <Dim x={194} y={100}>SERVICE BOX</Dim>
      </svg>
    );
  }

  if (slug === "racquetball") {
    // Floor plan 40ft × 20ft: service line 15ft, short line 20ft, receiving line 25ft.
    return (
      <svg viewBox="0 0 520 260" role="img" aria-label="Racquetball court floor plan" className="h-auto w-full">
        <rect x="90" y="46" width="340" height="170" fill="#FFFFFF" stroke={INK} strokeWidth="2.5" />
        <rect x="90" y="42" width="340" height="4" fill={tone.fg} /> {/* front wall */}
        <rect x="217.5" y="46" width="42.5" height="170" fill={tone.bg} /> {/* service zone 15–20ft */}
        <line x1="217.5" y1="46" x2="217.5" y2="216" {...LINE} /> {/* service line */}
        <line x1="260" y1="46" x2="260" y2="216" {...LINE} /> {/* short line */}
        <line x1="302.5" y1="46" x2="302.5" y2="216" stroke={INK} strokeWidth="1.5" strokeDasharray="5 5" fill="none" /> {/* receiving line */}
        <Dim x={260} y={34}>FRONT WALL ← EVERY SURFACE IN PLAY</Dim>
        <Dim x={238.5} y={130}>SERVICE</Dim>
        <Dim x={238.5} y={142}>ZONE</Dim>
        <Dim x={302.5} y={236}>RECEIVING LINE</Dim>
        <Dim x={260} y={252} anchor="middle">40 FT DEEP · 20 FT WIDE · 20 FT HIGH</Dim>
      </svg>
    );
  }

  // beach volleyball — 16m × 8m, no attack line on sand.
  return (
    <svg viewBox="0 0 520 260" role="img" aria-label="Beach volleyball court diagram" className="h-auto w-full">
      <rect x="88" y="52" width="344" height="160" fill={tone.bg} stroke={INK} strokeWidth="2.5" />
      <line x1="260" y1="36" x2="260" y2="228" stroke={tone.fg} strokeWidth="4" /> {/* net */}
      <line x1="260" y1="36" x2="260" y2="228" stroke="#fff" strokeWidth="1.2" strokeDasharray="3 6" />
      <Dim x={260} y={28}>NET · 2.43 M / 2.24 M</Dim>
      <Dim x={260} y={244}>16 M · NO ATTACK LINE ON SAND</Dim>
      <Dim x={62} y={136}>8 M</Dim>
      <Dim x={452} y={136} anchor="start">SERVE FROM</Dim>
      <Dim x={452} y={148} anchor="start">ANYWHERE</Dim>
      <Dim x={452} y={160} anchor="start">BEHIND LINE</Dim>
    </svg>
  );
}
