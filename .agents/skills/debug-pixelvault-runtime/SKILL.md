---
name: debug-pixelvault-runtime
description: 调查或修复 PixelVault 运行、构建、部署及生成链路故障时，定位日志与相关模块。
---

# Debug PixelVault Runtime

## Overview

Investigate PixelVault failures with evidence first and only patch after a root cause is plausible. This skill exists because build logs, provider failures, missing messages, Prisma issues, and Vercel/local mismatches recur in this project.

## Triage Workflow

1. Establish context:
   - Read `AGENTS.md`.
   - Read relevant current-state docs for non-trivial tasks.
   - Check `git status --short` before editing and do not revert unrelated user changes.
   - Identify whether the failure is local runtime, Vercel/deploy, API route, provider, database, i18n, UI hydration, or performance.

2. Gather evidence:
   - Prefer exact logs, stack traces, status codes, route paths, provider error payloads, and failing files.
   - Search with `rg` before broad reads.
   - For API failures, inspect route handler, schema validation, service layer, auth boundary, and downstream provider/storage/database calls.
   - For i18n failures, inspect message keys across all locales and the component namespace that requests them.
   - For Vercel failures, compare local Node/runtime/config assumptions with deployed settings.

3. Respect environment ownership:
   - Do not start `npm run dev`, `npx next dev`, or equivalent dev servers.
   - Inspect the known local URL and available browser tools first. Ask only for logs or access that cannot be obtained from the current environment.
   - Do not repeat the same failed credential/environment action without new evidence. Isolate that blocker and continue independent diagnosis.

4. Patch in the correct layer:
   - API route: auth, validation, service call, response only.
   - Service: business rules, credits, DB writes, provider orchestration, R2 storage.
   - Hook/API client: client request orchestration.
   - Component: display, interaction state, and translated copy.
   - Constants/types: model/provider IDs, schemas, route constants, env/config metadata.

5. Validate narrowly first:
   - Use the verification tiers in docs/WORKFLOW.md: focused feedback first, full gates for shared/high-risk changes.
   - If changing provider behavior, validate with schema-level or adapter-level checks before broad UI changes.
   - If a command cannot run because dependencies or environment are unavailable, say so plainly.

## Common Failure Patterns

- `MISSING_MESSAGE`: add or correct the key in every locale message file and confirm namespace usage.
- Provider HTTP 4xx: inspect request payload against official docs and distinguish content policy, auth, parameter, and unsupported-file errors.
- API 500: follow route to service to external dependency; do not fix symptoms in the component.
- Vercel-only failure: check environment variables, runtime version, build command, Prisma generation, and server-only imports.
- Hydration issue: compare server/client component boundary, locale data, unstable values, and browser-only APIs.
- Slow page/material loading: measure code path and data flow before adding caching or memoization.

## Common Triggers

- "Vercel has a warning/error."
- "Local works but deployed page fails."
- "The page says missing message."
- "Generation is broken."
- "An API route returns 500."
- "Page switching or asset loading is slow."
