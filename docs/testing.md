# Verification

Run these commands from the repository root.

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

See [AGENTS.md](../AGENTS.md) for design principles, red-green bug-fix testing, and atomic commit requirements.

See [scoring test cases](scoring-test-cases.md) for the migration acceptance matrix
and [fixture evidence](fixture-evidence.md) for source recordings.
