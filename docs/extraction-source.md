# Extraction source contract

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

## Normalization boundary

Keep the play adapter private to `watchability-module`. Normalize score states,
periods, clocks as seconds remaining, and defensible possession evidence. Keep
team identifiers needed for home/away mapping inside this boundary. Preserve
scoreboard quarter scores and any additional verified OT metadata needed by the
allowlisted scoreboard contract.

Do not persist raw summaries, drive collections, or full play arrays. Persist
small derived facts and bounded representative evidence instead. Scores, game
completion, and pregame records remain owned by scoreboard extraction; cached
play facts cannot override them.

## Scoreboard context

Derive a small `sourceContext` value from the normalized scoreboard game. Include
nullable home/away halftime and end-of-Q3 scores, calculated only when both
teams have all required quarter values, and completed-game final scores for
reconciliation. Use the page boundary `fetchGameFacts(game, forceRefresh)`
to pass this context to `extractPlayMetrics(summary, sourceContext)` before
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

See [temporal facts](extraction-temporal.md), [partial evidence](extraction-evidence.md),
and [fixture evidence](fixture-evidence.md).
