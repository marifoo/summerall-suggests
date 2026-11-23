# Summerall Suggests

A spoiler-free NFL game recommendation website that helps you decide which games are worth watching.

## Features

- **Spoiler-Free Recommendations**: Shows only team names and pre-game records for recommended games
- **Smart Analysis**: Automatically identifies exciting games based on multiple criteria
- **Star Ratings**: Top games receive a star indicator based on how many criteria they meet
- **Spoiler Zone**: Optional section to view full scores and quarter-by-quarter breakdowns
- **Week Navigation**: Browse backwards and forwards through past weeks and seasons
- **Background Loading**: After showing a week, loads the previous week's results, then the week before that, for faster navigation
- **Automatic Week Detection**: Defaults to the most recent week with completed games
- **Manual Refresh**: "Refresh data" button to fetch latest results on demand
- **Caching**: Reduces API calls with intelligent localStorage caching
- **Responsive Design**: Mobile-friendly card-based layout using Tailwind CSS

## How Games Are Recommended

The implemented points policy is the compatibility baseline. Bonuses accumulate:

| Rule | Condition | Points |
|------|-----------|--------|
| Close / very close | Margin ≤ 8 / ≤ 2 | +1 each |
| Overtime | Home linescores contain more than four periods, final score not tied | +1 |
| Comeback | Observed deficit ≥ 15 in Q3 or later, then tied or led | +1 |
| Strong comeback | Observed deficit ≥ 8 in Q4 or later, then tied or led | +1 |
| Shootout / super shootout | Combined score ≥ 55 / ≥ 64, margin ≤ 10 | +1 each |
| Late lead change | Last score change in Q4 switches directly between opposing leaders | +1 |
| Lead changes | At least 5 / 7 / 10 changes (ties preserve the previous leader) | +1 each |
| Winning records | Both pre-game wins minus losses ≥ 2 | +1 |
| Losing records | Both pre-game wins minus losses ≤ -4 | -1 |

Recommendations require **3+ points**. Every recommended game with **5+ points
gets 3 stars**; otherwise games tied for the weekly maximum get **1 star**.
Other recommended games have no stars. Sort order is descending points, preserving
schedule order for ties. A low-scoring weekly leader is not recommended automatically.

### Policy discrepancies (preserved, not silently corrected)

- The former README described an obsolete any-criterion policy (18+ scores,
  seven-point margins, playoff bonuses, 14-point comebacks, and different shootout
  conditions). The implementation uses the cumulative points policy above.
- [nflscores.md](nflscores.md) requests recommendations at **2+**, **1 star at 5+**,
  and **3 stars for the weekly maximum**. The implementation uses **3+**, **3 stars
  at 5+**, and **1 star for a lower weekly maximum** instead.
- Comebacks require subsequently tying or leading, not merely reducing the deficit;
  Q4 comeback detection also includes overtime. The last Q4 score must switch
  directly between leaders; a tie followed by a lead does not qualify.
- Summary fetching is selective: postseason events (when event-level season metadata
  exists), both teams scoring 15+, or margin ≤ 15. Skipped blowouts receive no
  summary-dependent bonuses even if an unobserved comeback happened. Record
  differentials assume ESPN's total record includes the completed game.

## Technical Details

- **Static App**: Pure vanilla JavaScript (ES6+), no build tools required
- **Styling**: Tailwind CSS via CDN
- **Data Source**: ESPN public APIs
- **API Requests**: Fetches scoreboards and game summaries directly from ESPN, with a 15-second timeout and HTTP/JSON error handling; no proxy or API key required
- **Week Loading**: Uses ESPN's current season/week to request the full week's schedule, then steps back to the most recent week with completed games
- **Background Loading**: Starts after the selected week renders. Loads the previous two weeks sequentially, including summaries needed for recommendations, using the same season transitions as navigation. Navigation shares any request already in flight and stops the old prefetch chain; background errors never replace the visible results.
- **Caching Strategy**: Compact, versioned, bounded localStorage plus up to three complete weeks in memory; see below.

## Compact cache and invalidation

`compact-cache.js` owns the persistent envelope and storage policy. Entries under
`summerall:` contain allowlisted scoreboard metadata (team names/logos, status,
actual scores, quarter scores, total records, dates, season calendar), extracted
play facts, and individual metrics plus complete decision traces. Full ESPN
summaries, drives, plays, boxscores, and unrelated scoreboard fields are never
persisted. Ranking is derived from the selected week's evaluations.

Three versions have independent meanings:

- **Schema version** (`schemaVersion` in the page): changes to the envelope or
  rendering contract remove incompatible entries.
- **Extraction version** (`EXTRACTION_VERSION` in `watchability.js`): bump when the
  required facts or extraction semantics change. Old entries are removed and ESPN
  is refetched because their metrics cannot establish the new facts. This is a
  conservative invalidation of all extracted entries, including scoreboards.
- **Rules version** (`RULES_VERSION` in `watchability.js`): bump for scoring weights,
  thresholds, recommendation, or star policy. Valid cached metrics are reevaluated
  and the new trace saved on read, without fetching ESPN. Scoreboard/play facts
  remain reusable. Normal expiry or eviction can independently require a fetch.

Startup and subsequent cache access remove expired, corrupt, incompatible, and
legacy app-owned `nfl_scoreboard*` / `nfl_summary_*` entries. Other localStorage
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

Reads preserve original expiration; warming memory cannot renew scoreboard or
latest-detection lifetimes. Expired facts are refetched, rather than kept forever.
Manual refresh bypasses the selected week's scoreboard and play-fact caches;
refresh at the latest week also rediscovers the latest week. Requests share work,
but a refresh starts a fresh request and older responses cannot replace it in
storage or on screen. Background loading still fetches the previous two weeks
sequentially after rendering, stops its old chain on navigation, and keeps failures
out of the visible results.

**Clear cache** removes persistent and in-memory app entries and cancels queued
prefetch. In-flight responses cannot repopulate the cleared cache. The visible
results stay available; refresh or subsequent navigation fetches again. Clearing
also works when localStorage is blocked.

## Architecture

`watchability.js` is a pure module with four boundaries: allowlist ESPN normalization,
threshold-independent metric extraction, deterministic individual evaluation, and
week-level ranking. `evaluate(metrics)` returns every rule's inputs, thresholds,
weight, applicability, match result, awarded points (including zero and negative),
total, and recommendation cutoff/decision. `rankWeek` adds rank and star explanations
without mutating evaluations. All scoring thresholds and weights live together in
that module. The page owns fetching, navigation, and rendering.

Unavailable scores, records, linescores, and play history are `null`, rather than
fabricated zeros or false values. Rules lacking required data award zero points and
explain why they are inapplicable. Scheduled/live/cancelled games cannot qualify.
This explicitly handles absent facts; valid-data scoring follows the characterized
implementation. Empty or incomplete play history cannot establish a negative fact.

## Deployment

1. Fork or clone this repository
2. Enable GitHub Pages in repository settings
3. Set source to the main branch
4. Access your site at `https://<username>.github.io/<repo-name>`

Or simply open `index.html` in any modern browser.

## Data Sources

- **Scoreboard**: `site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
- **Game Summary**: `site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={id}`

Week requests include `dates={seasonYear}`, `seasontype={2|3}`, `week={week}`, and `limit=1000` so they include the entire week rather than only the default day's games. The season year remains the same for January/February playoff games.

## Verification

Run the scoring, extraction, ranking, fetch, and rendering regression tests with Node.js 18 or newer (no dependencies to install):

```sh
node --test tests/*.test.cjs
```

See [AGENTS.md](AGENTS.md) for design principles, red-green bug-fix testing, and atomic commit requirements.

## Coverage

Supports regular season, playoffs, and Super Bowl games.

## License

MIT
