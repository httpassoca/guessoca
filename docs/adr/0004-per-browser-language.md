# The interface language is chosen per browser

Portuguese (pt-BR) is the default; a friend who doesn't read it switches their own browser to English (en-US), and the choice is remembered by that browser alone. Every string a person reads goes through one translation table in the client (`apps/web/src/lib/i18n.ts`), keyed, with parameters, as in trucossoca (its ADR 0005). Nothing on the server is translated: the server sends keys and data, never sentences.

Unlike trucossoca, there are no untranslated table calls, and unlike other "who am I" games there are no word lists: every post-it is written by a friend, in whatever language the turma speaks, and is shown as written. A language therefore costs only the interface strings.

## Consequences

Adding a string means adding it in both languages, which the type of the English table enforces, and a test checks that both texts use the same parameters. Nicknames and post-its are room data, the same on every screen. The emote balloons are pixel art drawn by the sprites pipeline (`?`, `!`, `haha`, "eu?"), so a balloon with words in it is drawn once per language ("eu?" / "me?") and the client picks the sheet by the reader's language, like any other string.
