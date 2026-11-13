# Art: how the 2D side works and how to import new art

This guide is for the next agent, or the owner, who is about to add a character, an animation, a prop, a background, a map or an emote. It explains the whole path from a source file to a pixel on screen, so you don't have to re-derive it. The decisions behind it are in ADR 0005 (world simulated in the client), ADR 0006 (Pixi 2.5D with HTML post-its) and ADR 0007 (sprites generated from a gitignored pack, plus its amendment for the skeleton). Code comments are in Portuguese; every file below has a header saying what it makes and where its output goes.

## The flow

```
owner's files ──cp──▶ assets-src/ (gitignored)         text grids in code (rooftop.ts, life.ts, emotes.ts, skyline.ts)
                         │                                  │
                         ▼                                  ▼
            recipes in tools/sprites/src  ◀─────────────────┘
                         │   bun run sprites   (tools/sprites/src/index.ts)
                         ▼
   apps/web/public/sprites/*.png        apps/web/src/lib/sprites/*.json      (both committed)
   char-N-idle / char-N-moves           characters, atlases,
   (.png for 0/1, .webp for the rest),
   rooftop, skyline-*,                  characters, rooftop, emotes
   emotes-<lang>
                         │                        │
                         ▼                        ▼
        served as files (/sprites/…)    imported by apps/web/src/lib/sprites/{characters,rooftop}.ts
                         │                        │
                         └──────────┬─────────────┘
                                    ▼
         Pixi scene (apps/web/src/lib/world/*)  +  HTML/CSS (apps/web/src/lib/panels/Hero, Swatch, Stage, Ledge)
```

- `bun run sprites` always regenerates the rooftop, skyline and emotes, which need no pack. For each character model it reads that model's pack, or, if the pack is missing, prints which file is missing, leaves that model's committed sheets alone and exits non-zero at the end.
- The pipeline is deterministic: running it on an unchanged tree reproduces the committed PNGs and JSONs byte for byte. If `git status` shows a changed sheet after a run you didn't mean to change, find out why before committing.
- CI and Docker only use what's committed and never run the pipeline.

## Licensing (ADR 0007)

- **Hero**: Ozzbit Games' free "male hero" pack. Personal and non-commercial use only, modifications allowed, **credit required** ("Herói: Ozzbit Games", the `credit.character` i18n key, shown in the menu and on the home screen; `hero.json` carries `"credit": "Ozzbit Games"`). The pack itself must never be redistributed.
- **Skeleton knight** and every seven-sheet character (`PACKS` in `tools/sprites/src/packs.ts`): the owner's own art, most of it made by an image model at the owner's request. No restriction and no credit (`"credit": null`).
- **Cats** (`cats.png`): LuizMelo's "Pet Cats Pack", CC0. No restriction; the README names the author anyway.
- **Birds** (`birds.png`): carysaurus's free "Bird Sprites". Free and commercial use, **credit required** ("Pássaros: carysaurus", the `credit.birds` i18n key, shown next to the hero's credit in the menu and on the home screen; `critters.json` carries `"credit": "carysaurus"`), and the pack must not be redistributed or resold: only the generated sheet is committed. The flight frames are drawn by us in code.
- **Scenery, emotes and skyline**: drawn in code (text grids and a seeded generator). No licence strings attached.
- **Never commit `assets-src/`.** It's in `.gitignore` and `.dockerignore`. Commit only the generated output.
- Art from any other pack needs a licence that allows this use (a free, non-commercial game whose repo is public). Signs and text are our own words: no real brands or game names.

## Directory map

Pipeline, `tools/sprites/src/` (`@guess/sprites`, pure apart from `png.ts` and the two entry points):

| File | Job |
|---|---|
| `index.ts` | `bun run sprites`: runs every recipe and writes the sheets and atlases. Lists the models and their pack folders. |
| `preview.ts` | `bun run sprites:preview`: enlarged contact sheets of the generated output in `.preview/` (gitignored). |
| `png.ts` | Read and write PNG files; the only disk I/O for images. |
| `image.ts` | Pure RGBA `Image` operations: crop, blit, colour swap/erase/keep, connected components, solidify, bounds, shear, squash, stretch, rotate, `under`. |
| `grid.ts` | Pixel art written as text: one character per pixel, `.` is transparent. |
| `atlas.ts` | What the models share: `ANIMATION_NAMES` (animation order), `layout()`, which crops all frames to one rectangle and builds a one-row-per-animation sheet and `Atlas`, and `paginate()`, which cuts that sheet into the pages that are written (`MAX_SHEET`, see "Sheet pages"). |
| `hero.ts` | The hero recipe: slice 128×128 cells, remove the sword from the shove, one sheet per hair ramp in `HAIRS` (only blonde today). |
| `skeleton.ts` | The skeleton recipe: slice 170×125 cells, remove slash trails, draw run/jump/fall, one sheet per cape ramp in `CAPES` (only red today). |
| `pack.ts` | The recipe for characters that arrive complete as seven sheets (image-model art). Changes no pixel: grounds every frame, optionally shifts an animation sideways, writes the sheet at the art's size with `scale` in the atlas. |
| `packs.ts` | The registry of seven-sheet characters in slot order: one entry per character (model, name, colour, folder, `PackConfig`). Newer characters' configs live here; the first ones have a file each (`kratos.ts`, …). |
| `characters.ts` | Every character in slot order (hero, skeleton, then `PACKS`) → `characters.json`. |
| `emotes.ts` | The emote balloons, from a 3×5 text font, one sheet per language. |
| `rooftop.ts` | The rooftop palette, the `Sketch` stamping board, every prop/texture/sign as a text grid, and the shelf-packed `rooftop.png` + atlas. |
| `life.ts` | The roof's ambient life as text grids (issue #70): loose window panes, the spinning fan, steam puffs, splashes, ripples, drips, neon shines for puddles, the failing BAR/24H frames, the plane, the car and the side-roof clutter. `ROOFTOP_RECIPES` = `RECIPES` + these, the list `index.ts` packs into `rooftop.png`. |
| `skyline.ts` | The two seeded, seamlessly tiling city strips, and `twinkles()`, the few windows per strip the client blinks. |
| `critters.ts` | The cats and birds: slices the two packs without changing a pixel, draws the birds' wing flap as text grids, stacks one strip per animation into `cats.png` and `birds.png` + `critters.json`. |
| `../test/` | Recipe tests with fake images; real-art tests skip when `assets-src/` is absent. |

Generated data, `apps/web/src/lib/sprites/`:

| File | Job |
|---|---|
| `atlases.json` | One `Atlas` per model: frame size, anchor, head box, stand box, `pages` (size and frames per line of each sheet), each animation's page, first line, frames/fps/loop, credit. |
| `characters.json` | Slot `n` → model, colour name, UI colour, sheet URLs (one per page), atlas name. |
| `rooftop.json` | Every rooftop frame (position, anchor, `tile`, `face`) plus the skyline strips. |
| `emotes.json` | Each balloon's rectangle and tail tip (shared by both languages). |
| `characters.ts` | Typed access for the client: `CHARACTER_ART`, `character(n)`, `frameAt` (page and corner of a frame), `frameIndex`, `sheetSize(atlas, page)`, `largestSheet`, `fitScale`, `attackMs`. |
| `rooftop.ts` | Typed access to `rooftop.json`; the sheet URLs. |
| `critters.json`, `critters.ts` | The critter strips (sheet rectangle, frames, fps, loop, feet anchor) and `stripFrame`. |

Client rendering, `apps/web/src/lib/world/` (Pixi files have no automated tests; the pure ones do):

| File | Job |
|---|---|
| `scene.ts` | The Pixi `Application`, layer order, depth sorting, character sprites, shadows, emote balloons; loads character sheets only for who is in the room. |
| `sheet-cache.ts` | Pure: which character sheets are loaded, when to free them, how much to shrink a sheet larger than the GPU's texture limit. |
| `platforms.ts` | Draws the dressed roofs: top, back ledge, facade, front parapet, box props, decor. |
| `dressing.ts` | Pure: which frame dresses each `MAP` box, roof rectangles on screen, `DECOR` placement, neon flicker and beacon timing. |
| `backdrop.ts` | Sky bands, stars, moon, two parallax skyline strips, the drop to the street and the street fog. |
| `weather.ts` | Rain streaks and the low front fog. |
| `ambient.ts` | Pure (issue #70): when every ambient thing happens, from a hash of the clock (`occurrence`, window states, sign failures, plane, meteor, lightning, searchlight, cars, siren, splashes, ripples, drips, steam). No state, no per-frame randomness. |
| `windows.ts` | Living windows over the facades (only the panes that differ from the facade are drawn) and the siren's red/blue wash. |
| `skylife.ts` | Lightning flash and thunder, searchlight, plane, shooting star, blinking city windows, cars in the street fog; four containers `backdrop.ts` interleaves with its own. |
| `rooflife.ts` | Rain touching things: splashes, puddle ripples and neon shine, drips, the AC fan, chimney steam, the kick when someone runs through a puddle. |
| `rain.ts` | Pure rain simulation (fixed pool of drops, screen pixels). |
| `celebration.ts` | The confetti around whoever just guessed right. |
| `confetti.ts` | Pure confetti maths (seeded pieces, closed-form position by age, world units). |
| `cheer.ts` | Pure: who newly got it right, from two consecutive snapshots. |
| `critters.ts` | Pure: the cats' wall-clock routine, routes between perches, reactions to presence; the bird flocks. |
| `fauna.ts` | Draws the critters inside the bodies container, tinted, sorted among the bodies by depth. |
| `parallax.ts` | Pure parallax offset and the per-layer factors. |
| `film.ts` | The film look: bloom on scenery, RGB split and CRT grain/scanlines/vignette on the world. |
| `art.ts` | Loads `rooftop.png` and the skylines into textures; tiles get their own repeat-mode canvas. |
| `view.ts` | Pure: integer scale, ground line, post-it and emote anchor heights. |
| `declutter.ts` | Pure: lifts overlapping post-its so the one behind sits above. |
| `heads.ts` | Pure: what each head tag shows. |
| `crowd.ts` | Pure: the other bodies (interpolated presence, fake players' fixed spots). |
| `runtime.ts` | The rAF loop: steps physics, sends presence, calls `Scene.render`, positions HTML post-its. |

HTML art, `apps/web/src/lib/panels/`: `Hero.svelte` (a character's idle in a CSS background from its `-idle` sheet, the same window for every model), `Swatch.svelte` (the head box as a coloured square), `Stage.svelte` (the chosen character at 4× on a strip of roof in the pre-lobby), `Ledge.svelte` (that strip, drawn from `rooftop.png` on a canvas), `CharacterPicker.svelte` (the eight buttons).

World geometry the art must match: `packages/world/src/index.ts` (`MAP`, `DEPTH`, `DEPTH_K`, `BODY_*`, `project`, `depthKey`, `Anim`, `SHOVE_COOLDOWN_MS`).

## Coordinate systems and scale

There are four spaces. Comments say which one a value is in.

1. **Source-sheet pixels**: the pack's cells. Hero cells are 128×128 (`CELL` in `hero.ts`); skeleton cells are 170×125 (`CELL_W`, `CELL_H`), and in them the feet rest on row `FEET_Y = 80`; Kratos cells are 116×160 with the ground at row 145; Vorcaro cells are 256×384 with the ground at row 352, kept at that size. Every recipe works in cell coordinates until `layout()`.
2. **Frame pixels**: after `layout()` crops all frames of a model to the smallest rectangle containing every opaque pixel of every animation. The hero is 45×51, the skeleton 120×61, Kratos 81×129 (drawn at 1/2) and Vorcaro 192×305 (drawn at 1/6: an atlas may carry `scale`, world units per frame pixel, default 1; read it with `artScale(atlas)` wherever atlas numbers become world or screen sizes). The **anchor** is the point between the feet on the ground: `x` is the middle of the idle's feet, `y` is the bottom row of the first idle frame (the frame height, in practice). Atlas `head` and `stand` are in frame pixels too.
3. **World units**: `x` along the roofs (right is positive), `y` up (0 = the lowest roof), `z` depth (0 = front edge, `DEPTH = 56` = back). **1 world unit = 1 sprite pixel**, so a 40-px-tall prop is 40 units tall.
4. **Screen pixels**: `project(p, cam, view)` gives `sx = (x − cam.x)·scale + width/2`, `sy = groundY − (y + z·DEPTH_K)·scale`. `DEPTH_K = 0.6` is an oblique projection: one unit of depth rises 0.6 px on screen while height stays 1:1, so a box's lid is drawn `round(depth · 0.6)` rows tall.

- **Scale**: `pickScale` in `view.ts` uses the largest integer that fits about 600×300 world units on screen, clamped to 2–6 (3 on a 1080p window). The integer scale keeps pixels square. `groundY` is 80 % of the screen height.
- **Why everything is pixelated**: `TextureSource.defaultOptions.scaleMode = 'nearest'`, `antialias: false`, `roundPixels: true`, `resolution: 1`, and `image-rendering: pixelated` in the HTML. Tiles are copied to their own canvas with `addressMode: 'repeat'` so a `TilingSprite` never samples a neighbour on the sheet. Never introduce smooth scaling or fractional scales on sprites.
- **Depth sorting**: bodies are sorted by `depthKey(p) = z`, larger first (further back is drawn first), with ties broken by id so the order doesn't flicker. Each sprite's `zIndex` is its place in that list. Height doesn't count: someone riding a head has nearly the same `z` as the person below, so who covers whom is decided by `z` (then id), not by who is on top.
- **Layer order** inside the world container: `scenery` (backdrop: sky, moon, `skylife.sky` (flash, searchlight, meteor, plane), far city, its twinkles, near city, its twinkles, drop, cars, street fog; then `platforms.back`: back decor, roof tops, ledges, facades, edges, living windows and siren wash, facade signs, floor decor, box props; then `rooflife`: puddle shine, splashes, ripples, drips, fan, steam, puddle kicks) → shadows → bodies (and the critters, sorted among them by depth) → `platforms.front` (front parapets, covering feet at the edge) → emote balloons → confetti → weather. The post-its and panels are HTML above the canvas and never pass through the filters.
- **Shadow**: an ellipse at the ground under the feet (`groundAt(MAP, x, z)`), not at the body's height, so a jump reads as height. It's `BODY_RX·1.3` by `BODY_RZ·DEPTH_K·1.8` world units at 40 % black, and shrinks to 45 % size by 120 units above the ground.
- **`BODY_H = 40`** is the physics height (what you stand on when riding a head). It isn't the sprite height (hero 37, skeleton 51, Kratos 61, Vorcaro 50, Orelha 15, Bolsonaro 70, knight 10, Old Snake 49, Pinocchio 50, Eve 50, Katarina 50, Punisher 59, Mista 52). Post-it height comes from the atlas instead: `headY(n) = anchor.y − head.y + 3` (hero 40, skeleton 47). The emote tail sits at `headY − 11`, `EMOTE_GAP = 14` units in front of the face.

## The character contract

### Animations

Every model has the same seven animations, in this exact order (`ANIMATION_NAMES` in `tools/sprites/src/atlas.ts`, `Anim` in `@guess/world`):

| Row | Name | When the world plays it | Loop | Hero (frames @ fps) | Skeleton (frames @ fps) |
|---|---|---|---|---|---|
| 0 | `idle` | on the ground, not moving (also while stunned) | yes | 10 @ 10 | 11 @ 10 |
| 1 | `walk` | moving at `WALK` speed (A/D, W/S) | yes | 10 @ 12 | 9 @ 12 |
| 2 | `run` | moving faster than `WALK` (Shift held) | yes | 10 @ 14 | 9 @ 18 (drawn) |
| 3 | `jump` | in the air, going up (Space) | no | 6 @ 12 | 4 @ 12 (drawn) |
| 4 | `fall` | in the air, going down, for `FALL_MS` | no | 4 @ 12 | 2 @ 10 (drawn) |
| 5 | `fall_loop` | still falling after `FALL_MS` | yes | 3 @ 10 | 3 @ 10 (drawn) |
| 6 | `shove` | for `SHOVE_COOLDOWN_MS` after J | no | 7 @ 16 | 5 @ 12 |

- A looping animation wraps; a non-looping one holds its last frame (`frameIndex`).
- **The shove must fit in `SHOVE_COOLDOWN_MS = 450` ms**: hero 7/16 = 437.5 ms, skeleton 5/12 ≈ 417 ms. The world shows `shove` for exactly that long, so a longer animation is cut and a shorter one holds its last frame. `tools/sprites/test/skeleton.test.ts` checks the skeleton.
- **`FALL_MS` is hard-coded** in `@guess/world` as the hero's fall, 4/12 s ≈ 333 ms, and is used for every model. The skeleton's fall lasts 200 ms, so its last fall frame holds for about 133 ms. A model with a longer fall would be cut short. If that matters, make `FALL_MS` per model, which is a behaviour change.
- The sprite faces right in the sheet; the client mirrors it with `scale.x = facing · scale`. Draw everything facing right.

### Frames and anchor

- All of a model's frames share one size, the union of every frame's opaque bounds (`layout()`). **The widest pose sets the frame size for everything.** A big wind-up (a sword swung behind) widens every frame of that model: the sheets grow and the empty space shows in the preview, though the anchor keeps the feet in place. Trim wind-ups, or choose shove frames that stay compact. The skeleton's 120-px-wide frame comes from its swing.
- The anchor is between the feet on the ground line of the first idle frame. Every other animation must keep the feet at the same place in the cell (the recipes shift frames to make that so; `shove()` in `skeleton.ts` lines the back heel up with the idle's).
- `head` is a square around the face in the first idle frame (`heroHead`, `skeletonHead`). It drives `Swatch.svelte` (the face square in the UI) and `headY` (the post-it height), so **each model keeps its own head box**. Don't reuse one model's numbers for another.
- `stand` is the idle frame's opaque rectangle. `fitScale` in `apps/web/src/lib/sprites/characters.ts` frames a character by it: `Hero.svelte` shows each character's standing box scaled to fill its cell, feet on the bottom line (the picker: a grid in the lobby panel, a full-width bottom bar on the pre-lobby screens, each cell with the character's name in a tooltip). The pre-lobby stage is the exception: it uses `trueScale`, the same pixels per world unit for everyone on a floor that doesn't move, so switching characters shows their real relative sizes. `face`, when present, is the square `Swatch.svelte` shows instead of `head` (a companion taller than the player character).
- Pixel art has no half-alpha: recipes call `solidify` on every cell first, which makes every non-zero alpha fully opaque. **Anti-aliased or soft-shadowed source art gets a hard halo.** Clean it in the source, or erase those colours in the recipe.

### The slots

`CHARACTERS = 23` in `@guess/rules` (characters aren't exclusive; a room still has up to eight people, so two can pick the same one). `tools/sprites/src/characters.ts` lists them in slot order: the hero variants in `HAIRS` (only blonde today), the skeleton variants in `CAPES` (only red today), then the seven-sheet characters in the order of `PACKS` (`packs.ts`). A test checks the list has `CHARACTERS` entries. The cast once had eleven, with four hair colours and three capes; the owner cut it to one per model. Changing the count renumbers what each browser remembers, which is harmless: an out-of-range number falls back to slot 0. `characters.json` maps each slot to:

```json
{ "model": "skeleton", "name": "vermelho", "color": "#982b2b", "sheet": "/sprites/char-1.png", "atlas": "skeleton" }
```

- `index.ts` paginates the `i`-th sheet a model's `build()` returns and writes its pages to the `i`-th slot of that model, so variant order = slot order.
- `color` is the ramp's base colour. It's used for borders and marks in the UI, and **must also be `--gs-char-N` in `apps/web/src/app.css`** (`apps/web/test/characters.test.ts` checks this). Colours must be unique.
- The UI names characters "Personagem N" (`pre.characterN` in `apps/web/src/lib/i18n.ts`), not by colour, so a new variant needs no i18n. The `name` field (Portuguese colour name) isn't shown.

### Sheet pages

A recipe's `build()` still returns one sheet per variant with one row per animation (`layout()`), as wide as the longest animation. `index.ts` then cuts it with `paginate()` (`tools/sprites/src/atlas.ts`) into the files that are committed, moving whole frames only:

- **Page 0, `char-N-idle`**: the idle, in one line. The picker, the pre-lobby stage and the face square (`Hero.svelte`, `Swatch.svelte`) only ever download this one, and the roof loads it first.
- **Page 1, `char-N-moves`**: walk, run, jump, fall, fall_loop and shove, each starting on a new line and wrapping at `cols` frames per line. `cols` is chosen so the page is as close to square as it can be (smallest longest side, then smallest area). If they don't fit in one page, more pages follow (`char-N-moves-2`…); none does today.
- **`MAX_SHEET = 8192`**: no page has a side longer than this. It is what software WebGL (SwiftShader) and many GPUs accept. A larger texture fails to upload, and because Pixi batches the roof, the failure blacks out everything drawn in the same batch (the middle roof, its boxes, the HOTEL sign and every character there), not just that character. `paginate()` throws if an idle doesn't fit one line or an animation doesn't fit one page.
- The atlas says where each frame is: `pages[p] = { w, h, cols }`, and each animation has `page` and `row` (its first line). `frameAt(atlas, name, i)` in the client returns `{ page, x, y }`; never compute frame positions by hand.
- The file names changed from `char-N.<ext>` when pages came in (issue #75), so an old `/sistema` override of a one-sheet layout can't mask a page. Replacing a sheet from `/sistema` still works per page: same format, same pixel size.

How the roof loads them (`scene.ts`, `sheet-cache.ts`): only the characters of who is in the room (the members with a character and the bots, the boss among them), as soon as they appear in the snapshot. The idle page arrives first; until the moves page arrives the body plays its idle, and before the idle arrives the body isn't drawn. A sheet nobody has used for `SHEET_KEEP_MS` (60 s) is freed. A few seconds after the roof is quiet, the other sheets are downloaded at low priority into the HTTP cache (not decoded). The renderer reads `MAX_TEXTURE_SIZE` and never uploads a bigger texture: a sheet that doesn't fit is shrunk at decode time and drawn larger by the same factor (`?texmax=2048` in the URL fakes a small GPU to see it), and a character whose idle sheet fails to load is drawn as the hero.

Supplied art is never stored at a reduced resolution: the files keep the pixels as delivered, and shrinking only ever happens in GPU memory, on a GPU that couldn't hold the file otherwise.

### Palette-ramp recolouring

A variant is the same sheet with one ramp swapped by exact colour (`swapColors`):

- **Hero hair**: `HAIR = 4c2641, 7d5556, 9f95ab` (shadow, base, highlight), the pack's brown. It was found with `palette()` on the idle and is used only by the hair. `HAIRS` holds the four ramps; ramp 0 is the original.
- **Skeleton cape**: `CAPE = 771818, 982b2b` (shadow, base). The art has exactly three reds; these two cover the cape (1244 and 236 px in the idle) and the third, `fe0707`, is the eyes and must stay.

To find a part's colours, run `palette()` on a cell (or look at the preview at 4×) and check that the colours aren't shared with another part. If they are, a swap recolours both, and you need to split by region or by connected component instead.

## How-to recipes

Every recipe ends the same way:

```
export PATH=$HOME/.bun/bin:$PATH
bun run sprites            # regenerate; it says which pack is missing, if any
bun run sprites:preview    # look at .preview/*.png
bun test                   # the recipe, atlas, dressing and character tests
bun run check
git status                 # only the sheets you meant to change
```

### 1. Replace the skeleton's drawn run/jump/fall with real sheets

The skeleton's run, jump, fall and fall_loop are drawn by code from idle/walk/swing frames (`run`, `jump`, `fall` in `skeleton.ts`). They're a stand-in.

1. Ask the owner for sheets in the same format as `IDLE.png`: one row of **170×125 cells**, facing right, feet on row **80** at the **same x as in `IDLE`**, no semi-transparent pixels. Suggested names and counts, matching the hero's rhythm: `RUN.png` (8–10 frames, plays at 14–18 fps), `JUMP.png` (4–6, 12 fps, no loop), `FALL.png` (2–4, 12 fps, no loop) and `FALL_LOOP.png` (2–3, 10 fps, loop). If fall and fall loop come in one sheet, slice it in the recipe.
2. Copy them to `assets-src/skeleton/`.
3. In `skeleton.ts`, add the names to `SHEETS`; `index.ts` then requires them.
4. In `derive()`, replace the drawn rows: `run: cells.RUN`, `jump: cells.JUMP`, and so on. Leave the drawing helpers in place for any row that's still drawn.
5. Update the frame counts (and fps if needed) in `SKELETON_SPEC`. `layout()` throws if a row's frame count doesn't match.
6. Update the real-art tests in `tools/sprites/test/skeleton.test.ts` if they assumed drawn frames, and the README "Sprites" text and the ADR 0007 amendment, which say these frames are drawn.
7. If the new sheets are wider than the current union (120×61), the frame grows; check the picker (`Hero.svelte`) and the post-it height still look right.

### 2. Add a new character model (a new pack or owner art)

1. **Licence first** (see above). Put the files in `assets-src/<model>/`.
2. Write `tools/sprites/src/<model>.ts` modelled on `skeleton.ts`:
   - `CELL_W`/`CELL_H` and a `cellsOf()` that slices and `solidify`s;
   - a `ModelSpec` (frames, fps, loop per animation, `credit`);
   - rows for all seven `ANIMATION_NAMES` (draw missing ones, or reuse frames, for example a two-frame jump);
   - erase effects the game doesn't want (slash trails, sparks) by colour or by component size;
   - a `head()` that finds the face in the cropped idle, and an `anchorX` (the middle of the feet in the first idle cell);
   - a `VARIANTS` list of ramps and a `build<Model>(sheets)` returning `{ sheets: one per variant, atlas }` via `layout()`.
3. Add the model to `Model` and to `characters()` in `tools/sprites/src/characters.ts`, and an entry to `models` in `index.ts` (pack folder, missing-pack hint, file list, build).
4. **Slots**: characters aren't exclusive, and the picker scrolls, so the count is free. Either take existing slots (for example 2 hero + 2 skeleton + new ones) or append one: raise `CHARACTERS` in `@guess/rules`, add a `--gs-char-N` in `app.css` (the picker, `.gs-chars`, is rows of seven and wraps by itself; keep it to two rows, because a third makes the home card taller than a 1080p screen), and update the range tests (rules, protocol, create, identity). The order in `characters()` is the slot order, and `@guess/rules` doesn't care which model a slot is. Existing rooms keep their numbers, so changing what a number looks like is a visual change only.
5. **Client**: in `apps/web/src/lib/sprites/characters.ts`, import `<model>.json`, add it to `Model` and `ATLASES`. Update `--gs-char-N` in `app.css` and the model list in `apps/web/test/characters.test.ts`.
6. **Credit**: if the pack needs credit, add it to the `credit.*` i18n keys (both languages), the menu and home footer, the README and the ADR. Credit strings are i18n'd; names of characters aren't.
7. Add recipe tests with fake images (see `tools/sprites/test/skeleton.test.ts`), plus real-art tests guarded by `existsSync`, as in the pitfalls below.
8. Look at the picker and the home stage: each character is framed by its standing box, so a new idle needs nothing, but check the face square in the team list.

### 3. Add a colour variant to an existing model

1. Add or replace a ramp in `HAIRS` (`hero.ts`, three colours: shadow, base, highlight) or `CAPES` (`skeleton.ts`, two colours: shadow, base). Pick shadow and highlight roughly as far from the base as the original's are.
2. Replacing a ramp keeps the slot count; adding one means a new slot or another variant giving up its own (step 4 above).
3. Set `--gs-char-N` in `apps/web/src/app.css` to the new base colour (`#rrggbb`, lowercase).
4. Recolouring another part (a scarf, the sword, the bones) is the same technique with that part's colours. Find them with `palette()` and check they're unique to the part.

### 4. Add or replace a rooftop prop or a sign

Everything on the rooftop is a text grid in `tools/sprites/src/rooftop.ts`, using the single `PALETTE` (one character per colour). Add a colour to `PALETTE` only if nothing there fits.

1. Write the grid, either as a literal or with a `Sketch` (`fill`, `frame`, `stamp`, `line`) for repetition.
2. Add a `Recipe` to `RECIPES`: `name`, `grid`, optional `anchor` (default: bottom middle), `tile: true` for repeating textures (first and last column identical), `fits` for map-box objects.
3. Place it in `DECOR` in `apps/web/src/lib/world/dressing.ts`:
   - `back`: standing behind the back ledge (antennas, the hotel sign);
   - `facade`: nailed `dy` units below the roof edge;
   - `floor`: lying on the roof at depth `z` (puddles).
   `x` is where the anchor goes, in world units.
4. **A sign**: `neonSign('TEXT', 'x' | 'z', { vertical?, off?, legs? })`, magenta or cyan. Add missing letters to `NEON_FONT` (5×7, one stroke). Our own words only.
5. **A box prop** (an object sitting on a `MAP` box): its visible top must equal the box's `top`. The frame must have:
   - width = `x1 − x0`;
   - front (`face`, the bottom rows) = box `top` − the roof's `top` under it;
   - lid (the rows above the face) = `round((z1 − z0) · DEPTH_K)`;
   - anchor bottom-left (the `box()` helper does this).
   `boxLooks` in `dressing.ts` matches a frame to a box by exactly these three numbers, and a box with no match is drawn invisible. `tools/sprites/test/rooftop.test.ts` ("cada caixa do mapa tem um objeto do tamanho dela…") and `apps/web/test/world-dressing.test.ts` both check against `MAP`. Example: the air conditioner on box x 120–160, z 30–56, top 28 over roof top 0 is 40 wide, with a face of 28 and a lid of round(26 · 0.6) = 16, so 44 rows.
6. **Importing a PNG instead of a grid**: not supported yet. You'd put the PNG in `assets-src/` (if licensed) or commit a small source under `tools/sprites/`, read it with `readPng` in `index.ts`, and let `rooftopSheet()` accept `Image` recipes alongside grids. The PNG must use only opaque pixels, ideally from `PALETTE`, so it sits in the same look.
7. The skyline is generated: change a `seed` in `SKYLINES` or the numbers in `STYLES` (`skyline.ts`).

### 5. Add a new map (the Irish pub idea, `docs/ideas/pub-irlandes.md`)

This is described here, not implemented. A map has three separate parts:

- **Geometry** (`packages/world`): `MAP` is an array of `Platform` boxes (`kind: 'roof' | 'box'`, `x0..x1`, `z0..z1`, `top`), plus `DEPTH`, `WORLD_X0/X1` and `spawnPoint` (the highest middle roof). A pub would have the floor, bar counter, tables, stage and a mezzanine as boxes; falling off the mezzanine replaces falling into the street (`FALL_Y`). The physics already takes `platforms` as a parameter, but the client passes the constant `MAP` everywhere (`runtime.ts`, `crowd.ts`, `scene.ts`, `dressing.ts`), so those call sites would take the room's map instead.
- **Dressing** (client): `platforms.ts` + `dressing.ts` are the only place that knows how to draw platforms, and they're rooftop-specific (roof tops, ledges, facades, parapets, `DECOR` per roof). A second map would need its own dressing module, for example `dressing-pub.ts` with its floor, wall and counter textures and decor list, chosen by map id. It would also need a backdrop (`backdrop.ts` is sky, city and street; a pub would be a back wall with bottles and a fireplace), weather (no rain; perhaps smoke) and film strengths (`FILM`: warmer, without the cold VHS). The art itself would be new recipes in a new `tools/sprites/src/pub.ts` writing `pub.png` + `pub.json`, in the same text-grid style.
- **Protocol choice**: the map would be chosen per sala in the lobby. That's a room setting in `@guess/rules` and the snapshot in `@guess/protocol`, which every client reads to pick both the geometry and the dressing. Everyone in a room must use the same `MAP`, because presence positions are only meaningful against the same platforms. This also opens the open question in the idea note, whether "telhado" stays the name of the world in `CONTEXT.md`. Decide that with the owner and record an ADR before coding.

### 6. Add an emote balloon

1. Add the name to `EMOTES` in **both** `tools/sprites/src/emotes.ts` and `packages/protocol/src/index.ts`, in the same order. The protocol parser rejects unknown names.
2. Add a `case` in `emote()`. If it has a word, give it one per language, like `words` for "eu?"/"me?". Add missing letters to `FONT` (3×5).
3. Map a key: `EMOTE_CODES` in `apps/web/src/lib/keys.ts` (Digit1–4 today; a fifth would be Digit5). Update the key help: the README "Teclas" table and `keys.emotes` in `apps/web/src/lib/i18n.ts` (both languages).
4. There is one `emotes.json` for both languages, so **a worded balloon must be the same width in every language**. Otherwise give each language its own atlas.
5. A balloon lasts `EMOTE_MS = 2000` ms.

### The chat bubble (not a sprite)

A chat message ("fala" in `CONTEXT.md`) shows as a speech bubble over the sender's head. It belongs to the emote balloons' family but isn't generated by `bun run sprites`, because it has to hold arbitrary text:

- **Layer**: HTML, inside the head label (`.gs-head` in `World.svelte`), right above the head and under the nickname, so `declutter.ts` already keeps it off the neighbours and it never passes through the film filters. Styles are `.gs-bubble` in `apps/web/src/app.css`.
- **Look**: the emote balloon rebuilt in CSS with the same colours (`#1a1426` ink, white paper): a 1-pixel outline with cut corners (four hard `box-shadow`s) and the same tail (one pixel plus shadows). One bubble pixel is one world pixel: `--gs-chat-px` is the view scale, set by `WorldRuntime` each time it changes, and every measure is a multiple of it.
- **Font**: [Tiny5](https://github.com/Gissio/font_tiny5) (SIL OFL 1.1), self-hosted in `apps/web/public/fonts/` with its licence (`Tiny5-OFL.txt`); Latin and Latin Extended subsets, so Portuguese accents are covered. Its native size is 8 px (capitals 5 pixels high, like the emotes' 3×5 font), so it's always set at `8 × --gs-chat-px` with a line of 9, smoothing off. Glyphs it lacks (emoji, other scripts) fall back to the system font.
- **Staying on the pixel grid**: the label is centred on the head, so a bubble with an odd width would land on a half pixel and blur. `placeHeads` in `runtime.ts` nudges it by `snapShift` (`bubbles.ts`). If you change paddings or margins, keep them multiples of `--u` and check a zoomed screenshot for grey columns.
- **Lifetime**: `bubbles.ts` (pure): 3 to 6 s by length; a new message from the same person replaces the old one.

### 7. Tune the film look and the weather

All of these are client-side constants, tuned by eye at 1080p (scale 3). No `bun run sprites` is needed; check in the browser with effects on and off (menu → "efeitos de tela").

- `FILM` in `film.ts`:
  - `split` (RGB split, screen px);
  - `grain` and `grainSize`;
  - `lineWidth` and `lineContrast` (scanlines);
  - `vignetting` and `vignettingAlpha`;
  - `bloomThreshold`, `bloomScale` and `bloomBlur`.
  Bloom is only on the scenery, so characters don't blow out; keep characters readable.
- `weather.ts`:
  - `DROPS` (170 rain streaks) and `SLANT`;
  - speed and length ranges, normalised by `s/3`;
  - the rain tint;
  - the low fog's alpha and drift.
- `backdrop.ts`: the `SKY` bands, the moon position, `FAR_BASE`/`NEAR_BASE` (where each skyline strip sits), the drop gradient, and the street fog tint, alpha and drift.
- `PARALLAX` in `parallax.ts`: the moon 0.02, far city 0.12, near city 0.3, street 0.75; the roofs are 1.
- `neonFlicker` and `beaconOn` in `dressing.ts`: the sign and mast light timings; `barSign` and `sign24h` in `ambient.ts` for the other two signs, and the rest of the ambient timings (section 10).

### 8. The confetti (issue #58)

When a guess is confirmed, every client draws confetti around that character for about 2 s (`celebration.ts`, maths in `confetti.ts`), and the guesser's own browser launches its body upward (`applyCheer` in `@guess/world`). No sheet: each piece is `Texture.WHITE` stretched to a 1- or 2-world-pixel square in a flat colour from the rooftop `PALETTE` (the neons, the lit window, the antenna and TV lights). It keeps the pixel grid: positions are whole world units times the integer scale, no rotation, and no alpha: a piece blinks out at the end of its life instead of fading. Half the pieces burst at once and the rest are born over one second from wherever the character is, then stay in the world, so the launch leaves a trail. Tune `CONFETTI_PIECES`, `CONFETTI_COLORS` and the speed, drag and fall ranges in `confetti.ts`; the launch height is `CHEER_VY`.

### 9. The critters: cats and birds (issue #71)

Ambient animals that live on the roof, from two itch.io packs, drawn by the client only (no network, no physics).

**Getting the packs.** Download LuizMelo's "Pet Cats Pack" and carysaurus's free "Bird Sprites" (the free file is `Birds_Free_Carysaurus.zip`; don't buy the paid one). Unzip the cats' `Pet Cats Pack/` folder into `assets-src/cats/` (`Cat-1` … `Cat-6`, `Meow-VFX`) and the three bird PNGs into `assets-src/birds/`. Then `bun run sprites`. Without them the recipe says what's missing and keeps the committed sheets.

**The recipe** (`tools/sprites/src/critters.ts`) changes no pixel of the packs:

- cats: 50×50 cells, feet on row 31 (ground row 32), feet centre x 25. `CATS` picks three folders (the folder numbers don't follow the pack's preview: Cat-2 is black, Cat-6 the grey tabby, Cat-5 white; Cat-3 has no `Itch`), `CAT_ANIMS` the twelve animations with their frame counts (the sheet width / 50) and fps chosen by eye. All cat frames are cropped to one union rectangle (30×16), so every strip shares the anchor. The meow lines (`Meow-VFX`, three 16×16 frames) get their own strip, anchored at the mouth end;
- birds: 32×32 cells, feet on row 31, the 12-frame idle of the pigeon and the crow (the yellow bird is left out). The free pack has no flight, so `PIGEON_FLY` and `CROW_FLY` draw three frames each (wings up, spread, down) as text grids in **that bird's own colours** (`PIGEON`, `CROW`, read from the idle with `palette()`), with the idle's head, placed so the body line sits on `FLY_BODY_ROW`. A test checks they use only the bird's colours.

**Drawing** (`apps/web/src/lib/world/fauna.ts`): 1× (one sheet pixel = one world unit, times the view's integer scale), mirrored by facing, tinted `0xc8c0ff` (Pixi `tint`) so daylight art sits in the night without touching its pixels, in the bodies container with a `zIndex` between the bodies behind and in front of it (no bloom; the lobby's grey comes from the world filter). The clock is `Date.now()`, so frames agree across tabs.

**Behaviour** (`apps/web/src/lib/world/critters.ts`, pure and tested in `apps/web/test/world-critters.test.ts`):

- **Places.** `CAT_SPOTS` are world points with the roof index: box lids from `MAP` (y = box `top`), the front parapet (roof top + 4, z 0), the back ledge (roof top + 5, z `DEPTH`), the floor. `floorOf` gives where a cat steps down to (in front of a box's footprint). `BIRDS` perch on the HOTEL sign (roof top + 23, z `DEPTH + 3` like the back decor), the back ledge, the tank lid, the antenna's middle crossbar (+24) and, for the crow, on the mast's beacon (+39). A new prop or a moved decor needs its perch moved by hand: nothing ties them.
- **Routes.** `route(a, b, gait)` is straight legs: hop down, walk to the front lane (z 18, clear of every box), along it, leap each gap edge to edge in an arc, out of the lane, hop up. `routeAt(route, t)` is closed form.
- **Routine.** Each cat has `beats` (act at a place for some ms, or walk between two places); `scheduled(i, seed, now)` plays them on a loop over the wall clock, shifted by a hash of the room code (`seedOf`). Every tab shows the same cat doing the same thing.
- **Reactions** come from presence via `Watcher` (who started a jump or shove, who landed, who runs, how long each has stood still): someone within `CAT_LOOK_R` → the resting cat sits and faces them; running, shoving or landing within `CAT_SCARE_R`, or a bot within `CAT_BOT_R` → meow (not for bots) and run to the refuge on the next roof; standing still `CAT_VISIT_MS` near it on its roof → the cat walks over, sits beside, then lies down and sleeps, and leaves when the person moves; the boss landing on a roof scatters its cats and flocks; a confirmed guess makes the nearest cat meow. After a reaction the cat walks back to its scheduled place and waits there until the routine reaches it, so tabs converge. Birds: running, jumping, shoving or landing within `BIRD_SCARE_R` sends the whole flock up `flightOffset`'s arc, with a few grey 1-px feathers using the confetti's closed-form maths, and it drops back along the same arc 20–60 s later; the crow only leaves for the boss.
- **Tuning**: the radii and times are the constants at the top of each section; speeds `CAT_WALK`/`CAT_RUN` keep the feet from sliding; `FLY_*` and `FLIGHT_MS` shape the flight.

### 10. Ambient life on the roof (issue #70)

The roof isn't a still picture: windows, sky, rain and props move on their own, on every client, with no network traffic. Everything follows three rules:

- **Time is a hash, not a dice roll.** `ambient.ts` computes every state from `now` (the tab's `performance.now()`) and a `hash(a, b, c, d)` of the thing's numbers (fixed arity, so it never allocates). `occurrence(now, { every, jitter, dur, p, salt })` is the building block for rare events: one every `every ± jitter` ms, lasting `dur`, in a fraction `p` of slots. Each tab has its own sky; nobody needs to see the same plane.
- **Dim and rare.** The numbers live in `AMBIENT` (plane every 40–90 s, shooting star in 40 % of 30–50 s slots, lightning every 3–5 min and never in the lobby, siren every ~2–4 min) and in the constants at the top of `windows.ts`, `skylife.ts` and `rooflife.ts` (alphas, reach, counts). The tests in `apps/web/test/world-ambient.test.ts` hold the rates, so "rare" stays rare. Nothing is drawn near the top-centre turn bar (the plane flies at 14–34 % of the sky, meteors only on the outer thirds), and the lobby's black-and-white filter covers every new layer because it's applied to the whole world.
- **Art is still text grids** (`tools/sprites/src/life.ts`), in `PALETTE` (which gained two leaf greens `a`/`A` and the green nav light `j`), packed into the same `rooftop.png`. Light effects that aren't pixel art (lightning flash, searchlight cone, siren wash) are code-drawn, low-alpha, and stepped where they can be (the siren wash is three bands, not a gradient).

The pieces:

- **Living windows**: `facade()` takes its plan from `PLANS`, and the atlas frame of each facade carries `windows` (first window at `x, y`, `w`×`h`, one every `bay` columns and `floor` rows, and the plan). `windows.ts` walks the facade's real columns and floors (not the tile's), and `windowFrame(base, windowId(roof, col, floor), now)` says which pane goes on top, or null when the facade's own drawing is right. Each window has its own 4–12 min epoch and is inverted 22 % of the time (about one change every few seconds across the map, which also breaks the three-floor repetition); TVs flicker between `win-t`, `win-t2`, `win-t3`; in 6 % of 26-s slots a lit window gets a silhouette crossing (`win-walk-0..4`). The overlay is recounted every 150 ms, one container per facade, so a frame only moves three containers. A loose pane must equal the facade's window without its sill (a test compares them pixel by pixel), so changing `WINDOWS` changes both.
- **Far-city twinkles**: `skyline(spec, spots)` records every window it draws without consuming the seeded rng (the PNG stays byte-identical), and `twinkles(spots, seed, n)` picks half lit, half dark ones with its own seed. They go to `skylines[i].twinkle` in `rooftop.json` with their lit and dark colours; `skylife.ts` paints the ones that are inverted now (`twinkleOn`, 15–40 s epochs) over every repetition of the strip.
- **Sky**: lightning brightens only the sky behind the far city (the skyline stands out against it), two flashes in 0.3 s, then `playSfx('thunder')` 1.5–3.5 s later. The searchlight is a stretched cone texture behind the far city. The plane is `plane` plus three 1-px light sprites (red, green, strobe, `navLights`).
- **Rain touching things**: splash channels land on roof tops and box lids weighted by area, skipping points hidden under a box; puddles get two ripple channels each and a `puddle-*-shine` tinted with the nearest sign on the same roof (`puddleGlow`, within 80 units) that dims with that sign's failures; drips hang from the front cornice, the facade signs' bottom edges and the water tank's platform. `inPuddle` turns a walking or running body inside a puddle's ellipse into a `kick-*` splash at the feet.
- **Props**: the AC fan is `fan-0..2` (FAN's blade cells re-coloured by angle) laid over the AC's lid; chimney steam is `puff-0..3` drifting left with the rain's slant and fading; BAR buzzes (`barSign`) and 24H blacks out and stutters back (`sign24h`), both as `neonSign(..., { off })` frames; the laundry line swaps `laundry-0/1`.
- **Side-roof clutter**: plain `DECOR` floor/back entries (non-solid, `MAP` untouched). Tall pieces sit near the back (`z` ≥ 40) because floor decor is always drawn behind bodies. The space around the AC and the chimney is kept free (only a cat bowl next to the AC); a test checks it.
- **Street**: four car channels (`carsAt`) on two lanes, moving with the street's parallax under its fog; the siren (`sirenAt`) washes the facades nearest to its moving `x` in red/blue and plays a quiet `siren` once.
- **Home stage** (`Stage.svelte`): a piece of the hotel facade fading into the dark behind the character, its three windows driven by the same `windowFrame`, plus a few CSS rain streaks; both stop under `prefers-reduced-motion`.

To see rare events without waiting, open the game with `?ceu=N` (1–120) on localhost or with `?dev`: `skySpeed` makes the plane, meteor, lightning and siren N times more frequent (same durations). Frame cost, measured headless at 1080p (rAF callback JS, game running, 4 bodies, interleaved A/B against `main`): p50 about 0.8 → 1.1 ms, p95 about 1.4 → 1.9 ms. If you add a layer, keep it pooled (no sprite created per frame), set Pixi properties only when they change, and keep empty `Graphics` hidden instead of clearing them every frame.

## Verification

### `bun run sprites:preview`

This reads only the committed output (no pack needed) and writes to `.preview/` (gitignored), printing every path:

- `<model>-<animation>.png`: that animation's frames side by side (read from the pages through the atlas) (wrapping at 2400 px) at 4×, on a checker background (transparent pixels show), each frame bordered. Red ticks below and to the left of each frame mark the anchor column and row; the feet should sit on them in every frame.
- `characters-idle.png`: the first idle frame of every slot, in slot order. Check the colours and that the feet line up.
- `rooftop.png`: every rooftop frame with its anchor; `emotes-pt-BR.png` and `emotes-en-US.png` with the tail tip as anchor; `skyline-far.png` and `skyline-near.png` each tiled twice side by side, so you can see the seam.

Open them with any image viewer (an agent can `Read` the PNG).

### Watching it in the real game (Playwright)

The Pixi scene has no automated tests, so for anything that moves, look at it running:

```
export PATH=$HOME/.bun/bin:$PATH
bun run build
PORT=3000 bun apps/server/src/index.ts      # serves the built client on :3000
```

Then drive it headless with `playwright-core` (install it in a scratch directory, not in the repo) and the cached Chromium. WebGL needs SwiftShader:

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:3000/?dev');   // ?dev enables fake players
// fill the nickname, pick a character (.gs-char), create the room, then replay keys:
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyD'); await page.waitForTimeout(600);
await page.screenshot({ path: 'run.png' });
await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft');
await page.keyboard.press('Space'); await page.waitForTimeout(150); await page.screenshot({ path: 'jump.png' });
await page.keyboard.press('KeyJ'); await page.waitForTimeout(200); await page.screenshot({ path: 'shove.png' });
```

Take screenshots in the middle of each animation (run, jump, fall off a roof edge, shove next to a fake player, emote keys 1–4). Compare the model sizes side by side, check the post-it height over each model, and toggle effects off to see the raw pixels.

### Art made by an image model

Every character in `packs.ts` is the pattern. The owner sends reference pictures to an image model with the prompt in `docs/character-prompt.md` and gets back a folder: seven one-row sheets (`idle`, `walk`, `run`, `jump`, `fall`, `fall_loop`, and `attack`, which is the game's `shove`; older packs call the file `shove.png` and both are accepted) with the frame counts and fps the model chose (written in `sheet.json`; older packs use the hero's fixed 10@10, 10@12, 10@14, 6@12, 4@12, 3@10, 7@16), facing right, one cell size, transparent background, plus a `sheet.json` (cell size, ground row, feet x). The owner then says "add this character" or "replace X with this" and points at the folder.

**Don't change the art.** No shrinking, recolouring, redrawing, rescaling a frame or dropping frames: the owner wants the pixels as delivered. The recipe (`pack.ts`) may only move whole frames, and the game draws the sheet smaller.

Importing one, start to finish:

0. Check where the art comes from. Art drawn or generated for the owner is fine, including fan drawings of known characters. Files extracted from another game (sprite rips, asset dumps) are not imported, even renamed: say so and stop. If a pack looks like a known game's character, compare a few frames against any rip you have before going on.
1. Copy the seven PNGs (and `sheet.json`) to `assets-src/<name>/`. If the folder has GIFs or "preview" sheets instead, use the PNG sheets and say so.
2. Look at every sheet and measure each cell's opaque bounds with a throwaway script: the cell size, the row under the idle's feet, where the feet sit against the idle in each animation, how tall he is. Trust the measurement over `sheet.json`.
3. Add one entry to `PACKS` in `tools/sprites/src/packs.ts`: `model`, `name`, a unique `color`, `dir`, and the `config`. For a pack from the current prompt the config is short: `...NEW` (the shared scale, no shifts), `cellW`, `cellH`, `headRows`, and `spec: packSpec({...})` with the frames and fps from `sheet.json`. Add what the measurements call for: `shifts` when an animation's feet sit off the idle's (and `padX` at least that), `headSize` or `headShift` when the automatic face square misses, `cells: { shove: {...} }` when `attack.png` has its own larger cell, `float` for animations where the character hovers on purpose, `files` when a sheet's name doesn't match what it shows. For a pack that ignored the size rule use `worldScaleFor(size, measured height)`. Write a short note above the entry: who it is, the cell, anything odd.
4. Add one to `CHARACTERS` in `packages/rules/src/game.ts`. Nothing else lists characters: the client, the tool and the tests read the registry. Replacing a character keeps its slot and skips this step.
5. `bun run sprites`, then `bun test`: the registry test builds every pack whose folder is present and checks the sheet is the art.
6. Look at it: `bun run sprites:preview`, then the game in a headless browser (the home screen picker and stage, and idle, walk, run, jump, shove on the roof). Check the feet don't slide, the name tag sits just above the head, and the neighbours in the picker aren't clipped (`.gs-char .gs-hero` in `app.css` centres the window).
7. Update the README, `CONTEXT.md` if the cast changed, and add an amendment to ADR 0007. Commit on a branch, open a PR, and merge when the owner says so.
8. Tell the owner about every flaw you saw in the art (a smaller frame, a duplicate, a weak fall) and leave it as it is.

Things the client already handles: an atlas with `scale < 1` is drawn smaller everywhere (`artScale`), with smooth filtering and no mipmaps (with mipmaps the sprite disappeared under software WebGL). The funny bots' boss is any character drawn twice as big (`SceneBody.scale`, from `scale` in the snapshot's `bots`): the sprite, the shadow and the emote balloon are multiplied by it from the feet, and `headY`/`emoteY` in `view.ts` take the same factor for the name tag and the balloon. The factor is an integer so pixel art keeps square pixels; art drawn smaller keeps its smooth filtering. No new sheet is needed.

## Pitfalls

- **Image-model art is never edited.** Kratos and Vorcaro come from `pack.ts`, which may only move whole frames. If a frame looks wrong, report it to the owner; don't fix it in code (the first Vorcaro import was shrunk and repaired in the recipe, shipped, and had to be redone).
- **A live override hides a deploy.** The owner can replace any sheet or the music from `/sistema` (ADR 0009). The replacement lives on the server, outside git, and keeps being served after a deploy. If a regenerated sheet doesn't show up live, look at the first tab of `/sistema` for active overrides.
- **CI has no `assets-src/`.** Tests that read real art must not touch the disk when it's absent. `describe.skipIf(!existsSync(pack))` is not enough on its own: bun runs a skipped `describe` body while registering its tests, so guard every read inside the body as well (see the end of `tools/sprites/test/skeleton.test.ts`). The recipe tests use fake images built in code.
- **Semi-transparent pixels get solidified.** `solidify` makes any alpha above 0 fully opaque, so soft edges become hard halos and drop shadows become solid blobs. Clean the source.
- **White slash trails versus white bones or shirts.** Trails are erased as white components that are too big: on the hero, white blobs over `SHIRT_WHITE_MAX = 24` px (the shirt's blobs are at most 17 px; trails are 325+); on the skeleton, white blobs over `SLASH_MIN = 100` (the largest bone blob is 55; the smallest trail 180), plus loose mostly-white pieces of at least `SLASH_TIP_MIN = 40`. New art with large white areas (a white cape, a big skull) needs new thresholds, or a different trail colour in the source. The tests compare bone and eye counts before and after.
- **The frame grows with the widest pose.** Trim wind-ups, or choose compact frames for the shove; check `<model>-*.png` in the preview for empty space. A wide frame no longer breaks the 8192 limit (the pages wrap), but it still costs memory in every frame of the moves page.
- **Never upload a texture over the GPU's `MAX_TEXTURE_SIZE`.** It doesn't fail alone: Pixi batches the scene and the whole batch goes black. Keep generated pages at `MAX_SHEET` (8192) or less; the client checks the limit and shrinks in GPU memory if a GPU is smaller still.
- **Keep head boxes, and so post-it heights, per model.** `headY` comes from each atlas's `head`. A wrong head box puts the post-it inside the sprite or floating far above it.
- **`--gs-char-N` must match `characters.json`**, and a test checks it.
- **Animations must stay within the shove cooldown** (450 ms), and remember the fall→fall_loop switch is the hero's `FALL_MS` for every model.
- **Box props must match `MAP`** exactly (width, face, lid), or the box is invisible; the tests say which box is missing.
- **Tiles must repeat**: the first and last column are identical (half a joint or pillar on each side); facades also repeat vertically. The tests check this.
- **Don't edit the generated JSON or PNG by hand.** Change the recipe and rerun; the next `bun run sprites` overwrites hand edits.
- **The pipeline must stay deterministic**: no `Math.random()` in recipes (the skyline uses the seeded `rng`). A rerun on an unchanged tree must leave `git status` clean.
