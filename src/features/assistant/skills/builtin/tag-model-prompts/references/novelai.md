# NovelAI V4.5 / V5

Checked against the NovelAI web client on 2026-11-27.

## Tags or sentences

- V4.5: Danbooru tags. A short English phrase is tolerated, but tags carry the picture.
- V5: reads plain English best of all NovelAI models. Keep tags for who and what (head count, character, hair, clothing, style), and add one or two short sentences for what tags cannot say: an action between people, a layout, a mood ("She is handing him a letter under the rain."). Never a paragraph, and never camera jargon a tag already covers.

## Emphasis

- {tag} raises a tag about ×1.05 per brace; [tag] lowers it about ÷1.05 per bracket. Stack at most three.
- Numeric: 1.3::tag:: and close the group with a bare ::. Below 1 weakens it.
- Negative weight -1::tag:: (V4.5 and V5) removes a concept from inside the prompt — handy when the negative field is not enough, and the ONLY way to steer away unwanted elements on V5 Full Medium Effort (where -1::tag:: to -3::tag:: replaces custom Undesired Content).
- Never (tag:1.2): that is SD syntax and NovelAI reads it as literal text.

## Base Canvas vs Precise Reference (two independent tracks)

- **Base Canvas (`add_reference` / `ref-1`)**: img2img or inpaint base image. Its redraw strength (`0.01–0.99`, default `0.7`) controls how freely the model changes the base picture — higher means more change. Do NOT put character/style/outfit references in Base Canvas when the creator wants Precise Reference.
- **Precise Reference (`precise_references` / `precise-1…`)**: separate from Base Canvas, up to 16 images, **+5 Anlas per image** (outside Opus free generation). Always pass verified picture handles (`precise-N`, `ref-N`, `result-N`, attached names, or `图_N`), never raw URLs. `precise_references` takes the full list each time; `[]` clears it.
  - **V4.5 Full / Curated**: kinds `character`, `style`, `character&style` (no `outfit`); `strength` `0–1`, `fidelity` `0–1` (both default `1`); no `preferSameOutfit`; multiple character references blend into one person; can combine with inpainting.
  - **V5 Full / Curated**: kinds `character`, `style`, `character&style`, `outfit`; `strength` `0–5` (default `1`, no `fidelity` control); `preferSameOutfit` toggle on `character` and `character&style` (`true` keeps the reference outfit, `false` allows changing clothes); supports multi-character stacking; **cannot** combine with inpainting.
  - **V5 Full Medium Effort**: **Precise Reference is NOT supported** (only Base Canvas img2img/inpaint). Switch to V5 Full or V5 Curated if the creator wants Precise Reference.

## V5 Full Medium Effort (distilled fast mode)

- Fixed 14 steps, `k_euler_ancestral`, `cfg_rescale 0`, and locked Heavy Undesired Content preset — custom base and character negative prompts are ignored.
- Use negative numeric emphasis (`-1::tag::` to `-3::tag::`) inside the positive prompt instead of writing to the negative field.
- Supports structured multi-character layout (up to 22 free positions) and text rendering (up to 750 chars, CJK supported), but does NOT support Precise Reference.

## Artist strings & Prompt Blocks

- Artist tags in NovelAI use the `artist:` prefix with spaces, e.g. `0.8::artist:rella::, 0.55::artist:guweiz::`. Keep total artist weights balanced (~1.5–2.3 across 2–3 complementary artists).
- On the tag bench, decouple the artist string into an enabled fixed `prefix` Prompt Block via `prompt_blocks` (`position: "prefix"`, `mode: "fixed"`, `weight: 1`) so style and scene can be edited independently. Check existing `Prompt blocks` on the board and disable conflicting leftover blocks (`enabled: false`).
- For full artist-string composition and original scene rules, read 技能·画师串调配与场景构图.

## What the app already adds — do not write it yourself

- Quality tags ("very aesthetic, masterpiece, no text" and the like) come from the quality chip.
- The Undesired Content preset (heavy, light, human focus, furry focus) comes from its chip and is prefixed to the negative.
- Writing either by hand doubles it. Point the creator at the chip instead.

## Text in the picture

- On the tag bench, words someone says are that person's dialogue, and other words are scene text. The app writes the "Text:" block at the very end of the prompt and drops "no text" from the quality tags. Never write "Text:" or quotes into a prompt yourself.
- V4.5 draws English only, up to about 118 characters in total. V5 Curated about 374, V5 Full (and Medium Effort) about 750, and V5 can draw Chinese, Japanese and Korean.

## People

- V4.5 takes up to 6 people on a 5×5 grid; V5 takes up to 22 people with free coordinates. In each person's own field write girl or boy, not 1girl; the head count (2girls, 1boy …) stays in the base prompt.

## Relations and complex layouts (V5)

- Tags name things; one short sentence ties them together. Name each object that is held, touched or in front as a plain noun phrase (a red umbrella), then say who holds it, what rests on what, and what hides what ("He holds a red umbrella over her; a table is in front of them.").
- Only list objects that are in this picture, and keep the creator's counts and colours.

## Comics and four-panel pages (V5)

- Reading order is left to right, top to bottom unless the creator asks for right to left or is adapting a manga page that reads that way. Say the order once in the base prompt.
- Four panels default to a 2×2 grid; name them top left, top right, bottom left, bottom right. Other layouts only when asked.
- Start each panel with where it is and what range it shows ("In the top right panel, close-up of her hands:"), then one or two short lines of content. Do not describe gutters, borders or panel ratios unless the creator wants them.
- No quality tags in a comic base prompt; keep each person's look identical across panels.

## Limits and settings

- Prompt length: V5 Full about 1471 tokens, V5 Curated about 703. Past that, the end is cut off — the important tags go first.
- Defaults: V5 CFG 4 and 28 steps (Medium Effort is fixed at 14 steps); V4.5 CFG 5. On V5, CFG above about 6 burns the colours; raise steps rather than CFG.
- Opus plans generate free only for single-image text-to-image (no Base Canvas, no Precise Reference) at ≤1024×1024 pixels and ≤28 steps (V5 counts toward the monthly Opus usage bar). Adding Base Canvas, Precise Reference (+5 Anlas each), larger sizes, or >28 steps costs Anlas — tell the creator clearly when suggesting them.
- Sizes: Small / Normal presets stay within the Opus free pixel area (`512×768` / `832×1216` / `1024×1024` etc.); Large (`1024×1536`, `1472×1472`) and Wallpaper (`1088×1920`, `1920×1088`) cost Anlas. Custom sizes must be multiples of 64 (64–2048 per side, ≤3,145,728 total pixels).
