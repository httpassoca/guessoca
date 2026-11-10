# Art: how the 2D side works and how to import new art

This guide is for the next agent, or the owner, who is about to add a character, an animation, a prop, a background, a map or an emote. It explains the whole path from a source file to a pixel on screen, so you don't have to re-derive it. The decisions behind it are in ADR 0005 (world simulated in the client), ADR 0006 (Pixi 2.5D with HTML post-its) and ADR 0007 (sprites generated from a gitignored pack, plus its amendment for the skeleton). Code comments are in Portuguese; every file below has a header saying what it makes and where its output goes.

## The flow

```
owner's files ──cp──▶ assets-src/ (gitignored)         text grids in code (rooftop.ts, emotes.ts, skyline.ts)
                         │                                  │
                         ▼                                  ▼
            recipes in tools/sprites/src  ◀─────────────────┘
                         │   bun run sprites   (tools/sprites/src/index.ts)
                         ▼
   apps/web/public/sprites/*.png        apps/web/src/lib/sprites/*.json      (both committed)
   char-0/1.png, char-2..9.webp,        hero, skeleton, kratos, vorcaro, orelha,
                                        bolsonaro, knight, oldsnake, pinocchio,
                                        eve,
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
- **Skeleton knight**, **Kratos**, **Vorcaro**, **Orelha**, **Bolsonaro**, the masked **knight**, **Old Snake**, **Pinocchio** and **Eve**: the owner's own art (the last four made by an image model at the owner's request). No restriction and no credit (`"credit": null`).
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
| `atlas.ts` | What the two models share: `ANIMATION_NAMES` (row order) and `layout()`, which crops all frames to one rectangle and builds the sheet and `Atlas`. |
| `hero.ts` | The hero recipe: slice 128×128 cells, remove the sword from the shove, one sheet per hair ramp in `HAIRS` (only blonde today). |
| `skeleton.ts` | The skeleton recipe: slice 170×125 cells, remove slash trails, draw run/jump/fall, one sheet per cape ramp in `CAPES` (only red today). |
| `pack.ts` | The recipe for characters that arrive complete as seven sheets (image-model art). Changes no pixel: grounds every frame, optionally shifts an animation sideways, writes the sheet at the art's size with `scale` in the atlas. |
| `kratos.ts`, `vorcaro.ts`, `orelha.ts`, `bolsonaro.ts`, `knight.ts`, `oldsnake.ts`, `pinocchio.ts`, `eve.ts` | One `PackConfig` each for `pack.ts`: cell size, shifts, world scale, head rows (and `headSize` for the dog and the dinosaur rider), feet rows. |
| `characters.ts` | The ten slots (0 hero, 1 skeleton, 2 Kratos, 3 Vorcaro, 4 Orelha, 5 Bolsonaro, 6 knight, 7 Old Snake, 8 Pinocchio, 9 Eve) → `characters.json`. |
| `emotes.ts` | The emote balloons, from a 3×5 text font, one sheet per language. |
| `rooftop.ts` | The rooftop palette, the `Sketch` stamping board, every prop/texture/sign as a text grid, and the shelf-packed `rooftop.png` + atlas. |
| `skyline.ts` | The two seeded, seamlessly tiling city strips. |
| `../test/` | Recipe tests with fake images; real-art tests skip when `assets-src/` is absent. |

Generated data, `apps/web/src/lib/sprites/`:

| File | Job |
|---|---|
| `hero.json`, `skeleton.json`, `kratos.json`, `vorcaro.json`, `orelha.json`, `bolsonaro.json`, `knight.json`, `oldsnake.json`, `pinocchio.json`, `eve.json` | One `Atlas` per model: frame size, anchor, head box, stand box, animation rows with frames/fps/loop, credit. |
| `characters.json` | Slot `n` → model, colour name, UI colour, sheet URL, atlas name. |
| `rooftop.json` | Every rooftop frame (position, anchor, `tile`, `face`) plus the skyline strips. |
| `emotes.json` | Each balloon's rectangle and tail tip (shared by both languages). |
| `characters.ts` | Typed access for the client: `CHARACTER_ART`, `character(n)`, `frameAt`, `frameIndex`, `sheetSize`, `PORTRAIT`. |
| `rooftop.ts` | Typed access to `rooftop.json`; the sheet URLs. |

Client rendering, `apps/web/src/lib/world/` (Pixi files have no automated tests; the pure ones do):

| File | Job |
|---|---|
| `scene.ts` | The Pixi `Application`, layer order, depth sorting, character sprites, shadows, emote balloons. |
| `platforms.ts` | Draws the dressed roofs: top, back ledge, facade, front parapet, box props, decor. |
| `dressing.ts` | Pure: which frame dresses each `MAP` box, roof rectangles on screen, `DECOR` placement, neon flicker and beacon timing. |
| `backdrop.ts` | Sky bands, stars, moon, two parallax skyline strips, the drop to the street and the street fog. |
| `weather.ts` | Rain streaks and the low front fog. |
| `rain.ts` | Pure rain simulation (fixed pool of drops, screen pixels). |
| `parallax.ts` | Pure parallax offset and the per-layer factors. |
| `film.ts` | The film look: bloom on scenery, RGB split and CRT grain/scanlines/vignette on the world. |
| `art.ts` | Loads `rooftop.png` and the skylines into textures; tiles get their own repeat-mode canvas. |
| `view.ts` | Pure: integer scale, ground line, post-it and emote anchor heights. |
| `declutter.ts` | Pure: lifts overlapping post-its so the one behind sits above. |
| `heads.ts` | Pure: what each head tag shows. |
| `crowd.ts` | Pure: the other bodies (interpolated presence, fake players' fixed spots). |
| `runtime.ts` | The rAF loop: steps physics, sends presence, calls `Scene.render`, positions HTML post-its. |

HTML art, `apps/web/src/lib/panels/`: `Hero.svelte` (a character's idle in a CSS background, the same window for both models), `Swatch.svelte` (the head box as a coloured square), `Stage.svelte` (the chosen character at 4× on a strip of roof in the pre-lobby), `Ledge.svelte` (that strip, drawn from `rooftop.png` on a canvas), `CharacterPicker.svelte` (the eight buttons).

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
- **Layer order** inside the world container: `scenery` (backdrop, then `platforms.back`: back decor, roof tops, ledges, facades, edges, facade signs, floor decor, box props) → shadows → bodies → `platforms.front` (front parapets, covering feet at the edge) → emote balloons → weather. The post-its and panels are HTML above the canvas and never pass through the filters.
- **Shadow**: an ellipse at the ground under the feet (`groundAt(MAP, x, z)`), not at the body's height, so a jump reads as height. It's `BODY_RX·1.3` by `BODY_RZ·DEPTH_K·1.8` world units at 40 % black, and shrinks to 45 % size by 120 units above the ground.
- **`BODY_H = 40`** is the physics height (what you stand on when riding a head). It isn't the sprite height (hero 37, skeleton 51, Kratos 61, Vorcaro 50, Orelha 30, Bolsonaro 45, knight 35, Old Snake 49, Pinocchio 50, Eve 50). Post-it height comes from the atlas instead: `headY(n) = anchor.y − head.y + 3` (hero 40, skeleton 47). The emote tail sits at `headY − 11`, `EMOTE_GAP = 14` units in front of the face.

## The character contract

### Animations

Every model's sheet has one row per animation, in this exact order (`ANIMATION_NAMES` in `tools/sprites/src/atlas.ts`, `Anim` in `@guess/world`):

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
- `stand` is the idle frame's opaque rectangle. `PORTRAIT` in `apps/web/src/lib/sprites/characters.ts` is the smallest window that fits every model's idle with the feet at one `anchorX`; `Hero.svelte` uses it so all ten line up in the picker.
- Pixel art has no half-alpha: recipes call `solidify` on every cell first, which makes every non-zero alpha fully opaque. **Anti-aliased or soft-shadowed source art gets a hard halo.** Clean it in the source, or erase those colours in the recipe.

### The ten slots

`CHARACTERS = 10` in `@guess/rules` (characters aren't exclusive; a room still has up to eight people, so two can pick the same one). `tools/sprites/src/characters.ts` lists them in slot order: the hero variants in `HAIRS` (only blonde today), the skeleton variants in `CAPES` (only red today), then Kratos, Vorcaro, Orelha, Bolsonaro, the knight, Old Snake, Pinocchio and Eve. The cast once had eleven, with four hair colours and three capes; the owner cut it to one per model. Changing the count renumbers what each browser remembers, which is harmless: an out-of-range number falls back to slot 0. `characters.json` maps each slot to:

```json
{ "model": "skeleton", "name": "vermelho", "color": "#982b2b", "sheet": "/sprites/char-1.png", "atlas": "skeleton" }
```

- `index.ts` writes the `i`-th sheet a model's `build()` returns to the `i`-th slot of that model, so variant order = slot order.
- `color` is the ramp's base colour. It's used for borders and marks in the UI, and **must also be `--gs-char-N` in `apps/web/src/app.css`** (`apps/web/test/characters.test.ts` checks this). Colours must be unique.
- The UI names characters "Personagem N" (`pre.characterN` in `apps/web/src/lib/i18n.ts`), not by colour, so a new variant needs no i18n. The `name` field (Portuguese colour name) isn't shown.

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
4. **Slots**: there are ten, which fills the picker's two rows, and characters aren't exclusive. Either take existing slots (for example 2 hero + 2 skeleton + new ones) or append one: raise `CHARACTERS` in `@guess/rules`, add a `--gs-char-N` in `app.css` (the picker, `.gs-chars`, is rows of five and wraps by itself; keep it to two rows, because a third makes the home card taller than a 1080p screen), and update the range tests (rules, protocol, create, identity). The order in `characters()` is the slot order, and `@guess/rules` doesn't care which model a slot is. Existing rooms keep their numbers, so changing what a number looks like is a visual change only.
5. **Client**: in `apps/web/src/lib/sprites/characters.ts`, import `<model>.json`, add it to `Model` and `ATLASES`. Update `--gs-char-N` in `app.css` and the model list in `apps/web/test/characters.test.ts`.
6. **Credit**: if the pack needs credit, add it to the `credit.*` i18n keys (both languages), the menu and home footer, the README and the ADR. Credit strings are i18n'd; names of characters aren't.
7. Add recipe tests with fake images (see `tools/sprites/test/skeleton.test.ts`), plus real-art tests guarded by `existsSync`, as in the pitfalls below.
8. Check `PORTRAIT`: if the new idle is much taller or wider, every portrait grows.

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
- `neonFlicker` and `beaconOn` in `dressing.ts`: the sign and mast light timings.

## Verification

### `bun run sprites:preview`

This reads only the committed output (no pack needed) and writes to `.preview/` (gitignored), printing every path:

- `<model>-<animation>.png`: that animation's frames side by side (wrapping at 2400 px) at 4×, on a checker background (transparent pixels show), each frame bordered. Red ticks below and to the left of each frame mark the anchor column and row; the feet should sit on them in every frame.
- `characters-idle.png`: the first idle frame of all ten slots, in slot order. Check the colours and that the feet line up.
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

Kratos, Vorcaro, Orelha, Bolsonaro, the knight, Old Snake, Pinocchio and Eve are the pattern; `oldsnake.ts`, `pinocchio.ts` and `eve.ts` are the most recent and follow the current prompt (`attack.png`). The owner sends reference pictures to an image model with the prompt in `docs/character-prompt.md` and gets back a folder: seven one-row sheets (`idle`, `walk`, `run`, `jump`, `fall`, `fall_loop`, and `attack`, which is the game's `shove`; older packs call the file `shove.png` and both are accepted) with the hero's counts and speeds (10@10, 10@12, 10@14, 6@12, 4@12, 3@10, 7@16), facing right, one cell size, transparent background, plus a `sheet.json` (cell size, ground row, feet x). The owner then says "add this character" or "replace X with this" and points at the folder.

**Don't change the art.** No shrinking, recolouring, redrawing, rescaling a frame or dropping frames: the owner wants the pixels as delivered. The recipe (`pack.ts`) may only move whole frames, and the game draws the sheet smaller.

Importing one, start to finish:

0. Check where the art comes from. Art drawn or generated for the owner is fine, including fan drawings of known characters. Files extracted from another game (sprite rips, asset dumps) are not imported, even renamed: say so and stop. If a pack looks like a known game's character, compare a few frames against any rip you have before going on.
1. Copy the seven PNGs (and `sheet.json`) to `assets-src/<name>/`. If the folder has GIFs or "preview" sheets instead, use the PNG sheets and say so.
2. Look at every sheet and measure each cell's opaque bounds with a throwaway script: the cell size, the row under the idle's feet, where the feet sit against the idle in each animation, how tall he is. Trust the measurement over `sheet.json`.
3. Write `tools/sprites/src/<name>.ts`: a `PackConfig` (`cellW`, `cellH`, `shifts` for an animation whose feet sit off the idle's, `padX` ≥ the largest shift, `worldScale` = the height wanted in game ÷ the art's height, `headRows`, `feetRows`), a UI colour, and `build<Name> = (sheets) => buildPack(sheets, CONFIG)`. `kratos.ts` is the shortest example; `orelha.ts` is the one for an animal (wider than tall, head at the front: set `headSize`).
4. Register it: `Model`, `SHEET_FORMAT` (`'webp'`, always lossless) and `characters()` in `tools/sprites/src/characters.ts`; an entry in `models` in `index.ts`; and in the client `apps/web/src/lib/sprites/characters.ts` (import the JSON, `Model`, `ATLASES`). Replacing a character keeps its slot and needs none of the slot steps; a new slot follows "The ten slots" above (raise `CHARACTERS`, add `--gs-char-N`, bump the range tests in rules, protocol, create and identity).
5. `bun run sprites`, then add the character to the real-art list at the end of `tools/sprites/test/pack.test.ts` and update the model lists in `tools/sprites/test/atlas.test.ts` and `apps/web/test/characters.test.ts`.
6. Look at it: `bun run sprites:preview`, then the game in a headless browser (the home screen picker and stage, and idle, walk, run, jump, shove on the roof). Check the feet don't slide, the name tag sits just above the head, and the neighbours in the picker aren't clipped (`.gs-char .gs-hero` in `app.css` centres the window).
7. Update the README, `CONTEXT.md` if the cast changed, and add an amendment to ADR 0007. Commit on a branch, open a PR, and merge when the owner says so.
8. Tell the owner about every flaw you saw in the art (a smaller frame, a duplicate, a weak fall) and leave it as it is.

Things the client already handles: an atlas with `scale < 1` is drawn smaller everywhere (`artScale`), with smooth filtering and no mipmaps (with mipmaps the sprite disappeared under software WebGL).

## Pitfalls

- **Image-model art is never edited.** Kratos and Vorcaro come from `pack.ts`, which may only move whole frames. If a frame looks wrong, report it to the owner; don't fix it in code (the first Vorcaro import was shrunk and repaired in the recipe, shipped, and had to be redone).
- **A live override hides a deploy.** The owner can replace any sheet or the music from `/sistema` (ADR 0009). The replacement lives on the server, outside git, and keeps being served after a deploy. If a regenerated sheet doesn't show up live, look at the first tab of `/sistema` for active overrides.
- **CI has no `assets-src/`.** Tests that read real art must not touch the disk when it's absent. `describe.skipIf(!existsSync(pack))` is not enough on its own: bun runs a skipped `describe` body while registering its tests, so guard every read inside the body as well (see the end of `tools/sprites/test/skeleton.test.ts`). The recipe tests use fake images built in code.
- **Semi-transparent pixels get solidified.** `solidify` makes any alpha above 0 fully opaque, so soft edges become hard halos and drop shadows become solid blobs. Clean the source.
- **White slash trails versus white bones or shirts.** Trails are erased as white components that are too big: on the hero, white blobs over `SHIRT_WHITE_MAX = 24` px (the shirt's blobs are at most 17 px; trails are 325+); on the skeleton, white blobs over `SLASH_MIN = 100` (the largest bone blob is 55; the smallest trail 180), plus loose mostly-white pieces of at least `SLASH_TIP_MIN = 40`. New art with large white areas (a white cape, a big skull) needs new thresholds, or a different trail colour in the source. The tests compare bone and eye counts before and after.
- **The frame grows with the widest pose.** Trim wind-ups, or choose compact frames for the shove; check `<model>-*.png` in the preview for empty space.
- **Keep head boxes, and so post-it heights, per model.** `headY` comes from each atlas's `head`. A wrong head box puts the post-it inside the sprite or floating far above it.
- **`--gs-char-N` must match `characters.json`**, and a test checks it.
- **Animations must stay within the shove cooldown** (450 ms), and remember the fall→fall_loop switch is the hero's `FALL_MS` for every model.
- **Box props must match `MAP`** exactly (width, face, lid), or the box is invisible; the tests say which box is missing.
- **Tiles must repeat**: the first and last column are identical (half a joint or pillar on each side); facades also repeat vertically. The tests check this.
- **Don't edit the generated JSON or PNG by hand.** Change the recipe and rerun; the next `bun run sprites` overwrites hand edits.
- **The pipeline must stay deterministic**: no `Math.random()` in recipes (the skyline uses the seeded `rng`). A rerun on an unchanged tree must leave `git status` clean.
