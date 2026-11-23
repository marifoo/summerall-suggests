# Summerall Suggests

A spoiler-free NFL game recommendation website that helps you decide which games are worth watching.

## Features

- **Spoiler-Free Recommendations**: Shows only team names and pre-game records for recommended games
- **Smart Analysis**: Automatically identifies exciting games based on multiple criteria
- **Star Ratings**: Recommended games receive stars according to points and weekly ranking
- **Spoiler Zone**: Optional section to view full scores and quarter-by-quarter breakdowns
- **Developer Mode**: Explicit opt-in inspection of all games, metrics, scoring traces, and ranking explanations (reveals spoilers)
- **Clear Cache**: Remove app-owned persistent and memory caches
- **Week Navigation**: Browse backwards and forwards through past weeks and seasons
- **Background Loading**: After showing a week, loads the previous week's results, then the week before that, for faster navigation
- **Automatic Week Detection**: Defaults to the most recent week with completed games
- **Manual Refresh**: "Refresh data" button to fetch latest results on demand
- **Caching**: Reduces API calls with intelligent localStorage caching
- **Responsive Design**: Mobile-friendly card-based layout using Tailwind CSS

## How Games Are Recommended

[scoring-new.md](scoring-new.md) is the authoritative policy. Evaluate completed games only and sum these nine categories, awarding only the highest matching tier within each category:

| Category | Condition | Points |
|---|---|---|
| General scoring | Combined final score >28 | +1 |
| Close finish | Final margin ≤8 / ≤2 | +1 / +2 |
| Overtime | Reached OT, including a tied result | +1 |
| Comeback | Erase 15+ in Q3/Q4 / erase 8+ in Q4 | +1 / +2 |
| Late drama | Q4 tying/go-ahead score or trailing possession down 1–8 at ≤3:00 / Q4 tying/go-ahead score at ≤5:00 | +1 / +2 |
| Lead changes | At least 3 / 5 verified leader switches | +1 / +2 |
| Shootout | Final total ≥55 with final margin ≤10 or Q4 margin ≤7 / total ≥65 with margin ≤10 at Q3 end, in Q4, or final | +1 / +2 |
| Team quality | Both pregame wins minus losses ≥2 | +1 |
| Playoff significance | Both pregame wins minus losses ≥7 | +1 |

The maximum is 14 points; there is no losing-record penalty. General scoring
stacks with shootout, and both record categories stack. Record differentials
assume ESPN total records include the completed game, whose result is reversed;
ties do not change wins minus losses. Playoff significance is record based.

Recommend at **3+ points**. Every tied leader among recommended games receives
**3 stars**. Other recommendations receive **1 star at 6+**, or none at 3–5.
A numerical weekly leader below 3 is not recommended or starred. Sort descending
by points, preserving schedule order for ties.

Comebacks require recovering to a tie or lead in regulation; OT-only recoveries
do not count, and later losing does not undo a recovery. Ties preserve the last
leader for counting switches. Drama survives later scores and conversions.
Q4 competitiveness includes the score carried into the quarter; final-total
shootout thresholds need not have been reached at that competitive moment.
Summaries are requested for **every completed game**, including blowouts, during
selected-week loading and previous-week prefetch. Missing summaries still allow
scoreboard-only awards. Unfinished games do not request summaries.

Unavailable facts remain null. Positive witnesses in partial history can establish
a tier; unsupported negatives and higher tiers remain unknown. The evaluator
awards the highest supported tier and exposes unresolved alternatives in its trace.
[nflscores.md](nflscores.md) records the historical policy.

## Developer mode (spoilers)

Check **Developer mode — reveals spoilers for all games** above the results. It is
off on every page load and never persisted. It shows every game in the selected
week, including scheduled/live games and blowouts, with actual scores,
extracted metrics (including comeback facts, missing values, and summary availability),
every category's inputs/thresholds/tier applicability/results/selected tier/points, total points,
recommendation cutoff and decision, weekly rank, ties, and star explanations.
Non-completed games are ineligible and unranked. An unavailable fact displays as
`null`; it is distinct from a known zero or false value.

This view consumes the same evaluations used to render normal recommendations;
it does not request extra data or apply a second scoring policy. It also reveals
when summary history left facts unavailable. Turning it off removes
the inspection content from the DOM. Navigation clears old inspection results
while loading; the checkbox stays enabled for the current page session.
Normal recommendation cards continue to show only names, pre-game records, dates,
and stars; scores and rule details remain behind the separate spoiler opt-ins.
Spoiler quarter tables align both teams across all known periods, label overtime
as OT/2OT/etc., and show a dash for unavailable quarter values.

## Technical Details

- **Standalone HTML App**: Application code is embedded in `index.html`; no build tools or package installation required
- **Styling**: Tailwind CSS via CDN
- **Data Source**: ESPN public APIs
- **API Requests**: Fetches scoreboards and game summaries directly from ESPN, with a 15-second timeout and HTTP/JSON error handling; no proxy or API key required
- **Week Loading**: Uses ESPN's current season/week to request the full week's schedule, then steps back to the most recent week with completed games
- **Background Loading**: Starts after the selected week renders. Loads the previous two weeks sequentially, including summaries needed for recommendations, using the same season transitions as navigation. Navigation shares any request already in flight and stops the old prefetch chain; background errors never replace the visible results.
- **Caching Strategy**: Compact, versioned, bounded localStorage plus up to three complete weeks in memory; see below.

## Compact cache and invalidation

The inline `compact-cache-module` in `index.html` owns the persistent envelope and storage policy. Entries under
`summerall:` contain allowlisted scoreboard metadata (team names/logos, status,
actual scores, quarter scores, total records, dates, season calendar), extracted
play facts, and individual metrics plus complete decision traces. Full ESPN
summaries, drives, plays, boxscores, and unrelated scoreboard fields are never
persisted. Ranking is derived from the selected week's evaluations. Week loading evaluates
current facts rather than trusting saved decisions; damaged or inconsistent traces
are repaired without refetching valid scores or play facts.

Three versions have independent meanings:

- **Schema version** (`schemaVersion` in the page): changes to the envelope or
  rendering contract remove incompatible entries.
- **Extraction version** (`EXTRACTION_VERSION` in the inline `watchability-module`): bump when the
  required facts or extraction semantics change. Old entries are removed and ESPN
  is refetched because their metrics cannot establish the new facts. This is a
  conservative invalidation of all extracted entries, including scoreboards.
- **Rules version** (`RULES_VERSION` in the inline `watchability-module`): bump for scoring weights,
  thresholds, recommendation, or star policy. Valid cached metrics are reevaluated
  and the new trace saved on read, without fetching ESPN. Scoreboard/play facts
  remain reusable. Normal expiry or eviction can independently require a fetch.

Startup and subsequent cache access remove expired, corrupt, incompatible, and
legacy app-owned `nfl_scoreboard*` / `nfl_summary_*` entries. Source caches are
also validated at their domain boundary: weekly metadata must match the requested
week/year/season type, discovery boundaries must be valid, and play facts must
have the extractor's nullable numeric/boolean/evidence shape. Malformed source
entries are removed and refetched, rather than passed into scoring or navigation. Other localStorage
keys are preserved. Storage is bounded to **128 entries and 1.5 MiB** (UTF-16
key/value estimate), with least-recently-used eviction. Quota failures evict older
entries and retry; unavailable storage becomes a cache miss. Three complete weeks
remain usable in memory when persistent storage cannot be used.

Lifetimes:

| Entry | Lifetime |
|-------|----------|
| All-final scoreboard | 2 hours |
| Scoreboard with live games | 5 minutes |
| Scheduled or empty scoreboard | 1 hour |
| Latest-week detection | 5 minutes |
| Final summary-derived play metrics | 30 days |
| Live / scheduled summary-derived metrics | 5 minutes / 1 hour |
| Individual metrics and decisions | Selected scoreboard's remaining lifetime |

Reads preserve original expiration; warming memory cannot renew scoreboard,
latest-detection, or summary-derived fact lifetimes. A memory week expires at the
earliest expiration of its scoreboard and the play facts used in its decisions. Expired facts are refetched, rather than kept forever.
Manual refresh bypasses the selected week's scoreboard and play-fact caches;
refresh at the latest week also rediscovers the latest week. Requests share work,
but a refresh starts a fresh request and older responses cannot replace it in
storage or on screen. Background loading still fetches the previous two weeks
sequentially after rendering, stops its old chain on navigation, and keeps failures
out of the visible results.

**Clear cache** removes persistent and in-memory app entries and cancels queued
prefetch. In-flight responses and pending cached-discovery continuations cannot repopulate
the cleared cache or start new week requests. The visible
results stay available; refresh or subsequent navigation fetches again. Clearing
also works when localStorage is blocked.

## Architecture

The inline `watchability-module` in `index.html` is a pure module with four boundaries: allowlist ESPN normalization,
threshold-independent metric extraction, deterministic individual evaluation, and
week-level ranking. `evaluate(metrics)` returns every category's inputs, thresholds,
tier applicability, match results, selected tier, and awarded points (including zero),
total, and recommendation cutoff/decision. `rankWeek` adds rank and star explanations
without mutating evaluations. All scoring thresholds and weights live together in
that module. The inline `compact-cache-module` in `index.html` owns versioning, expiry, bounds, eviction, and
storage failures behind `getEntry` / `get` / `set` / `remove` / `clear`. The page
owns request sharing, week loading, navigation, and rendering.

Unavailable scores, records, linescores, and play history are `null`, rather than
fabricated zeros or false values. Rules lacking required data award zero points and
explain why they are inapplicable. Scheduled/live/cancelled games cannot qualify.
Normalization falls back to competition status when event status omits its type.
This explicitly handles absent facts; scoring follows [scoring-new.md](scoring-new.md).
The ESPN adapter merges drive collections and independently recorded scoring
plays, deduplicates stable play IDs, and orders verified sequence numbers or
period/clock observations. Sanitized recordings in `tests/fixtures` verify
post-play scores, event clocks, scoring values and conversions, and overtime
period evidence. Live possession uses post-play team/down evidence, excluding
terminal markers; start ownership at a turnover's finish clock cannot establish
continued possession. Explicitly described untimed downs are separate from an
expired clock. The latest possession witness for each positive deficit and
representative score/clock evidence are persisted; raw plays and drives are not.

The verified source contract does not guarantee that omitted drives or plays can
be detected. Exact lead-change totals and unsupported negative temporal facts
therefore remain unknown; independently proved leader switches provide a lower
bound that still earns supported lead-change tiers. Quarter and final-score
reconciliation detects contradictions but cannot prove completeness. Q4 score
intervals retain conservative clock bounds, separate from an exact event clock.
A missing score observation does not erase a proved transition between known
states; a missing ending clock can still use a preceding known Q4 time as its
upper bound. Malformed clocks remain unknown without discarding other facts.

Halftime and cumulative end-of-Q3 scores anchor regulation comebacks and Q4
competitiveness; overtime-only recoveries do not count. Each cached summary fact
stores the scoreboard context (including completed final scores) used during
extraction. Changed or newly available context triggers a fresh summary; concurrent
requests with different contexts cannot share an inconsistent result. Scoreboard
completion, scores, and pregame records cannot be overwritten by cached play facts.


## Deployment

1. Fork or clone this repository
2. Enable GitHub Pages in repository settings
3. Set source to the main branch
4. Access your site at `https://<username>.github.io/<repo-name>`

GitHub Pages serves the repository directly, including a repository subpath; no
build, deployment script, backend, or secrets are required. You can also download
or copy **only `index.html`** and open it in a modern browser. The scoring and cache
modules are embedded in named script blocks, preserving their separate interfaces.
Internet access is needed for ESPN data and Tailwind CDN styling. Embedded CSS
keeps spoiler sections hidden even if the styling CDN fails.

## Data Sources

- **Scoreboard**: `site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
- **Game Summary**: `site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={id}`

Week requests include `dates={seasonYear}`, `seasontype={2|3}`, `week={week}`, and `limit=1000` so they include the entire week rather than only the default day's games. The season year remains the same for January/February playoff games.

## Verification

Run the scoring, extraction, ranking, fetch, and rendering regression tests with Node.js 18 or newer (no dependencies to install):

```sh
node --test tests/*.test.cjs
```

Tests load the canonical named script blocks from `index.html`; there are no
duplicate scoring/cache implementations. The suite covers scoring boundaries and cumulative bonuses, comeback/tie semantics,
capped category and zero points, missing data, star ties, compact serialization, independent
version changes, expiry preservation, eviction/quota/blocked storage, request sharing,
refresh/clear races, sequential prefetch, and opt-in developer rendering. Browser
smoke verification is also available with an installed Playwright package and
Chromium (optional testing dependencies; not needed to run or deploy the app):

```sh
SUMMERALL_PLAYWRIGHT_PATH=/path/to/playwright \
SUMMERALL_CHROMIUM_PATH=/path/to/chromium \
node tests/browser-smoke.cjs
```

If Playwright resolves normally and its Chromium is installed, the environment
variables may be omitted. This runner copies only `index.html` into a temporary
directory and checks a static root URL, GitHub Pages repository subpath, and local
file with the styling CDN blocked. ESPN fixtures make results deterministic. It
checks spoiler protection, developer inspection, mobile overflow, clear-cache, and
reload defaults without relying on live game results.

See [AGENTS.md](AGENTS.md) for design principles, red-green bug-fix testing, and atomic commit requirements.

## Coverage

Supports regular season, playoffs, and Super Bowl games.

## License

MIT
