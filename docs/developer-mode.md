# Developer mode and spoilers

Check **Developer mode — reveals spoilers for all games** above the results. It is
off on every page load and never persisted. It shows every game in the selected
week, including scheduled/live games and blowouts, with actual scores,
extracted metrics (including comeback facts, missing values, and summary availability),
every category's inputs/thresholds/tier applicability/results/selected tier/points, total points,
recommendation cutoff and decision, weekly rank, ties, and star explanations.
Non-completed games are ineligible and unranked. An unavailable fact displays as
`null`; it is distinct from a known zero or false value.

This view consumes the same evaluations used to render normal recommendations;
it does not request extra data or apply a second scoring policy. It also reveals
when summary history left facts unavailable. Turning it off removes
the inspection content from the DOM. Navigation clears old inspection results
while loading; the checkbox stays enabled for the current page session.
Normal recommendation cards continue to show only names, pre-game records, dates,
and stars; scores and rule details remain behind the separate spoiler opt-ins.
Spoiler quarter tables align both teams across all known periods, label overtime
as OT/2OT/etc., and show a dash for unavailable quarter values.
