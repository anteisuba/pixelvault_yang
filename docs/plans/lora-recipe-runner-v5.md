# Task Packet: LoRA recipe fidelity and Runner controls

## Goal

- Make Civitai source-image recipes truthfully reproducible through the LoRA workbench and Comfy Runner, including prompt, negative prompt, seed, steps, CFG, supported sampler/scheduler, source generation size, and compatible base selection.

## Non-goals

- Do not change credits, authentication, BYOK routing, or non-Runner provider behavior.
- Do not claim pixel-identical reproduction when a source recipe depends on unavailable extra LoRAs, custom nodes, or unsupported upscalers.
- Do not expose RunPod, Civitai, Hugging Face, or R2 secrets to the client.

## Task Scene / Type

- provider/API + service/business logic + narrow LoRA UI wiring + QA

## Read First

- `AGENTS.md`
- `CLAUDE.md`
- `docs/WORKFLOW.md`
- `docs/scenes/service-change.md`
- `docs/scenes/new-model.md`
- `docs/scenes/ui-page.md`
- `docs/archive/reviews/2026-07-02-lora-domain-ui-review.md`
- `docs/plans/comfy-runner-v4-anima-dit.md`

## Source of Truth

- `src/types/index.ts`
- `src/services/civitai-lora.service.ts`
- `src/lib/civitai-recipe-to-generation.ts`
- `src/components/business/studio/lora/LoraWorkbench.tsx`
- `src/components/business/studio/prompt-tags/LoraSourceRecipeStrip.tsx`
- `src/constants/lora-base-models.ts`
- `workers/execution/src/models/runner/*`
- `workers/execution/src/index.ts`
- `workers/runner-comfyui-fork/rp_handler.py`

## Allowed File Scope

- LoRA recipe schemas, extraction, pure mapping, tests, workbench wiring, and LoRA i18n keys.
- Runner request/workflow builders, fork handler/cache policy, and focused tests.
- Runner/LoRA base catalog entries needed for compatible choices.
- This task packet and the owning status/runner documentation at closeout.

## Forbidden File Scope

- `prisma/**`
- credit/billing code
- Clerk/authentication code
- unrelated Studio, Canvas, Gallery, Prompt, or provider implementations
- existing unrelated dirty-worktree changes

## Assumptions / Open Questions

- The project remains non-commercial, so the current Anima non-commercial model license is acceptable for this environment.
- Source-recipe mode remains the default for faithful reproduction; fixed base variants never silently replace a source checkpoint.
- RunPod S3 access is configured locally as profile `runpod-s3`; the physical volume was verified on 2026-07-14 without starting a Pod.
- Anima Aesthetic/Turbo must not become fixed selectable entries until their exact UNET paths are present and pinned/on-demand recovery is defined. Source-checkpoint auto mode may fetch compatible Anima recipe checkpoints into the correct UNET directory.

## Acceptance Criteria

- Applying a Civitai recipe changes the actual generation request, not only the displayed recipe card.
- The sample seed `5536891017203` reaches the Runner without 32-bit truncation.
- Supported Civitai sampler strings normalize to an allowlisted ComfyUI sampler and scheduler; unsupported values remain visibly unapplied.
- Runner uses recipe base dimensions when available and validates architecture-specific limits.
- The base selector clearly distinguishes source-faithful behavior from fixed compatible base choices and never shows incompatible SDXL Anima Pencil for Cosmos Anima LoRAs.
- The UI states which fields will be applied and which cannot be applied.
- Dynamic volume files have a bounded, auditable cache policy before optional multi-gigabyte Anima variants are enabled.

## Validation / Evidence

- Focused Vitest suites for recipe extraction/mapping/workbench/strip and Runner builders.
- Worker TypeScript tests and typecheck.
- Python syntax/unit checks for fork-side seed/cache normalization.
- Manual browser verification on `/zh/studio/lora?section=generate` using the owner-run dev server.

## Implementation Status (2026-07-14)

- Local implementation complete: recipe extraction/mapping, LoRA workbench request wiring, Runner validation/workflow mapping, fork-side uint64 conversion, managed LRU, and persistent cache manifest/download history.
- Physical volume verified through RunPod S3: `rk3t3mb1ko`, US-CA-2, 22 objects, 50,572,049,990 bytes (~47.09 GiB). Anima Base/Qwen CLIP/VAE are present; no `models/upscale_models/` directory exists.
- Civitai metadata mapping complete for dynamic files: the 10 cached Civitai LoRAs split into 5 Illustrious + 5 Anima; the dynamic checkpoints are Nova Anime XL IL v19.0, Anima Turbo v1.0, and MiaoMiao Harem Anima 1.4.
- Automated validation complete: focused app tests, Runner workflow tests, Python unit/syntax checks, and project typecheck.
- Local follow-up implemented: the Runner can now build an optional `VAEDecode → 4x-AnimeSharp → SaveImage` path and the fork can hash-verify/cache the author-published model in `models/upscale_models/`. The asset is still absent from the physical volume until the new Worker/fork is deployed and a job requests it.
- Remaining operational work: deploy the execution Worker and RunPod fork image, run one live large-seed/upscale recipe, and complete owner visual QA before claiming high-resolution source-image fidelity. The v6 UI packet is implemented locally.

## Documentation Sync

- Update the current Runner plan/status facts after implementation; do not rewrite unrelated status entries.
