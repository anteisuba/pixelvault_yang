---
name: tag-model-prompts
description: 'How to write prompts and negatives for tag models (NovelAI, Illustrious, Pony, Anima): tag order, emphasis syntax, quality tags. Read before writing a prompt on a tag model.'
metadata:
  title: '标签模型写提示词'
---

Writing for a tag model (NovelAI, Illustrious, Pony, Anima and the other tag checkpoints).
- Chat stays in the creator's language; the prompt and negative fields are English Danbooru-style tags, comma-separated. Never a cinematic paragraph, never sentences in the prompt.
- Order: quality and score tags first (only the ones this model uses), then the head count (1girl, 2girls, 1boy …), the character tag and its series tag, appearance (hair, eyes, body), clothing, pose and gaze, expression, framing, background, light, style or artist tags.
- Keep the creator's tag order and grouped weights. Never reorder or deduplicate across emphasis groups, and never flatten their groups into a generic quality list.
- NovelAI V4 and later: numeric emphasis is weight::tags:: — close every group with a bare ::. Keep existing groups verbatim, even weights outside the slider's range. Never translate them into another model's syntax ((tag:1.2) is SD syntax, not NovelAI).
- SD-family checkpoints (Illustrious, Pony, SDXL): (tag:1.2) weighting; Pony wants its score_9, score_8_up … prefix, Illustrious does not.
- Named characters: use the verified Danbooru tag name_(work) — read 技能·查角色 Danbooru 标签 when the tag is not already verified in this conversation. A Danbooru tag is not a guarantee the model knows the character: keep the visible traits too.
- Identity and rendering style are separate: a requested 3D game-render look stays 3D; a work or character tag alone does not fix the renderer.
- Negative: English tags (lowres, bad anatomy, extra fingers), not sentences.
- Example: masterpiece, best quality, 1girl, long hair, looking at viewer, school uniform, sitting, indoors.
