# Anyone can turn ghost; the moderator can turn anyone ghost

The owner asked for an option to "ghost" players: they set themselves as ghosts, and the moderator can too. Nothing more was specified, so this records the reading we chose. Before this, a ghost (`fantasma`) was only someone outside the turn order: a late joiner, or the moderator who chose to only moderate. Now a member can also **turn ghost** (`ghosted`): stay in the room, walk, emote and chat, but be out of play (away from the keyboard, just watching, just hanging out).

- **Who**: anyone toggles it for themselves, in any phase; the moderator toggles it for anyone else. There is no lock: someone the moderator ghosted un-ghosts themselves when they're back. It's state in the pure room (`GameState.ghosted`, the `ghost` action in `@guess/rules`), sent by a new `{ type: 'ghost', member, on }` client message that the protocol parser validates; the rules refuse anyone but the member or the moderator.
- **Lobby**: a ghost leaves the turn order (the author circle closes without them, and post-its whose author changes are cleared, as when someone joins or is kicked) and doesn't write. Un-ghosting puts them at the end of the order, like a newcomer.
- **Game**: a ghost stays in the order and keeps their post-it (hidden from them as always; ghosting never reveals it), so un-ghosting rejoins the turns on the next round. Meanwhile their turn is skipped (at once, if it was theirs), they aren't a voter (their vote is dropped if a vote was open; if they had claimed, the vote is dropped without a result and the turn moves on), they can't claim, give up or be marked right, and they don't hold the game open: it ends when every connected non-ghost player has guessed or given up. If everyone turns ghost, the game waits with no turn, as it does when everyone drops. Whoever already guessed stays in the ranking.
- **Play again**: ghosts stay out of the new order until they un-ghost.
- **Rooftop**: a ghost is drawn translucent, ice-blue tinted and floating a few world pixels up (draw time only, no new art, `apps/web/src/lib/world/ghost.ts`). Bodies pass through a ghost and a ghost passes through everyone: no collision, no shove either way, no riding; the server drops shoves from or to a ghost. Funny bots don't see ghosts at all; talking bots know someone is a ghost and may say so.

## Considered options

- **A ghost leaves the order mid-game too**: simpler state, but they'd lose their post-it (its author can't rewrite it after the start) and couldn't come back until the next game, which is wrong for someone who just stepped away.
- **Keep ghosts in the order in the lobby as well**: no post-its cleared when someone toggles, but the game would start with a player who isn't there and someone would have to write a post-it for a person who only came to hang out.
- **Only the moderator can un-ghost someone they ghosted**: protects against a player dodging an AFK mark, but there's nothing to protect: un-ghosting just means "I'm here again".

## Consequences

`MemberView.ghost` keeps meaning "out of play right now" and is now true for ghosted members too, so an old client still shows them as ghosts; the new optional `MemberView.ghosted` (sent only when true) tells a ghost who is still in the order apart from one who isn't. The rules' notion of "present" (online, not fake, not ghosted) drives turns, voters and the end condition in one place.
