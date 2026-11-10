# Prompt for a new character

The owner gives this prompt, with reference pictures, to an image model. What comes back is a folder that `tools/sprites/src/pack.ts` can import without changing a pixel (see "Art made by an image model" in `docs/art.md`). The frame counts and speeds are the hero's, and `PACK_SPEC` in `pack.ts` expects exactly them.

The prompt text lives in `apps/web/src/lib/system/character-prompt.txt`, so the system page (`/sistema`) can show it with a copy button. Edit it there.


Two changes against the first version of this prompt, both from importing Vorcaro and Kratos: rule 6 now forbids a last frame that copies the first (Vorcaro's idle and walk had one), and rule 8 asks for binary alpha outright.
