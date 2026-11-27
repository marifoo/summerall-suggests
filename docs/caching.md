# Compact cache and invalidation

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
entries are removed and refetched, rather than passed into scoring or navigation.
Discovery weeks must fit the season calendar; damaged calendars use NFL season
length defaults. Summary event IDs, when supplied by ESPN, must match the
requested game, and cached facts also carry and validate that game ID. Other localStorage
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
storage or on screen. See [week loading](data-sources.md) for background fetch order and navigation behavior.

**Clear cache** removes persistent and in-memory app entries and cancels queued
prefetch. In-flight responses and pending cached-discovery continuations cannot repopulate
the cleared cache or start new week requests. The visible
results stay available; refresh or subsequent navigation fetches again. Clearing
also works when localStorage is blocked.
