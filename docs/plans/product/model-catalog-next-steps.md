# Model Catalog Cleanup Next Steps

Date: 2026-04-28

Status: new handoff plan for continuing the AI model catalog cleanup after Step 2-A.

## Baseline

Completed locally before this plan:

- `a31a379 fix model version identifiers`
  - Renamed `VEO_3` to `VEO_31`.
  - Renamed `PIKA_V22` to `PIKA_V25`.
  - Kept legacy aliases for historical records.
  - Did not force-change Gemini Pro Image to an unverified `3.1` endpoint.
- `4aec307 retire obsolete model catalog entries`
  - Safely retired the 7 hard-delete models from new-generation surfaces.
  - Kept model IDs, labels, family mapping, and provider adapter compatibility for old records.
  - Added service and routing guards so retired models cannot start new generations.

Before continuing on another machine, confirm these commits are present:

```powershell
git log --oneline -3
```

## Scope Of This Plan

This plan covers the remaining work from the model catalog cleanup:

- Step 3: soft-delete / grey-release 4 models.
- Step 4: add new image, video, and audio models.
- Step 5: regroup the Studio model selector by user intent.
- Step 6: run L3 end-to-end validation after the catalog stabilizes.

This plan intentionally does not cover:

- Physical deletion of historical generation records.
- Credits repricing.
- Provider-level adapter consolidation.
- Full Studio UX redesign beyond the intent-based model selector.
- Commercial risk analysis for Sora or other providers.

## Global Rules

- Keep historical model IDs resolvable for old generations.
- Do not use `available: false` for Step 3 soft deletes unless the model should truly stop generating.
- Use a separate `deprecated` / hidden-by-default flag for grey release.
- Do not expose provider secrets to the client.
- All new user-facing labels must be added to `src/messages/en.json`, `src/messages/ja.json`, and `src/messages/zh.json`.
- Verify live provider endpoints against official docs before adding any new model entry.
- Preserve the existing BYOK flow unless the task explicitly adds a provider that requires a new key shape.

## Task Packet

- Goal:
  - Finish the model catalog cleanup without breaking historical generations or existing BYOK routes.
- Non-goals:
  - Do not delete historical DB rows.
  - Do not rewrite provider adapters as part of Step 3.
  - Do not change credits pricing in the same patch unless a new model requires an initial catalog cost.
- Read first:
  - `AGENTS.md`
  - `docs/guides/codex-development-workflow.md`
  - `docs/plans/feature/02-現狀映射.md`
  - `docs/plans/qa/functional/02-現狀映射.md`
  - `docs/plans/ui/02-現狀映射.md`
  - `docs/plans/qa/ui/02-現狀映射.md`
  - `src/constants/models.ts`
  - `src/services/model-config.service.ts`
  - `src/services/generate-image.service.ts`
  - `src/components/business/ModelSelector.tsx`
  - `src/components/business/studio/StudioPromptArea.tsx`
- Allowed file scope:
  - `src/constants/**`
  - `src/services/providers/**`
  - `src/services/*generation*.ts`
  - `src/services/model-config.service.ts`
  - `src/components/business/**`
  - `src/hooks/**`
  - `src/messages/{en,ja,zh}.json`
  - `prisma/seed.ts`
  - `prisma/seed.mjs`
  - relevant tests under `src/**/*.test.ts`
  - e2e tests only in Step 6
- Validation:
  - `npx vitest run <changed targeted tests>`
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build` before merge if Node 22 is available
- Definition of done:
  - Default model surfaces show only intended active models.
  - Deprecated models remain callable only through intentional legacy/custom paths.
  - New models have constants, labels, provider routing, capability metadata, seed data, and tests.
  - Intent UI is translated and works on desktop and mobile.
  - L3 e2e smoke covers representative providers and output types.

## Step 3: Soft Delete Grey Release

Target models:

| Model ID                                   | Current intention                 | Grey-release behavior                             |
| ------------------------------------------ | --------------------------------- | ------------------------------------------------- |
| `seedream-4.0` / `SEEDREAM_40`             | replaced by Seedream 5 Lite + 4.5 | hide from default lists, keep generation possible |
| `nai-diffusion-4-full` / `NOVELAI_V4_FULL` | replaced by NovelAI V4.5          | hide from default lists, keep generation possible |
| `kling-video` / `KLING_VIDEO`              | replaced by Kling V3 Pro          | hide from default lists, keep generation possible |
| `seedance-1.5-pro` / `SEEDANCE_15_PRO`     | replaced by Seedance 2.0          | hide from default lists, keep generation possible |

Implementation plan:

1. Add `deprecated?: boolean` to `ModelOption`.
2. Add a canonical list:

   ```ts
   export const DEPRECATED_MODEL_IDS = [
     AI_MODELS.SEEDREAM_40,
     AI_MODELS.NOVELAI_V4_FULL,
     AI_MODELS.KLING_VIDEO,
     AI_MODELS.SEEDANCE_15_PRO,
   ] as const satisfies readonly AI_MODELS[]
   ```

3. Mark those model entries with `deprecated: true`, but keep `available: true`.
4. Decide helper semantics:
   - `getAvailableModels()` should keep returning genuinely usable models only if existing callers expect default UI options.
   - If historical/admin callers need all callable models, introduce `getCallableModels()` instead of overloading `getAvailableModels()`.
5. Hide deprecated models from:
   - Studio default model selector.
   - Homepage model table.
   - Arena default model list.
   - API key preset list.
   - Intent recommendations.
6. Keep deprecated models resolvable via:
   - `getModelById`
   - `getModelMessageKey`
   - `getModelFamily`
   - historical generation display.
7. Add tests:
   - Deprecated models are not returned by default selection helpers.
   - Deprecated models still resolve by ID.
   - `resolveGenerationRoute` does not reject them solely because of deprecation.
   - Step 2-A retired models remain blocked.

Validation commands:

```powershell
npx vitest run src/constants/models.test.ts src/services/generate-image.service.test.ts src/services/model-config.service.test.ts src/services/model-router.service.test.ts src/i18n/completeness.test.ts
npx tsc --noEmit
npm run lint
```

Rollout notes:

- Observe usage for 1-2 weeks.
- If usage is effectively zero, promote these models to the Step 2-A retired path in a later separate commit.

## Step 4: Add New Models

Split this into three commits or PRs. Do not bundle all providers into one risky patch.

### Step 4-A: GPT Image 2 Snapshot

Goal:

- Add a stable snapshot model entry for GPT Image 2 if the provider supports the requested snapshot ID.

Candidate:

- `gpt-image-2-2026-04-21`

Before implementation:

- Verify the exact OpenAI model ID in official OpenAI docs.
- If the snapshot ID is not officially listed, do not add it as a callable model.
- If only the alias is supported, document that decision and keep `OPENAI_GPT_IMAGE_2` as the active entry.

Likely files:

- `src/constants/models.ts`
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`
- `prisma/seed.ts`
- `prisma/seed.mjs`
- `src/services/providers/openai*.test.ts`
- `src/constants/models.test.ts`

Validation:

```powershell
npx vitest run src/constants/models.test.ts src/services/providers/openai*.test.ts src/i18n/completeness.test.ts
npx tsc --noEmit
```

### Step 4-B: New Video Models

Target additions:

| Model family | Candidate IDs       | Notes                                                                           |
| ------------ | ------------------- | ------------------------------------------------------------------------------- |
| Sora         | Sora 2 / Sora 2 Pro | Verify whether this goes through FAL or OpenAI in this codebase. Do not assume. |
| Luma         | Ray 3 / Ray 3.14    | Replacement path for Ray 2.                                                     |
| Runway       | Gen-4               | Replacement path for Gen-3.                                                     |
| LTX          | LTX-2               | Open model benchmark candidate; verify provider and schema.                     |

Implementation sequence:

1. Verify official provider docs and exact endpoint IDs.
2. Add enum IDs and model entries in `src/constants/models.ts`.
3. Add i18n labels in all three locale files.
4. Add seed entries.
5. Add or update capability metadata:
   - output type
   - T2V / I2V support
   - reference-image requirements
   - duration constraints
   - resolution constraints
   - audio support
   - timeout
6. Update provider body builders only where a new endpoint schema requires it.
7. Keep worker parity if the model runs through FAL worker paths.
8. Add tests for each model family:
   - catalog entry resolves.
   - correct adapter type.
   - correct external model ID.
   - request body builder matches provider schema.
   - I2V required-reference handling if applicable.

High-risk files:

- `src/constants/models.ts`
- `src/constants/provider-capabilities.ts`
- `src/constants/video-options.ts`
- `src/services/providers/fal/video-request-builders.ts`
- `workers/execution/src/models/fal/video-request-builders.ts`
- `src/services/providers/openai.ts` if Sora goes through OpenAI.
- `src/services/video-generation-validation.service.ts`
- `src/services/video-generation.service.ts`
- `src/messages/{en,ja,zh}.json`
- provider tests.

Validation:

```powershell
npx vitest run src/constants/models.test.ts src/services/providers/fal/video-request-builders.test.ts src/services/video-generation-validation.service.test.ts src/i18n/completeness.test.ts
npx tsc --noEmit
npm run lint
```

Manual smoke:

- One T2V request for each new provider path.
- One I2V request for each model that claims I2V.
- Confirm generated records persist with correct `model`, `provider`, `outputType`, `duration`, and URL fields.

### Step 4-C: New Audio Model

Default recommendation:

- Add OpenAI `gpt-4o-mini-tts` first if the existing OpenAI adapter can support it with the least provider-surface change.

Alternative:

- Add MiniMax Speech-02 / Music 2.6 if Chinese voice quality is the priority and the team accepts a new provider adapter.

Decision gate:

| Option     | Pros                                            | Cost                                      |
| ---------- | ----------------------------------------------- | ----------------------------------------- |
| OpenAI TTS | simpler key flow, likely reuses OpenAI provider | less China-specific differentiation       |
| MiniMax    | stronger Chinese/audio positioning              | new adapter, new env/key docs, more tests |

Implementation for OpenAI path:

1. Verify exact model ID and request/response schema.
2. Add enum/model entry.
3. Extend OpenAI provider adapter for audio if not already present.
4. Add audio capability metadata.
5. Add i18n labels.
6. Add tests for request body and normalized audio output.

Implementation for MiniMax path:

1. Add provider constant and provider config.
2. Add server-only adapter under `src/services/providers/`.
3. Add API key validation and provider key hints.
4. Add catalog and i18n labels.
5. Add normalized audio result tests.

Validation:

```powershell
npx vitest run src/constants/models.test.ts src/services/providers/*audio*.test.ts src/i18n/completeness.test.ts
npx tsc --noEmit
npm run lint
```

## Step 5: Intent-Based Model Selector

Precondition:

- Complete Step 3.
- Complete at least the low-risk part of Step 4.
- Freeze the active model list for this UI pass.

Goal:

- Change the Studio model selector from provider-first grouping to user-intent-first grouping.

Initial intent groups:

| User intent               | Default              | Alternative 1          | Alternative 2   |
| ------------------------- | -------------------- | ---------------------- | --------------- |
| Photorealistic / portrait | FLUX 2 Pro           | GPT Image 2            | Seedream 5 Lite |
| Anime / manga             | NovelAI V4.5 Curated | Illustrious XL         | Animagine XL 4  |
| Logo / poster / text      | Recraft V4 Pro       | Ideogram V3            | GPT Image 2     |
| Fast preview / iteration  | FLUX 2 Schnell       | Gemini 3.1 Flash Image | SDXL            |
| Reference image editing   | FLUX Kontext Max     | Gemini Pro Image       | Seedream 4.5    |
| Video                     | Seedance 2.0         | Veo 3.1                | Sora 2          |
| Fast short video          | Seedance 2.0 Fast    | MiniMax Hailuo 2.3     | Wan 2.6         |
| Text-to-speech            | Fish Audio S2 Pro    | FAL F5-TTS             | new audio model |

Implementation plan:

1. Add an intent config, likely in `src/constants/model-intents.ts`.
2. Keep config model-ID based, not provider-label based.
3. Filter intent entries through active/default-selectable helpers so retired/deprecated models cannot leak into default UI.
4. Add an Advanced drawer for remaining active models.
5. Add i18n labels:
   - intent names
   - short helper labels if needed
   - advanced drawer label
6. Update `ModelSelector` and the Studio entry component with minimal surface change.
7. Keep API request shape unchanged.
8. Add UI tests or component tests if present.

Design constraints:

- No provider-card wall as the primary UI.
- Each intent shows at most 3 primary options.
- Advanced drawer may still group by provider or capability.
- Mobile must remain scannable; avoid dense nested cards.
- Do not introduce new hardcoded visible strings.

Validation:

```powershell
npx vitest run src/constants/models.test.ts src/i18n/completeness.test.ts
npx tsc --noEmit
npm run lint
```

Manual UI validation:

- Desktop Studio: select each intent and generate once with a known working model.
- Mobile Studio: open selector, switch intent, select model, submit.
- Confirm deprecated and retired models are absent from default intent groups.
- Confirm historical generation cards still render model names.

## Step 6: L3 E2E After Catalog Stabilizes

Precondition:

- Step 3 completed.
- Step 4 completed or intentionally reduced.
- Step 5 completed.
- Node 22 available.
- Test env has valid provider keys or mocked provider mode.

Representative smoke list:

| Output | Provider path      | Candidate               |
| ------ | ------------------ | ----------------------- |
| Image  | OpenAI             | GPT Image 2             |
| Image  | Gemini             | Gemini 3.1 Flash Image  |
| Image  | FAL                | FLUX 2 Pro              |
| Image  | HuggingFace        | SDXL                    |
| Image  | NovelAI            | NovelAI V4.5 Curated    |
| Video  | FAL                | Seedance 2.0 or Veo 3.1 |
| Video  | VolcEngine         | Seedance 2.0 Volc       |
| Audio  | Fish Audio         | Fish Audio S2 Pro       |
| Audio  | FAL                | F5-TTS                  |
| Audio  | New audio provider | OpenAI or MiniMax       |

E2E paths:

- Landing page loads.
- Studio auth guard works.
- Model selector shows intent groups.
- Generate image.
- Generate video.
- Generate audio.
- Gallery detail page renders generated item.
- Mobile Studio selector works.
- `/api/health` works.
- `/api/health/providers` works.
- `/api/models` returns no retired or deprecated default-hidden models unless explicitly designed otherwise.

Validation commands:

```powershell
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
```

If e2e framework exists:

```powershell
npx playwright test
```

Dev server rule:

- Codex should not start the dev server in this project.
- The user starts it manually and provides the local URL if browser inspection is needed.

## Suggested Commit Split

1. `mark deprecated model catalog entries`
2. `add gpt image snapshot model`
3. `add next video model catalog entries`
4. `add tts catalog model`
5. `group studio models by intent`
6. `add model catalog e2e coverage`

Keep each commit independently reviewable.

## Open Questions

- Should `getAvailableModels()` mean "callable" or "default-selectable" after Step 3?
  - Recommended: make default UI use a new explicit helper such as `getDefaultSelectableModels()` and keep `getModelById()` as the historical resolver.
- Should OpenAI TTS be the first new audio model?
  - Recommended: yes, unless Chinese voice differentiation is the immediate product priority.
- Should Sora be routed through FAL or OpenAI?
  - Do not decide from memory. Verify current provider docs first.
- Should Gemini Pro Image remain `gemini-3-pro-image-preview`?
  - Current local baseline did not change it because the alternative endpoint was not verified. Revisit only with official docs in hand.
