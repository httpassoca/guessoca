# A system page with live asset overrides

The owner wants one place to see, download and replace everything the game uses, without a deploy or a terminal: a page at `/sistema`, behind a password.

## What it is

- **Client**: `apps/web/src/lib/screens/Sistema.svelte`, loaded as its own chunk so players don't download it. Tabs for an overview, the characters (all seven animations of each playing, with ground and anchor guides, zoom, speed, pause and step), the scenery (rooftop objects, skyline, emote balloons), the sounds (the music file and the five code-generated effects, playable and downloadable as WAV) and a table of every served file. It also zips everything for download and shows the character prompt with a copy button. Portuguese only: it has one reader.
- **Server**: `apps/server/src/admin.ts`, routes under `/api/admin/`. Every call carries the password in the `x-admin-pass` header; the server compares its SHA-256 with `GUESS_ADMIN_HASH` from its environment. There is no session.

## Replacing a file

Only files that already exist in `sprites/` and `music/` can be replaced, by a file of the same format (checked on the bytes) and, for images, the same pixel size. The atlases that say where each frame sits are compiled into the client, so a sheet with another layout would draw garbage; that case needs a deploy, as does a new character or any sound effect.

A replacement is written to `<data>/overrides/<path>` and the static handler serves it in place of the built file. The original is never touched, so undoing is deleting the override. `<data>` is `/app/data` in the container, a named Docker volume (`guessoca-data`), so overrides survive deploys.

## Consequences

- **An override outlives a deploy, even one that ships new art for the same file.** The page lists active overrides on its first tab for that reason. An agent that changes a sheet in the repo and doesn't see it live should check there first.
- **Neither the password nor its hash is in the repository**, which is public: a hash of a short password can be brute-forced. The hash comes only from the server's environment (`~/.guessoca.env` on the VPS, passed by `docker:start` when the file exists). Without it the admin routes answer 404 and the page says the system is off; existing overrides are still served. Tests use a throwaway password.
- The password protects only writes: every asset is a public URL anyway. The damage of a leaked password is bounded (same-size images and an Ogg file, all reversible, originals intact).
- Wrong passwords wait 400 ms before the 401. There is no lockout.
- Overrides are not in git. The zip download is the way to get them back into the repo.

## Amendment: usage statistics

The owner wants to know how the game is used and how close the talking bots run to the free Groq tier, so `/sistema` has a **Uso** tab, fed by `GET /api/admin/usage` behind the same password check (no password, wrong password: 401, like every admin route).

- **Live**: computed on each request from the rooms in memory (open rooms by phase, connected members, visitors without a nickname, bots on the roof), the process uptime and memory. Nothing stored. The page asks again every 5 s while the tab is open and visible.
- **Over time**: `apps/server/src/usage.ts` keeps one bucket per day (São Paulo's day, `America/Sao_Paulo`) for the last 90 days, older ones dropped on the next write. Each bucket holds only counters: rooms created; games started, finished, abandoned; seats taken (players per game is seats ÷ games); total game time; shoves and falls of finished games; claims, correct guesses, give-ups, players turned ghost; chat lines (the count); bosses spawned and knocked down; sockets closed for flooding (4429) and requests refused by the IP limits; Groq requests, tokens, 429s, timeouts and other errors; bot lines said and dropped (by the filter, or late); the day's peak of people connected at once; and how many times each character was picked.
- **Who counts**: the server (`server.ts`: rooms created, refusals, sockets, visits) and the host (`host.ts`: game transitions, chat, flood kicks, bosses, bot lines) call a `meter` with an event; the Groq client reports its own requests. The room's `step()` stays pure: the host compares the state before and after each step. A meter that throws is swallowed; counting never touches the disk on the game's path.
- **On disk**: `<data>/stats.json` (the `guessoca-data` volume, so it survives deploys), written 15 s after the first change and on SIGTERM, to a temporary file renamed over the old one. A missing or broken file starts the counts from zero; a failed write is logged at most once an hour and retried on the next change. What is read back is sanitised (unknown keys and non-counts dropped, days and hashes capped).

### What is deliberately not stored

No IP address, nickname, chat text, post-it word, image, room code or token. Distinct visitors per day are counted from the per-room, per-browser token (ADR 0003 amendment) hashed with SHA-256 together with a random salt drawn each day, truncated to 16 hex characters; at the day's end the salt and the hashes are discarded and only the number remains. Today's hashes are written to the file only so that a deploy in the middle of the day does not count everyone twice; they cannot be reversed or linked across days. At most 20 000 per day are kept. Because the token is per room, one person in three rooms counts three times: the number is "seats opened", close enough for a game among friends.

The Groq meter shows the limiter's own sliding windows (requests and tokens in the last minute and 24 h against `GROQ_RPM`/`RPD`/`TPM`/`TPD`), which are what actually throttles the bots, next to the calendar-day counters.
