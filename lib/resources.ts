// Reference content for each sport: rules, scoring, and skill tiers. Static (no DB) —
// this is educational reference material, not user data.

export type Tier = { name: string; desc: string };
export type SportResource = {
  tagline: string;
  format: string;
  court: string;
  overview: string;
  scoring: string;
  rules: string[];
  equipment: string;
  tiers: Tier[];
};

export const RESOURCES: Record<string, SportResource> = {
  tennis: {
    tagline: "The classic. Deuce, advantage, and the long rally.",
    format: "Singles (1v1) or doubles (2v2)",
    court: "78 ft × 27 ft (singles), 36 ft wide for doubles; 3 ft net",
    overview:
      "Tennis is played on a rectangular court divided by a net. You score by landing the ball in the opponent's court so they can't return it legally. Points build into games, games into sets, and sets into the match.",
    scoring:
      "Points run 0 (\u201Clove\u201D), 15, 30, 40, then game. At 40\u201340 it's \u201Cdeuce\u201D \u2014 you must win two points in a row (advantage, then game). Six games win a set, but you must lead by two; at 6\u20136 you play a tiebreak to 7 (win by two). Matches are usually best of three sets.",
    rules: [
      "You get two serve attempts. Miss both and it's a double fault, losing the point.",
      "Serves must land diagonally in the opposite service box.",
      "The ball may bounce once before you return it, or you can take it out of the air (a volley).",
      "A serve that clips the net cord and still lands in is a \u201Clet\u201D and is replayed.",
    ],
    equipment: "A strung racquet and pressurized tennis balls.",
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
    court: "44 ft × 20 ft; 34 in net; 7 ft non-volley zone each side",
    overview:
      "Pickleball mixes tennis, badminton, and table tennis on a small court with paddles and a perforated plastic ball. It's quick to learn and very social, which is a big part of why it's the fastest-growing racquet sport.",
    scoring:
      "Games go to 11 and you must win by two. In traditional doubles, only the serving side can score, and most of the game is decided at the net with soft \u201Cdink\u201D exchanges.",
    rules: [
      "The serve is underhand and travels diagonally across the court.",
      "Double-bounce rule: the serve must bounce, and the return must bounce, before anyone volleys.",
      "The 7-ft non-volley zone \u2014 \u201Cthe kitchen\u201D \u2014 is off-limits for volleys; you can't hit the ball out of the air while standing in it.",
      "Stay out of the kitchen unless the ball has bounced there.",
    ],
    equipment: "A solid paddle and a perforated plastic ball.",
    tiers: [
      { name: "Beginner", desc: "Learning the serve, the kitchen rule, and keeping the ball in play." },
      { name: "Intermediate", desc: "Consistent dinks and drives; understands stacking and shot selection." },
      { name: "Advanced", desc: "Controls the kitchen line, resets hard balls, and constructs points." },
      { name: "Open", desc: "Tournament-level hands, speed-ups, and strategy." },
    ],
  },
  padel: {
    tagline: "Doubles in a glass box \u2014 the walls are your friend.",
    format: "Always doubles (2v2)",
    court: "20 m × 10 m, fully enclosed by glass and mesh",
    overview:
      "Padel is played in an enclosed court where the walls are part of the game. It's always doubles, rewards touch and positioning over raw power, and is one of the fastest-growing sports in the world.",
    scoring:
      "Scoring is identical to tennis \u2014 15, 30, 40, deuce/advantage, six games to a set (win by two), tiebreak at 6\u20136, best of three sets.",
    rules: [
      "The serve is underhand, bounced first, and hit below waist height into the diagonal box.",
      "After a ball bounces on your side, it can come off your own glass walls and you can still play it.",
      "You can let the ball rebound off the back or side glass before returning it.",
      "You win the point if the ball bounces twice on the opponents' side.",
    ],
    equipment: "A solid, stringless perforated racquet and a low-pressure ball.",
    tiers: [
      { name: "Beginner", desc: "Learning the serve and how to read balls off the glass." },
      { name: "Intermediate", desc: "Comfortable using the walls; consistent volleys and lobs." },
      { name: "Advanced", desc: "Controls net position, uses the bandeja, and defends off the back glass." },
      { name: "Open", desc: "Tournament-level positioning, power, and shot variety." },
    ],
  },
  racquetball: {
    tagline: "Enclosed-court power game \u2014 every surface is live.",
    format: "Singles (1v1) or doubles (2v2)",
    court: "40 ft × 20 ft × 20 ft enclosed; all surfaces in play",
    overview:
      "Racquetball is played inside a fully enclosed court where the front wall, side walls, ceiling, and floor are all in play. It's fast, athletic, and built around the serve and quick reactions.",
    scoring:
      "Only the server scores. Games typically go to 15, and a match is best of three with a third game to 11. Lose a rally on your serve and you simply give up the serve rather than a point.",
    rules: [
      "The serve must hit the front wall first and land beyond the short line.",
      "On a rally, the ball must reach the front wall before it touches the floor.",
      "After hitting the front wall, the ball may use any combination of walls and the ceiling.",
      "You lose the rally if you can't return the ball to the front wall before it bounces twice.",
    ],
    equipment: "A strung racquet (with wrist tether) and a hollow rubber ball.",
    tiers: [
      { name: "Beginner", desc: "Learning the serve and keeping rallies alive off the front wall." },
      { name: "Intermediate", desc: "Uses ceiling balls and pinches; consistent serves and returns." },
      { name: "Advanced", desc: "Controls center court, mixes serves, and finishes with kill shots." },
      { name: "Open", desc: "Tournament-level power, retrieving, and shot selection." },
    ],
  },
};
