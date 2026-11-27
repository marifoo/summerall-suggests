# Evaluation and ranking contracts

Keep `evaluate(metrics)` pure and deterministic. Use a small, fixed category
definition with ordered tiers, rather than a general rule engine. Evaluate each
tier's own required facts and alternatives, then award only the highest known
matching tier. Sum the nine category awards exactly once.

Keep inputs, thresholds, applicability, match result, points, and explanations in
the returned trace. Include explicit tier results and a selected-tier identifier so a reader can see why +2 replaced +1. A capped category must not
render two independent positive awards.

Use category IDs such as `general-scoring`, `close-finish`, `overtime`, `comeback`,
`late-drama`, `lead-changes`, `shootout`, `team-quality`, and
`playoff-significance`. Keep `reasons` derived from awarded categories.

Pregame records follow the [ESPN source assumption](data-sources.md).

## Ranking

Apply the star precedence in the [scoring policy](scoring-new.md).

Preserve descending-point order and schedule order for ties. Keep completed-game
rank and numeric weekly-maximum diagnostics useful even when no game qualifies;
explain that a numerical leader below 3 receives no recommendation or stars.
Scheduled/live games remain unranked.

See [developer mode](developer-mode.md) for rendering and spoiler protections.
