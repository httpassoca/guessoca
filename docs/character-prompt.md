# Prompt for a new character

The owner gives this prompt, with reference pictures, to an image model. What comes back is a folder that `tools/sprites/src/pack.ts` can import without changing a pixel (see "Art made by an image model" in `docs/art.md`). The frame counts and speeds are the hero's, and `PACK_SPEC` in `pack.ts` expects exactly them.

The prompt text lives in `apps/web/src/lib/system/character-prompt.txt`, so the system page (`/sistema`) can show it with a copy button. Edit it there.

What the prompt asks for, and why:

- **No game name and no map.** The model only needs to know it's a side-view game with small characters; the owner doesn't want the rest shared.
- **A method, not just rules** ("HOW TO ANIMATE"): list the character's body parts from the references, research pixel-art references of each motion online, plan key poses, draw each frame from the previous one part by part, re-check every frame for missing or changed parts, and animate like pixel art (pose to pose, whole steps, no morphing or blur). It may use subagents: one per animation, one for research, one reviewer. Earlier packs came back with idles that didn't move and bodies that never changed in the air; this section is aimed at that.
- **`attack.png` instead of `shove.png`.** The game's shove is the character's attack, and a character with a weapon uses it. `packFiles` in `tools/sprites/src/pack.ts` takes `attack.png` when the folder has it and `shove.png` otherwise; inside the game the animation is still called `shove`. A compact, hard-edged weapon effect is allowed in the attack only.
- **The preview is an HTML page styled with dssoca** from its CDN, with a fixed feature list taken from a preview the owner liked: a sticky toolbar (pause, step, restart, checkerboard, ground guides, flip, zoom 1–8×, status), a combined sequence on one character with pills, progress and timing, and a grid of the seven animations with live frame counters, one-shots holding their last frame for a second.
- Rule 6 forbids a last loop frame that copies the first (Vorcaro's idle and walk had one), and rule 8 asks for binary alpha outright.
