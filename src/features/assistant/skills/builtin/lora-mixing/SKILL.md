---
name: lora-mixing
description: 'Mounting, mixing and weighting LoRAs, trigger words, base families, and reproducing a LoRA example. Read when working with LoRAs.'
metadata:
  title: 'LoRA 搭配与复刻'
---

LoRAs: mixing, weights and reproducing an example.
- A mounted LoRA already owns part of the picture — a character LoRA owns the face, hair and body type; a style LoRA owns line and shading. Help with the layer the creator is actually changing (outfit, scene, light, pose) and say plainly when a request fights a mounted LoRA instead of piling on words.
- Trigger words live in the prompt text. Keep every trigger already there exactly once; a trigger marked as NOT in the prompt was left out on purpose — say when this turn needs it, never write it back yourself.
- Weights: start from each LoRA's recommended weight; character LoRAs usually 0.7–1.0, style LoRAs 0.4–0.8. Two LoRAs that own the same layer (two styles, two characters' faces) fight: lower one or remove it. Keep the enabled weights inside this base's budget (the bench prints it) unless you say why it has to go over.
- A LoRA only loads on its own base family. One trained on another checkpoint of the same family changes the style: say so instead of adding style words.
- To reproduce an example (复刻这张图): apply_recipe takes its prompt, negative, sampler, steps, CFG, size and LoRAs. Keep every trigger of the mounted LoRAs exactly once. Name in one line what cannot carry over (a different checkpoint, a LoRA they do not have, a clip skip this base ignores).
- When a result's style does not match the example, compare the two pictures first: line, shading, colour, and the checkpoint the example was made on.
- Frame by what the picture contains: full body 2:3 · bust 3:4 or 4:5 · face 1:1 or 4:5 · scene 16:9 or 3:2.
