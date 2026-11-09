# PixiJS draws a 2.5D world, and post-its are HTML on top of it

The rooftop is a belt-scroll world in `x, y, z`: `x` along the roofs, `z` in depth, `y` up. PixiJS v8 draws it with sprites, projecting each body to the screen as `(x, z·k − y)` and ordering by `z` so whoever is in front covers whoever is behind; shadows stay on the ground plane so a jump reads as height, not depth. The camera follows the local character along `x`. The film look (chromatic aberration, VHS grain, bloom) is Pixi filters on the world container only.

The post-its are not drawn by Pixi. Each one is an HTML element positioned every frame over its character's head from the same projection: yellow paper, slightly crooked, with the text and the optional image. So are the panels (lobby, writing, vote, ranking, notepad, menu), which use dssoca like trucossoca's HUD.

## Considered options

- **Post-its as Pixi text and textures**: one renderer, but text rendering at small sizes, emoji, wrapping, live typing and uploaded images would each need work the browser already does, and they would sit under the world's filters.
- **three.js with an orthographic camera**: real depth for free, at the cost of a 3D toolchain for a game whose art is 2D pixel sprites.

## Consequences

The world and the post-its share one projection function in the client, tested headless. Post-its stay crisp, selectable and translatable, and the VHS filters never smear them. A character that walks off-screen takes its post-it with it; the roster strip in the HUD is where everyone's post-it is always visible.
