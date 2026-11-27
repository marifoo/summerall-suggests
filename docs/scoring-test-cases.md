# Scoring migration acceptance cases

These cases record the acceptance matrix for the [scoring migration](scoring-implementation-plan.md).
Run the commands in [verification](testing.md).

## Pure scoring and ranking cases

- General scoring at 28/29; final margins 0/2/3/8/9; OT win/tie versus regulation.
- Comeback deficits 14/15 and 7/8; a Q4 eight-point comeback alone earns +2;
  both comeback tiers together still earn only +2; recovery to a tie counts.
- Lead counts 0/2/3/4/5/7/10, capped at +2; both tie-transition patterns.
- Partial history with five verified switches earns +2 despite an unknown exact
  count; three/four verified switches earn +1 with the upper tier unresolved.
  Duplicate or overlapping fragments cannot inflate the lower bound.
- Drama scoring at 5:01/5:00/4:59 and in Q3/Q4/OT; a nonfinal tying score;
  go-ahead touchdown followed by an extra point; a later lead-extending score.
- Possession at 3:01/3:00/2:59, with deficits 0/1/8/9; wrong-team possession;
  a late chance without a score or win; a verified drive spanning 3:00.
- Shootout totals 54/55/64/65; relevant margins 7/8 and 10/11; Q3-only,
  Q4-entry-only, Q4-only, and final-only competitiveness; an eventual blowout;
  final total reached after the competitive state; both tiers capped at +2.
- Each team's pregame differential independently below/at +2 and +7; asymmetric
  records, ties, no losing penalty, and two record categories stacking to +2.
- General scoring plus upper shootout earns +3 across those categories; category
  totals equal the sum of trace awards, stay between 0 and 14, and are deterministic.
- Low-total games can qualify; 2/3-point recommendation boundary; live,
  scheduled, cancelled, and missing-data games never gain fabricated eligibility.
- Ranking fixtures `[8, 6, 5, 3, 2]` → stars `[3, 1, 0, 0, 0]`;
  `[4, 4, 3]` → `[3, 3, 0]`; `[6, 6, 5]` → `[3, 3, 0]`;
  `[3]` → `[3]`; `[2, 1]` → `[0, 0]`; empty and all-pending weeks.

## Extraction and source-boundary cases

- Symmetric home/away recoveries, later losses, deficits carried from halftime
  and Q3, first-play recoveries, unrecovered deficits, and OT-only recoveries.
- Realistic scoring sequences with separate conversions, scoreless Q4 plays,
  cumulative quarter-score arithmetic, and known Q4 entry with no later plays.
- Clock parsing at 15:00/5:00/3:00/0:00, malformed/missing clocks, missing periods,
  missing team IDs, ambiguous possession, turnovers, and overlapping drive data.
- Terminal drive ownership/end-of-game post-play states do not invent a late
  chance; a supported live possession or genuine untimed down can establish one.
- A possession interval ending exclusively at 3:00 does not establish possession
  at 3:00; an inclusive live observation at the same clock does.
- Quarter-total-only comeback anchors reach extraction; cached anchor changes
  invalidate dependent facts, including unknown-to-known changes; overlapping
  requests with different source contexts cannot reuse inconsistent derived facts.
- A Q4/final-score correction with unchanged halftime/end-of-Q3 anchors forces
  dependent facts to be refetched and reconciled against the current final
  scores; context shape validity alone cannot permit stale facts to be reused.
- Missing initial/final drives and an omitted middle segment leave affected
  coverage unknown even when retained numeric scores appear plausible.
- Partial history preserves known matching branches while leaving unsupported
  negatives/upper tiers unknown; a final score alone cannot prove no comeback.
- A Q3 deficit followed by a Q4 tie across an unknown boundary does not establish
  Q4 recovery; a first observed scoreless Q4 play with that tied score does not
  establish Q4 tying-score drama. Test histories with identical observed endpoints
  that admit qualifying and nonqualifying timings; leave those bonuses unknown.
  Add a same-period score/clock gap that cannot locate the tie before/after 5:00,
  plus controls with a valid anchor/contiguous sequence or independent scoring
  evidence that does prove the bonus. Preserve unrelated observed facts.
- Verified Q4 states of 10–17 at 4:50 and 17–17 at 4:00 prove upper-tier drama
  despite a missing scoring play and a scoreless endpoint play. Retain the
  240–290-second interval rather than a fabricated exact score time. Contrast
  with a 5:10–4:00 interval, which proves Q4 drama but leaves its +2 tier unknown.
- A known final margin suffices for a shootout when Q4 history is absent; a known
  Q4 score suffices for lower drama when its clock is absent.
- Cached play facts cannot replace completion, final scores, or records;
  malformed new fact/evidence shapes cause a refetch rather than a false award.

## Integration, cache, and browser cases

Extend `tests/watchability.test.cjs` for pure contracts and existing suites such
as `tests/espn-fetch.test.cjs`, `tests/review-regressions.test.cjs`,
`tests/reviewer-fact-boundary.test.cjs`, and
`tests/reviewer-source-validation.test.cjs` for extraction and app behavior.

Verify summaries are requested for formerly skipped completed games, including
a lopsided final with qualifying late drama. Verify live/scheduled exclusion,
scoreboard-only fallback, cached repeats, retries, manual refresh, shared
foreground/prefetch work, and clear/refresh races with the expanded request set.

Extend cache and decision tests for migration, rules-only recalculation, nullable
facts, expiration, and compact serialization. Retain existing quota, eviction,
blocked-storage, and three-week memory checks. Confirm large fixtures persist
only compact facts/evidence and no complete plays, drives, or summaries.

Update developer trace assertions, category counts, and rendered star fixtures,
including `tests/browser-smoke.cjs`'s old hardcoded 39 rows. Prefer assertions
about category IDs and decisions over merely replacing one magic row count.
Keep browser fixtures coherent enough to exercise score, clock, and possession
semantics. Verify root hosting, repository-subpath hosting, and opening a copied
`index.html` locally with styling CDN blocked, plus mobile layout and spoiler
opt-ins.
