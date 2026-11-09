# One container on the VPS serves both client and server

The game needs a long-lived WebSocket server and a place to keep uploaded post-it images, which static hosts and serverless platforms can't hold. As in trucossoca (its ADR 0001), we chose one Bun container in this monorepo that serves the built client as static files, accepts image uploads, and handles WebSockets on the same origin, guess.passoca.dev, behind nginx on the same VPS as passoca-api and trucossoca. The image is built on the GitHub runner, never on the VPS (trucossoca learned that the build starves the server); the runner ships it with `docker save | gzip` over scp and restarts it over SSH, then probes `/health` and `/` and fails the run if either is silent. The container listens on `127.0.0.1:3003`: passoca-api holds 8080 and trucossoca 3002 (checked with `docker ps` and `ss -ltn` on the VPS).

## Considered options

- **Client on Vercel, server on the VPS**: two pipelines and a CORS boundary, and image uploads would cross it, for no gain at friends scale.
- **A second app inside trucossoca's container**: one deploy for two games, but a fix to one would drop the rooms of the other, and the two repos would share a release cadence they don't have.
