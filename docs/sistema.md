# The system page on the VPS

`/sistema` (ADR 0009) stays off until the server has the password's SHA-256 in its environment. Neither the password nor the hash is in this repository. Do this once on the VPS, replacing `THE PASSWORD` with the real one:

```bash
printf 'GUESS_ADMIN_HASH=%s\n' "$(printf %s 'THE PASSWORD' | sha256sum | cut -d' ' -f1)" > ~/.guessoca.env && chmod 600 ~/.guessoca.env
```

Then restart the container so it picks the file up (any later deploy does this by itself):

```bash
cd ~/dev/guessoca && npm run docker:stop; npm run docker:start
```

Check it from anywhere. `sistema desligado` with 404 means the file wasn't picked up; `senha errada` with 401 means it's on:

```bash
curl -s -w ' %{http_code}\n' https://guess.passoca.dev/api/admin/assets
```

How it fits together:

- `docker:start` in `package.json` adds `--env-file ~/.guessoca.env` only when that file exists, so a server without it still deploys, with the system off.
- The file lives in the home directory, not in `~/dev/guessoca`, because the deploy wipes that folder on every push.
- Replaced files are kept in the Docker volume `guessoca-data` (mounted at `/app/data`), which survives deploys. `docker volume rm guessoca-data` (with the container stopped) discards every replacement at once.
- To change the password, write the file again with the new one and restart the container.
- Usage statistics (the **Uso** tab, `GET /api/admin/usage`, same password) are kept in `stats.json` in the same volume: daily counters for the last 90 days, written 15 s after a change and on `docker stop`. Deleting the file (container stopped) starts the counts over. No IPs, nicknames, chat text or post-it words are stored; see the amendment to ADR 0009.
- To try it on your own machine: `GUESS_ADMIN_HASH=$(printf %s 'anything' | sha256sum | cut -d' ' -f1) PORT=3111 bun apps/server/src/index.ts`, then open `http://localhost:3111/sistema`. Add `GUESS_DATA_DIR=/some/tmp/dir` to keep that run's overrides and `stats.json` out of the repo's `data/`.
