# Architecture

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

The [source contract](extraction-source.md) owns normalization and scoreboard
context dependencies. [Temporal extraction](extraction-temporal.md) defines the
derived facts; [partial-history evidence](extraction-evidence.md) defines what
can be concluded when observations are missing. [Fixture evidence](fixture-evidence.md)
records the verified ESPN payload behavior.

See [data sources](data-sources.md) for fetching, [caching](caching.md) for storage,
and [evaluation and ranking](scoring-evaluation.md) for the scoring interface.
