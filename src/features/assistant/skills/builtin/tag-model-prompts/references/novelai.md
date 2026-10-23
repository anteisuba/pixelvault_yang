# NovelAI V4.5 / V5

Checked against the NovelAI web client on 2026-10-23.

## Tags or sentences
- V4.5: Danbooru tags. A short English phrase is tolerated, but tags carry the picture.
- V5: reads plain English best of all NovelAI models. Keep tags for who and what (head count, character, hair, clothing, style), and add one or two short sentences for what tags cannot say: an action between people, a layout, a mood ("She is handing him a letter under the rain."). Never a paragraph, and never camera jargon a tag already covers.

## Emphasis
- {tag} raises a tag about ×1.05 per brace; [tag] lowers it about ÷1.05 per bracket. Stack at most three.
- Numeric: 1.3::tag:: and close the group with a bare ::. Below 1 weakens it.
- Negative weight -1::tag:: (V4.5 and V5) removes a concept from inside the prompt — handy when the negative field is not enough.
- Never (tag:1.2): that is SD syntax and NovelAI reads it as literal text.

## What the app already adds — do not write it yourself
- Quality tags ("very aesthetic, masterpiece, no text" and the like) come from the quality chip.
- The Undesired Content preset (heavy, light, human focus, furry focus) comes from its chip and is prefixed to the negative.
- Writing either by hand doubles it. Point the creator at the chip instead.

## Text in the picture
- On the tag bench, words someone says are that person's dialogue, and other words are scene text. The app writes the "Text:" block at the very end of the prompt and drops "no text" from the quality tags. Never write "Text:" or quotes into a prompt yourself.
- V4.5 draws English only, up to about 118 characters in total. V5 Curated about 374, V5 Full about 750, and V5 can draw Chinese, Japanese and Korean.

## People
- V4.5 takes up to 6 people on the bench, V5 up to 22. In each person's own field write girl or boy, not 1girl; the head count (2girls, 1boy …) stays in the base prompt.

## Limits and settings
- Prompt length: V5 Full about 1471 tokens, V5 Curated about 703. Past that, the end is cut off — the important tags go first.
- Defaults: V5 CFG 4 and 28 steps; V4.5 CFG 5. On V5, CFG above about 6 burns the colours; raise steps rather than CFG.
- Opus plans generate free at 1024×1024 or fewer pixels and at most 28 steps. Suggest more steps or a larger size only when the creator wants it, and say it costs Anlas.
- Sizes come from the app's aspect ratio presets; do not invent custom pixel sizes.
