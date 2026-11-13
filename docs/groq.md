# The talking bots: Groq setup

Some funny bots talk (the amendment "the bots talk" in ADR 0005): their lines come from a language model on Groq, called only by the server. Without a key in the server's environment the feature is off and every bot stays silent; nothing else changes. There are no canned lines.

## Turn it on (once, on the VPS)

1. Create a free API key at https://console.groq.com/keys.
2. Add it to `~/.guessoca.env`, the same file that holds `GUESS_ADMIN_HASH` (see `docs/sistema.md`). **Append** with `>>`; the `>` in `docs/sistema.md` would wipe the admin hash:

   ```bash
   printf 'GROQ_API_KEY=%s\n' 'gsk_THE_KEY' >> ~/.guessoca.env && chmod 600 ~/.guessoca.env
   ```

3. Restart the container so it picks the file up (any later deploy does this by itself):

   ```bash
   cd ~/dev/guessoca && npm run docker:stop; npm run docker:start
   ```

4. Check the log: the start line says which model talks (`talk="openai/gpt-oss-20b"`; `talk=false` means the key wasn't picked up), and every line a bot says logs `room.botSaid` (room, bot id, priority; never the text). Errors from Groq log `talk.error` with the status.

The key never leaves the server and is never in the repository. To turn the feature off, remove the line and restart.

## Optional settings

All in the same file, all optional:

| Variable | Default | What |
|---|---|---|
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Any chat model id from https://console.groq.com/docs/models. A `gpt-oss` model gets `reasoning_effort: low` and 220 completion tokens (its reasoning counts); any other gets 60. |
| `GROQ_RPM`, `GROQ_RPD`, `GROQ_TPM`, `GROQ_TPD` | 30, 1000, 8000, 200000 | The account's limits for that model (requests and tokens per minute and per day; see https://console.groq.com/settings/limits). Change them with the model or after upgrading the plan. |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | Any OpenAI-compatible endpoint (a local fake for testing). |

## The budget

The limits are per Groq organization, so one budget (`Budget` in `apps/server/src/groq.ts`) is shared by every room in the process. It counts requests and tokens in sliding windows of a minute and of 24 hours (with the real usage each response reports), and lets each priority use only part of every limit: replying to a person up to 90% per minute and 95% per day, reacting to events 70% and 80%, idle chatter 45% and 50%. It also obeys Groq: the `x-ratelimit-remaining-*` headers pause until their `reset-*`, a 429 pauses for `retry-after` (doubling while it repeats), and a request that takes more than 6 s is dropped. The day window lives in memory, so a restart forgets it; Groq's own 429 still stops it.

Inside a room (`TalkBrain` in `apps/server/src/talk.ts`): one request at a time; a bucket of 3 that refills one every 30 s (at most 2 a minute sustained); the same bot waits at least 4 s between replies, 10 s between reactions and 30 s between idle lines; bots answer each other for at most three lines in a row without a person in between. Idle chatter needs 2 tokens in the room bucket, so a reply always has room.

What that costs: a request is about 400 input tokens (persona, scene, recent chat) and up to ~150 output tokens with reasoning, so ~550 to 600. A 40-minute game with a few talking bots makes about 40 to 60 requests (25k to 35k tokens); the hard ceiling for one room is about 80 requests (~50k tokens). The free day (200k tokens, 1000 requests) covers five or six typical games; after half of it is used, bots stop chatting idly; after 80%, they only answer people who talk to them.

## Testing without a key

`GROQ_BASE_URL` can point at a fake. With any server on port 3999 that answers `POST /chat/completions` like OpenAI (`{"choices":[{"message":{"content":"..."}}]}`), run:

```bash
DEV_TALK_CHANCE=1 GROQ_API_KEY=fake GROQ_BASE_URL=http://127.0.0.1:3999 PORT=3111 bun apps/server/src/index.ts
```

`DEV_TALK_CHANCE` (only in a development room, never in production) sets the chance of a bot talking (normally 30%), so the first bot (a boss, in a dev room) talks for sure. Say its name in the chat and its bubble shows the fake's line.
