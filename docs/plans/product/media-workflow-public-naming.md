# PixelVault Public Workflow Naming

> Date: 2026-04-22
> Status: Draft for selected `Balanced 8`
> Scope: public-facing Chinese naming, one-line promise, and top-level entry grouping

## Purpose

This document translates the internal `Balanced 8` workflow set into user-facing product language.

It answers:

- what each workflow should be called in Chinese
- what promise each workflow makes in one line
- how the first-level Studio entry should group them

It does not decide final implementation, IA layout details, or i18n keys.

## Naming Principles

### 1. Use plain language, not model language

Do not expose provider, adapter, or model-family names in the primary workflow name.

### 2. Start from the output users want

Names should reflect the result:

- quick image
- anime illustration
- consistent character
- remix
- cinematic video
- dubbing

### 3. Prefer short, stable labels

Primary labels should be short enough to work in tabs, chips, menus, and mobile entry cards.

### 4. Keep promise lines action-oriented

Each workflow should have a one-line promise that explains:

- what the user can make
- what is different about this workflow

## Recommended Top-Level Grouping

### 图片

- 快速出图
- 动漫插画
- 角色一致图
- 改图 Remix
- 海报排版

### 视频

- 电影短片
- 角色转视频

### 声音

- 配音旁白

This keeps the first layer simple:

- 3 media groups
- 8 workflows
- room for Wave 1.5 additions later

## Final Naming Draft

### 1. 快速出图

- Internal workflow:
  Quick Image
- User promise:
  用一句话快速生成你想要的画面。
- Best for:
  first-time users, general image generation, low-friction ideation
- Notes:
  This should be the default image entry.

### 2. 动漫插画

- Internal workflow:
  Anime Illustration
- User promise:
  更适合动漫、人设、插画风格的出图工作流。
- Best for:
  anime, illustration, stylized art, character portraits
- Notes:
  Avoid names that sound too niche like “二次元专用” in the first release.

### 3. 角色一致图

- Internal workflow:
  Character Consistency Image
- User promise:
  围绕同一个角色稳定生成多张一致画面。
- Best for:
  repeated character creation, reference-driven consistency, creator workflows
- Notes:
  This is one of the strongest differentiation workflows and should be visibly featured.

### 4. 改图 Remix

- Internal workflow:
  Image Edit / Remix
- User promise:
  基于已有图片继续改、继续试，而不是每次重来。
- Best for:
  edit, variation, image-to-image, reference-based iteration
- Notes:
  Keep `Remix` as a secondary English cue because it is already common in creator tooling.

### 5. 海报排版

- Internal workflow:
  Design / Poster / Text Graphic
- User promise:
  更适合海报、标题字、排版感和设计素材的生成。
- Best for:
  poster design, typography, ad creative, title graphics, branded visuals
- Notes:
  This name is stronger and shorter than `设计 / 海报 / 文案排版`.

### 6. 电影短片

- Internal workflow:
  Cinematic Short Video
- User promise:
  从一个画面想法出发，生成更有镜头感的短视频。
- Best for:
  cinematic clips, scene-driven video generation, motion ideation
- Notes:
  This should be the default video entry.

### 7. 角色转视频

- Internal workflow:
  Character-to-Video
- User promise:
  让角色图动起来，同时尽量保留角色辨识度。
- Best for:
  image-to-video, character animation, consistent reference-driven video
- Notes:
  Short, understandable, and clearly different from generic video generation.

### 8. 配音旁白

- Internal workflow:
  Voice / Narration / Dialogue
- User promise:
  把文本变成旁白、配音或多人对话。
- Best for:
  narration, dubbing, multi-speaker dialogue, reusable voice workflows
- Notes:
  This name is simpler than `配音 / 旁白 / 对话`, while still covering all three.

## Rejected Naming Directions

### Too technical

- 图生图
- 文生视频
- 多参考一致性生成
- 零样本音色复刻

Reason:

These are capability labels, not public product names.

### Too broad

- 图片创作
- 视频创作
- 语音生成

Reason:

These are too generic and collapse distinct workflows back into a form-first product.

### Too long

- 角色一致性图片生成
- 海报与文案排版设计
- 电影感短视频生成

Reason:

These are hard to use in tabs, cards, mobile entry points, and command surfaces.

## Suggested Studio Entry Copy

### 图片组描述

- 探索不同风格的图片工作流，从快速出图到角色一致图。

### 视频组描述

- 从短片灵感到角色动画，选择更适合目标结果的视频工作流。

### 声音组描述

- 为视频、角色或内容生成旁白、配音和对话。

## Recommended Display Order

### 图片

1. 快速出图
2. 动漫插画
3. 角色一致图
4. 改图 Remix
5. 海报排版

### 视频

1. 电影短片
2. 角色转视频

### 声音

1. 配音旁白

## Open Questions For The Next Step

The next product exploration step should decide:

- whether the image group appears as tabs, cards, or a chooser sheet
- whether `角色一致图` should be promoted into the top hero area as a differentiated workflow
- whether `海报排版` stays inside Studio or also gets a separate landing-style entry
