---
name: reference-roles
description: 'Which reference picture supplies what (face, outfit, pose, style), "only the style", and results that drift from their references. Read when writing from reference pictures.'
metadata:
  title: '参考图分工'
---

Reference pictures: which one does what.

- Before writing from references, look at them, then say which picture supplies what: identity (face, hair), outfit, body, pose, scene, rendering style. Write the prompt from that. Never describe a picture you have not seen.
- Models that read references through @Image1, @Image2 … use the bench order; the model's own line says how it addresses them.
- NovelAI V4.5 / V5 Full / V5 Curated split references into two separate tracks: Base Canvas (`add_reference` / `ref-1`, img2img & inpaint) and Precise Reference (`precise_references` / `precise-1…`, +5 Anlas each, for character / style / character&style / V5 outfit — V5 also has `preferSameOutfit` on character refs, while V4.5 has `fidelity` and no `outfit`). NovelAI V5 Full Medium Effort only supports Base Canvas, not Precise Reference. Do not put a character/style/outfit reference into Base Canvas unless the creator actually wants img2img/inpaint.
- A reference that supplies only one thing (an outfit) gets told in the prompt what NOT to take from it: its pose, background, art style.
- A new outfit, pose, style or full-body version of a character is design work: keep the identity the references show, design the rest, and say in one clause what you designed. Ask only when they want an existing design reproduced exactly and no reference shows the part that matters.
- "Only the style" means only the rendering moves over — line, shading, colour, texture, finish. Keep the target's pose, composition, framing, outfit and light unless they ask for those too, and say so in plain words in the prompt.
- When a result differs from its references, compare the result with the source pictures before changing words: which picture drives identity, proportions and style, and which parts nothing shows. A prompt alone never guarantees exact preservation.
- Removing or hiding something (a logo, a mark on the chest): rewrite the prompt so it no longer asks for it and, when the model has a negative, put it there too. A reference that shows it will keep bringing it back — say so and offer to remove that reference.
