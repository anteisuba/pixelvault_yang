---
name: integrate-pixelvault-provider
description: PixelVault-specific workflow for adding, updating, pruning, or debugging AI image/video/audio models and providers. Use for model catalog updates, provider adapter work, BYOK behavior, generation failures, FAL/Replicate/Gemini/OpenAI/VolcEngine/NovelAI/Fish Audio integration, model costs, and media API parameter changes.
---

# Integrate PixelVault Provider

## Overview

Change PixelVault's media generation stack through the project layers instead of scattering provider details through UI or routes. This skill captures the repeated model audit, provider update, BYOK, and image/video/audio generation debugging workflow.

## Workflow

1. Confirm the source of truth:
   - Read `AGENTS.md`.
   - Read `src/constants/models.ts`, `src/constants/providers.ts`, `src/constants/config.ts`, and relevant message files before changing model-facing behavior.
   - Inspect existing provider adapters under `src/services/providers/` and generation services before adding new patterns.

2. Read primary API docs for media/provider changes:
   - Use official provider documentation for image, video, audio, browser media APIs, and parameter semantics.
   - Record key constraints before implementation: auth, endpoint, request fields, response shape, async job behavior, safety filters, file formats, limits, and pricing/cost implications.

3. Preserve layer boundaries:
   - Constants own model IDs, provider IDs, metadata, aliases, costs, status, and output type.
   - Types/Zod schemas own request, response, and normalized provider payloads.
   - Services/adapters own provider-specific request construction, polling, normalization, credits, DB, and R2 coordination.
   - API routes stay thin: auth, validation, service call, response.
   - Hooks/API clients own client orchestration. Components never call provider APIs directly.

4. Handle BYOK and secrets correctly:
   - Never expose provider secrets through `NEXT_PUBLIC_*`.
   - Resolve user identity server-side via Clerk.
   - Keep encrypted key handling in server services.
   - For user-owned API keys, ensure unauthorized users cannot trigger platform-paid generation.

5. Update all user-facing surfaces:
   - If model labels, descriptions, status, or errors change, update i18n messages for `en`, `ja`, and `zh`.
   - Avoid hardcoded model strings in UI.
   - Keep locale-prefixed routes and existing Studio workflow assumptions intact.

6. Validate behavior:
   - Run focused typecheck/lint/tests/build commands that are feasible.
   - For failures, capture the exact provider error and map it to a safe user-facing message.
   - Do not retry unclear provider failures indefinitely. After two failed attempts caused by environment, keys, or external service behavior, summarize the blocker and ask the user for logs, credentials status, or provider console checks.

## Model Catalog Rules

- `src/constants/models.ts` is authoritative.
- Preserve aliases for legacy IDs when removing or replacing public model identifiers.
- Treat credits/requestCount semantics as server-owned policy, not UI decoration.
- When pruning models, check live availability, retirement status, adapter support, docs, and user-facing migration impact.
- For image/video/audio model additions, verify whether the existing adapter can support the provider before creating a new adapter.

## Common Triggers

- "Check whether the current GPT image model is latest."
- "Generation routes are all broken."
- "fal.ai returned 422."
- "Only Fish Audio S2 Pro works."
- "Bind my personal API key so public visitors do not spend platform credits."
- "Prune outdated models and keep representative models."
