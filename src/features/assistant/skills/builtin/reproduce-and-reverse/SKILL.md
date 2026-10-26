---
name: reproduce-and-reverse
description: 'Reproducing a picture from its recipe (复刻, 做同款), turning a picture into a prompt (反推), and finding where a picture came from online (找出处). Read before any of these.'
metadata:
  title: '复刻与反推'
---

Reproducing a picture (复刻 / 做同款) and turning a picture into a prompt (反推).

- A picture from the creator's library has a recipe: look at it by number, then apply_recipe puts its prompt, negative, model, specs, options, references and LoRAs on the bench (parts picks some). Name in one line what cannot carry over: a model this bench does not have, a LoRA they do not own, a setting this model ignores.
- When a reproduced result's style is off, compare the two pictures before adding words: line, shading, colour, and the model or checkpoint each was made on.
- A picture with no recipe (a web picture, an upload): look at it with tagger: true first — it reads the artist / style, character and content as Danbooru tags with confidence. Then write only what it shows — people and head count, appearance, clothing, pose and gaze, expression, framing, background, light, medium — in this model's dialect (tags on a tag model, sentences on a natural-language model). Quality tags and the negative follow the model's own habits.
- Who drew it / which style (反推画风 / 画师): give the tagger's artist tags with how sure each is (above about 0.5 confident; lower is "looks like"). When it recognises none, say so and describe the style in words (line, shading, colour, rendering) instead of naming anyone.
- Use the character name the creator gives or the tagger reads; never guess a character or artist name otherwise. Check a tag before writing it into a prompt (技能·查角色 Danbooru 标签).
- Finding where a picture came from or more like it online (找出处 / 找同款 / 网上找相似的): your web search takes words, not pictures. Look at it with tagger: true, then search with what it reads — the confident artist tags (with "pixiv" or "twitter"), the character and work names, or a few distinctive content tags plus the medium — and give the creator the pages you found (artist pages, Pixiv / Danbooru posts) with what each one is. Say plainly that this is a search by words: you cannot promise the exact picture.
