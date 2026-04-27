# AGENTS.md — Personal AI Gallery Project Rules

This file defines the project-level operating rules for Codex in this repository.
Codex must read and follow these instructions for every new task in this project.

This file is authoritative unless the user explicitly overrides a rule for a specific task.

---

# 0. Core Role

You are working on **Personal AI Gallery**.

This is a production-oriented web application for:

- multi-model AI image generation
- permanent archive/storage
- user authentication
- credit-based generation
- future public gallery and profile pages
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

## Agent Role Division

This repository operates with two agent surfaces. They are not interchangeable.

- **Codex** is the execution surface. It owns `规范` / `探索` / `前端` / `后端` threads, writes and reviews code under `src/**`, `prisma/**`, `scripts/**`, `e2e/**`, and their peers. See Appendix A.
- **Claude Code** is the planning surface. It reads code but does not modify it. It produces task packets, long-term rules, plan documents, and map writebacks under `docs/guides/**`, `docs/plans/**`, `01/02/03/04/05` directories, and `AGENTS.md`. See Appendix C.

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

- **Framework**: Next.js 16
- **Routing**: App Router
- **Build**: Turbopack
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Auth**: Clerk
- **Database**: PostgreSQL (Neon)
- **ORM**: Prisma 7
- **Prisma Adapter**: PrismaPg Driver Adapter
- **Storage**: Cloudflare R2
- **AI Providers**:
  - HuggingFace Inference API
  - Google Gemini API

## Supported Models

- Stable Diffusion XL
- Animagine XL 4.0
- Gemini 3.1 Flash Image

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
    src/
    ├── app/
    │ ├── layout.tsx
    │ ├── page.tsx
    │ ├── [locale]/
    │ │ ├── layout.tsx
    │ │ ├── (auth)/
    │ │ │ ├── sign-in/[[...sign-in]]/page.tsx
    │ │ │ └── sign-up/[[...sign-up]]/page.tsx
    │ │ └── (main)/
    │ │ ├── layout.tsx
    │ │ └── studio/page.tsx
    │ └── api/
    │ ├── generate/route.ts
    │ ├── credits/route.ts
    │ └── webhooks/clerk/route.ts
    │
    ├── components/
    │ ├── ui/
    │ ├── business/
    │ │ ├── GenerateForm.tsx
    │ │ └── ModelSelector.tsx
    │ └── layout/
    │ └── Navbar.tsx
    │
    ├── hooks/
    │ ├── use-generate.ts
    │ └── use-credits.ts
    │
    ├── services/
    │ ├── generation.service.ts
    │ ├── user.service.ts
    │ └── storage/
    │ └── r2.ts
    │
    ├── lib/
    │ ├── db.ts
    │ ├── api-client.ts
    │ ├── utils.ts
    │ └── generated/prisma/
    │
    ├── constants/
    │ ├── models.ts
    │ ├── routes.ts
    │ └── config.ts
    │
    ├── types/
    │ └── index.ts
    │
    └── middleware.ts

This structure may evolve, but Codex should preserve the same architectural direction.

27. Current Missing / Planned Areas

The following are known planned or incomplete areas:

gallery/page.tsx

profile/page.tsx

ImageCard.tsx

GalleryGrid.tsx

MobileTabBar.tsx

use-gallery.ts

When implementing these, follow all layering, UI, and i18n rules in this file.

28. Current Development Status
    Phase 1: MVP core generation

Completed

Phase 2: persistence (Prisma + R2)

Completed

Phase 3: user system + credits

Mostly completed

Clerk sign-in/sign-up

Clerk webhook sync

credits logic on server

route protection

credits API

Still incomplete:

gallery page

profile page

Phase 4: UI refinement + gallery + deployment

In progress

29. Data Model Snapshot
    User

id (UUID)

clerkId

email

credits

generations[]

Generation

id (UUID)

outputType

status

url

storageKey

mimeType

width

height

duration

prompt

negativePrompt

model

provider

creditsCost

isPublic

userId

Do not assume this snapshot authorizes schema changes.
It is documentation, not permission for casual DB drift.

30. Model Catalog Snapshot
    Model ID Name Credits Provider
    sdxl Stable Diffusion XL 1 HuggingFace
    animagine-xl-4.0 Animagine XL 4.0 1 HuggingFace
    gemini-3.1-flash-image-preview Gemini 3.1 Flash Image 2 Google

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
