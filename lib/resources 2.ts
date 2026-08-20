// Reference content for each sport: rules, scoring, serving, faults, etiquette,
// tiers, glossary, and a first-match checklist. Static (no DB) — educational
// reference material, not user data. Expanded per the Daylight Playbook brief.

export type Tier = { name: string; desc: string };
export type Term = { term: string; def: string };
export type SportResource = {
  tagline: string;
  format: string;
  court: string;
  overview: string;
  scoring: string;
  serving: string[];
  rules: string[];
  faults: string[];
  etiquette: string[];
  equipment: string;
  firstMatch: string[];
  glossary: Term[];
  tiers: Tier[];
};

export const RESOURCES: Record<string, SportResource> = {
  tennis: {
    tagline: "The classic. Deuce, advantage, and the long rally.",
    format: "Singles (1v1) or doubles (2v2)",
    court: "78 ft × 27 ft (singles), 36 ft wide for doubles; 3 ft net at center",
    overview:
      "Tennis is played on a rectangular court divided by a net. You score by landing the ball in the opponent's court so they can't return it legally. Points build into games, games into sets, and sets into the match. It rewards consistency first, then placement, then power — in that order.",
    scoring:
      "Points run 0 (\u201Clove\u201D), 15, 30, 40, then game. At 40\u201340 it's \u201Cdeuce\u201D \u2014 you must win two points in a row (advantage, then game). Six games win a set, but you must lead by two; at 6\u20136 most matches play a tiebreak to 7 (win by two). Matches are usually best of three sets.",
    serving: [
      "Stand behind the baseline, between the center mark and the sideline, on the right (deuce) side to start.",
      "Toss the ball and hit it before it bounces, diagonally into the opposite service box.",
      "You get two attempts per point. Miss both — a double fault — and you lose the point.",
      "After each point, alternate sides (deuce court, then ad court). The serve changes hands every game.",
      "A serve that clips the net cord and still lands in the box is a \u201Clet\u201D — replay it, no penalty.",
    ],
    rules: [
      "The ball may bounce once on your side before you return it, or you can volley it out of the air (never on the serve return in doubles-style rec play — let the serve bounce).",
      "A ball landing on any part of the line is in.",
      "You lose the point if the ball bounces twice, you hit it into the net or out, you touch the net, or the ball touches your body.",
      "In doubles, the full 36 ft width is in play; in singles, only inside the singles sidelines.",
      "Change ends after every odd-numbered game (1st, 3rd, 5th…).",
    ],
    faults: [
      "Double fault — both serves miss the box.",
      "Foot fault — stepping on or over the baseline before striking the serve.",
      "Hitting the ball before it crosses to your side of the net.",
      "Touching the net or posts while the ball is in play.",
      "A double hit or carrying the ball on the strings.",
    ],
    etiquette: [
      "Call your own lines honestly and loudly; if you're not sure, the ball was in.",
      "Return stray balls to the neighboring court between points, not during them.",
      "Announce the score before every serve — server's score first.",
      "Don't walk behind a court mid-point; wait for the rally to end.",
      "Shake hands (or tap racquets) at the net when it's done.",
    ],
    equipment: "A strung racquet and pressurized tennis balls. Court shoes with non-marking soles.",
    firstMatch: [
      "Bring a can of balls — new balls are the custom for the match, and the winner usually keeps them.",
      "Warm up together: five minutes of rallies, then a few serves each.",
      "Agree the format before you start: one set, best of three, or a timed session.",
      "Spin a racquet to decide who serves first.",
      "Log the score in Klimr right after — sets and games, while they're fresh.",
    ],
    glossary: [
      { term: "Ace", def: "A serve the returner never touches." },
      { term: "Deuce / Ad", def: "40–40, and the point after it (advantage)." },
      { term: "Let", def: "A replayed point — most often a serve that clips the net and lands in." },
      { term: "Rally", def: "The exchange of shots after the serve." },
      { term: "Volley", def: "Hitting the ball before it bounces." },
      { term: "Tiebreak", def: "First to 7 (win by 2) to decide a 6–6 set." },
      { term: "Break", def: "Winning a game on your opponent's serve." },
    ],
    tiers: [
      { name: "Beginner", desc: "Learning grips and getting rallies started; consistent contact is the goal." },
      { name: "Intermediate", desc: "Reliable groundstrokes and serves; can sustain rallies and place the ball." },
      { name: "Advanced", desc: "Spin, depth, and shot tolerance under pressure; comfortable at net and serving with intent." },
      { name: "Open", desc: "Tournament-level pace, tactics, and movement." },
    ],
  },
  pickleball: {
    tagline: "Fast, social, and easy to start. Mind the kitchen.",
    format: "Doubles (2v2) most common; also singles",
    court: "44 ft × 20 ft; 34 in net at center; 7 ft non-volley zone each side",
    overview:
      "Pickleball mixes tennis, badminton, and table tennis on a small court with paddles and a perforated plastic ball. Points are short, the learning curve is gentle, and the game is social by design — which is why it's the fastest-growing racquet sport in the world.",
    scoring:
      "Games go to 11, win by two. In traditional scoring only the serving side can score, and in doubles both partners serve before the side changes (\u201Cside out\u201D) — so the score has three numbers: your score, theirs, and the server number (1 or 2). Some leagues use rally scoring (a point on every rally, usually to 15 or 21); Klimr matches default to traditional.",
    serving: [
      "Serve underhand, below the waist, with the paddle head below your wrist at contact.",
      "Stand behind the baseline and serve diagonally, beyond the opposite kitchen, into the service court.",
      "One attempt only (a let that lands in is played in most modern rules).",
      "The first serving team of a game starts with only one server (called \u201C0\u20130\u20132\u201D).",
      "Call the full score before serving: yours, theirs, server number.",
    ],
    rules: [
      "Double-bounce rule: the serve must bounce, and the return must bounce, before anyone volleys.",
      "The 7-ft non-volley zone — \u201Cthe kitchen\u201D — is off-limits for volleys: you can't strike the ball out of the air while touching it (or its line).",
      "You may enter the kitchen any time to play a ball that has bounced there.",
      "Momentum counts: if a volley carries you into the kitchen, it's a fault even after the hit.",
      "Line calls: any line is in — except the kitchen line on the serve, which is a fault.",
    ],
    faults: [
      "Volleying while touching the kitchen or its line.",
      "Serve landing in the kitchen or missing the diagonal service court.",
      "Violating the double-bounce rule.",
      "Ball into the net, out of bounds, or bouncing twice.",
      "Serving with the wrong player or from the wrong side (score/server confusion).",
    ],
    etiquette: [
      "Call the score loudly before every serve — it keeps server order honest.",
      "The kitchen line is the receiver's call; the baseline is the server's side's call.",
      "In open play, paddle-stacking is the queue — winners usually split or rotate off.",
      "Say \u201Cball on!\u201D immediately if a stray ball enters a live court.",
      "Tap paddles at the net after the game.",
    ],
    equipment: "A solid paddle and a perforated plastic ball (indoor and outdoor balls differ). Court shoes.",
    firstMatch: [
      "Learn the score call first — \u201C0\u20130\u20132\u201D to start — and the rest follows.",
      "Plant yourself at the kitchen line after the third shot; that's where points are won.",
      "When in doubt, dink: a soft shot into their kitchen beats a fast one into the net.",
      "Agree on traditional vs rally scoring before the first serve.",
      "Log the final score in Klimr — games to 11, win by two.",
    ],
    glossary: [
      { term: "The kitchen", def: "The 7-ft non-volley zone on each side of the net." },
      { term: "Dink", def: "A soft shot that drops into the opponent's kitchen." },
      { term: "Side out", def: "Serve passing to the other team." },
      { term: "Third-shot drop", def: "A soft third shot used to reach the net safely." },
      { term: "Erne", def: "A legal volley taken from beside (not inside) the kitchen." },
      { term: "Stacking", def: "Doubles positioning trick to keep partners on preferred sides." },
      { term: "Two-bounce rule", def: "Serve and return must each bounce before volleys begin." },
    ],
    tiers: [
      { name: "Beginner", desc: "Learning the serve, the kitchen rule, and keeping the ball in play." },
      { name: "Intermediate", desc: "Consistent dinks and drives; understands stacking and shot selection." },
      { name: "Advanced", desc: "Controls the kitchen line, resets hard balls, and constructs points." },
      { name: "Open", desc: "Tournament-level hands, speed-ups, and strategy." },
    ],
  },
  padel: {
    tagline: "Tennis scoring, glass walls, endless angles.",
    format: "Doubles (2v2) — the standard; singles courts are rare",
    court: "20 m × 10 m enclosed court; glass back walls; net at 88 cm center",
    overview:
      "Padel is played in an enclosed court where the walls are part of the game. Scoring is borrowed from tennis, serves are underhand, and rallies are long because the glass gives you a second chance — the ball can bounce off the back wall and stay in play. Strategy and positioning beat raw power.",
    scoring:
      "Identical to tennis: 15, 30, 40, game; deuce at 40\u201340 (many clubs play \u201Cgolden point\u201D at deuce instead — one deciding point). Six games win a set with a two-game lead; tiebreak at 6\u20136. Matches are best of three sets.",
    serving: [
      "Serve underhand: bounce the ball behind the service line and strike it at or below waist height.",
      "Serve diagonally into the opposite service box; the ball must bounce in the box before hitting a wall.",
      "Two attempts, like tennis. A serve that bounces in the box and then hits the side glass is good; if it hits the fence (mesh) after the bounce, it's a fault.",
      "Both feet stay behind the service line until contact.",
    ],
    rules: [
      "The ball must bounce on the court floor first — hitting your opponents' glass directly on the full is out.",
      "After the bounce, the ball can rebound off your own back or side glass and you can still return it.",
      "You may play the ball off your own walls to send it over the net.",
      "One bounce max on the floor; walls don't count as bounces.",
      "The net posts and out-of-court returns follow local house rules — agree before play.",
    ],
    faults: [
      "Ball hitting the opponents' wall or fence before their floor.",
      "Double bounce on the floor.",
      "Serving overhand or above the waist.",
      "Touching the net, or the ball touching your body.",
      "Returning the serve on the volley — the receiver must let the serve bounce first.",
    ],
    etiquette: [
      "Give way on shared glass corners — call \u201Cmine\u201D early and loud.",
      "Sweep sand or debris off your half between sets if the court needs it.",
      "The receiving side calls the service box; each side calls its own back glass.",
      "Racquet tap at the net after the match; winners book the next court.",
    ],
    equipment: "A perforated, stringless padel racket and slightly depressurized padel balls. Court shoes with lateral grip.",
    firstMatch: [
      "Let the back glass help you — moving away from the wall to play the rebound is skill #1.",
      "Lob early and often; the lob is padel's most important shot.",
      "Take the net with your partner; padel is won at the net line.",
      "Agree deuce vs golden point before starting.",
      "Log sets and games in Klimr, tennis-style.",
    ],
    glossary: [
      { term: "Bandeja", def: "A sliced overhead that keeps you at the net." },
      { term: "Víbora", def: "A faster, spinnier cousin of the bandeja." },
      { term: "Chiquita", def: "A soft, low shot at the net players' feet." },
      { term: "Golden point", def: "A single deciding point at deuce." },
      { term: "Back-glass return", def: "Playing the ball after it rebounds off your own glass." },
      { term: "Salida", def: "Exiting the court door to play a ball back in (advanced, house rules)." },
    ],
    tiers: [
      { name: "Beginner", desc: "Learning wall rebounds and the underhand serve; rallies over power." },
      { name: "Intermediate", desc: "Comfortable off the back glass; lobs and net positioning with a partner." },
      { name: "Advanced", desc: "Bandeja/víbora control, pair movement, and point construction." },
      { name: "Open", desc: "Competition pace: wall play, transitions, and tactics at speed." },
    ],
  },
  racquetball: {
    tagline: "Four walls, one ball, pure speed.",
    format: "Singles (1v1); doubles and cutthroat (3 players) variants",
    court: "40 ft × 20 ft × 20 ft enclosed court; every surface in play",
    overview:
      "Racquetball is played inside a fully enclosed court where the front wall is the target and everything — walls, ceiling, back wall — is in play. Only the serving side scores, so momentum swings hard. It's the most cardio-intense sport on Klimr: short points, explosive movement, fast hands.",
    scoring:
      "Matches are two games to 15 (no win-by-two needed in standard rules); if it's one game each, a tiebreaker to 11 decides it. Only the server scores — win a rally as receiver and you earn the serve (\u201Cside out\u201D), not a point.",
    serving: [
      "Start inside the service zone (between the short line and the service line).",
      "Bounce the ball once and strike it to the front wall first.",
      "The serve must rebound past the short line before touching the floor — landing on or before it is a fault.",
      "Two serve attempts; two faults is an \u201Cout\u201D (serve passes to your opponent).",
      "The receiver must let the serve pass the receiving line (dashed) or bounce before playing it.",
    ],
    rules: [
      "Every return must reach the front wall before touching the floor — it may touch side walls or ceiling on the way.",
      "The ball may bounce once on the floor before you return it.",
      "Hinders: if your opponent blocks your path or your straight shot to the front wall, play a \u201Chinder\u201D — replay the rally. Safety first, always.",
      "A serve that hits three surfaces before landing (e.g. front–side–side) is a fault (\u201Cthree-wall serve\u201D).",
      "A ceiling ball is legal any time after the serve.",
    ],
    faults: [
      "Short serve (not past the short line) or long serve (reaching the back wall on the full).",
      "Skip ball — the ball hits the floor before the front wall.",
      "Double bounce before your return.",
      "Foot fault — leaving the service zone before the serve crosses the short line.",
      "Avoidable hinder — taking away the shot instead of the path (loses the rally).",
    ],
    etiquette: [
      "Eye protection is non-negotiable — no eyewear, no game.",
      "Call hinders generously; a replayed point beats a racquet to the face.",
      "Give the shooter a clear lane to the front wall — move, don't duck.",
      "Knock before opening a court door, and never open it mid-rally.",
    ],
    equipment: "A racquetball racquet with wrist tether, a pressurized rubber ball, and protective eyewear (required).",
    firstMatch: [
      "Watch the ball, not the wall — turn your head, protect your eyes.",
      "Aim low on the front wall; low, hard shots (\u201Ckill shots\u201D) end rallies.",
      "Use the ceiling ball to reset when you're pulled out of position.",
      "Center court is home — return there after every shot.",
      "Log games in Klimr: 15, 15, and the 11-point tiebreak if it went three.",
    ],
    glossary: [
      { term: "Side out", def: "Losing the serve — the only way the receiver \u201Cscores\u201D." },
      { term: "Kill shot", def: "A ball so low off the front wall it's unreturnable." },
      { term: "Hinder", def: "Interference — the rally is replayed." },
      { term: "Ceiling ball", def: "A defensive shot off the ceiling that pushes opponents deep." },
      { term: "Z-serve", def: "A serve carving front wall → side wall for a wicked angle." },
      { term: "Rollout", def: "The perfect kill: the ball rolls off the front wall." },
    ],
    tiers: [
      { name: "Beginner", desc: "Learning to track the ball off walls; keeping serves legal and safe." },
      { name: "Intermediate", desc: "Ceiling game, passing shots, and holding center court." },
      { name: "Advanced", desc: "Kill-shot accuracy, serve variety, and shot selection under fatigue." },
      { name: "Open", desc: "Tournament speed: anticipation, deception, and full-court control." },
    ],
  },
  beach_volleyball: {
    tagline: "Two players, all the sand, every skill.",
    format: "Doubles (2v2) — the Olympic standard",
    court: "16 m × 8 m sand court; net at 2.43 m (men) / 2.24 m (women)",
    overview:
      "Beach volleyball is the two-a-side game on sand: every player passes, sets, attacks, blocks, and defends. There are no rotations and no substitutions — just you, your partner, and the elements. Wind, sun, and deep sand are part of the strategy.",
    scoring:
      "Best of three sets, rally scoring (a point on every rally). Sets one and two go to 21, the deciding third to 15 — all win by two. Teams switch ends every 7 points (every 5 in the third set) to share the wind and sun.",
    serving: [
      "Serve from anywhere behind the end line — underhand, overhand float, or jump serve.",
      "One attempt; a serve that clips the net and lands in (\u201Clet serve\u201D) is live and playable.",
      "Partners alternate servers each time their team wins back the serve.",
      "You may not block or attack the opponent's serve.",
    ],
    rules: [
      "Three touches maximum per side — and a block counts as the first touch.",
      "No open-hand tips: use knuckles (\u201Cpokey\u201D), a closed fist, or a clean roll shot.",
      "Hand-setting is legal but held to a strict double-contact standard; sets must come out clean.",
      "You may cross under the net if you don't interfere with the opponents.",
      "The ball may be played off any part of the body.",
    ],
    faults: [
      "Four touches, or two consecutive touches by the same player (except after a block).",
      "A caught, thrown, or double-contacted set.",
      "Open-hand tip over the net.",
      "Net touch while playing the ball.",
      "Foot fault on the serve (touching the court before contact).",
    ],
    etiquette: [
      "Call the score before every serve; there's no ref in rec play.",
      "\u201CIn/out\u201D is the receiving team's call on their side; be generous.",
      "Rake or flatten dangerous holes between sets.",
      "Switch ends on schedule without being asked — the wind is half the game.",
      "High-five under the net when it's over.",
    ],
    equipment: "A beach volleyball (softer and slightly larger than indoor). Barefoot or sand socks; sunglasses recommended.",
    firstMatch: [
      "Talk constantly: \u201Cmine,\u201D \u201Cyours,\u201D \u201Cup!\u201D — communication is the third teammate.",
      "Serve at the weaker passer or into the wind seam.",
      "Bump-set if hand-setting feels risky; clean beats fancy.",
      "Learn the switch rhythm (every 7 points) before game one.",
      "Log sets in Klimr: 21, 21, and 15 if it goes three.",
    ],
    glossary: [
      { term: "Side out", def: "Winning the rally on the opponent's serve." },
      { term: "Pokey", def: "A knuckle shot — the legal answer to the banned open-hand tip." },
      { term: "Cut shot", def: "A sharp-angle attack across the net tape." },
      { term: "Husband-and-wife", def: "The serve that drops untouched between two players." },
      { term: "Peel", def: "The blocker pulling off the net to defend." },
      { term: "Let serve", def: "A serve off the net tape that stays in play." },
    ],
    tiers: [
      { name: "Beginner", desc: "Clean bump passing and serving in; moving in sand without burning out." },
      { name: "Intermediate", desc: "Reliable side-out game: pass, set, and a placed attack." },
      { name: "Advanced", desc: "Blocking schemes, cut shots, and serving with intent." },
      { name: "Open", desc: "Tournament sand: reads, defense, and full skill under wind and sun." },
    ],
  },
};
