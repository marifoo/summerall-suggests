# ESPN adapter evidence

`espn-401671793.json` is an allowlisted recording of the ESPN summary for
Kansas City at Atlanta, September 22, 2024, obtained from the URL in its `source`
field. It retains the complete observed drive/play chronology, stable IDs,
sequence numbers, scores, periods, clocks, and live start down/team. Names,
articles, statistics, logos, and other unrelated fields were removed.

The opening kickoff and first offensive down are both at 15:00 with a 0–0
score. Subsequent play clocks decrease; `start.down` and `start.team` identify
the snap's possession. The first touchdown's score is 7–0 (including its attached
conversion); the following scoreless timeout remains 7–0. Thus scores are
post-play while the play clock describes the start of the play. Terminal plays
may have no live down. A drive team or `end.team` alone does not prove a live
possession.

The fixture establishes ascending sequence-number ordering, stable-ID duplicate
removal, and completed-drive array representation. The adapter also accepts
object drive collections and a separately supplied current drive; tests project
the verified records into these representations and overlap them to check
identity-based deduplication. This does not claim ESPN guarantees a complete
collection. Neither sequence numbers nor matching final totals can prove that
an unobserved scoreless drive was present. Consequently exact lead counts and
negative history-dependent facts remain unknown; positive lower bounds and
same-period timing intervals remain usable. Fixtures never control network
availability during automated tests.
