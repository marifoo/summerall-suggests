# New watchability scoring implementation plan

Implement [scoring-new.md](scoring-new.md) as the authoritative scoring policy.
It supersedes the old policy in `nflscores.md` and the compatibility descriptions
in `README.md`. This plan changes no application behavior by itself.

Keep the application in the standalone `index.html`, with no build step,
installation, backend, secrets, or deployment changes. Preserve the existing pure
normalization, extraction, evaluation, and weekly-ranking boundaries, compact
caching, and spoiler protections.

## Current implementation and intended changes

The inline `watchability-module` currently uses extraction version 3 and rules
version 1. Its 13 independently additive rules need to become nine categories
whose tiers do not stack within a category.

| Category | Required result | Main difference from current behavior |
|---|---|---|
| General scoring | +1 for combined final score >28 | New category; not an eligibility gate |
| Close finish | +1 at margin 3–8; +2 at margin 0–2 | Same effective points, expressed as one category |
| Overtime | +1 if the game reached OT, including ties | Remove the non-tie restriction |
| Comeback | +1 for erasing 15+ in the second half; +2 for erasing 8+ in Q4 | Highest tier wins; Q4 alone can earn +2; fix quarter boundaries and exclude OT recovery |
| Late drama | +1 for a Q4 tying/go-ahead score or a trailing possession chance at ≤3:00 while down 1–8; +2 for a tying/go-ahead score at ≤5:00 in Q4 | Replace last-score/direct-leader-switch detection |
| Lead changes | +1 for 3–4; +2 for 5+ | Replace additive thresholds at 5, 7, and 10 |
| Shootout | +1 at 55+ with final margin ≤10 or a Q4 margin ≤7; +2 at 65+ with margin ≤10 at end of Q3, during Q4, or final | Raise upper threshold from 64, add historical competitiveness, cap category at +2 |
| Team quality | +1 if both pregame record differentials are ≥+2 | Preserve calculation; use a clear category name |
| Playoff significance | +1 if both pregame record differentials are ≥+7 | New category; no actual playoff-status check |

Remove the losing-record penalty. General scoring stacks with shootout; team
quality stacks with playoff significance. The maximum possible total is 14.

Only completed games are eligible. Recommend at 3+ points. Among recommendations,
award three stars to every weekly leader; otherwise award one star at 6+ and no
stars at 3–5. The weekly-leader award replaces the single star. A week with no
recommendations has no starred games.

## Fact extraction and source contracts

### Verify the ESPN adapter before choosing fields

Inspect representative ESPN responses and retain small, sanitized fixtures in
the test suite. Establish the following from actual payloads rather than guessing
from field names:

- Play order and identifiers, completed-drive collections and any separately
  exposed final/current drive, including array and object representations.
- Home/away team identity and how drive/play possession maps to it.
- Whether each score and clock describes the state before or after a play, how
  scoring plays and conversions are represented, and how no-play entries appear.
- Whether possession start/end information supports observations or continuous
  intervals, including a drive that crosses 3:00 without a play at exactly 3:00.
- What establishes coverage of the relevant game or period: all supported drive
  collections, game/period entry and exit evidence, identifiable gaps, and source
  guarantees that can be supported by the fixtures.
- Reliable evidence that a game reached overtime, including a tied result.

The adapter must consume each play once in chronological order. Merge source
collections only when fixtures establish that they contain distinct relevant
plays, and deduplicate by stable identity when they overlap. Do not assume that a
single drive collection is complete or that the scoring team is the possessing
team after a play. Use deterministic fixtures for all automated tests; live API
availability must not control their outcome.

### Normalize only what the extractor needs

Keep the play adapter private to `watchability-module`. Normalize score states,
periods, clocks as seconds remaining, and defensible possession evidence. Keep
team identifiers needed for home/away mapping inside this boundary. Preserve
scoreboard quarter scores and any additional verified OT metadata needed by the
allowlisted scoreboard contract.

Do not persist raw summaries, drive collections, or full play arrays. Persist
small derived facts and bounded representative evidence instead. Scores, game
completion, and pregame records remain owned by scoreboard extraction; cached
play facts cannot override them.

### Supply scoreboard context through an explicit contract

Derive a small `sourceContext` value from the normalized scoreboard game. Include
nullable home/away halftime and end-of-Q3 scores, calculated only when both
teams have all required quarter values, and completed-game final scores for
reconciliation. Change the page boundary to `fetchGameFacts(game, forceRefresh)`
so it can pass this context to `extractPlayMetrics(summary, sourceContext)` before
the timeline is reduced to cached facts. Keep context calculation in the pure
module and fetching in the page. Direct extraction tests supply context
explicitly where needed.

Store the normalized context used alongside the cached play metrics. On every
summary-fact cache read, compare it with the requesting game's current context.
An unequal value, including an unknown value becoming known, makes that fact
entry a cache miss and triggers extraction from a fresh summary. This prevents
thirty-day facts from silently relying on corrected or previously unavailable
quarter or final scores. A Q4/final-only correction must invalidate facts even
when halftime and end-of-Q3 anchors are unchanged. Validate the context's shape
and its equality with the current source; shape validation alone is insufficient.
Apply existing refresh and generation protections to this dependency check.
Include context in the extraction-version change; it does not replace
scoreboard-owned final scores or completion.

Request sharing must also respect context: include the normalized context in the
identity of in-flight derived work, or revalidate and re-extract after joining
work created with different context. A game-ID-only match is insufficient.
Keep end-of-Q3 margin and a known Q4 entry margin available to `extractMetrics`
from scoreboard anchors even when the summary request fails; they are supported
scoreboard facts, not evidence that subsequent Q4 history is complete.

Use verified play states to corroborate anchors when possible. Conflicting source
evidence makes affected temporal facts unavailable rather than authorizing a
fabricated transition. Test a game whose only known entering deficit comes from
quarter totals and whose first Q3/Q4 play erases it, plus a cached anchor mismatch
on a later scoreboard load. Do not depend on unverified summary-header linescores
as an implicit second route for these anchors.

### Derive threshold independent facts

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

### Apply temporal semantics explicitly

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

### Handle incomplete history locally

Use `null` for unavailable facts. Missing clocks must not discard observable
lead changes or a known Q4 tying score; missing possession must not disable
score-based drama; missing summary history must not disable final-score bonuses.
Do not replace absent quarter scores, periods, or possession with zeros.

Positive evidence can establish a matching condition even in partial history.
Absence of a match establishes a negative only if the relevant coverage is
complete. An exact lead count requires adequate sequence coverage; observed
switches in an incomplete sequence must not masquerade as an exact count.

Retain a separate verified lead-change lower bound even when the exact total is
unknown. It must count distinct switches proved in chronological evidence,
without counting a shared transition twice across overlapping fragments. Five
proved switches establish +2 regardless of missing earlier history. Three or
four prove at least +1; award that supported minimum while a possible +2 remains
unresolved. Treat these as ordered minimum thresholds (3+, then 5+) under the
category cap, giving the specified 3–4/+1 and 5+/+2 result when the count is exact.
Do not report the bound as an exact count or an unknown higher tier as false.

Define per-fact coverage in the adapter from the verified source contract, not
from the mere presence of numeric scores and periods. Account for all relevant
drive collections and check game/period boundaries, ordering, duplicates, and
identifiable gaps. Reconcile the available sequence with known quarter and final
scores to detect contradictions. Reconciliation alone cannot prove completeness:
an omitted scoreless drive, or omitted scoring that returns to the same margin,
can leave plausible endpoints while hiding possession or drama.

Only mark coverage complete when the verified collection contract and observed
boundary/sequence evidence support it for that fact. Otherwise preserve positive
witnesses but leave unsupported negatives and exact counts unknown. Explicitly
test omitted initial/final drives and a missing middle segment, including one
whose remaining scores still reconcile. Period/clock/possession coverage can
differ; do not use one global completeness flag to disable unrelated facts.
For time-sensitive bonuses, a positive witness must establish the required
period or clock as well as the score condition. A justified interval is enough
when every possible timing within it qualifies; endpoints that admit both a
qualifying and nonqualifying timing leave that tier unknown. Keep an exact time
distinct from a proved clock bound, and do not attach the event to an endpoint's
scoreless play. These bounds are derived evidence, not estimated scores or times.

For alternative conditions, one known true branch suffices even if another is
unknown. If a lower tier is established but the higher tier cannot be assessed,
award the established points and expose that uncertainty in the trace. This
continues the existing policy of awarding only supported points; it adds no
confidence penalty or estimated bonus.

## Category evaluation and developer explanations

Keep `evaluate(metrics)` pure and deterministic. Use a small, fixed category
definition with ordered tiers, rather than a general rule engine. Evaluate each
tier's own required facts and alternatives, then award only the highest known
matching tier. Sum the nine category awards exactly once.

Keep inputs, thresholds, applicability, match result, points, and explanations in
the returned trace. Add explicit tier results and a selected-tier identifier or
equivalent so a reader can see why +2 replaced +1. A capped category must not
render two independent positive awards. Update the developer renderer wherever
the old single-weight trace cannot represent tiers or partial availability.

Use category IDs such as `general-scoring`, `close-finish`, `overtime`, `comeback`,
`late-drama`, `lead-changes`, `shootout`, `team-quality`, and
`playoff-significance`. Keep `reasons` derived from awarded categories and update
tests that assert the old rule IDs or the old count of 13 rules.

Reuse pregame-record calculation, including reversal of the completed game's
win/loss/tie and ignoring ties in wins-minus-losses. Verify this with coherent
fixtures around +2 and +7. Preserve the documented source assumption that ESPN's
total record includes the completed game; do not silently substitute standings or
actual playoff qualification.

## Summary fetching and cache migration

Fetch summaries for every completed game in the selected week and during existing
previous-week prefetch. Remove the final-score/playoff heuristic in
`shouldFetchSummary`, or replace it with a completion-only boundary. Scheduled,
live, and cancelled games remain ineligible and do not need summary requests.
Missing summaries leave supported scoreboard-only awards available.

Keep the existing request sharing, refresh behavior, clear-cache cancellation,
generation guards, sequential prefetch, three-week memory bound, and failure
handling. More summaries increase cold-load work; avoid adding a separate request
scheduler as part of this change. Verify request counts and final-game caching so
normal repeat visits reuse facts, and a failed summary is retried on revisit.

Bump `EXTRACTION_VERSION` for new facts and corrected temporal extraction. Bump
`RULES_VERSION` for the new categories and awards. Update `isPlayMetrics`, the
projection in `extractMetrics`, and any source validators to accept exactly the
new nullable fact/evidence contract. Reject malformed cached values and refetch.

The current extraction-version mismatch intentionally invalidates all extracted
entries, including scoreboards, discovery, facts, and decisions. Keep that
documented conservative migration rather than attempting to reinterpret old
facts. A separate schema-version bump is needed only if the envelope/rendering
contract requires it; do not change the cache envelope solely for new facts.

Retain rules-only reevaluation for future changes with compatible extraction.
Preserve original expiration on reads and recalculation. Memory weeks must still
expire with their earliest scoreboard/play-fact dependency. New derived facts
must remain within existing 128-entry and 1.5 MiB persistent bounds; no raw ESPN
payloads may enter storage.

## Weekly ranking and spoiler protections

Keep `rankWeek` separate from evaluation and do not mutate its inputs. Calculate
the star winner from recommended games, then apply winner-first precedence:

1. Ineligible or not recommended: zero stars.
2. Tied for the highest recommended total: three stars.
3. Other recommended game with 6+ points: one star.
4. Other recommended game: zero stars.

Preserve descending-point order and schedule order for ties. Keep completed-game
rank and numeric weekly-maximum diagnostics useful even when no game qualifies;
explain that a numerical leader below 3 receives no recommendation or stars.
Scheduled/live games remain unranked. Update all old five-point/star explanations.

Normal cards continue to show only teams, pregame records, dates, and stars.
Scores, category evidence, uncertainty, and ranking explanations remain behind
existing spoiler opt-ins. Developer mode must inspect the exact evaluations used
by normal recommendations, clear on navigation, and reset to off on reload.

## Regression and acceptance tests

Follow the repository's red-green requirement for every corrected behavior: add
a focused regression, run it against the existing code and confirm the expected
failure, then implement and rerun. New policy tests should likewise fail against
the old policy before the corresponding implementation. Update obsolete
characterization expectations deliberately; retain independent regressions for
missing facts, cache safety, fetching, and rendering.

### Pure scoring and ranking cases

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

### Extraction and source-boundary cases

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

### Integration, cache, and browser cases

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

## Delivery sequence

The following are proposed future implementation commits. Do not commit this
plan or implementation work as part of the planning request.

1. **Extend and correct extraction.** Add failing quarter-boundary/OT-recovery
   regressions and fixture-based clock, possession, and competitiveness tests.
   Implement the adapter and compact facts, source validation, fact projection,
   explicit scoreboard-context dependency, and extraction-version bump together.
   Update old OT-comeback expectations and README extraction/cache descriptions.
   Keep the existing scorer and developer renderer functional until the next
   step; retain every legacy fact they consume and update affected
   characterization tests deliberately.
2. **Apply the complete scoring and recommendation policy.** Add failing
   category, ranking, and rendered-star tests. Replace additive rules with nine
   capped categories, fetch summaries for all completed games, implement new
   star threshold/precedence, and bump the rules version. Update traces,
   explanations, developer rendering, cache tests, app/browser fixtures, and
   README scoring/fetch/star behavior together. Remove unused legacy extraction
   fields once nothing consumes them; if that changes the persisted fact
   contract, bump extraction again in this commit.

Each future commit must be coherent and independently reviewable, keep its
applicable tests passing, and include its related documentation. Combining scoring
and stars avoids releasing a hybrid recommendation policy or repeating the same
fixture migration. Complete both steps before treating the migration as finished
or deploying the new policy.

Update `README.md` to link to `scoring-new.md` as the source of truth and describe
the final categories, temporal semantics, recommendation/star rules, complete
summary coverage, compact facts, and invalidation. Replace its old
compatibility/discrepancy section. Mark `nflscores.md` as historical without
rewriting its original policy. Keep deployment and internet-dependency guidance.

## Verification and completion criteria

Run focused tests during each red-green cycle, then the README command before
each future implementation commit:

```sh
node --test tests/*.test.cjs
```

Run the optional browser smoke runner when Playwright and Chromium are available:

```sh
SUMMERALL_PLAYWRIGHT_PATH=/path/to/playwright \
SUMMERALL_CHROMIUM_PATH=/path/to/chromium \
node tests/browser-smoke.cjs
```

If optional browser dependencies are unavailable, record that verification gap.
Inspect the final diff for unintended adjacent assets or raw-payload persistence.
Completion requires all nine categories and stars to match `scoring-new.md`,
supported evidence and missing values to appear accurately in developer mode,
old caches to be handled deliberately, the dependency-free suite to pass, and
the standalone deployment/spoiler contract to remain intact.
