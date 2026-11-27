# ESPN adapter evidence

The JSON fixtures described here live in [`tests/fixtures/`](../tests/fixtures/)
at the repository root.

`espn-401671793.json` is an allowlisted recording of the ESPN summary for
Kansas City at Atlanta, September 22, 2024, obtained from the URL in its `source`
field. It retains the complete observed drive/play chronology, stable IDs,
sequence numbers, scores, periods, clocks, and live start down/team. Names,
articles, statistics, logos, and other unrelated fields were removed.

The opening kickoff and first offensive down are both at 15:00 with a 0–0
score. The first touchdown's score is 7–0 (including its attached conversion);
the following scoreless timeout remains 7–0. Scores describe post-play states.
A start team/down describes possession before the play; it cannot be combined
with the displayed clock to prove the same team still possesses the ball after
a turnover. Live observations use verified end ownership/down and exclude
terminal period/game markers. A drive team alone is insufficient.

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

`espn-401437880-ot-tie.json` records the December 4, 2022 Washington at New
York Giants 20–20 tie. Its `sources` fields identify the fetched scoreboard and
summary URLs. The allowlisted scoreboard has status period 5 and five quarter
scores on both sides, including 0–0 in OT. The summary sample preserves all five
observed OT drives, IDs, sequence numbers, clocks, post-play scores, start/end
possession fields, and play type IDs. Regulation plays are deliberately omitted;
the sample establishes positive OT evidence without claiming complete regulation
coverage. The actual response uses an array of previous drives with no current
drive. Its terminal type-66 play still has a numeric end down and team, so these
fields alone cannot establish a live possession at 0:00.

`espn-scoring-evidence.json` keeps four actual scored drive records and their
matching top-level scoring-log entries from the same Atlanta/Kansas City game.
The stable IDs match across both collections. The scoring log supplies the
scoring team's ID, while `scoringType.name` identifies touchdowns and field goals.
Touchdowns include their attached conversion in the post-play score;
`pointAfterAttempt.value` records the conversion's awarded points. The drive
record and scoring log use the same displayed scoring-event clock, so a verified
scoring transition can use that recorded time independently of a missing earlier
play. The adapter does not infer the scoring team from possession on an arbitrary
return touchdown.

`espn-eight-point-recovery.json` records the February 12, 2023 Super Bowl's
Philadelphia touchdown and successful two-point conversion at 5:15 in Q4. It
keeps that scored drive record and matching scoring-log entry only. Both report
35–35 after the attached conversion, with conversion value 2 and Philadelphia's
scoring identity. These establish an independently reconstructable 27–35 to
35–35 recovery; prior drive history is deliberately omitted. Boundary tests
project the recorded event schema to 5:01, 5:00, 4:59 and 0:00 without network
requests.

Tests also omit a scored drive record while retaining its matching scoring-log
record. The adapter consumes the latter once by stable ID, preserving positive
scoring evidence when the drive collection is partial. A scoring-log touchdown
without attached conversion metadata can still prove a tying post-score state;
it cannot reconstruct an unsupported conversion total or possession.
