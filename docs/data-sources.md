# Data sources and week loading

- **Scoreboard**: `site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
- **Game Summary**: `site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={id}`

Week requests include `dates={seasonYear}`, `seasontype={2|3}`, `week={week}`, and `limit=1000` so they include the entire week rather than only the default day's games. The season year remains the same for January/February playoff games.

## Request behavior

- **API Requests**: Fetches scoreboards and game summaries directly from ESPN, with a 15-second timeout and HTTP/JSON error handling; no proxy or API key required
- **Week Loading**: Uses ESPN's current season/week to request the full week's schedule, then steps back to the most recent week with completed games
- **Background Loading**: Starts after the selected week renders. Loads the previous two weeks sequentially, including summaries needed for recommendations, using the same season transitions as navigation. Navigation shares any request already in flight and stops the old prefetch chain; background errors never replace the visible results.

Summaries are requested for every completed game, including blowouts, during
selected-week loading and previous-week prefetch. Unfinished games do not request
summaries. Missing summaries still allow scoreboard-only awards; a failed summary
is retried on revisit.

ESPN total records are assumed to include the completed game. Pregame records
reverse its win/loss result; ties do not change wins minus losses.

See [caching](caching.md) for request reuse, expiry, refresh, and clear-cache behavior.
