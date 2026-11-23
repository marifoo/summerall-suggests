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

A game is marked as "watchable" if it meets **any** of these criteria:

| Criteria | Condition |
|----------|-----------|
| Close Game | Both teams scored 18+ AND final margin ≤ 7 |
| Comeback | 14+ point deficit in 2nd half, then won or lost by 1 |
| Playoff | Any postseason game with margin ≤ 9 |
| High-Scoring | Combined score 55+ AND margin ≤ 15 |
| Lead Changes | 5+ lead changes AND both teams scored 15+ |

Games meeting the most criteria receive a star icon.

## Technical Details

- **Single HTML File**: Pure vanilla JavaScript (ES6+), no build tools required
- **Styling**: Tailwind CSS via CDN
- **Data Source**: ESPN public APIs
- **API Requests**: Fetches scoreboards and game summaries directly from ESPN, with a 15-second timeout and HTTP/JSON error handling; no proxy or API key required
- **Week Loading**: Uses ESPN's current season/week to request the full week's schedule, then steps back to the most recent week with completed games
- **Background Loading**: Starts after the selected week renders. Loads the previous two weeks sequentially, including summaries needed for recommendations, using the same season transitions as navigation. Navigation shares any request already in flight and stops the old prefetch chain; background errors never replace the visible results.
- **Caching Strategy**:
  - Each week cached separately for quick navigation
  - Up to three complete weeks retained in memory, so preloaded results remain available when localStorage is full or blocked
  - Moving a cached scoreboard into memory preserves its original expiration, including the five-minute latest-week detection limit
  - Scoreboard (all games final): 2 hours
  - Game summaries (final): Cached indefinitely
  - In-progress games: 5 minutes
  - Scheduled games: 1 hour
  - Latest-week detection: 5 minutes
  - Manual refresh bypasses the selected week's scoreboard and game-summary caches
  - Older in-flight responses cannot overwrite a newer refresh in persistent storage

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

Run the fetch and rendering regression tests with Node.js 18 or newer (no dependencies to install):

```sh
node --test tests/espn-fetch.test.cjs
```

See [AGENTS.md](AGENTS.md) for design principles, red-green bug-fix testing, and atomic commit requirements.

## Coverage

Supports regular season, playoffs, and Super Bowl games.

## License

MIT
