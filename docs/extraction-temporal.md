# Temporal facts and counting

Use facts that support rule changes without fetching ESPN again. Concrete names
may follow existing conventions, but the contract must cover:

| Fact | Purpose |
|---|---|
| Final combined score and margin | General scoring, close finish, and shootout |
| OT occurrence with evidence availability | Overtime, independent of a winning result |
| Cumulative end-of-Q3 margin | Upper shootout competitiveness; derive from both teams' first three known quarter scores when available |
| Minimum observed Q4 margin, including its entry state | Both shootout tiers |
| Maximum erased second-half and Q4 deficits, with per-team evidence | Comeback tiers |
| Nullable exact lead-change count, verified lower bound, and sequence coverage | Lead-change tiers without discarding bonuses proved by partial history; retain tie-preserving semantics |
| Whether any Q4 score tied the game or put the scoring team ahead | Lower late-drama scoring branch |
| Minimum proved upper bound on seconds remaining at such a Q4 score, with exact clock or interval provenance | Upper late-drama tier without inventing an exact time |
| Trailing-possession observations or verified intervals, summarized by positive deficit and latest known clock | Late-chance branch without embedding the 8-point or 180-second policy thresholds in extraction |
| Per-fact availability/coverage and representative source evidence | Distinguish known matches, known nonmatches, and missing evidence |

Keep derived possession summaries compact, for example the minimum observed
seconds remaining for each positive deficit, plus evidence and coverage. Include
observations justified by a verified continuous possession interval. Do not infer
possession at 3:00 merely because one play occurred before and another after it;
turnovers, special teams, and drive boundaries must be accounted for.
An end-of-game post-play state or terminal drive ownership cannot alone establish
a live trailing possession. Require an actual live Q4 observation or supported
interval. Handle a genuine untimed down at 0:00 separately from a clock that
already represents the end of the game.
For an interval-derived clock, preserve endpoint inclusivity or retain an actual
supported live witness. An exclusive possession-ending boundary at exactly 3:00
must not become a qualifying observation for the team that lost possession.

## Temporal semantics

- Seed Q3 comeback tracking from the known halftime score and Q4 tracking from
  the known end-of-Q3 score. Include the state before the first play in a period,
  so an immediate recovery cannot hide the entering deficit. Track each team's
  largest relevant deficit and subsequent recovery in order; reducing a deficit
  without tying or leading is insufficient.
- Locate each recovery within its qualifying period using a valid entry anchor,
  a deficit/recovery pair wholly within that period, or independent evidence of
  the actual recovery transition. A last-observed Q3 deficit followed by a Q4 tie
  cannot prove Q4 recovery if the intervening Q3/Q4 boundary is unknown: the
  recovery may already have occurred in an omitted Q3 segment. Leave the Q4
  bonus unknown while retaining any separately proved second-half recovery.
- Second-half recovery means Q3 or Q4; the Q4 tier requires recovery in period 4.
  Neither tier receives credit for a recovery that happens only in OT. Once
  earned in regulation, a comeback remains earned if that team later loses.
- Count leader switches throughout the game, including OT. The first leader
  does not count; A → tie → B counts once, A → tie → A counts zero.
- Detect a tying score from a previously trailing state to a tie, and a go-ahead
  score from a tied or trailing state to a lead. Extending an existing lead does
  not qualify. Later scoring, including conversions, never removes prior drama.
- Attach period and clock to an actual qualifying scoring transition. Use its
  independently verified before/after states or reconstruct them from a
  contiguous supported sequence. Do not attribute a cumulative score jump across
  missing history to the next observed play: that play may be scoreless, or the
  qualifying score may have occurred in Q3 or before 5:00. An entry anchor can
  seed a contiguous reconstruction; an anchor alone does not time a later score.
- Also accept interval evidence that proves a qualifying score occurred, even
  when its exact play is missing. Verified Q4 states of 10–17 at 4:50 and 17–17
  at 4:00 prove a tying score within five minutes: the entire possible scoring
  interval qualifies. Retain the period, score endpoints, and conservative clock
  range (240–290 seconds here), with an exact clock left unknown. The largest
  possible seconds remaining is a safe bound for a ≤300-second rule. Take the
  minimum of those proved upper bounds across witnesses for the compact fact.
  An interval straddling 5:00 cannot establish the upper tier, though it may
  establish lower-tier Q4 drama if the score is proved to lie wholly in Q4.
- Q4-only facts use period 4, including 0:00 scoring plays. Include exactly 5:00
  for the upper drama tier and exactly 3:00 for a trailing possession chance.
- Include the Q4 entry state in Q4 competitiveness even if Q4's first play
  widens the margin. A competitive state can precede reaching 55/65 total points;
  those thresholds apply only to the final total.

Scoring thresholds are defined in the [scoring policy](scoring-new.md).
See [partial evidence](extraction-evidence.md) for unknown facts and clock bounds.
