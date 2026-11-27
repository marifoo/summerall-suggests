# Partial history and evidence

Use `null` for unavailable facts. Missing clocks must not discard observable
lead changes or a known Q4 tying score; missing possession must not disable
score-based drama; missing summary history must not disable final-score bonuses.
Do not replace absent quarter scores, periods, or possession with zeros.

Positive evidence can establish a matching condition even in partial history.
Absence of a match establishes a negative only if the relevant coverage is
complete. An exact lead count requires adequate sequence coverage; observed
switches in an incomplete sequence must not masquerade as an exact count.

Retain a separate verified lead-change lower bound even when the exact total is
unknown. It must count distinct switches proved in chronological evidence,
without counting a shared transition twice across overlapping fragments. Five
proved switches establish +2 regardless of missing earlier history. Three or
four prove at least +1; award that supported minimum while a possible +2 remains
unresolved. Treat these as ordered minimum thresholds (3+, then 5+) under the
category cap, giving the specified 3–4/+1 and 5+/+2 result when the count is exact.
Do not report the bound as an exact count or an unknown higher tier as false.

Define per-fact coverage in the adapter from the verified source contract, not
from the mere presence of numeric scores and periods. Account for all relevant
drive collections and check game/period boundaries, ordering, duplicates, and
identifiable gaps. Reconcile the available sequence with known quarter and final
scores to detect contradictions. Reconciliation alone cannot prove completeness:
an omitted scoreless drive, or omitted scoring that returns to the same margin,
can leave plausible endpoints while hiding possession or drama.

Only mark coverage complete when the verified collection contract and observed
boundary/sequence evidence support it for that fact. Otherwise preserve positive
witnesses but leave unsupported negatives and exact counts unknown. Explicitly
test omitted initial/final drives and a missing middle segment, including one
whose remaining scores still reconcile. Period/clock/possession coverage can
differ; do not use one global completeness flag to disable unrelated facts.
A missing score observation does not erase a proved transition between known
states. A missing ending clock can still use a preceding known Q4 time as its
upper bound; malformed clocks remain unknown without discarding other facts.
For time-sensitive bonuses, a positive witness must establish the required
period or clock as well as the score condition. A justified interval is enough
when every possible timing within it qualifies; endpoints that admit both a
qualifying and nonqualifying timing leave that tier unknown. Keep an exact time
distinct from a proved clock bound, and do not attach the event to an endpoint's
scoreless play. These bounds are derived evidence, not estimated scores or times.

For alternative conditions, one known true branch suffices even if another is
unknown. If a lower tier is established but the higher tier cannot be assessed,
award the established points and expose that uncertainty in the trace. This
continues the existing policy of awarding only supported points; it adds no
confidence penalty or estimated bonus.

See [source context](extraction-source.md) and [temporal facts](extraction-temporal.md).
