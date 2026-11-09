# Native Bun WebSocket, with images over plain HTTP

Clients talk to the server over Bun's built-in WebSocket and the browser's own WebSocket, with a small JSON protocol in `@guess/protocol`, a ping every fifteen seconds, a server that drops a socket silent for thirty, and a reconnect loop written by us. Reconnection already has game meaning (a person returns to their place in the turma with the same tab token), so a library's reconnect would sit on top of ours anyway; trucossoca made the same call (its ADR 0002) and it held up.

Post-it images do not travel on the socket. The author's browser shrinks the image to WebP and sends it with a `POST` to the room; the server answers with an id, and the next snapshot carries a URL that every browser loads with a plain `<img>`. Snapshots stay small text, and the browser's image cache does the rest.

## Consequences

Three channels, never interleaved: room messages (snapshots in, actions out), presence (each character's position and animation, about fifteen a second, relayed by the host outside the room state, ADR 0005), and HTTP for images. The upload endpoint checks the room exists, the token belongs to it, and the body is a WebP under a fixed size cap; anything else is refused before it touches memory.
