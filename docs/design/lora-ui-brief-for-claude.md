# Claude UI Brief: LoRA Prompt Tag Library

Use this brief after reading:

- `docs/design/lora-tag-system.md`
- `docs/screenshots/current-ui-inventory/studio-lora-desktop-1440.png`
- `docs/screenshots/current-ui-inventory/studio-lora-mobile-390.png`
- `src/components/business/studio/StudioPromptArea.tsx`
- `src/components/business/studio/prompt-tags/LoraPromptControlButton.tsx`
- `src/components/business/studio/lora/LoraWorkbench.tsx`

## Scope

You are responsible only for UI and interaction design.

Do not design or change:

- database schema
- API contracts
- provider routing
- Civitai integration behavior
- prompt compilation rules
- tag search ranking
- LoRA compatibility logic

Codex owns the system design in `docs/design/lora-tag-system.md`.

## Tag Source Rules

The UI should reflect these system-owned tag sources:

1. PixelVault curated tags
   - default visible starter library
   - quality, style, lighting, camera, scene, negative

2. Imported Danbooru tags
   - searchable prompt tags
   - mostly hidden behind search/category browsing
   - shown as Danbooru/source-backed suggestions, not as the primary beginner
     surface

3. LoRA trigger tags
   - created dynamically from Civitai `trainedWords`, trained PixelVault LoRA
     trigger words, and saved LoRA assets
   - have scale/weight and model compatibility states

Civitai model tags are discovery/filter facets for the LoRA Library. Do not
design them as one-click prompt tags unless the system exposes them as curated
prompt tags.

## Direction

The old top Studio-wide LoRA bar should disappear. Active LoRAs should live in
the prompt workspace as selected tags/chips.

Design the prompt area as:

```text
free text prompt
selected positive tags
selected negative tags
selected LoRA trigger tags
tag search / tag library entry point
```

LoRA is not a separate floating frame at the top of Studio anymore. It is a
special tag type with scale, trigger text, model compatibility, and removal.

## UI Surfaces To Design

1. Prompt tag area inside Studio
   - selected positive tags
   - selected LoRA trigger tags
   - selected negative tags
   - collapsed and expanded states
   - too-many-tags state
   - tag reorder affordance
   - LoRA scale control
   - unsupported/model mismatch warning

2. Tag library/search popover or sheet
   - searchable tag list
   - recent tags
   - recommended tags
   - category browse
   - LoRA tags from active library/assets
   - positive vs negative filter
   - empty search state
   - loading and error states

3. `/studio/lora` integration
   - Library should still browse/search Civitai LoRAs.
   - "Use in Studio" now means "add as LoRA tag".
   - Details should show trigger tag, alternates, recommended prompt, model
     family, external-only state, and favorite action.

4. Mine page
   - user's trained/favorite LoRAs should be presented as reusable LoRA tags.
   - Card actions should emphasize "Add tag" / "Use in prompt", not a separate
     top-level active bar.

5. Train page
   - Training output should clearly produce a reusable LoRA tag.
   - Completion state should offer "add to prompt tags".

6. Mobile
   - Use bottom sheet/drawer patterns for tag search and LoRA details.
   - Keep selected tags visible without consuming the whole viewport.
   - Avoid placing long trigger words in layouts that can overflow.

## Required States

Design these explicitly:

- no selected tags
- selected tags present
- tag search loading
- tag search empty
- tag search error
- tag already selected
- tag disabled by current model
- LoRA external-only
- LoRA base family mismatch
- LoRA inferred trigger word
- LoRA trigger already present in free text
- negative tag applied
- tag library collapsed
- tag library expanded
- mobile drawer open
- training completed with new LoRA tag

## Output Format

Return:

1. Current UI problem diagnosis
2. Revised information architecture
3. Desktop layout
4. Mobile layout
5. Component inventory
6. Interaction details
7. Empty/loading/error/unsupported states
8. File-level UI implementation notes

Do not write code yet.
