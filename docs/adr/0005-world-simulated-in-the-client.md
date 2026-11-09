# The world is simulated in each browser and relayed as presence

The rooftop is a toy, not the game: walking, jumping, standing on heads, shoving and falling never change who guessed what. So each browser owns its own character. `@guess/world` (pure TypeScript, `bun test`) steps that character against the platforms and against the last known positions of everyone else, and the browser sends its state (position, velocity, facing, animation) about fifteen times a second. The host relays it to the other sockets outside the room state, as trucossoca relays presence, keeping only the latest per sender between sends. Others' bodies are drawn interpolated between the last two states received. A shove is a message from the shover to the pushed person's browser, which applies the knockback to itself; whoever is pushed decides where they land.

## Considered options

- **Server-authoritative physics**: the server steps every body at a fixed rate and sends positions back. Fair and consistent, but every jump would wait a round trip, the server would run a game loop for a toy, and nothing in the game depends on fairness here.
- **Peer-to-peer (WebRTC)**: lower latency between friends, but signalling, NAT traversal and a second transport for a few dozen bytes a second.

## Consequences

Two screens can disagree for a moment about who stood where, and a modified client can fly; neither matters, because falling has no effect on the game. Collision against remote bodies uses positions up to ~70 ms old, so pushing through a crowd feels slightly soft, which is fine for a party game. Presence is not activity: a room where people only walk around still dies after ten minutes. The world package has no knowledge of rooms, sockets or Pixi, so its rules (gravity, solid bodies, riding on a head, shove knockback, respawn) are tested headless.
