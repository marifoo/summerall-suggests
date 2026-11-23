> Historical policy. Superseded by [scoring-new.md](scoring-new.md).

Also read the README.md. 

For this project, I want to add a different determination, if the game is watchable. Internally, this shall be done via points and the game with the highest points is the most watchable.

Scoring:
  - **Close Games:** Differential ≤ 8 points gives +1 for our metric
  - **Very Close Games:** Additionally, a differential ≤ 2 points gives a bonus +1 for our metric
  - **Decided in Overtime:** Game goes into overtime, and does not end in a draw gives a bonus +1
  - **Comebacks:** Recovery from a 15+ point deficit (anywhere) in the second half gives +1. (Game doesn't need to be won)
  - **Strong Comebacks:** Recovery from a 8+ point deficit in the 4th quarter gives a bonus +1. (Game doesn't need to be won)
  - **Shootouts:** Combined score of 55+ while finishing with a differential ≤ 10 points gives +1
  - **Super Shootouts:** Combined score of 64+ while finishing with a differential ≤ 10 points gives +1
  - **Late Lead Changes:** The last score in the 4th quarter being a lead change gives +1 
  - **Total Lead Changes:** 5+ lead changes gives +1 
  - **Many total Lead Changes:** 7+ lead changes gives a bonus +1 
  - **Record number total Lead Changes:** 10+ lead changes gives a bonus +1 
  - **Playoff Teams involved:** Both teams having a Record differential of at least +2 gives +1
  - **Losing Teams involved:** Both teams having a Record differential of -4 or worse gives -1
 
Any game with 2+ points shall be recommended. 
Any game with 5+ points shall be highlighted with a star.
The game with the highest score shall be highlighted with 3 stars. On a tie, all of those tied shall be highlighted.
