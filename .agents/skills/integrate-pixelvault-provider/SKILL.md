---
name: integrate-pixelvault-provider
description: 新增或修改 PixelVault 模型目录、provider adapter、参数、计费或 BYOK 契约时使用。
---

# Integrate PixelVault Provider

## Overview

Change PixelVault's media generation stack through the project layers instead of scattering provider details through UI or routes. This skill captures the repeated model audit, provider update, BYOK, and image/video/audio generation debugging workflow.

## Workflow

1. Confirm the source of truth:
   - Read `AGENTS.md`.
   - Read `src/constants/models.ts`, `src/constants/providers.ts`, `src/constants/config.ts`, and relevant message files before changing model-facing behavior.
   - Inspect `src/services/providers/registry.ts`, generation services and the matching handlers under `workers/execution/src/models/` before changing execution behavior.

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
   - Follow docs/WORKFLOW.md and docs/scenes/new-model.md: catalog/adapter changes require full application checks and affected Worker tests; real paid calls require corresponding authorization.
   - For failures, capture the exact provider error and map it to a safe user-facing message.
   - Do not retry unclear provider failures indefinitely. Do not repeat the same failing action without new evidence. Report missing environment/access, continue independent checks, and never request raw secrets in chat.

## Model Catalog Rules

- `src/constants/models.ts` is authoritative.
- When removing or replacing a public model identifier, delete it and update every reference (constants, i18n, adapters, tests, docs) in the same change; no alias layer (Engineering Principle 1).
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
