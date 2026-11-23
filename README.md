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
