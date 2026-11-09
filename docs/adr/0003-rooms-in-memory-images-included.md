# Rooms live in process memory, images included, nothing persists

The game is for up to eight friends on a voice call. People join with a nickname and a random token, and a room dies after ten idle minutes. No database, no accounts, no history, no object storage. A post-it image lives in a map inside its room, as bytes, and dies with the room; the snapshot only carries `/api/rooms/CODE/images/ID`. A restart of the server, including every deploy, drops every running game and every image. We accepted this, as trucossoca did (its ADR 0004), because a deploy during a game is rare at this scale and a post-it is worth nothing after the game.

The token is per tab (`sessionStorage`): it survives a refresh and a network drop in the same tab, which is what reconnection needs, and two tabs of one browser are two people, which is how a game is tested alone. The nickname, the language and the last character are per browser (`localStorage`). The notepad is per tab and never leaves it.

## Consequences

Memory is bounded by the rules, not by hope: at most eight people, one image per post-it (a replaced image frees the old one), WebP of at most 512 px and a byte cap on upload, so a room holds a few megabytes at worst. A room that dies frees everything it held in one step. Someone's place is held until the room dies, so a person who drops returns to the same character, post-it and spot in the ranking.
