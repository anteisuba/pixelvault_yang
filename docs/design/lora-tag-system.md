# LoRA Prompt Tag System Design

Last updated: 2026-06-09

This document defines the system direction for turning PixelVault's LoRA
workflow into a prompt tag workflow. It is intentionally system-facing: UI
layout, visual hierarchy, and component styling should be designed separately.

## External Patterns Reviewed

1. NovelAI tag prompting

   NovelAI treats prompt tags as model-aware controls, not just labels. Its
   docs emphasize tag suggestions, special quality/aesthetic/year/dataset tags,
   and model-specific ordering where earlier tags may carry more influence:
   https://docs.novelai.net/en/image/tags/

   System takeaway:
   - Tags need typed categories and model-family rules.
   - Ordering is part of compilation, not a purely visual choice.
   - Some tags are invisible/automatic preambles or suffixes.

2. A1111 Tag Autocomplete

   The Stable Diffusion WebUI tag autocomplete extension uses booru tag files,
   wildcard categories, extra-network/LoRA completion, preview metadata, model
   allow/deny lists, and insertion rules for escaping/commas:
   https://github.com/dreamscapeai/tagcomplete

   System takeaway:
   - Search should support labels, aliases/search terms, categories, and source
     metadata.
   - LoRA trigger insertion is a first-class completion source.
   - Model compatibility should be centralized, not handled only in UI.

3. Civitai LoRA metadata

   Civitai exposes model tags and model version `trainedWords`, which are the
   closest public metadata source for LoRA trigger words:
   https://github.com/civitai/civitai/wiki/REST-API-Reference

   System takeaway:
   - LoRA tags can be derived from `trainedWords`, description prompt blocks,
     Civitai model tags, and mined prompts.
   - Trigger words are optional and sometimes unreliable; confidence/source
     flags are required.

4. SDBuilder-style prompt builders

   SDBuilder exposes category browsing, positive/negative tag management,
   rearranging tags, and output formatting for SD WebUI / NovelAI:
   https://www.sdbuilder.net/

   System takeaway:
   - The useful product primitive is "build a prompt from categorized pieces",
     not only autocomplete inside a textarea.
   - Positive tags, negative tags, and output formatting are separate system
     concerns.

## Current PixelVault State

PixelVault already has most of the LoRA runtime path:

- `src/hooks/use-active-lora-stack.tsx`
  - per-user localStorage persistence
  - `?style=` URL resolution and sharing
  - active LoRA asset + scale stack

- `src/components/business/studio/prompt-tags/LoraPromptControlButton.tsx`
  - in-prompt-toolbar LoRA controls
  - scale, share, trigger insertion, recommended prompt application
  - current model compatibility warnings

- `src/components/business/studio-shared/chrome/ActiveLoraBar.tsx`
  - duplicate top-level visible LoRA strip
  - should be removed from Studio layout once prompt-area tags own the visible
    state

- `src/lib/merge-stack-loras.ts`
  - injects active stack LoRAs into `advancedParams.loras` at generation time

- `src/services/civitai-lora.service.ts`
  - extracts Civitai LoRA assets, trigger candidates, prompt alternates, tags,
    preview images, and model/version metadata

The missing system layer is a typed prompt tag stack that treats active LoRAs
as one kind of selected prompt tag.

## Product/System Goal

Replace the visible "global LoRA bar" mental model with this:

```text
Prompt workspace
  free text
  selected positive tags
  selected negative tags
  selected LoRA trigger tags
  model-aware compile step
  generation request
```

The LoRA runtime state can remain under the hood, but users should experience
LoRAs as prompt tags that can be searched, selected, weighted, removed, and
compiled.

## Core Concepts

### PromptTagDefinition

Reusable tag metadata. A definition can come from PixelVault defaults, a LoRA
asset, Civitai metadata, user history, or future user-created tags.

```ts
type PromptTagType =
  | 'quality'
  | 'aesthetic'
  | 'dataset'
  | 'subject'
  | 'character_trait'
  | 'outfit'
  | 'pose'
  | 'scene'
  | 'camera'
  | 'lighting'
  | 'style'
  | 'negative'
  | 'lora_trigger'
  | 'prompt_preset'

type PromptTagSource =
  | 'system'
  | 'danbooru'
  | 'lora_asset'
  | 'civitai'
  | 'mined_prompt'
  | 'recent'
  | 'user'

type PromptPolarity = 'positive' | 'negative'

interface PromptTagDefinition {
  id: string
  type: PromptTagType
  source: PromptTagSource
  label: string
  promptText: string
  aliases: string[]
  category: string
  polarity: PromptPolarity
  modelFamilies: string[]
  modelIds?: string[]
  orderGroup: number
  defaultWeight?: number
  confidence?: 'official' | 'inferred' | 'mined' | 'user'
  loraAssetId?: string
  loraStyleCode?: string
  loraUrl?: string
  loraDefaultScale?: number
  conflictsWith?: string[]
  requires?: string[]
}
```

### PromptTagSelection

An active tag instance in the current prompt workspace.

```ts
interface PromptTagSelection {
  id: string
  tagId: string
  promptText: string
  polarity: PromptPolarity
  weight?: number
  enabled: boolean
  orderIndex: number
  source: PromptTagSource
  loraAssetId?: string
  loraScale?: number
  insertedAt: string
}
```

Selections are intentionally separate from definitions. The same definition can
be selected with a custom weight or disabled temporarily.

### PromptTagStack

The per-user active prompt tag state.

```ts
interface PromptTagStack {
  ownerClerkId: string
  version: 1
  positive: PromptTagSelection[]
  negative: PromptTagSelection[]
  updatedAt: string
}
```

Short-term storage should be localStorage, mirroring the current active LoRA
stack behavior. Database persistence is optional and should wait until the UX
proves useful.

## Tag Sources and Import Strategy

PixelVault should use three tag sources:

```text
1. A1111 Tag Autocomplete Danbooru CSV
2. Dynamic LoRA trigger tags from Civitai / trained assets
3. PixelVault curated system tags
```

Do not treat every external tag source as a prompt tag source. Some tags are
good for browsing or filtering LoRAs but are not good text to compile into a
generation prompt.

### Source 1: A1111 Danbooru CSV

Use the A1111 Tag Autocomplete Danbooru CSV as the imported prompt-tag corpus.
Its documented row format is:

```csv
<name>,<type>,<postCount>,"<aliases>"
```

Example:

```csv
1girl,0,4114588,"1girls,sole_female"
solo,0,3426446,"female_solo,solo_female"
highres,5,3008413,"high_res,high_resolution,hires"
long_hair,0,2898315,longhair
```

Danbooru category mapping:

```text
0 General   -> prompt candidate
1 Artist    -> exclude from MVP
3 Copyright -> exclude from MVP
4 Character -> exclude from MVP
5 Meta      -> prompt candidate
```

PixelVault mapping:

```text
name      -> promptText
name      -> label, title-cased or underscore-normalized for display
type      -> sourceCategory
postCount -> popularity
aliases   -> aliases
source    -> danbooru
```

Import filters for MVP:

```text
include:
  - category 0 General
  - category 5 Meta
  - postCount >= 5000

exclude:
  - category 1 Artist
  - category 3 Copyright
  - category 4 Character
  - deprecated/invalid tags if present
  - rating tags
  - obvious NSFW tags
  - tags containing unsafe slurs or explicit sexual/body terms
  - tags longer than 60 chars
```

Imported Danbooru tags should not all be shown as a flat library. They should
be classified into PixelVault prompt categories.

Heuristic classification:

```text
quality:
  masterpiece, best_quality, highres, absurdres, detailed, very_aesthetic

negative:
  bad_anatomy, bad_hands, blurry, lowres, jpeg_artifacts, watermark, text

camera:
  close-up, portrait, cowboy_shot, upper_body, full_body, looking_at_viewer

pose:
  standing, sitting, lying, walking, dynamic_pose

lighting:
  backlighting, rim_light, soft_lighting, dramatic_lighting

scene:
  indoors, outdoors, bedroom, street, forest, city, sky, night

style:
  anime_screencap, watercolor, sketch, lineart, cel_shading

character_trait:
  hair/eyes/expression/body traits that pass the safety filter

outfit:
  clothing/accessory tags that pass the safety filter
```

Ambiguous General tags can remain `type: 'subject'` or `type: 'style'` with a
low confidence marker until curated.

Generated file target:

```text
src/constants/prompt-tags.danbooru.generated.ts
```

The generated file should export a compact array of `PromptTagDefinition`
objects, not raw CSV rows.

Import script target:

```text
scripts/import-danbooru-prompt-tags.ts
```

The script should:

1. read a local CSV file path passed by CLI
2. parse CSV with a real parser, not string splitting
3. apply category, count, length, and safety filters
4. classify into PixelVault tag types
5. sort by type and popularity
6. write the generated TS file

The CSV itself should not be fetched at runtime.

### Source 2: LoRA Trigger Tags

LoRA trigger tags are dynamic. They are derived from existing LoRA asset data,
not a static import.

Sources:

```text
Civitai model-versions/:id images[].meta.prompt
Civitai /api/v1/images meta.prompt when present
Civitai modelVersions.trainedWords
Civitai description prompt blocks already extracted by service code
trained PixelVault LoRA triggerWord
favorite/imported LoraAssetRecord triggerWord
AI-inferred prompt drafts when explicitly requested
```

Mapping:

```text
asset.name            -> label
asset.triggerWord     -> promptText
asset.styleCode       -> aliases
triggerAlternates     -> aliases
asset.baseModelFamily -> modelFamilies
asset.loraUrl         -> loraUrl
asset.defaultScale    -> loraDefaultScale
asset.id              -> loraAssetId
source                -> lora_asset or civitai
type                  -> lora_trigger
polarity              -> positive
category              -> LoRA
```

LoRA trigger tags must carry confidence:

```text
source_image -> Civitai model-version image meta prompt
community    -> Civitai community image prompt
declared     -> Civitai trainedWords / trained asset trigger
parsed       -> Civitai description code block
inferred     -> fallback from model name or AI reverse prompt
user         -> manually entered/imported
```

Runtime behavior:

```text
Use LoRA          -> select lora_trigger tag
Remove tag        -> remove active LoRA
Change tag scale  -> change LoRA scale
Share selected    -> encode via existing ?style= path for compatibility
Generate          -> compile trigger into prompt and lora URL into advancedParams.loras
```

### Source 3: PixelVault Curated Tags

PixelVault needs a small curated starter set for tags that work across modern
image models and for negative prompts that should not depend on Danbooru.

Target file:

```text
src/constants/prompt-tags.curated.ts
```

Initial categories:

```text
quality
style
lighting
camera
scene
negative
```

Example:

```ts
export const CURATED_PROMPT_TAGS = [
  {
    id: 'quality-best',
    type: 'quality',
    source: 'system',
    label: 'Best quality',
    promptText: 'best quality',
    aliases: ['high quality'],
    category: 'Quality',
    polarity: 'positive',
    modelFamilies: ['anime', 'sdxl'],
    orderGroup: 20,
  },
  {
    id: 'lighting-cinematic',
    type: 'lighting',
    source: 'system',
    label: 'Cinematic lighting',
    promptText: 'cinematic lighting',
    aliases: ['movie lighting', 'film lighting'],
    category: 'Lighting',
    polarity: 'positive',
    modelFamilies: ['all'],
    orderGroup: 80,
  },
  {
    id: 'negative-bad-hands',
    type: 'negative',
    source: 'system',
    label: 'Bad hands',
    promptText: 'bad hands, extra fingers, malformed fingers',
    aliases: ['hand fix', 'bad fingers'],
    category: 'Negative',
    polarity: 'negative',
    modelFamilies: ['all'],
    orderGroup: 10,
  },
]
```

Curated tags should be the default visible library before Danbooru import is
enabled, and they should rank above Danbooru tags when names collide.

### Civitai Tags Are Not Prompt Tags

Civitai `/api/v1/tags` and `model.tags` should be treated as discovery and
filter facets, not as prompt text.

Use Civitai tags for:

```text
LoRA library filters
LoRA category labels
search facets
related-LoRA discovery
```

Do not directly compile Civitai model tags into prompts unless they are
converted into a curated `PromptTagDefinition` or a LoRA trigger.

## Search System

The tag search should start client-side and deterministic.

Sources:

- static system tags in `src/constants/prompt-tags.ts`
- imported Danbooru prompt tags from
  `src/constants/prompt-tags.danbooru.generated.ts`
- LoRA-derived tags from `useLoraAssets`
- active Civitai library result tags when browsing `/studio/lora`
- local recent tags from per-user localStorage

Suggested module:

```text
src/lib/prompt-tag-search.ts
```

Search ranking:

1. exact label or exact promptText match
2. prefix match
3. alias match
4. category/type match
5. source priority: active LoRA > recent > system > Danbooru > Civitai facets
6. model compatibility boost
7. usage recency boost
8. already-selected penalty

Normalization rules:

- lowercase
- trim whitespace
- normalize underscores and spaces for comparison
- preserve original `promptText` for compilation
- split aliases into tokens

The search result shape should include compatibility metadata so UI does not
recompute business rules.

```ts
interface PromptTagSearchResult {
  tag: PromptTagDefinition
  score: number
  selected: boolean
  compatibility: PromptTagCompatibility
  reason?: string
}
```

## Compile System

Suggested module:

```text
src/lib/prompt-tag-compiler.ts
```

Input:

```ts
interface CompilePromptTagsInput {
  freePrompt: string
  selectedTags: PromptTagSelection[]
  activePreset?: {
    promptPrefix?: string
    negativePrompt?: string
  } | null
  modelId?: string | null
  existingAdvancedParams?: AdvancedParams
}
```

Output:

```ts
interface CompilePromptTagsResult {
  prompt: string | undefined
  advancedParams: AdvancedParams | undefined
  appliedLoras: { url: string; scale?: number }[]
  warnings: PromptTagWarning[]
}
```

Default positive ordering:

```text
dataset/meta
quality/aesthetic
LoRA trigger tags
subject/character identity
character traits
outfit/accessories
pose/expression
scene/background
camera/composition
lighting/color
style/rendering
free prompt text
```

Negative ordering:

```text
selected negative tags
advancedParams.negativePrompt
style preset negative prompt
explicit per-run negative override
```

Important rules:

- Deduplicate by normalized prompt text.
- LoRA trigger tags compile into positive prompt text and into
  `advancedParams.loras`.
- If a trigger already exists in free text, do not duplicate it.
- Disabled tags stay in state but do not compile.
- Existing `advancedParams.loras` are appended after selected LoRA tags.
- Keep the FAL LoRA cap of 5.
- Keep `?style=` compatibility for shared LoRA links.

## LoRA as Tags

Every active LoRA becomes a selected tag with `type: 'lora_trigger'`.

Derived fields from `LoraAssetRecord`:

```text
label            -> asset.name
promptText       -> asset.triggerWord
aliases          -> [asset.name, asset.styleCode, triggerAlternates...]
category         -> "LoRA"
polarity         -> positive
source           -> lora_asset or civitai
loraAssetId      -> asset.id
loraStyleCode    -> asset.styleCode
loraUrl          -> asset.loraUrl
loraDefaultScale -> asset.defaultScale
confidence       -> official / inferred / mined / user
modelFamilies    -> [asset.baseModelFamily]
```

Runtime behavior:

- Adding a LoRA from `/studio/lora` should create/select a LoRA tag.
- Removing the LoRA tag should remove the active LoRA runtime entry.
- Changing LoRA tag weight should change LoRA scale.
- Applying an author prompt should optionally add extracted prompt tags, but
  the first pass may simply replace free text.

## Compatibility

Move duplicated compatibility logic out of UI into a shared module:

```text
src/lib/lora-compatibility.ts
```

Responsibilities:

- map Civitai base model strings into PixelVault model family buckets
- determine whether a selected image model can run the selected LoRA tags
- recommend a compatible image model route
- return warnings for:
  - no image model selected
  - selected model does not support LoRA
  - base family mismatch
  - external-only family
  - too many LoRAs
  - duplicate LoRA URL

This should reuse existing constants from `src/constants/lora.ts` where
possible instead of keeping a separate family map in UI.

## Persistence and Migration

Phase 1 should preserve existing LoRA behavior.

1. Keep `LoraStackProvider`.
2. Stop rendering `ActiveLoraBar` in `src/app/[locale]/(main)/studio/layout.tsx`.
3. Introduce a prompt tag stack provider for non-LoRA tags.
4. In the prompt area, derive visible LoRA tags from `useActiveLoraStack`.
5. Generation still uses `mergeStackLoras`.

Phase 2 can merge LoRA runtime state into the prompt tag provider.

Migration path:

- Read old `pv.active-lora-stack.v2.<clerkId>`.
- Create `lora_trigger` selections from each stored entry.
- Keep writing old storage for one release so `?style=` and existing tests stay
  stable.
- Later rename internals only if the public behavior is stable.

## Files To Add

```text
src/types/prompt-tags.ts
src/constants/prompt-tags.ts
src/constants/prompt-tags.curated.ts
src/constants/prompt-tags.danbooru.generated.ts
src/lib/prompt-tag-search.ts
src/lib/prompt-tag-compiler.ts
src/lib/lora-compatibility.ts
src/hooks/use-prompt-tag-stack.tsx
scripts/import-danbooru-prompt-tags.ts
```

Recommended tests:

```text
scripts/import-danbooru-prompt-tags.test.ts
src/lib/prompt-tag-search.test.ts
src/lib/prompt-tag-compiler.test.ts
src/lib/lora-compatibility.test.ts
src/hooks/use-prompt-tag-stack.test.tsx
```

## Files To Change

```text
src/app/[locale]/(main)/studio/layout.tsx
src/components/business/studio/StudioPromptArea.tsx
src/components/business/studio/prompt-tags/LoraPromptControlButton.tsx
src/components/business/studio/lora/LoraAssetCard.tsx
src/components/business/studio/lora/LoraWorkbench.tsx
src/hooks/use-unified-generate.ts
src/lib/merge-stack-loras.ts
src/types/index.ts
src/messages/en.json
src/messages/zh.json
src/messages/ja.json
```

`ActiveLoraBar.tsx` should remain temporarily if tests or old imports rely on
it, but it should no longer be rendered in Studio.

## First Implementation Slice

The smallest useful system slice before UI design:

1. Add prompt tag types, static tag definitions, compiler, search, and tests.
2. Add curated system tags.
3. Add an import script for the A1111 Danbooru CSV and generate a filtered
   `prompt-tags.danbooru.generated.ts`.
4. Add a provider that stores selected non-LoRA prompt tags in localStorage.
5. Expose adapter helpers that convert `LoraAssetRecord` to
   `PromptTagDefinition` and `PromptTagSelection`.
6. Remove `ActiveLoraBar` rendering from Studio layout.
7. Update `StudioPromptArea` generation path to compile selected prompt tags
   into `freePrompt` and `advancedParams.negativePrompt`.
8. Keep LoRA runtime injection through `useActiveLoraStack` for compatibility.

After this slice, Claude can design UI around a stable system contract:

- search input returns typed tag results
- selected tags are ordered, removable, weight-aware selections
- LoRA tags are selections with scale and compatibility status
- compiler owns prompt order and negative prompt merging
