# Scoring migration plan

Historical migration plan from the original additive rules to the current nine-category policy.
It is retained as implementation rationale; it is not a description of pending work.
The original baseline used extraction version 3 and rules version 1.
The superseded rules are in [historical scoring](nflscores.md); the authoritative
current rules are in [scoring policy](scoring-new.md).

## Design contracts

- [Source normalization and scoreboard context](extraction-source.md)
- [Temporal facts](extraction-temporal.md)
- [Partial history and evidence](extraction-evidence.md)
- [Evaluation and ranking](scoring-evaluation.md)
- [Acceptance cases](scoring-test-cases.md)

## Cache migration

Bump `EXTRACTION_VERSION` for new facts and corrected temporal extraction. Bump
`RULES_VERSION` for the new categories and awards. Update `isPlayMetrics`, the
projection in `extractMetrics`, and any source validators to accept exactly the
new nullable fact/evidence contract. Reject malformed cached values and refetch.

The [cache guide](caching.md) defines version invalidation, expiry, bounds, and
refresh/clear guarantees. The [data source guide](data-sources.md) defines summary
coverage and request sharing. Preserve those contracts during migration; a separate
schema bump is needed only when the envelope or rendering contract changes.
More summary requests increase cold-load work; the migration deliberately avoids
adding a separate request scheduler.

## Original delivery sequence

1. **Extend and correct extraction.** Add failing quarter-boundary/OT-recovery
   regressions and fixture-based clock, possession, and competitiveness tests.
   Implement the adapter and compact facts, source validation, fact projection,
   explicit scoreboard-context dependency, and extraction-version bump together.
   Update old OT-comeback expectations and [extraction](extraction-source.md) and [cache](caching.md) documentation.
   Keep the existing scorer and developer renderer functional until the next
   step; retain every legacy fact they consume and update affected
   characterization tests deliberately.
2. **Apply the complete scoring and recommendation policy.** Add failing
   category, ranking, and rendered-star tests. Replace additive rules with nine
   capped categories, fetch summaries for all completed games, implement new
   star threshold/precedence, and bump the rules version. Update traces,
   explanations, developer rendering, cache tests, app/browser fixtures, and
   [scoring](scoring-new.md) and [fetch behavior](data-sources.md) documentation together. Remove unused legacy extraction
   fields once nothing consumes them; if that changes the persisted fact
   contract, bump extraction again in this commit.

The sequence kept extraction independently reviewable while combining scoring
and stars to avoid a hybrid recommendation policy or repeated fixture migration.
Both steps were required before deploying the new policy.

## Completion criteria

Run [verification](testing.md). If optional browser dependencies are unavailable,
record that verification gap. Inspect the diff for unintended adjacent assets or
raw-payload persistence. Completion requires the scoring policy, accurate supported
evidence and missing values in developer mode, deliberate old-cache handling,
passing tests, and preservation of standalone hosting and spoiler protections.
