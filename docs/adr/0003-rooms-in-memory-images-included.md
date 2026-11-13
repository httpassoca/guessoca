# Rooms live in process memory, images included, nothing persists

The game is for up to eight friends on a voice call. People join with a nickname and a random token, and a room dies after ten idle minutes. No database, no accounts, no history, no object storage. A post-it image lives in a map inside its room, as bytes, and dies with the room; the snapshot only carries `/api/rooms/CODE/images/ID`. A restart of the server, including every deploy, drops every running game and every image. We accepted this, as trucossoca did (its ADR 0004), because a deploy during a game is rare at this scale and a post-it is worth nothing after the game.

The token is per tab (`sessionStorage`): it survives a refresh and a network drop in the same tab, which is what reconnection needs, and two tabs of one browser are two people, which is how a game is tested alone. The nickname, the language and the last character are per browser (`localStorage`). The notepad is per tab and never leaves it.

## Consequences

Memory is bounded by the rules, not by hope: at most eight people, one image per post-it (a replaced image frees the old one), WebP of at most 512 px and a byte cap on upload, so a room holds a few megabytes at worst. A room that dies frees everything it held in one step. Someone's place is held until the room dies, so a person who drops returns to the same character, post-it and spot in the ranking.

## Amendment: the token is per room and per browser (issue #68)

A per-tab token lost the seat whenever someone closed the tab and opened the room link again: they came back as a stranger, while their old place stayed in the turma as dropped, holding a post-it, a turn and an author role. The token now lives in `localStorage`, one random token per room code (`guess.seats`: code → token and when it was last used). Reopening the link from any tab of the same browser, even after a browser restart, returns the person to their place. Two tabs open on the same room are the same person, as a duplicated tab already was: the newer one takes over and the older one shows "another tab took over", with a button to take it back. An entry unused for 24 hours is forgotten and swept on the next visit; a room dies long before that. If `localStorage` is blocked, the token falls back to the tab, as before.

The token says nothing about the person and is different per room, so it links nothing across rooms. On a shared computer, whoever opens the same room link in the same browser gets that seat, which was already true of a tab left open. Testing alone now needs a second browser or a private window (or the fake players), not a second tab.

Someone who arrives without the token (another device, another browser) is a new person: there is no "that's me, come back as X", because anyone with the link could take a dropped seat that way, and an approval by the moderator would need new messages and screens for a case the per-browser token mostly removes. The moderator kicks the old seat instead. Kicking stays final for that room, and the kicked screen says so.
