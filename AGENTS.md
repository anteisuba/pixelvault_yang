# AGENTS.md — Personal AI Gallery Project Rules

This file defines the project-level operating rules for Codex in this repository.
Codex must read and follow these instructions for every new task in this project.

This file is authoritative unless the user explicitly overrides a rule for a specific task.

---

# 0. Core Role

You are working on **Personal AI Gallery**.

This is a production-oriented web application for:

- multi-model AI image / video / audio generation
- permanent archive/storage
- user authentication
- BYOK and credit / free-tier based generation
- public gallery, creator profile, arena, storyboard, collections, and social flows
- multilingual UI

Your job is not just to "make code work".
Your job is to:

- preserve architecture
- preserve type safety
- preserve security boundaries
- preserve maintainability
- improve UI intentionally
- make all new user-facing features translation-ready

Do not behave like a code generator that rewrites everything blindly.
Behave like a careful staff engineer working inside an existing codebase.

## Future-Oriented Execution Principle

Implementation time is not the primary constraint.
**Code is cheap** compared with product correctness, long-term leverage, and the quality bar this project should reach.

Do not be limited by past patterns, inherited expectations, or "how this type of app is usually built" when they hold back the better product.
Act from the future version of the product: propose and execute the solution that should exist, while still preserving this project's non-negotiable architecture, type-safety, security, and maintainability rules.

## Completion Reporting Rule

After every completed change, Codex must clearly tell the user:

- what files or areas were changed
- what the change enables or fixes
- what validation was run, or why validation was not run

Do not merely say that the work is done.

## Command Output Safety Rule

Protect context usage. Any command with unknown or potentially large output must be byte-capped.

Default pattern:

```bash
COMMAND 2>&1 | head -c 4000
```

## AI Agent Execution Discipline

All meaningful AI-assisted work in this repository must follow these rules:

1. **Think before coding** — state assumptions first; do not guess silently. The model cannot read minds, so unclear intent must be surfaced.
2. **Simplicity first** — use the least code that solves the task. Do not add speculative abstractions or "future flexibility" that creates code likely to be deleted later.
3. **Surgical changes** — change only what must change. Do not casually optimize neighboring code; that is how PRs inflate.
4. **Goal-driven execution** — define success criteria first, then iterate until validation passes. Without success criteria, agents either loop too long or stop too early.
5. **Use models only for judgment tasks** — classification, drafting, summarization, extraction, and similar tasks are appropriate. Do not use models for routing, retries, status-code handling, or deterministic transformations. If code can answer it, let code answer it.
6. **Token budget is not a suggestion** — target 4000 tokens per task and 30000 tokens per session. Long sessions degrade decision consistency and can reintroduce fixes that were already rejected earlier.
7. **Expose conflicts instead of averaging them** — if the codebase has two patterns, choose one deliberately. Mixing both can hide errors twice.
8. **Read before writing** — inspect exports, callers, and shared utilities first. Avoid creating duplicate helpers beside existing ones just because they were not read.
9. **Tests must verify intent, not just behavior** — if business logic changes but tests would still pass, the tests are wrong.
10. **Checkpoint every important step** — do not keep building on top of a broken step without noticing. Each important stage needs an observable state or validation point.
11. **Match codebase conventions** — follow the existing implementation style unless there is a clear reason to change it. Do not silently switch paradigms that tests or lifecycle behavior may depend on.
12. **Failures must be loud** — expose uncertainty, skipped records, partial failures, and degraded paths. Do not report success while silently dropping important work.
13. **Stop when direction is unclear** — do not guess product direction, API contracts, provider capabilities, model parameters, pricing assumptions, permission boundaries, or persistence strategy. If the repository docs and code do not answer the question, stop and ask the user before changing behavior.

## Documentation Context Discipline

For future tasks, Codex must use the active documentation reading path defined in `docs/README.md`.

This section supersedes older path-specific references to retired directories such as `docs/guides/**`, `docs/ai/**`, `docs/reference/**`, `docs/progress/**`, and historical `docs/plans/**` subtrees. If an old path no longer exists, use the current taxonomy in `docs/README.md` and the relevant code source of truth.

Default reading order:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/status.md` if it exists
4. the relevant `docs/domains/*.md`
5. the relevant `docs/architecture/*.md`
6. the relevant `docs/integrations/*.md`
7. the relevant code source of truth

Do not read the whole `docs/` tree by default. Load the smallest relevant set, then inspect the code source of truth before making changes.

If docs and code disagree, trust the code as the implementation fact, but do not silently choose a product or API direction. If the conflict affects product behavior, auth, credits, storage, database, provider/API integration, or user-visible contracts, stop and ask the user.

## Required Development Workflow

For every meaningful development, planning, debugging, provider/model/API, architecture, or UI task, Codex must follow this sequence:

1. Read the relevant documentation.
2. Inspect the code source of truth.
3. Verify official or primary-source documentation when the task involves provider behavior, model behavior, API contracts, pricing, SDK/platform behavior, auth, storage, database, deployment, or security.
4. Expose uncertainty, conflicts, and assumptions.
5. Stop for user confirmation when direction is unclear or when multiple product/API/architecture directions are reasonable.
6. Write or confirm a task packet before non-trivial implementation.
7. Implement a small, scoped slice.
8. Run the relevant validation.
9. Update only the necessary documentation.

Canonical short form:

`读文档 -> 查代码事实源 -> 必要时查官方资料 -> 暴露不确定点 -> 你确认方向 -> 写 task packet -> 实现小切片 -> 跑验证 -> 更新必要文档`

Skipping a step is allowed only for trivial changes where the step is genuinely irrelevant. If a step is skipped, the final report must say why.

## Agent Role Division

This repository operates with two agent surfaces. They are not interchangeable.

- **Codex** is the execution surface. It owns `规范` / `探索` / `前端` / `后端` threads, writes and reviews code under `src/**`, `prisma/**`, `scripts/**`, `e2e/**`, and their peers. See Appendix A.
- **Claude Code** is the planning surface. It reads code but does not modify it. It produces task packets, long-term rules, plan documents, and map writebacks under the active `docs/` taxonomy, `01/02/03/04/05` directories, and `AGENTS.md`. See Appendix C.

Every non-trivial change flows: Claude Code produces a task packet → Codex executes → Claude Code reviews the diff and writes the result back into the maps. Trivial changes (typos, sub-10-line fixes, pure renames) can go directly to Codex without a task packet.

---

# 1. Product Overview

## Product Name

**Personal AI Gallery**

## Product Goal

A platform that allows users to:

- sign in
- choose an AI model
- submit prompts
- generate images
- store outputs permanently
- manage credits
- later browse public galleries and personal works

## Main Stack

- **Framework**: Next.js 16.2.4
- **Routing**: App Router
- **Build**: Turbopack
- **Language**: TypeScript 5
- **Runtime target**: Node 22.x
- **Styling**: Tailwind CSS + shadcn/ui
- **Auth**: Clerk
- **Database**: PostgreSQL (Neon)
- **ORM**: Prisma 7.7.0
- **Prisma Adapter**: PrismaPg Driver Adapter
- **Storage**: Cloudflare R2
- **AI Providers**:
  - HuggingFace Inference API
  - Google Gemini API
  - OpenAI Images API
  - FAL
  - Replicate
  - NovelAI
  - VolcEngine
  - Fish Audio

## Supported Models

The source of truth is `src/constants/models.ts`.

Current catalog:

- 45 `MODEL_OPTIONS` entries: 27 image, 16 video, 2 audio
- 38 available model entries and 7 retired entries
- 2 legacy aliases in `MODEL_ID_ALIASES`, so 47 model identifiers are recognized by normalization

Available image models:

- `gpt-image-2`
- `gemini-3-pro-image-preview`
- `flux-2-pro`
- `seedream-4.5`
- `seedream-5.0-lite`
- `seedream-4.0`
- `ideogram-3`
- `gemini-3.1-flash-image-preview`
- `flux-2-dev`
- `flux-2-schnell`
- `flux-lora`
- `illustrious-xl`
- `sd-3.5-large`
- `animagine-xl-4.0`
- `nai-diffusion-4-5-full`
- `nai-diffusion-4-5-curated`
- `nai-diffusion-4-full`
- `sdxl`
- `flux-2-max`
- `recraft-v4-pro`
- `flux-kontext-pro`
- `flux-kontext-max`

Available video models:

- `kling-v3-pro`
- `veo-3.1`
- `seedance-2.0`
- `seedance-2.0-fast`
- `seedance-2.0-volc`
- `seedance-2.0-fast-volc`
- `seedance-1.5-pro`
- `minimax-video`
- `luma-ray-2`
- `pika-v2.5`
- `kling-video`
- `runway-gen3`
- `wan-video`
- `hunyuan-video`

Available audio models:

- `fish-audio-s2-pro`
- `fal-f5-tts`

Retired model entries kept for compatibility:

- `seedream-3.0`
- `recraft-v3`
- `nai-diffusion-3`
- `playground-v2.5`
- `gemini-2.5-flash-image`
- `seedance-pro`
- `seedance-1.0-pro`

---

# 2. High-Level Engineering Priorities

When multiple implementation options exist, use these priorities in order:

1. **Correctness**
2. **Security**
3. **Type safety**
4. **Architecture consistency**
5. **Readability / maintainability**
6. **UI/UX quality**
7. **Performance**
8. **Speed of implementation**

Do not sacrifice 1–5 for superficial speed.

---

# 3. Non-Negotiable Hard Rules

## 3.1 No magic values

Do not hardcode model IDs, route paths, provider names, credit costs, UI mode strings, or reusable text literals inside components or logic.

### Bad

```ts
if (model === 'sdxl') { ... }
router.push('/en/studio')
Good
if (model === AI_MODELS.SDXL) { ... }
router.push(ROUTES.STUDIO)
```

Use constants from:

src/constants/models.ts

src/constants/routes.ts

src/constants/config.ts

or create a new constants file if needed

3.2 No any

Do not use any.

Allowed replacements:

interface

type

unknown + narrowing

Zod schema + inferred type

generic type parameters

Bad
const result: any = await response.json()
Good
const result = GenerateResponseSchema.parse(await response.json())
type GenerateResponse = z.infer<typeof GenerateResponseSchema>
3.3 No direct fetch inside components

Do not call fetch directly inside React components for app business operations.

Bad
const handleSubmit = async () => {
await fetch('/api/generate', { method: 'POST', body: ... })
}
Good
const handleSubmit = async () => {
await generateImage(payload)
}

All front-end requests must be encapsulated through:

src/lib/api-client.ts

or a clearly named API client module

3.4 No business logic inside API routes

API routes may do only these things:

auth check

input validation

call service layer

return response

Do not put complex orchestration, credits rules, provider-specific business logic, R2 key design, or Prisma coordination directly in route handlers.

3.5 No unsafe client trust

Never trust:

client-reported credits

client-reported user ID

client-reported ownership

client-reported generation status

client-reported permissions

Credits deduction and permission checks must always happen on the server.

3.6 No Tailwind arbitrary values unless justified

Avoid arbitrary values like:

w-[257px]

mt-[13px]

rounded-[23px]

Prefer:

standard Tailwind tokens

reusable semantic classes

tailwind config extensions when genuinely necessary

Arbitrary values are allowed only if:

there is a compelling visual/system reason

they are rare

they are not replacing a perfectly good token

3.7 No hidden architecture drift

Do not silently introduce a second way of doing the same thing.

Examples:

do not mix direct component fetches with API client usage

do not mix scattered schema definitions and central schema definitions without reason

do not create another translation pattern once i18n is established

do not create another page layout pattern unless there is a clear architecture reason

4. Required Development Order

For new features, follow this order whenever possible:

constants/

types/

services/

hooks/

components/

pages/routes

tests / validation

UI polish

If task scope is small, this order can be collapsed, but the same dependency direction must be preserved.

5. Project-Specific Architecture Rules
   5.1 Layer responsibilities
   constants/

Contains:

model IDs

provider IDs

route definitions

config values

enums-like objects

reusable option metadata

types/

Contains:

shared interfaces

Zod schemas

inferred types

DTO-like data shapes

domain types

services/

Contains:

server-side business logic

DB coordination

storage logic

credit logic

provider invocation orchestration

hooks/

Contains:

client-side state logic

async orchestration for UI

derived UI state

reusable interaction logic

components/ui/

Contains:

dumb/presentational components

styling primitives

reusable UI building blocks

no business logic

components/business/

Contains:

domain-aware components

hook usage

UI orchestration

no direct business logic implementation

no direct API fetches

components/layout/

Contains:

page shells

layout structure

navigation

top bars / tab bars / wrappers

app/

Contains:

route entry files

route layouts

route composition

server component page composition

api/

Contains:

thin request/response boundary only

5.2 Keep business logic out of the UI

UI components should not decide:

final credits deduction

final storage keys

DB persistence flow

provider security handling

authorization outcome

They may request those outcomes, but server code must decide them.

5.3 Keep route files thin

Page files should mostly:

compose components

load route-level data if necessary

wire localization

define metadata if needed

Do not turn page.tsx into a 400-line mixed kitchen sink.

6. TypeScript Rules
   6.1 File types

Use:

.ts

.tsx

Do not introduce:

.js

.jsx

6.2 Props typing

All props must have explicit interfaces.

Convention:

XxxProps

Example
interface GenerateFormProps {
defaultModel: ModelId
onSuccess?: (generationId: string) => void
}
6.3 Schema-first whenever data crosses boundaries

Use Zod for:

API request bodies

API responses when relevant

env validation if added

external provider payload normalization

form-level structured validation when appropriate

Pattern:

const GenerateRequestSchema = z.object({
prompt: z.string().min(1),
model: z.enum([...])
})

type GenerateRequest = z.infer<typeof GenerateRequestSchema>
6.4 Prefer inference from schema

If a shape is already represented in a Zod schema, prefer:

type T = z.infer<typeof Schema>

instead of duplicating the type manually.

6.5 Avoid unsafe type assertions

Do not use:

as any

as unknown as X

large blind casts

Use narrowing, parser functions, discriminated unions, or schema parsing instead.

7. Naming Conventions
   File naming

Components: PascalCase.tsx

Hooks: use-xxx.ts or useXxx.ts

Services: xxx.service.ts

Constants: semantic file names such as models.ts, routes.ts, config.ts

Schema/type modules: descriptive names, not vague names like common.ts unless truly common

Symbol naming

constants: SCREAMING_SNAKE_CASE

types/interfaces: PascalCase

hooks/functions/variables: camelCase

React components: PascalCase

8. Import Order

Always prefer this order:

// 1. React / Next.js
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// 2. Third-party libraries
import { z } from 'zod'
import { useUser } from '@clerk/nextjs'

// 3. Internal constants / types
import { AI_MODELS } from '@/constants/models'
import type { GenerateRequest } from '@/types'

// 4. Internal hooks / services / components
import { useGenerate } from '@/hooks/use-generate'
import { Button } from '@/components/ui/button'

// 5. Local styles if necessary
import styles from './styles.module.css'

Keep imports grouped and stable.

9. Routing Rules
   9.1 App Router is the source of truth

This project uses Next.js App Router.

Do not introduce Pages Router patterns.

9.2 Locale-based routing

The app uses locale segments under:

/en/...

/ja/...

/zh/...

Default locale is:

en

All routing and page design must remain compatible with locale-prefixed routes.

9.3 Route constants

Reusable route paths should be defined in constants.

Do not scatter route strings across the codebase.

9.4 Preserve route structure

Do not change route structure casually during UI work.
UI improvement tasks must not break existing route conventions.

10. Authentication Rules (Clerk)
    10.1 Auth boundary

Protected pages and protected route handlers must verify auth before doing privileged work.

10.2 Never trust client identity

Never trust identity from:

form values

search params

headers unless part of verified middleware flow

User identity must come from Clerk/auth context.

10.3 Webhook logic

Webhook handlers must remain thin and validated.
Do not put unrelated business logic into Clerk webhook routes.

11. Credits Rules
    11.1 Credits are server-owned state

The client may display credits.
The server decides:

current balance

affordability

deduction

refund if applicable

consistency guarantees

11.2 Model cost must come from constants/config

Do not hardcode credit costs inside components or handlers.

11.3 Failed generation handling

If generation failure affects credits policy, it must be decided and implemented in service logic, not guessed in UI.

12. AI Provider Integration Rules
    12.1 Provider-specific code belongs in services or adapters

Do not put provider request format logic into page files or React components.

12.2 Normalize provider differences

Different providers may return different shapes.
Normalize them into project-controlled shapes before they reach the broader app.

12.3 Never expose secrets to client

Provider API keys must never be exposed via NEXT*PUBLIC*\*.

12.4 Official documentation verification required

Before planning or modifying provider, model, generation API, payload schema, response normalization, webhook, pricing, or credit-cost behavior, Codex must verify the current behavior against the latest official or primary-source documentation.

Preferred source order:

1. Official API documentation
2. Official SDK documentation or changelog
3. Official model page, model card, or endpoint schema
4. Official announcements, release notes, or migration guides
5. Current repository implementation

Do not rely on memory for model/API behavior. If official documentation cannot confirm a model name, capability, parameter, limit, return shape, pricing rule, or deprecation status, stop and ask the user instead of changing API-related code by inference.

When the verified external documentation conflicts with current code or local docs, report the conflict with source links and ask before changing behavior.

13. Storage Rules (Cloudflare R2)
    13.1 R2 logic belongs in storage service modules

Storage upload, key generation, content normalization, and related helper logic must live in:

src/services/storage/...

13.2 No storage key logic in UI

UI should never generate or assume final storage keys.

13.3 Persist canonical metadata

If width, height, mime type, storage key, provider, etc. are stored, those values must come from trusted server-side flow.

14. Database / Prisma Rules
    14.1 Prisma access should be centralized

Use shared Prisma access patterns.
Do not create multiple ad-hoc Prisma clients.

14.2 DB writes belong in services

Page files, hooks, and components must not directly orchestrate DB logic.

14.3 Keep schema usage explicit

When using Prisma results in app code:

transform to stable shapes if needed

do not leak raw DB concerns into UI unnecessarily

14.4 Migrations should stay intentional

Do not casually change schema during unrelated UI tasks.

If a feature requires schema changes:

state that clearly

keep migration focused

keep code changes aligned with the migration

15. UI / Design Rules (Impeccable Workflow)

For any task involving:

page redesign

layout changes

spacing changes

typography changes

visual hierarchy

CTA treatment

mobile adaptation

component visual cleanup

section rhythm

premium feel / polish

Codex must follow the Impeccable frontend-design workflow.

15.1 Required UI workflow

For page-level UI tasks, use this sequence:

Inspect

locate route entry

locate related components

locate where visible text is defined

identify current styling approach

identify shared layout dependencies

Audit
Evaluate:

hierarchy

spacing rhythm

typography

CTA clarity

consistency

responsiveness

visual noise

anti-patterns

Critique
State what is weak and what should improve.

Implement
Perform only the necessary page/component changes.

Normalize
Unify spacing, text scale, buttons, containers, section transitions, and responsive behavior.

Polish
Final light refinement only.
Do not overdesign.

15.2 UI hard rules

When improving UI:

do not change business logic unless the task explicitly requires it

do not change API contracts unless required

do not change route structure unless required

prefer improving existing components over creating unnecessary duplicates

avoid turning every section into nested cards

avoid generic AI-looking dashboard aesthetics when the page is meant to feel product-focused or creator-focused

avoid random decorative gradients that reduce clarity

avoid weak contrast

avoid overly dense mobile layouts

avoid inconsistent padding scales across sibling sections

avoid introducing new dependencies just for cosmetic tweaks unless truly justified

15.3 UI quality goals

Aim for:

intentional hierarchy

readable typography

clean spacing rhythm

clear CTA

stable container widths

visually coherent sections

responsive layouts that still feel deliberate on mobile

minimal but confident styling

15.4 During UI tasks, preserve architecture

A UI task is not permission to:

move business logic into components

move fetch calls into click handlers

duplicate route-level logic

create inconsistent text translation patterns

15.5 UI skill stack

For UI work, use this stack deliberately:

- Taste Skill: use for landing pages, portfolio-like presentation pages, gallery presentation, and visual upgrades. Treat it as aesthetic inspiration, not as permission to add unrelated motion libraries, random visual systems, or speculative page sections.
- Anthropic `frontend-design`: use for production-grade frontend implementation and anti-generic interface direction.
- `ui-ux-pro-max`: use for broad UX audits across buttons, forms, cards, responsive behavior, accessibility, layout, and motion.
- `hue design-system`: use only after the exact package/source is installed and reviewed. Until then, design-system rules in `docs/ai/ui-design-system.md` are authoritative.

Project rules override skill rules when they conflict. Never let a skill override auth, API, database, credit, provider, storage, i18n, type-safety, or route-structure constraints.

15.6 Responsive UI workflow

For UI tasks that affect responsive behavior, follow `docs/ai/responsive-workflow.md`, `docs/ai/ui-design-system.md`, and `docs/ai/mobile-qa-checklist.md`.

Required mobile-first checks:

- test 375px, 390px, 430px, 768px, 1024px, and 1440px
- avoid `height: 100vh`; prefer `min-h-dvh`, `min-h-svh`, or `h-dvh` when viewport height matters
- audit `h-screen`, `min-h-screen`, `fixed`, `absolute`, `overflow-hidden`, sticky bottom bars, modal/dialog/drawer containers, and gallery grids
- prompt inputs and bottom actions must remain reachable when the mobile keyboard changes the visual viewport
- use safe-area padding for bottom navigation, sticky action bars, and bottom sheets
- do not change API, database, auth, credits, providers, or generation logic during UI-only tasks

Default UI execution order:

- Audit first.
- Output problems with file paths, severity, priority, and proposed direction.
- Patch one page or component at a time.
- Normalize spacing, typography, buttons, containers, and responsive behavior.
- Run the relevant validation commands.
- Provide a concise QA checklist and any skipped validation.

16. i18n / Localization Rules

This project must support multilingual UI in a scalable way.

16.1 Supported locales

en

ja

zh

16.2 Default locale

en

16.3 All new user-facing text must be translation-ready

Do not introduce new hardcoded visible UI strings once i18n is active or being implemented.

This applies to:

button labels

headings

empty states

toasts

descriptions

field labels

helper text

tabs

nav items

error copy shown to users

16.4 Translation architecture

Use a single consistent i18n architecture for the app.

Do not mix:

scattered inline dictionaries

component-local hand-made translation objects

route-level ad-hoc string maps

multiple unrelated translation loading styles

Keep message organization predictable and scalable.

16.5 Locale route compatibility

All localization changes must remain compatible with:

/en/...

/ja/...

/zh/...

Do not introduce a second incompatible routing model.

16.6 Key naming

Translation keys should be:

stable

semantic

reusable

not excessively tied to layout structure

Prefer:

studio.title

studio.form.promptLabel

gallery.empty.description

Avoid:

page1.section2.blueButtonText

16.7 Reuse keys where meaning is shared

If multiple pages use the same meaning, prefer reusing shared keys rather than duplicating slightly different ones without reason.

16.8 No translation logic mixed with business logic

Translation retrieval should remain a presentation concern.
Business services should not depend on UI translation keys.

17. Hooks Rules
    17.1 Hooks own client-side interaction logic

Hooks may manage:

loading state

form interaction state

optimistic UI state if appropriate

local selection state

request invocation via API client

Hooks must not secretly absorb server-only business rules.

17.2 Keep hooks cohesive

Do not build giant hooks that manage unrelated concerns.

18. Component Rules
    18.1 Prefer composition

Prefer several small, readable components over one oversized all-purpose component.

18.2 Keep presentational components dumb

components/ui/ should be easy to reuse and easy to test visually.

18.3 Avoid component duplication

Before creating a new component:

check if an existing one can be extended

check if a small variant/prop solves the need

Do not create PrimaryButton2, FancyButton, StudioButtonNew style chaos.

19. Styling Rules
    19.1 Follow existing stack

Prefer:

Tailwind

shadcn/ui

existing utility patterns

existing design tokens / conventions

Do not introduce a second styling system.

19.2 Keep visual system consistent

Spacing, radius, border usage, text sizes, and layout containers should feel part of one system.

19.3 Avoid visual entropy

Do not add:

unnecessary shadows everywhere

multiple unrelated border styles

inconsistent radius tokens

random color choices

decorative effects that do not improve clarity

20. Accessibility Rules

All user-facing UI work should consider:

sufficient contrast

keyboard access

correct button/link semantics

readable form labels

disabled state clarity

focus visibility

Do not trade accessibility away for decoration.

21. Performance Rules
    21.1 Avoid unnecessary client components

Prefer server components unless client interactivity is needed.

21.2 Avoid unnecessary rerenders

Do not introduce prop churn or unstable inline structures if avoidable.

21.3 Keep bundle growth intentional

Do not add heavy dependencies lightly.

22. Error Handling Rules
    22.1 User-facing errors

Errors shown to users should be:

concise

understandable

safe

translation-ready

22.2 Internal errors

Preserve useful debug detail in logs where appropriate, but do not leak secrets.

22.3 Validation first

Prefer failing early with validation rather than allowing bad data deeper into the stack.

23. Testing / Validation Rules

For meaningful code changes, Codex should do as many of the following as are available and relevant:

run type checking

run lint

run tests if present

run build if relevant and feasible

summarize what was verified

If a command cannot be run, say so clearly.

Do not claim verification you did not perform.

23.1 Browser / Mobile QA Evidence Rules

When Codex performs browser QA, mobile QA, visual QA, or report-only testing, it must avoid screenshot-only conclusions.

Before reporting a page as blank, corrupted, crashed, or visually broken:

- capture objective browser evidence, such as `page.evaluate(() => document.body.innerText.length)`, visible DOM counts, screenshot evidence, and `pageerror` / console listeners
- state whether the issue is fixable in application code before assigning a bug category
- classify OS, browser chrome, font loading, network transients, local compile delays, or test-environment artifacts as environment issues, not product bugs

Before using a screenshot as final evidence for animated or loading states:

- wait for the page to settle with `waitForLoadState('networkidle')` when applicable
- add an extra stabilization wait, such as `waitForTimeout(1500)`
- prefer disabling or reducing motion in browser context, such as `prefersReducedMotion: 'reduce'`, when the animation itself is not under test

Severity must use objective user-impact standards:

- Critical: the user cannot complete a core task
- High: the issue blocks a main flow
- Medium: the flow can be completed, but the experience is poor or confusing
- Low: polish, clarity, or minor visual quality issues

A hook-order warning, console error, or transient browser error is not Critical by itself when the UI remains usable and the core task still works.

Before writing a QA issue, Codex must inspect the relevant source quickly. For example, grep component names, route files, and visible strings before claiming that an effect such as `HyperText` is corrupted UI rather than intentional decorative animation.

23.2 Computer Use Development / Testing / Debug Loop

When the user says any version of:

`实现这个功能，并按项目工作流跑 Computer Use 开发+测试+debug 闭环。不要只跑单测；必须真实打开页面完成主路径，失败就修，修完复测。`

Codex must treat this as a required end-to-end verifier, not as optional QA.

Codex must follow `docs/guides/codex-development-workflow.md` and include a `Computer Use Flow Check` in the task goal or execution plan.

Required loop:

```md
Implement slice -> Fast check -> Computer Use Flow check -> classify failure -> inspect source/logs -> patch -> rerun same Flow check -> report evidence
```

Rules:

- do not stop after unit tests, typecheck, or lint when the requested flow is UI-visible
- open the real target page with Computer Use or the appropriate browser tool
- complete the main user path with real clicks, typing, scrolling, selection, submission, and waiting where applicable
- capture objective evidence: URL, visible text/state, screenshot or app state, console/page errors, server/API logs when relevant
- if the flow fails, classify the failure as application bug or environment issue before fixing
- for application bugs, make the smallest scoped fix and rerun the same flow check
- if blocked by login, permissions, third-party services, missing secrets, CAPTCHA, or other environment constraints, stop and report a handoff instead of claiming success
- do not perform risky Computer Use actions without confirmation, including deleting data, creating API keys, changing account permissions, submitting external forms, uploading sensitive files, or triggering payments

24. Change Scope Rules
    24.1 Stay within task scope

Do not refactor unrelated files just because they look improvable.

24.2 Make the smallest correct change

Prefer minimal, coherent, architecture-respecting changes.

24.3 Explain cross-cutting changes

If a task requires touching multiple layers, explain why.

25. Git / Commit Discipline

When making grouped changes, keep them logically separable.

Prefer this split when relevant:

UI upgrade changes

i18n infrastructure changes

schema/migration changes

service logic changes

Do not mix unrelated categories into one chaotic patch unless the task truly demands it.

26. Current Known Directory Structure

Current high-level structure:

```text
src/
├── app/
│   ├── layout.tsx
│   ├── global-error.tsx
│   ├── [locale]/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── (auth)/sign-in/[[...sign-in]]/page.tsx
│   │   ├── (auth)/sign-up/[[...sign-up]]/page.tsx
│   │   └── (main)/
│   │       ├── layout.tsx
│   │       ├── studio/page.tsx
│   │       ├── gallery/page.tsx
│   │       ├── gallery/[id]/page.tsx
│   │       ├── profile/page.tsx
│   │       ├── u/[username]/page.tsx
│   │       ├── arena/page.tsx
│   │       ├── arena/history/page.tsx
│   │       ├── arena/leaderboard/page.tsx
│   │       ├── storyboard/page.tsx
│   │       └── storyboard/[id]/page.tsx
│   └── api/                       # 89 route.ts files
├── components/
│   ├── ui/                        # shadcn/Radix primitives
│   ├── business/                  # domain-aware UI orchestration
│   └── layout/                    # Navbar, MobileTabBar, providers
├── constants/
│   ├── models.ts                  # AI_MODELS + MODEL_OPTIONS
│   ├── providers.ts               # AI_ADAPTER_TYPES
│   ├── workflows.ts               # Balanced 8 workflow shell
│   ├── routes.ts
│   ├── config.ts
│   ├── execution.ts
│   └── domain option/config files
├── contexts/
│   ├── studio-context.tsx
│   └── api-keys-context.tsx
├── hooks/                         # 49 use-* hook files
│   ├── use-unified-generate.ts
│   ├── use-gallery.ts
│   ├── use-my-profile.ts
│   ├── use-arena.ts
│   ├── use-storyboard.ts
│   └── domain interaction hooks
├── i18n/
├── lib/
│   ├── api-client.ts
│   ├── api-client/
│   ├── api-route-factory.ts
│   ├── db.ts
│   ├── logger.ts
│   ├── with-retry.ts
│   ├── circuit-breaker.ts
│   ├── prompt-guard.ts
│   ├── llm-output-validator.ts
│   ├── signature-verifiers/
│   └── generated/prisma/
├── messages/                      # en / ja / zh next-intl messages
├── services/                      # 46 service files
│   ├── providers/                 # 8 provider adapters
│   ├── storage/r2.ts
│   ├── generation.service.ts
│   ├── studio-generate.service.ts
│   ├── generate-image.service.ts
│   ├── generate-video.service.ts
│   ├── generate-audio.service.ts
│   ├── video-pipeline.service.ts
│   ├── user.service.ts
│   └── domain services
├── test/
├── types/
│   └── index.ts
└── proxy.ts
```

This structure may evolve, but Codex should preserve the same architectural direction.

27. Current Missing / Planned Areas

The old MVP gaps `gallery/page.tsx`, `profile/page.tsx`, `ImageCard.tsx`, `GalleryGrid.tsx`, `MobileTabBar.tsx`, and `use-gallery.ts` are now implemented.

Known current incomplete or planned areas:

- service tests remain missing for 11 service files, including `studio-generate.service.ts`, `arena.service.ts`, `lora-training.service.ts`, `prompt-enhance.service.ts`, and several LLM / media helpers
- hook tests remain low coverage: 4 tested hook files out of 49 `use-*` hook files
- 25 API route files still lack direct `route.test.ts` coverage
- image-transform `background` / `garment` / `detail` dimensions are schema-reserved but not implemented
- LoRA training APIs and hooks exist, but `/studio` does not expose LoRA training as a first-class workflow
- long-video pipeline recovery semantics are not finalized
- requestCount / credits wording still needs semantic cleanup before monetization

When implementing these, follow all layering, UI, and i18n rules in this file.

28. Current Development Status

The project is beyond the early MVP stage.

Completed or shipped:

- multi-provider image generation
- video generation and long-video pipeline foundation
- audio generation
- persistent R2 storage
- Clerk auth and webhook sync
- BYOK API key management
- free-tier / usage ledger infrastructure
- protected routes and server-owned auth checks
- gallery, generation detail page, profile, creator profile, arena, storyboard, collections, follows, and likes
- workflow-first Studio shell with Balanced 8 workflows

Still in progress:

- generation pipeline unification across image / video / audio
- long-running server-owned execution beyond the current worker-covered slice
- service and hook test coverage expansion
- UI loading/error boundary consistency on nested pages
- production monetization semantics for credits vs requestCount

29. Data Model Snapshot

Primary Prisma models currently include:

- `User`: Clerk-linked account, public profile fields, request/credit state, and relations
- `UserApiKey`: encrypted BYOK provider credentials
- `Generation`: generated image/video/audio metadata and archive references
- `GenerationJob`: durable async generation job state
- `ApiUsageLedger`: request usage and accounting entries
- `ArenaMatch` / `ArenaEntry`: model comparison and voting
- `CharacterCard` / `GenerationCharacterCard`: character recipe assets and generation links
- `BackgroundCard` / `StyleCard`: reusable prompt card assets
- `UserLike` / `UserFollow`: social relationships
- `Collection` / `CollectionItem`: user-created galleries
- `VideoPipeline` / `VideoPipelineClip`: long-video pipeline state

Do not assume this snapshot authorizes schema changes.
It is documentation, not permission for casual DB drift.

30. Model Catalog Snapshot

The source of truth is always `src/constants/models.ts`. Current `MODEL_OPTIONS` entries:

| Model ID                         | Output | Provider    | Credits | Status    |
| -------------------------------- | ------ | ----------- | ------- | --------- |
| `gpt-image-2`                    | image  | OpenAI      | 3       | available |
| `gemini-3-pro-image-preview`     | image  | Gemini      | 3       | available |
| `flux-2-pro`                     | image  | FAL         | 2       | available |
| `seedream-4.5`                   | image  | FAL         | 2       | available |
| `seedream-5.0-lite`              | image  | VolcEngine  | 2       | available |
| `seedream-4.0`                   | image  | VolcEngine  | 2       | available |
| `seedream-3.0`                   | image  | VolcEngine  | 1       | retired   |
| `ideogram-3`                     | image  | FAL         | 2       | available |
| `recraft-v3`                     | image  | FAL         | 2       | retired   |
| `gemini-3.1-flash-image-preview` | image  | Gemini      | 2       | available |
| `flux-2-dev`                     | image  | FAL         | 1       | available |
| `flux-2-schnell`                 | image  | FAL         | 1       | available |
| `flux-lora`                      | image  | FAL         | 1       | available |
| `illustrious-xl`                 | image  | Replicate   | 2       | available |
| `sd-3.5-large`                   | image  | FAL         | 1       | available |
| `animagine-xl-4.0`               | image  | HuggingFace | 1       | available |
| `nai-diffusion-4-5-full`         | image  | NovelAI     | 2       | available |
| `nai-diffusion-4-5-curated`      | image  | NovelAI     | 2       | available |
| `nai-diffusion-4-full`           | image  | NovelAI     | 1       | available |
| `nai-diffusion-3`                | image  | NovelAI     | 1       | retired   |
| `sdxl`                           | image  | HuggingFace | 1       | available |
| `playground-v2.5`                | image  | HuggingFace | 1       | retired   |
| `gemini-2.5-flash-image`         | image  | Gemini      | 1       | retired   |
| `flux-2-max`                     | image  | FAL         | 3       | available |
| `recraft-v4-pro`                 | image  | FAL         | 2       | available |
| `flux-kontext-pro`               | image  | FAL         | 2       | available |
| `flux-kontext-max`               | image  | FAL         | 3       | available |
| `kling-v3-pro`                   | video  | FAL         | 6       | available |
| `veo-3.1`                        | video  | FAL         | 8       | available |
| `seedance-2.0`                   | video  | FAL         | 6       | available |
| `seedance-2.0-fast`              | video  | FAL         | 4       | available |
| `seedance-2.0-volc`              | video  | VolcEngine  | 5       | available |
| `seedance-2.0-fast-volc`         | video  | VolcEngine  | 3       | available |
| `seedance-pro`                   | video  | FAL         | 4       | retired   |
| `seedance-1.5-pro`               | video  | VolcEngine  | 5       | available |
| `seedance-1.0-pro`               | video  | VolcEngine  | 4       | retired   |
| `minimax-video`                  | video  | FAL         | 3       | available |
| `luma-ray-2`                     | video  | FAL         | 4       | available |
| `pika-v2.5`                      | video  | FAL         | 3       | available |
| `kling-video`                    | video  | FAL         | 5       | available |
| `runway-gen3`                    | video  | FAL         | 5       | available |
| `wan-video`                      | video  | FAL         | 2       | available |
| `hunyuan-video`                  | video  | FAL         | 3       | available |
| `fish-audio-s2-pro`              | audio  | Fish Audio  | 2       | available |
| `fal-f5-tts`                     | audio  | FAL         | 1       | available |

Legacy aliases:

- `veo-3` → `veo-3.1`
- `pika-v2.2` → `pika-v2.5`

Always confirm existing constants before editing model-related logic.

31. Security Rules
    31.1 Environment variables

NEXT*PUBLIC*\* may be used only for values that are safe for the browser, such as:

Clerk publishable key

public CDN domain

public app URL

Never expose:

AI API keys

DB credentials

storage secrets

private service credentials

31.2 Sensitive operations

Sensitive operations must happen server-side:

credits mutation

ownership checks

persistence of generation records

storage finalization

31.3 Do not log secrets

Do not print secrets in logs, errors, or debug output.

32. When Codex Is Uncertain

When uncertain, follow this order:

check src/constants/

check src/types/

check src/services/

check src/hooks/

check src/components/ui/

check existing route/layout patterns

check i18n structure if visible text is involved

If still uncertain:

preserve the current architecture

prefer the smallest correct change

prefer schema-first typing

do not use any

do not hardcode user-facing copy

do not invent a second architecture pattern

32.1 Dev server ownership rule

For this project, the user owns local dev server startup and log inspection.

Codex must not run:

npm run dev

npx next dev

other equivalent local app startup commands for interactive development

When page inspection or local interaction requires the app to be running:

ask the user to start it manually

ask for the local URL when needed

use the user-run server for inspection instead of attempting startup locally

If the user-run startup fails:

do not retry startup on Codex's side

ask the user to inspect or share the relevant log output

32.2 Required context loading order

For non-trivial tasks, Codex must build context in this order:

1. `AGENTS.md` and relevant `docs/guides/*.md`
2. the closest current-state map documents:
   - `docs/plans/ui/02-現狀映射.md`
   - `docs/plans/feature/02-現狀映射.md`
   - `docs/plans/qa/functional/02-現狀映射.md`
   - `docs/plans/qa/ui/02-現狀映射.md`
   - `docs/progress/current-status-audit.md`
   - `docs/guides/ai-context.md`
   - for future-facing roadmap work only: the relevant `docs/plans/roadmap/**` documents
3. relevant `docs/plans/...`
4. relevant `src/**/CLAUDE.md`
5. target code and test files

For this repository, `docs/plans/ui/`, `docs/plans/feature/`, `docs/plans/qa/functional/`, and `docs/plans/qa/ui/` are closer to the current codebase than most historical planning docs. `docs/plans/roadmap/` is a future-planning layer, not a current-state source of truth.

When they conflict with older roadmap or redesign notes, prefer the mapping documents unless direct code inspection proves they are stale.

32.3 First-project read vs later chats

When Codex is first taking over the project, it should do one broader orientation pass across:

- `AGENTS.md`
- `docs/guides/*.md`
- `01/02/03/04` README + 現狀映射 documents
- `docs/plans/roadmap/**` only if the task is roadmap, future capability design, or sequencing work
- the highest-risk core files:
  - `src/types/index.ts`
  - `src/contexts/studio-context.tsx`
  - `src/hooks/use-unified-generate.ts`
  - `src/lib/api-route-factory.ts`
  - `src/constants/models.ts`

After that first orientation, new chats must not re-read the whole repository by default.

They should read:

- the laws
- the relevant maps
- the task slice

Only re-run a broader repo read when:

- the user explicitly asks for a global review
- the map documents have become stale
- the architecture has materially changed
- the task is a cross-cutting refactor

  32.4 Required task packet before substantial work

Before non-trivial implementation or review work, Codex should establish a task packet containing:

- goal
- non-goals
- documents to read first
- allowed file scope
- validation commands
- definition of done

If the task crosses layers, the packet should also state:

- which layers are changing
- which `01/02/03/04` entries are affected

  32.5 Required development workflow

For meaningful work, Codex should follow this sequence:

1. classify the task domain
2. read the relevant map documents
3. inspect the target code slice
4. create or update the plan before implementation
5. implement with minimal architectural drift
6. self-review the diff
7. hand the result to `探索` for independent review when feasible
8. run validation
9. update maps, plans, or guides if the change altered the documented reality

Implementation must not be treated as final review.

For UI work, read `01-UI` together with `04-UI測試`.

For backend/business work, read `02-功能` together with `03-功能測試`.

32.6 Required project stability gates

Codex should not judge the project as "stable" based only on ad hoc manual inspection.

Use these gates:

- type/static gates:
  - `npx tsc --noEmit`
  - `npm run lint`
- change-related tests:
  - relevant unit, route, hook, or component tests
- pre-merge gates for meaningful changes:
  - `npx vitest run`
  - `npm run build`
- smoke paths:
  - landing
  - studio auth / generate
  - gallery
  - mobile
  - i18n
- health endpoints:
  - `/api/health`
  - `/api/health/providers`
- documentation freshness:
  - `01/02/03/04` still match the code
  - plans are not silently stale

If code, maps, and rules are out of sync, the project should not be described as fully stable.

32.7 Detailed workflow guide

Codex must follow:

- `docs/guides/codex-development-workflow.md`

for the detailed rules covering context loading, planning, implementation flow, independent review, and stability judgment.

33. Required Behavior for Page Upgrade Tasks

When the task is "upgrade page UI", Codex must:

identify the route entry

identify related components

identify where visible strings come from

audit the current UI

propose or infer a minimal coherent rewrite

implement only necessary changes

normalize and polish

run validation if possible

summarize changed files and reasons

Do not jump straight to a full rewrite without inspection.

34. Required Behavior for i18n Tasks

When the task is "add or improve localization", Codex must:

inspect current locale routing

inspect current message organization if any

identify visible strings in target pages/components

establish or extend a single consistent i18n pattern

keep /en, /ja, /zh compatible

make user-facing strings translation-ready

avoid mixing translation logic into service/business logic

summarize which files now own translations

35. Required Output Discipline

After implementing a task, Codex should summarize:

what files changed

why they changed

what architectural choices were preserved

what was verified

what remains intentionally unchanged

Do not claim more than was actually done.

36. Final Principle

This codebase should grow like a clean city, not like a pile of cables.

Every change should make the project:

more consistent

more predictable

more type-safe

more translation-ready

more maintainable

more visually intentional

If a change makes the codebase noisier, less predictable, or more ad-hoc, it is probably the wrong change.

---

# Appendix A. Codex Thread Operating Model

This project should maintain four pinned Codex threads with these exact names:

- `规范`
- `探索`
- `前端`
- `后端`

These threads are not interchangeable. They define a durable operating model for the repository.

## A.1 `规范`

Purpose:

- produce durable project rules, workflows, and AI meta-coding guidance
- write those documents into `docs/guides/`
- keep `AGENTS.md` updated with the guide index in Appendix B

Rules:

- only write documents that have ongoing governing value
- prefer stable rules and repeatable workflows over temporary task notes
- when execution work reveals a reusable constraint, fold it back into `docs/guides/`

## A.2 `探索`

Purpose:

- understand this repository and external repositories
- break large tasks into executable plans
- perform independent review on completed implementation work
- write exploration output into `docs/plans/`

Rules:

- use this thread for investigation, decomposition, comparison, architecture reading, and post-implementation review
- keep implementation out unless a tiny probe is required to confirm understanding
- when a plan becomes stale, update the plan document instead of letting execution drift silently
- when reviewing implementation, read the relevant `03-功能測試` and/or `04-UI測試` documents as the checklist source instead of relying only on ad hoc intuition

## A.3 `前端`

Purpose:

- execute UI, layout, interaction, responsive, and localization-facing implementation work

Rules:

- every code modification in this thread must use plan mode
- read the relevant plan in `docs/plans/` before substantial implementation when one exists
- if durable frontend rules emerge, feed them back into `规范`
- if the implementation changes task shape, feed that back into `探索`
- after meaningful implementation, hand the resulting diff and the relevant `01-UI` / `04-UI測試` entries back to `探索` for independent review when feasible

## A.4 `后端`

Purpose:

- execute service, API, auth, storage, database, and server-side implementation work

Rules:

- every code modification in this thread must use plan mode
- read the relevant plan in `docs/plans/` before substantial implementation when one exists
- if durable backend rules emerge, feed them back into `规范`
- if the implementation changes task shape, feed that back into `探索`
- after meaningful implementation, hand the resulting diff and the relevant `02-功能` / `03-功能測試` entries back to `探索` for independent review when feasible

## A.5 Cross-Layer Work

Some changes naturally span frontend and backend.

When that happens:

- choose either `前端` or `后端` as the execution thread
- keep the plan explicit about which layers are being changed
- do not duplicate the same implementation across both execution threads

## A.6 Feedback Loop

The intended operating loop is:

`规范` defines durable laws -> `探索` turns uncertainty into plans -> `前端` or `后端` executes in plan mode -> new durable insights flow back into `规范` and `探索`

---

# Appendix B. Guide Index

Every durable rule document created under `docs/guides/` must be indexed here.

- `docs/guides/README.md` — guide directory purpose, update rules, and current catalog
- `docs/guides/codex-thread-operating-model.md` — pinned thread responsibilities, `规范`-thread intake and patch-first discipline, output locations, and feedback loop
- `docs/guides/codex-development-workflow.md` — context loading order, task packets, plan/implement/review flow, and stability gates
- `docs/guides/claude-code-planning-workflow.md` — Claude Code planning surface: role boundaries, path lock, task packet handoff, diff review, and map writeback
- `docs/guides/plan-synchronization-workflow.md` — plan status blocks, delta logs, and pre/post implementation sync rules that keep plans aligned with code

---

# Appendix C. Claude Code Planning Role

This project runs Claude Code as a dedicated planning surface on top of Codex's four execution threads.

## C.1 Purpose

Claude Code is not a parallel code author. It exists to:

- produce and maintain durable rules (`规范` output) under `docs/guides/**`
- decompose tasks into executable plans and task packets (`探索` output) under `docs/plans/**`
- review Codex diffs against the task packet and the `01/02/03/04` maps
- write completed work back into `01-UI` / `02-功能` / `03-功能測試` / `04-UI測試` so the maps stay true

## C.2 Hard Boundaries

Claude Code must not modify code. The following paths are locked via `.claude/settings.local.json` deny rules:

- `src/**`, `prisma/**`, `scripts/**`, `e2e/**`, `apps/**`, `components/**`, `public/**`, `.github/workflows/**`, `.husky/**`
- top-level build / dependency config: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig*.json`, `tailwind.config.ts`, `eslint.config.mjs`, `playwright.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `components.json`, `middleware.ts`, `instrumentation*.ts`, `sentry.*.config.ts`

Claude Code is allowed to write:

- `docs/**`
- `docs/plans/ui/**`, `docs/plans/feature/**`, `docs/plans/qa/functional/**`, `docs/plans/qa/ui/**`, `docs/plans/roadmap/**`
- `AGENTS.md`, `claude.md`, `CLAUDE.md`, top-level `README*.md`, `WBS-*.md`
- `.claude/settings.local.json`

Read-only access to `src/**` is allowed and expected — Claude Code must read the code to plan accurately. Only mutation is blocked.

## C.3 Task Packet Handoff

Every non-trivial change starts with a task packet produced by Claude Code, attached to the tail of a `docs/plans/**` document. The packet template is specified in `docs/guides/claude-code-planning-workflow.md` and must cover: Goal, Non-goals, map anchors (01/02/03/04), layer, Read first, allowed file scope, forbidden files, validation commands, and definition of done.

Codex then executes the packet in plan mode on `前端` or `后端`, without Claude Code intervention.

## C.4 Review Loop

Once Codex signals completion, Claude Code pulls `git diff` (read-only) and runs an independent review focused on:

1. scope compliance (no out-of-packet edits)
2. architecture and layer discipline
3. type safety and Zod boundaries
4. auth / ownership / credits / provider fallback integrity
5. i18n completeness
6. test coverage
7. map drift in `01/02/03/04`

The review result is written back to the same plan document under a `Review & 回流` section as one of: `Pass`, `Pass with follow-up`, or `Needs rework`.

## C.5 Map Writeback

After a `Pass`, Claude Code updates the affected `0X-現狀映射.md` entries and any related work-package or implementation-checklist documents. A task is not considered complete until the maps reflect the new reality, regardless of CI status.

## C.6 When Claude Code Does Not Engage

Trivial changes bypass Claude Code entirely. These go directly to Codex:

- typos and single-line copy tweaks
- changes under ~10 lines that do not cross layers or touch high-risk files
- pure renames, import sorting, prettier cleanup
- execution steps inside an existing task packet Codex is already working through

For anything else, default to the Claude Code planning line — a redundant packet is cheaper than a silent drift.

## C.7 Plan Synchronization

Claude Code and Codex must not treat old plans as current by default. For any
non-trivial task that depends on `docs/plans/**`, follow
`docs/guides/plan-synchronization-workflow.md`.

Required behavior:

- Planning work adds or updates a `Plan Status` block when a plan is active.
- Before implementation, compare the plan's last verified commit with current code in the listed code areas.
- If relevant code changed, reconcile the delta, mark the plan `stale`, or request a refreshed task packet.
- After meaningful implementation, the executor reports one of: `No related plan exists`, `Plan still matches`, `Plan delta should be updated`, `Plan marked stale`, or `Plan completed`.
- Map writeback appends a short delta log instead of rewriting the whole plan unless the plan is genuinely superseded.
