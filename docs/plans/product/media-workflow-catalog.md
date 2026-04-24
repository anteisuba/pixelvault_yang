# PixelVault Media Workflow Catalog

> Date: 2026-04-22
> Status: Selected launch cut + full media workflow map
> Selected cut: Option B — Balanced 8
> Scope: product-facing workflow taxonomy for image, video, and audio

## Purpose

This document defines both:

- the selected public-first launch cut
- the broader multi-media workflow map behind that launch cut

It is not an implementation plan and it is not a rules document.
Its job is to answer:

- what ordinary users think they are trying to make
- which workflows should appear as first-class entry points
- which model capability buckets back each workflow
- which workflows belong in wave 1 vs later expansion

## Product Direction

PixelVault should no longer lead with model names or provider routes.

The product-facing abstraction should be:

`user goal -> workflow -> compiler -> execution -> asset`

Model names remain important internally, but they should mostly live behind the workflow layer.

## Design Principles

### 1. User goals beat model names

Users should not need to know whether they want Gemini, NovelAI, Kling, or Seedance first.
They should start from what they want to make.

### 2. One workflow = one clear promise

Each workflow should make a narrow promise:

- fast image
- anime illustration
- consistent character image
- cinematic short video
- narration / dubbing

Do not make workflows so broad that they collapse back into a generic form.

### 3. Shared product skeleton, media-specific compilers

Image, video, and audio should share:

- workflow selection
- run lifecycle
- progress model
- artifact history
- retry / cancel / save patterns

But they should not share a single compiler.
Each media type still needs its own compiler and validation rules.

### 4. Wave 1 favors breadth of user value over total model exposure

Wave 1 should expose the most understandable and repeatable workflows.
Not every capability in the model catalog needs a first-class public entry point immediately.

## Capability Source of Truth

Workflow capability mapping should use:

- `docs/api/model-capability-catalog.md`

This catalog is the fact layer.
This workflow document is the product layer built on top of that fact layer.

## Workflow Status Model

This document uses three planning labels:

- `shipped`
  the core path exists in the product today
- `partial`
  underlying capability exists, but it is not yet a polished first-class workflow
- `planned`
  strategically justified, but not yet productized

Launch tiers:

- `Wave 1`
  public-first launch cut
- `Wave 1.5`
  near-term expansion after Wave 1 stabilizes
- `Wave 2`
  later expansion, advanced tools, or creator systems

## Full Workflow Map

The workflow map should be broader than the launch cut.

The launch cut decides what users see first.
The workflow map decides what the product is trying to become.

### Image Workflows

| ID  | Workflow                              | User goal                                                                              | Capability buckets                                      | Current maturity | Launch tier |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------- | ----------- |
| I1  | Quick Image                           | Generate an image from a plain-language prompt with minimal setup                      | 通用文生图                                              | shipped          | Wave 1      |
| I2  | Anime Illustration                    | Generate anime, illustration, and stylized character art more reliably                 | 动漫 / 二次元 / 插画                                    | shipped          | Wave 1      |
| I3  | Character Consistency Image           | Generate multiple images of the same character with better consistency                 | 多参考 / 一致性 / 角色参考                              | partial          | Wave 1      |
| I4  | Image Edit / Remix                    | Edit or iterate on an existing image instead of starting over                          | 图像编辑 / 改图 / 参考图驱动                            | partial          | Wave 1      |
| I5  | Design / Poster / Text Graphic        | Generate posters, title graphics, text-heavy visuals, and branded materials            | 文本渲染 / 排版 / Logo / Vector; 设计 / 品牌 / 广告素材 | partial          | Wave 1      |
| I6  | Multi-Reference Creation              | Combine several reference images into a directed new image result                      | 多参考 / 一致性 / 角色参考                              | partial          | Wave 1.5    |
| I7  | Image Deconstruct / Reverse Engineer  | Analyze, break down, or reverse-engineer an image into reusable prompt or layer cues   | 图像编辑 / 改图 / 参考图驱动                            | partial          | Wave 1.5    |
| I8  | Image Transform                       | Transform an image across style, pose, background, garment, or detail dimensions       | 图像编辑 / 改图 / 参考图驱动                            | partial          | Wave 1.5    |
| I9  | Super Resolution / Background Cleanup | Upscale, isolate, or clean an image after generation                                   | 图像编辑 / 改图 / 参考图驱动                            | partial          | Wave 2      |
| I10 | Style Lab / LoRA                      | Generate with custom style anchors, LoRA-backed presets, or reusable style experiments | LoRA / 自定义风格                                       | partial          | Wave 2      |
| I11 | Card-Directed Creation                | Build images from character, background, and style cards as reusable creative assets   | 多参考 / 一致性 / 角色参考; 设计 / 品牌 / 广告素材      | shipped          | Wave 2      |
| I12 | Series Image Creation                 | Generate a deliberate sequence of related images around one idea, prompt, or character | 通用文生图; 多参考 / 一致性 / 角色参考                  | planned          | Wave 2      |

### Video Workflows

| ID  | Workflow                       | User goal                                                                                | Capability buckets                                                     | Current maturity | Launch tier |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------- | ----------- |
| V1  | Cinematic Short Video          | Generate a short cinematic clip from an idea or scene description                        | 文生视频; 电影机位 / 多镜头 / 叙事控制                                 | shipped          | Wave 1      |
| V2  | Character-to-Video             | Animate a character or reference image into a short clip while preserving identity       | 图生视频 / 参考图驱动 / 首尾帧                                         | partial          | Wave 1      |
| V3  | Dialogue / Native Audio Video  | Generate a clip that includes native speech, sound, or dialogue behavior                 | 原生音频 / 对白 / 口型                                                 | partial          | Wave 1.5    |
| V4  | Long Video Extend              | Extend a clip into a longer sequence through pipeline-based continuation                 | 长视频扩展                                                             | partial          | Wave 1.5    |
| V5  | Storyboard Coverage            | Turn scene beats into multi-shot coverage with character and style anchors               | 文生视频; 图生视频 / 参考图驱动 / 首尾帧; 电影机位 / 多镜头 / 叙事控制 | planned          | Wave 1.5    |
| V6  | Continuation / Style Anchor    | Continue a clip with stronger visual continuity and last-frame anchoring                 | 图生视频 / 参考图驱动 / 首尾帧; 长视频扩展                             | planned          | Wave 2      |
| V7  | Video Assembly / Sequence Edit | Arrange, preview, and export multiple generated shots as a sequence                      | 电影机位 / 多镜头 / 叙事控制                                           | planned          | Wave 2      |
| V8  | Series Video Creation          | Generate a repeatable sequence of related clips around one story, character, or campaign | 文生视频; 图生视频 / 参考图驱动 / 首尾帧                               | planned          | Wave 2      |

### Audio Workflows

| ID  | Workflow                     | User goal                                                                           | Capability buckets                                              | Current maturity | Launch tier |
| --- | ---------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------- | ----------- |
| A1  | Voice / Narration / Dialogue | Turn text into narration, dubbing, or voiced dialogue                               | 文本转语音; 多说话人对话; 零样本音色复刻; 多语言 / 参考音频驱动 | shipped          | Wave 1      |
| A2  | Multi-Speaker Dialogue       | Generate a scripted conversation with multiple speakers                             | 多说话人对话                                                    | partial          | Wave 1.5    |
| A3  | Voice Cloning                | Reuse a voice identity from uploaded reference audio                                | 零样本音色复刻                                                  | partial          | Wave 1.5    |
| A4  | Multilingual Dubbing         | Generate the same line or script in another language with controlled voice behavior | 多语言 / 参考音频驱动                                           | partial          | Wave 2      |
| A5  | Video Voiceover / Dub Track  | Create narration or dialogue specifically for a generated video artifact            | 文本转语音; 多说话人对话; 多语言 / 参考音频驱动                 | planned          | Wave 2      |

## Launch Strategy

### Selected public launch cut — Wave 1

The selected public-first cut remains **Balanced 8**:

#### Image

- Quick Image
- Anime Illustration
- Character Consistency Image
- Image Edit / Remix
- Design / Poster / Text Graphic

#### Video

- Cinematic Short Video
- Character-to-Video

#### Audio

- Voice / Narration / Dialogue

### Wave 1.5 expansion

Wave 1.5 should add the most justified adjacent workflows after the launch cut stabilizes:

- Multi-Reference Creation
- Image Deconstruct / Reverse Engineer
- Image Transform
- Dialogue / Native Audio Video
- Long Video Extend
- Storyboard Coverage
- Multi-Speaker Dialogue
- Voice Cloning

### Wave 2 expansion

Wave 2 can absorb creator-system and post-processing layers:

- Super Resolution / Background Cleanup
- Style Lab / LoRA
- Card-Directed Creation as a public workflow
- Series Image Creation
- Continuation / Style Anchor
- Video Assembly / Sequence Edit
- Series Video Creation
- Multilingual Dubbing
- Video Voiceover / Dub Track

## Why The Map Is Bigger Than The Launch Cut

The launch cut should stay small because ordinary users need clarity.

The product map should stay broad because:

- model and workflow capability already exceed the launch cut
- some partial features already exist in Studio
- later phases should not require re-inventing the product taxonomy

In other words:

- plan broadly
- launch selectively
- implement in phases

## What Should Stay Internal in Wave 1

The following should generally remain internal concepts, not public-first workflow names:

- provider names
- adapter names
- model slugs
- route option names
- capability flags
- advanced reference-count limits

These belong in:

- compiler selection
- advanced mode
- health / fallback systems
- internal observability

## Current Product Reality Notes

These notes explain why some workflows are marked `partial` instead of `shipped`:

- image transform exists, but only part of the planned transform dimensions are implemented
- super resolution / remove background / save edited output are present in preview but still disabled as a complete workflow
- LoRA training APIs and hooks exist, but LoRA is not yet a first-class Studio workflow
- long-video pipeline exists, but it is still closer to an advanced capability than a workflow-first product surface
- video today is still more form-driven than workflow-driven
- private voice cloning exists, but it is not yet a polished public workflow surface

## Studio IA Implications

Wave 1 should expose the launch cut.
Waves 1.5 and 2 should influence IA now, but not all appear in the first layer.

That suggests a structure like:

- first layer:
  image / video / audio groups
- second layer:
  public workflow choices within each group
- third layer:
  advanced tools and later workflows

Model selection should move one level down:

- hidden by default
- shown as workflow-tuned choices
- fully exposed only in advanced / expert mode

## What This Document Does Not Decide

This document does not yet decide:

- exact UI layout
- exact workflow names shown in production
- exact compiler logic
- Cloudflare execution architecture
- migration sequencing from current Studio mode structure
- which Wave 1.5 items ship together vs separately

Those should be covered by follow-up planning.
