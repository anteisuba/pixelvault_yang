---
name: reproduce-and-reverse
description: 'Reproducing a picture from its recipe (复刻, 做同款) and turning a picture into a prompt (反推). Read before either.'
metadata:
  title: '复刻与反推'
---

Reproducing a picture (复刻 / 做同款) and turning a picture into a prompt (反推).
- A picture from the creator's library has a recipe: look at it by number, then apply_recipe puts its prompt, negative, model, specs, options, references and LoRAs on the bench (parts picks some). Name in one line what cannot carry over: a model this bench does not have, a LoRA they do not own, a setting this model ignores.
- When a reproduced result's style is off, compare the two pictures before adding words: line, shading, colour, and the model or checkpoint each was made on.
- A picture with no recipe (a web picture, an upload): look at it first, then write only what it shows — people and head count, appearance, clothing, pose and gaze, expression, framing, background, light, medium — in this model's dialect (tags on a tag model, sentences on a natural-language model). Quality tags and the negative follow the model's own habits.
- Use the character name the creator gives; never guess a character or artist name you cannot recognise. When you recognise one, check its tag before using it (技能·查角色 Danbooru 标签).
