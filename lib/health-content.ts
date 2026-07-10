/** The Training Table — Klimr's evergreen health & nutrition library for
 *  racquet and beach athletes. Original editorial content; educational, not
 *  medical advice (the page carries the disclaimer). */

export type HealthArticle = {
  slug: string;
  kicker: string;
  title: string;
  minutes: number;
  summary: string;
  sections: { h: string; body: string }[];
};

export const HEALTH_ARTICLES: HealthArticle[] = [
  {
    slug: "hydration-electrolytes",
    kicker: "Fueling",
    title: "Hydration & electrolytes for court and sand",
    minutes: 4,
    summary: "Racquet and beach sports are stop-start efforts in the sun — you lose more sodium than steady-state athletes and feel it as late-match cramping and fading focus.",
    sections: [
      { h: "Before you play", body: "Arrive hydrated instead of chasing it: roughly 16–20 oz of fluid in the two hours before first serve, with a salty snack or an electrolyte mix if you're a heavy or salty sweater (white residue on your hat is the tell)." },
      { h: "During play", body: "Sip on every changeover rather than chugging between sets — small, regular amounts absorb better. For sessions past 60–90 minutes or anything in real heat, plain water isn't enough; add sodium (300–600 mg/hour is a common range for salty sweaters) and some carbohydrate." },
      { h: "After", body: "Rehydrate to about 125–150% of what you lost — weigh in before and after a hard session once to learn your sweat rate. Pale-yellow urine by the evening is the simple check." },
    ],
  },
  {
    slug: "match-day-fueling",
    kicker: "Fueling",
    title: "What to eat on match day",
    minutes: 4,
    summary: "Tournament days are long, with unpredictable gaps between matches. The goal is steady energy without ever playing on a full stomach.",
    sections: [
      { h: "The base meal", body: "Three to four hours out: a familiar, carb-forward meal with moderate protein and low fat/fiber — rice or pasta with chicken, oatmeal with banana, a turkey sandwich. Match day is never the day to try something new." },
      { h: "Between matches", body: "Under an hour to your next match: stick to fast carbs — banana, applesauce pouch, sports drink, a handful of pretzels. Two-plus hours: a small real meal works, then top up lightly 30–45 minutes before." },
      { h: "The night before", body: "A normal dinner with an extra portion of carbs beats any extreme 'carb load.' Prioritize sleep over everything else on the list." },
    ],
  },
  {
    slug: "recovery-sleep",
    kicker: "Recovery",
    title: "Recovery that actually moves the needle",
    minutes: 5,
    summary: "Most recovery gadgets fight over the last 5%. Sleep, food timing, and easy movement are the 95% — and they're free.",
    sections: [
      { h: "Sleep is the whole game", body: "Aim for 7–9 hours with a consistent schedule; a single short night measurably degrades serve accuracy and reaction time. If you play night matches, build a wind-down: screens down, room cool and dark, same routine every time." },
      { h: "The first hour after", body: "Get carbs plus 20–40 g of protein within an hour or two of a hard session — chocolate milk, yogurt with granola, or a proper meal all qualify. It's about restocking glycogen and giving muscles material to repair with." },
      { h: "Easy movement beats total rest", body: "On the day after a tournament, a 20–30 minute walk, swim, or easy spin clears soreness faster than the couch. Save true rest days for when your body — or your motivation — asks loudly." },
    ],
  },
  {
    slug: "shoulder-elbow-care",
    kicker: "Injury prevention",
    title: "Protecting the overhead athlete's shoulder & elbow",
    minutes: 5,
    summary: "Serves, smashes, and spikes load the same small structures thousands of times a season. Most overuse pain announces itself quietly first.",
    sections: [
      { h: "The 10-minute insurance policy", body: "Twice a week: band external rotations, scapular rows, and wrist extensor work (the classic tennis-elbow curl with a light dumbbell). Boring, effective, and cheaper than an MRI." },
      { h: "Ramp load, don't spike it", body: "Most overuse injuries follow a sudden jump — a new racquet, a heavier ball, a tournament weekend after a quiet month. Increase weekly volume gradually and treat big jumps as a known risk you're choosing." },
      { h: "The traffic-light rule", body: "Pain that warms up and disappears: monitor. Pain that persists through play or changes your mechanics: cut volume and see a professional. Sharp pain, swelling, or night pain: stop and get assessed — that's what the verified pros below are for." },
    ],
  },
  {
    slug: "heat-sun-safety",
    kicker: "Conditions",
    title: "Heat & sun: playing smart outdoors",
    minutes: 3,
    summary: "Beach volleyball at noon and summer hard courts are genuinely hostile environments. Respecting them is a performance strategy, not caution theater.",
    sections: [
      { h: "Sun", body: "SPF 30+ applied 20 minutes before play and re-applied every two hours (sweat eats it faster than the label admits). A hat and sunglasses aren't style points — glare costs you overheads." },
      { h: "Heat", body: "Acclimatize over 1–2 weeks of shorter sessions when summer arrives. Pre-cool with cold fluids, seek shade on every changeover, and know the red flags: goosebumps in the heat, confusion, or when you stop sweating — that's a stop-now medical situation." },
      { h: "Sand specifics", body: "Sand surface temps can exceed 120°F on a sunny afternoon — sand socks are legal in most leagues and your feet will thank you. Schedule hard training for mornings when you can." },
    ],
  },
  {
    slug: "strength-foundations",
    kicker: "Training",
    title: "Strength foundations for racquet & beach athletes",
    minutes: 5,
    summary: "You don't need a bodybuilding program — you need force you can express sideways, overhead, and off one leg, twice a week.",
    sections: [
      { h: "The core four", body: "Squat or split-squat pattern, a hinge (Romanian deadlift), a push (overhead or bench), and a pull (row or pull-up). Two sessions a week, 3–4 sets each, leaving a rep or two in the tank." },
      { h: "Make it sport-shaped", body: "Add lateral lunges and band-resisted side shuffles for court coverage, medicine-ball rotational throws for groundstroke and spike power, and single-leg calf work for sand push-off." },
      { h: "In-season vs off-season", body: "In-season, strength work maintains: shorter, lighter, never within 24 hours of a match. Off-season is when you build. If you're new to lifting, two months with a qualified trainer beats a year of guessing — several are verified below." },
    ],
  },
];
