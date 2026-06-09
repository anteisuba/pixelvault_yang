# Prompt 助手 (LoRA-aware Prompt Assistant) — Redesign

Last updated: 2026-06-08

This document redesigns the Studio image-page补词 panel (today internally
`LoraPromptControl` + `TagLibrary`) into a **LoRA-aware prompt assistant**.

It is the UX/IA sibling of [`lora-tag-system.md`](./lora-tag-system.md): that
doc defined the _prompt-tag system_ (types, search, compiler, sources). This
doc defines how the _panel_ should present that system so a user who does not
understand Danbooru tags or LoRA trigger words can still configure the current
LoRA correctly.

Scope: information architecture, the new one-click **recipe** concept, and the
**i18n strategy** for English-only tags. No image/runtime contract changes.

## Reframe

The panel is **not**:

- a tag dictionary (do not flatten every word into a wall),
- a LoRA image library (do not make users pick from Civitai image cards).

The panel **is** a prompt operation surface. Its job is to turn "选择词" into
"完成一个可用的 prompt 配方" for the **currently active LoRA**.

User-facing name: **Prompt 助手 / Prompt Assistant** (not "LoRA Library").
Internal identifiers (`LoraPromptControl*`, i18n namespace) may stay to avoid
churn; only the displayed `title` / trigger `label` strings change.

## What already exists (reuse, do not rebuild)

| Capability                                                          | Where                               | Reused as                       |
| ------------------------------------------------------------------- | ----------------------------------- | ------------------------------- |
| Per-user selected tag stack                                         | `use-prompt-tag-stack.tsx`          | Selection state for all zones   |
| Tag search (label/promptText/alias/category)                        | `prompt-tag-search.ts`              | NL search backend               |
| Prompt compile (positive/negative ordering, dedupe)                 | `prompt-tag-compiler.ts`            | Selected-preview + recipe apply |
| Curated system tags (with CN/JP aliases)                            | `prompt-tags.curated.ts`            | Purpose-grouped corpus          |
| Danbooru imported tags                                              | `prompt-tags.danbooru.generated.ts` | Advanced search tail            |
| LoRA source tags (trigger / author / alternates)                    | `TagLibrary.buildLoraSourceTags`    | Current-LoRA zone               |
| Civitai mined community prompts                                     | `use-civitai-mined-prompts.ts`      | Current-LoRA "实测 prompt"      |
| model-keyword fallback triggers                                     | `use-model-keyword-lora-tags.ts`    | Low-confidence fallback         |
| Source-match (author/mined + anti-3D + scale 0.85, `reliable` flag) | `lora-source-match-prompt.ts`       | Backs the "忠实还原角色" recipe |
| Source confidence badge                                             | `TagSourceBadge.tsx`                | Confidence chips                |

The Generate tab (`GenerateControlTab`) is already LoRA-aware (trigger insert,
author starter, 贴近来源图, scale, model-match). The redesign **promotes** that
thinking to be the whole panel and **demotes** the flat `TagLibrary` chip wall
to a purpose-organized, search-on-demand corpus.

### 现状校正 (audit findings — read before estimating)

Two facts changed the weighting of this design after a code pass:

1. **`PROMPT_TAG_DANBOORU_DEFINITIONS` is currently `[]`** — the import script
   (`import-danbooru-prompt-tags.ts`) has never been run, so the default corpus
   is just the **14 curated tags** + dynamic LoRA-source tags. The "一堆词看不懂"
   problem is therefore mostly **framing/organization**, not volume. Concretely:
   full curated-label translation is trivial (14 entries), and the whole
   "Danbooru 海量长尾" i18n machinery below is **forward-looking**, not
   load-bearing. Design the panel around the small curated + LoRA + recipe
   surface; treat Danbooru as an opt-in future tail.
2. **`useModelKeywordLoraTags(query)` is search-time only** — it takes a query
   string with a min length, not "give me this LoRA's keyword triggers". So
   model-keyword fallback belongs in zones ①/④ (search), **not** as a
   zero-query zone-② recommendation. Zone ② shows trigger / author / mined only.
3. **Negative prompt has two stores, already reconciled at compile** —
   `promptTags.negative` selections + `advancedParams.negativePrompt`. They are
   merged by `compilePromptTags(...)` at `StudioPromptArea.tsx:519`
   (`existingNegativePrompt: advancedParams?.negativePrompt`). The ⑤ preview and
   recipe-apply must reuse that same compiler call so the two paths never drift.

## Information architecture

Five stacked zones inside one panel (single scroll; search + preview pinned):

```text
┌───────────────────────────────────────────────┐
│ ① NL 搜索框 (pinned top)                         │  角色/衣服/画风/镜头/光线/负向
├───────────────────────────────────────────────┤
│ ② 当前 LoRA 推荐  (only when a LoRA is active)   │  必须触发词 → 作者 prompt →
│    [触发词] [作者 prompt] [实测 prompt]           │  实测 prompt → keyword fallback
│    推荐 scale 0.85 · 防漂移正/负词                  │  + 推荐 scale + 防漂移词
├───────────────────────────────────────────────┤
│ ③ 一键配方 (LoRA-type-aware)                      │  忠实还原角色 / 2D插画 /
│    [忠实还原角色] [半身头像] [全身立绘] [去3D质感]   │  半身 / 全身 / 去3D …
├───────────────────────────────────────────────┤
│ ④ 通用补词 (按用途分组, 折叠)                       │  主体/姿势/服装/镜头/光线/
│    主体 ▸  姿势 ▸  服装 ▸  镜头 ▸  光线 ▸ …        │  风格/质量/负向修正
├───────────────────────────────────────────────┤
│ ⑤ 已选预览 (pinned bottom)                        │  "将加入 prompt 的内容"
│    正向: … · 负向: …            [清空]            │  live compiled text
└───────────────────────────────────────────────┘
```

### ① Concept search (CN/JP/EN)

One box, replaces the current search + acts as the entry to ④. **Not** full
natural-language sentence parsing — it's **concept-keyword** matching (角色 /
衣服 / 镜头 / 去3D …) backed by `searchPromptTags` plus a deterministic
**synonym-expansion** table (see i18n). Empty query → show ②③④ landing;
non-empty → flat ranked results (current behavior), rows show purpose +
confidence badge. (Naming it "自然语言" in UI copy is fine; the engine is
keyword+synonym, not an LLM parser.)

### ② Current-LoRA recommendation (primary)

Renders only when `useActiveLoraStack().items` is non-empty. Per LoRA, ordered
by confidence:

1. **必须触发词** (official) — always first; one-tap insert.
2. **作者推荐 prompt** (official) — `recommendedPrompt`.
3. **作者变体 prompt** (official) — `recommendedPromptAlternates`.
4. **实测 prompt** (mined, 中高) — `useCivitaiMinedPrompts` outfits. Requires the
   persisted Civitai ids (the A-fix); historical favorites need a re-favorite.
5. **推荐 scale** — `LORA_SOURCE_MATCH_SCALE` (0.85) surfaced as a hint + the
   existing slider.
6. **防漂移词** — `2d style / anime illustration / …` positive + the anti-3D
   negative set, shown as a one-tap pair (the "去 3D 质感" recipe; family-gated).

model-keyword fallback is **not** in this zone — it is search-time only (see
现状校正 #2); it surfaces in ①/④ when the user searches, badged 低可信.

This zone is the existing `GenerateControlTab` + `LoraSourceTagGroup` merged
and reordered by confidence rather than by control type.

### ③ One-click recipes (LoRA-type-aware) — NEW

A recipe is a **bundle**, not a single tag: positive group + negative group +
optional LoRA scale. Recipes are filtered by the active LoRA's `type`
(`subject` / `style`) so a character LoRA never shows a scenery recipe.

Data model (`constants/prompt-recipes.ts`):

```ts
type PromptRecipeKind = 'static' | 'source-match'

interface PromptRecipe {
  id: string // 'faithful-character', 'upper-body', …
  nameKey: string // i18n key → PromptAssistant.recipes.<id>
  appliesTo: ('any' | 'subject' | 'style')[]
  // Some recipes are only valid for certain model families. de-3d's anti-3D
  // negatives are nonsense on a Flux *photoreal* LoRA — gate on family, not
  // just type. Reuse `isAnimeLikeLora(baseModelFamily)` from the source-match
  // lib instead of inventing a second family map.
  appliesToFamily?: ('anime' | 'sdxl' | 'flux' | 'any')[]
  kind: PromptRecipeKind // 'source-match' delegates to the lib
  positive?: string[] // promptText tokens (English)
  negative?: string[]
  loraScale?: number
}
```

**Apply mechanism (be explicit — it's not just "the compiler"):** the compiler
_reads_ selections, it does not add them. Applying a recipe means, for each
token, constructing an ad-hoc `PromptTagDefinition` and calling
`promptTags.addTag(...)` — positive tokens at `polarity: 'positive'`, negative
tokens at `polarity: 'negative'` — exactly how `TagLibrary.addCustomTag`
already mints user tags. Negatives go into the **`promptTags.negative` stack**
(removable chips), **not** `advancedParams.negativePrompt`, so a recipe is
fully undoable; the compiler still merges both stores at generation time.
If `loraScale` is set, also call `loraStack.setScale(asset.id, scale)`.

> ⚠️ Inconsistency to resolve in slice 1: the existing 贴近来源图 path writes
> negatives to `advancedParams.negativePrompt` (via `mergeNegativePrompt`),
> while recipes will write to the negative tag stack. Pick one store for
> machine-applied negatives so the two entry points don't diverge — recommend
> the tag stack (visible + removable), and migrate 贴近来源图 to match.

The **`source-match`** recipe ("忠实还原角色") is dynamic: it delegates to
`buildSourceMatchedLoraPrompt(asset, minedOutfits)` (just shipped) and inherits
its `reliable` gating — disabled with a hint when no author/mined data exists,
exactly like the 贴近来源图 button.

Initial set (tokens are placeholders for design review, English-only):

```text
subject:
  faithful-character  kind=source-match  scale 0.85        # 忠实还原角色
  upper-body          +[upper body, portrait, looking at viewer, detailed face]
  full-body           +[full body, standing, simple background]
style:
  scene-illustration  +[beautiful scenery, wide shot, soft lighting, highly detailed]
  style-max           scale↑ +[masterpiece, best quality]
any (family-gated where noted):
  de-3d   family=anime/sdxl  +[2d style, anime illustration, flat color, cel shading]
                             -[3d, 3d render, cgi, realistic, photorealistic, plastic skin]
  hi-quality                 +[masterpiece, best quality, highly detailed, high resolution]
  fix-anatomy (neg)          -[bad hands, extra fingers, bad anatomy, malformed limbs, lowres]
```

`de-3d` must **not** show on a Flux photoreal LoRA (`appliesToFamily` excludes
`flux`); it reuses `isAnimeLikeLora` / the anti-3D set from
`lora-source-match-prompt.ts`.

`de-3d` / `fix-anatomy` reuse the anti-3D / negative sets already defined in
`lora-source-match-prompt.ts` — keep one source of truth, import them.

### ④ General补词, grouped by purpose (not source)

Regroup `PROMPT_TAG_DEFINITIONS` by **purpose** (the `type` field), not by
`source`. Buckets, in order: 主体 / 姿势 / 服装 / 镜头 / 光线 / 风格 / 质量 /
负向修正. Each bucket is collapsed by default; expanding lazy-renders chips.
This replaces the current "system / LoRA / categories" source grouping in
`TagLibrary`.

### ⑤ Selected preview (pinned)

Show the **compiled** result (`prompt-tag-compiler`) live: a positive line and
a negative line of what will actually be appended to the prompt, so the user
knows what a click does before generating. Includes the clear-all action.

## Confidence badges

Small, on every recommended/result chip. Map `source` → label + tone:

```text
civitai (author)    高     emerald
mined_prompt        中高   teal
model_keyword       中/低  amber
system / curated    通用   neutral
lora_asset (trigger) 官方   violet
danbooru            参考   muted
user                自定义  muted
```

`TagSourceBadge` already exists; extend its mapping + add the confidence tone.

## i18n strategy (the core constraint)

**Hard rule: `promptText` stays English, always.** Image models (Danbooru-
trained SDXL / Illustrious / Pony, Flux) are trained on English/booru tokens —
translating the compiled text would break generation. Localization is a
**display + input** layer, never the compiled output.

Three layers:

| Layer                                            | Localized?  | Mechanism                                 |
| ------------------------------------------------ | ----------- | ----------------------------------------- |
| `promptText` (→ model)                           | ❌ never    | English token, shown verbatim on the chip |
| `label` (display)                                | ✅          | next-intl, keyed per tag id               |
| `category` / purpose group / recipe name / badge | ✅          | next-intl                                 |
| search input                                     | ✅ CN/JP/EN | alias match + synonym expansion           |

Decision (confirmed): **full curated-label translation + English token shown +
CN/JP search.**

Per surface:

- **Curated/system tags** (~dozens, small): give each a localized `label` via
  `PromptAssistant.tags.<id>` in en/ja/zh. The chip shows the localized label
  **and** the English `promptText` in a sub-line / corner — so 中文/日文 users
  read the meaning _and_ learn the real token fed to the model.
- **Curated aliases** already include CN/JP terms
  (`['best quality','高质量','精致','高品質']`) — keep extending these so
  search works in all three languages without translating `promptText`.
- **LoRA source tags** — labels already localized via interpolation
  (`library.loraSourceTrigger` etc.); keep.
- **Recipes** — names via `PromptAssistant.recipes.<id>` (en/ja/zh).
- **Danbooru tail** (currently **empty** — 现状校正 #1; this is forward-looking
  for when the import runs, thousands, cannot hand-translate): localize the
  **purpose group header** only; chips show the English token + localized badge;
  ship CN/JP aliases for the **top-N** common ones so search reaches them.
  Danbooru is the advanced tail, not the primary surface — CN/JP users live in
  zones ②③④-curated, which are fully localized.
- **Search synonym expansion** — deterministic CN/JP → token/recipe map (e.g.
  「去3D」「防漂移」→ de-3d recipe;「半身」→ upper-body;「修手」→ fix-anatomy).
  No LLM (repo rule: LLM only for judgment tasks). Lives in
  `prompt-tag-search` as a pre-normalization alias table.

Net result for a 中文 user: localized labels, recipes, purpose groups, and
Chinese search; the only English visible is the raw token on each chip — which
is correct, because that token _is_ what goes to the model.

## Files

Add:

```text
src/constants/prompt-recipes.ts            # PromptRecipe[] (LoRA-type-aware)
src/constants/prompt-recipes.test.ts
src/lib/apply-prompt-recipe.ts             # recipe → tag-stack + scale (reuses compiler + source-match)
src/lib/apply-prompt-recipe.test.ts
src/components/business/studio/prompt-tags/PromptAssistantPanel.tsx   # zones ②③④⑤ shell
src/components/business/studio/prompt-tags/CurrentLoraRecommendations.tsx
src/components/business/studio/prompt-tags/RecipeRow.tsx
src/components/business/studio/prompt-tags/SelectedPromptPreview.tsx
```

Change:

```text
src/components/business/studio/prompt-tags/LoraPromptControlButton.tsx  # host the new panel
src/components/business/studio/prompt-tags/TagLibrary.tsx               # regroup by purpose
src/components/business/studio/prompt-tags/TagSourceBadge.tsx           # confidence tone + labels
src/lib/prompt-tag-search.ts                                           # CN/JP synonym expansion
src/constants/prompt-tags.curated.ts                                   # extend CN/JP aliases
src/messages/{en,ja,zh}.json                                          # PromptAssistant.* (labels/recipes/badges/purpose)
```

## Implementation slices (after design sign-off)

1. **Recipe system** — `prompt-recipes.ts` + `apply-prompt-recipe.ts` + tests
   (pure logic, no UI). Wire "忠实还原角色" to source-match, "去3D"/"修手" to the
   shared anti-3D/negative sets.
2. **i18n layer** — localized labels for curated tags + recipe names + purpose
   groups + badges in en/ja/zh; CN/JP synonym table in search. (No new UI.)
3. **Panel IA** — `PromptAssistantPanel` with zones ②③④⑤; regroup `TagLibrary`
   by purpose; rename displayed title to Prompt 助手.
4. **Polish** — selected-preview compile line, confidence tones, collapse state,
   mobile drawer parity.

Each slice ends with `npx vitest run` + the UI 确认阶梯 (lint/build → visual
regression → token/a11y assertions → interaction). Per the UI workflow contract,
non-trivial visual changes get a Figma change-list before implementation.

## Non-goals / open questions

- **Not** img2img / reference-image visual matching (that was option D in the
  source-match discussion; out of scope here).
- **Not** translating `promptText` into the model prompt — ever.
- Recipe token lists above are **design placeholders** — confirm the exact
  tokens per recipe during slice 1.
- Whether the panel keeps the two-tab (Generate / Tags) split or merges into one
  scroll is a layout decision for the Figma pass.
