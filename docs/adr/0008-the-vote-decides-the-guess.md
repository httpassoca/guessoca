# The vote decides the guess, not the game

Questions, answers and guesses happen out loud on the turma's voice call. The game has no guess field, no text matching and no limited tries. When the person whose turn it is says they got it, they press "Acertei" (`claim`): the timer pauses and every other connected player votes "did X get it?" for fifteen seconds. Abstentions don't count, the majority of votes cast wins, and a tie counts as yes. Yes reveals the post-it to its owner and records them in the ranking; no resumes the turn with the time it had left. The moderator can mark anyone right or wrong at any moment, overriding the vote and even undoing a reveal.

## Considered options

- **Typed guesses matched against the post-it**: post-its are free text written by friends ("o cachorro da tia Neide"), so matching would need fuzzy rules, synonyms and language handling, and would still be wrong in exactly the cases friends find funny.
- **The claimer decides alone**: fastest, but nobody else gets a say, and an honest mistake on a noisy call would stand.

## Consequences

The room state machine models the vote as data (open votes, a deadline timer, a tally) and never reads post-it text to decide anything. Ghosts and disconnected people don't vote, so a two-person game is one voter deciding. Players can't undo a result; the moderator can.
