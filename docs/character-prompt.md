# Prompt for a new character

The owner gives this prompt, with reference pictures, to an image model. What comes back is a folder that `tools/sprites/src/pack.ts` can import without changing a pixel (see "Art made by an image model" in `docs/art.md`). The frame counts and speeds are the hero's, and `PACK_SPEC` in `pack.ts` expects exactly them.

```text
You are making an animated 2D character for my browser game "guessoca", a side-view
game on a neon rooftop at night where small pixel-art characters walk, run, jump,
fall and shove each other.

I will send you one or more reference images of a character. They may be pixel art,
drawings or real photos. Your job is to turn the reference into a 2D pixel-art-style
game character and produce every animation frame the game needs, filling in all the
poses the references don't show. It does not have to be pixel-perfect or on a strict
pixel grid; what matters is that it reads as pixel art and that every frame follows
the rules below.

WHAT TO DELIVER
1. A folder named after the character (lowercase, no spaces, e.g. "kratos/"),
   delivered as a zip, containing exactly these seven files. Each is a single
   horizontal row of equal-size cells, left to right in playback order, PNG with a
   transparent background:

  file            frames  fps  loops  what it shows
  idle.png          10     10   yes   standing, breathing; small motion only
  walk.png          10     12   yes   one full walk cycle (both steps)
  run.png           10     14   yes   one full run cycle, body leaning forward
  jump.png           6     12   no    crouch, push off, rise; last frame is held while going up
  fall.png           4     12   no    turning from rising to falling; last frame is held
  fall_loop.png      3     10   yes   falling, small flutter of limbs/cloth/hair
  shove.png          7     16   no    a quick push or strike forward, then recover

   Also put a "sheet.json" in the folder with: the cell width and height, the y of
   the ground line in the cell, the x of the point between the feet in the idle,
   and the frames/fps/loop table above.

2. An artifact (one interactive HTML page) that previews the animations, so I can
   judge them before importing. It must:
   - embed the seven sheets (as data URIs, no external files) and play all seven
     at the same time, each at its own fps from the table, with its name, frame
     count and fps as a label;
   - play looping animations forever, and play the non-looping ones once, hold the
     last frame for about a second, then restart;
   - draw with nearest-neighbour scaling (image-rendering: pixelated) at an integer
     zoom, with a zoom control (1x to 8x);
   - use a dark purple background (#1a1028) with a toggle to a checkerboard, so
     stray pixels and halos show up;
   - have a toggle that draws the ground line and the feet x on every animation,
     so I can see if the character slides or sinks;
   - have a "flip" toggle to mirror the character facing left;
   - have pause and step-one-frame buttons, and show the current frame number;
   - include one combined view that plays idle → walk → run → jump → fall →
     fall_loop → shove in sequence on a single character, to check they match
     each other.

The frame counts and fps are fixed: the game plays them at exactly those speeds.
The shove must read fully within its 7 frames (about 440 ms), and the fall within
its 4 frames (about 330 ms), because the game cuts to the next state after that.

RULES FOR EVERY FRAME
1. Side view, facing RIGHT. The game mirrors the sprite for left.
2. One cell size for all seven sheets. Pick whatever size suits the character (any
   size is fine), but keep it identical everywhere.
3. Same character, same scale, same proportions, same colours and same outfit in
   every frame. No drifting details between frames or between sheets.
4. Feet on the same ground line in every cell, and the body at the same horizontal
   position in the cell. In idle, walk, run and shove at least one foot touches that
   line in every frame. In jump, fall and fall_loop the character is in the air but
   stays at the same horizontal position; do not move it up or down the cell to
   show height, the game does that.
5. The character animates in place. Walk and run cycles do not travel across the cell.
6. Loops must be seamless: the last frame leads back into the first, and is not a
   copy of the first.
7. Fully transparent background. No ground, no drop shadow, no glow, no outline
   halo, no motion blur, no slash trails, no dust or spark effects. The game adds
   its own shadow.
8. Hard edges: every pixel is either fully opaque or fully transparent.
9. Keep poses compact. Nothing should swing far outside the body (no long wind-up
   behind the back in the shove), because the widest pose sets the frame size for
   all animations.
10. If the character carries something (a weapon, a bag), it stays in every
    animation, held the same way.
11. Limited palette with clear shading steps, readable at small size on a dark
    purple night background. Give the head a clear silhouette; a label floats above it.

STYLE REFERENCE
Match the feel of a classic 16-bit side-scroller hero: about 3 to 4 heads tall,
strong silhouette, a few shading steps per colour, readable face. Idle is calm
(breathing, cloth or hair moving slightly). Walk is relaxed, run is clearly faster
with a forward lean and bigger arm swing, jump has a visible crouch before take-off,
fall has limbs and cloth trailing upward.

HOW TO WORK
- First show me a single idle frame as the character design and wait for my OK
  before drawing the rest.
- Then produce the seven sheets, build the preview artifact from those exact
  files, and look at it yourself before showing me: fix any animation that
  slides, sinks, flickers or changes the character.
- When I approve the preview, give me the folder as a zip. The PNGs in the zip
  must be the same ones the artifact plays.
- Tell me about any frame where you had to bend a rule.

Here are my reference images:
[attach images]
```

Two changes against the first version of this prompt, both from importing Vorcaro and Kratos: rule 6 now forbids a last frame that copies the first (Vorcaro's idle and walk had one), and rule 8 asks for binary alpha outright.
