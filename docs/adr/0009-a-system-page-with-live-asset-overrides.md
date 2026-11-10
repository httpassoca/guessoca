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
