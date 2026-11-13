# The world is simulated in each browser and relayed as presence

The rooftop is a toy, not the game: walking, jumping, standing on heads, shoving and falling never change who guessed what. So each browser owns its own character. `@guess/world` (pure TypeScript, `bun test`) steps that character against the platforms and against the last known positions of everyone else, and the browser sends its state (position, velocity, facing, animation) about fifteen times a second. The host relays it to the other sockets outside the room state, as trucossoca relays presence, keeping only the latest per sender between sends. Others' bodies are drawn interpolated between the last two states received. A shove is a message from the shover to the pushed person's browser, which applies the knockback to itself; whoever is pushed decides where they land.

## Considered options

- **Server-authoritative physics**: the server steps every body at a fixed rate and sends positions back. Fair and consistent, but every jump would wait a round trip, the server would run a game loop for a toy, and nothing in the game depends on fairness here.
- **Peer-to-peer (WebRTC)**: lower latency between friends, but signalling, NAT traversal and a second transport for a few dozen bytes a second.

## Consequences

Two screens can disagree for a moment about who stood where, and a modified client can fly; neither matters, because falling has no effect on the game. Collision against remote bodies uses positions up to ~70 ms old, so pushing through a crowd feels slightly soft, which is fine for a party game. Presence is not activity: a room where people only walk around still dies after ten minutes. The world package has no knowledge of rooms, sockets or Pixi, so its rules (gravity, solid bodies, riding on a head, shove knockback, respawn) are tested headless.

## Amendment: the server simulates the funny bots

"Funny bots" (issue #55) are characters nobody controls that show up on the roof while the game runs, to distract and amuse. Someone has to own their bodies so every screen sees the same thing, and no browser is always there, so the server does: while the option is on and the game is playing, `RoomHost` runs a loop (30 steps a second) over `BotWorld` (`apps/server/src/bots.ts`), which steps each bot with the same `@guess/world` physics the browsers use. Each bot's presence goes out as an ordinary `presence` message with a `b…` id, at the players' rate and only when it changed; the room snapshot carries the list of bots on the roof (`bots`), so a client draws them exactly as it draws a person. A player's shove on a bot is applied by the server; a bot's shove on a player is a `shoved` message, applied by that player's browser as always.

This is the game loop on the server that the original decision avoided. It is acceptable here because it exists only while the option is on and a game is running, it steps at most fifteen bodies, and nothing in the guessing depends on it: the bots know nothing about turns, votes or the clock. Players are still simulated in their own browsers; the bots see them through the last presence each one sent.

The behaviour is in two layers, both random on purpose so players can't predict it: a director with a wandering mood decides when and how many arrive (from none to fifteen, tending to get busier in a long game but on no schedule), and each bot scores what it could do now by its own random personality and what is around it, then draws among the best. The server takes each character's attack length from `apps/server/src/attacks.json`, written by `bun run sprites`, because the production image doesn't carry the client's atlases.
