CLAUDE.md — Personal AI Gallery Project Rules

## Project

Personal AI Gallery (PixelVault) — multi-model AI image generation + permanent archive platform.

**Stack**: Next.js 16 (App Router + Turbopack) · TypeScript · Clerk · Prisma 7 + PostgreSQL (Neon) · Cloudflare R2 · next-intl (en/ja/zh)
**AI Providers**: HuggingFace · Google Gemini · OpenAI

## Key Entry Points

| Path | Role |
|------|------|
| `src/constants/` | All config, enums, routes — **check here first** |
| `src/types/index.ts` | Zod schemas + TypeScript types |
| `src/services/` | Server-only business logic (DB, R2, AI) |
| `src/hooks/` | Client-side state management |
| `src/components/business/` | Stateful UI (uses hooks, no direct API) |
| `src/components/ui/` | Stateless shadcn primitives |
| `src/app/api/` | API routes (auth → validate → delegate) |
| `src/messages/` | i18n JSON (en/ja/zh — all three must stay in sync) |

## Hard Rules

1. **No magic values** — use `src/constants/`, never hardcode strings/numbers
2. **No `any`** — define types via Zod schemas, infer with `z.infer<typeof schema>`
3. **No fetch in components** — all API calls go through `src/lib/api-client.ts`
4. **API routes do 3 things only** — auth check → Zod validate → call service
5. **No Tailwind arbitrary values** — extend `tailwind.config.ts` instead
6. **Feature dev order** — constants → types → services → hooks → components
7. **Import order** — React/Next → third-party → internal constants/types → components/hooks → styles

## Design Language

See `docs/frontend/design-system.md` for full spec. Key constraints:

- Background: `#faf9f5` (米白, never `#fff`) · Text: `#141413` · Accent: `#d97757`
- Fonts: Space Grotesk (headings) + Lora (body) — must be sans + serif pair
- Motion: fade-in + translate-up only, 300–600ms ease-out
- **Forbidden**: blue-purple gradients, neon, heavy shadows, pure white bg, generic AI aesthetic

## Security

- `NEXT_PUBLIC_` only for: Clerk public key, CDN domain, App URL
- API routes must `auth()` from Clerk before processing
- Credit deduction logic must run server-side only

## Docs

| File | Content |
|------|---------|
| `docs/architecture/system-architecture.md` | Directory structure, tech stack, data flow |
| `docs/frontend/design-system.md` | Colors, typography, layout, motion rules |
| `docs/database/database.md` | Prisma models, relations, migration workflow |
| `docs/frontend/components.md` | Components, hooks & capability system API reference |
| `docs/progress/phases.md` | Development phase tracking |
| `docs/product/roadmap.md` | Future features and priorities |
| `docs/plans/product/unified-development-plan.md` | Unified 3-track dev plan (A: fixes, B: Studio redesign, C: features) |
| `docs/plans/product/development-plan-legacy.md` | Original S1-S9 implementation specs (reference, merged into unified plan) |

## Component Tiers

- `components/ui/` — No state, no business logic, pure display
- `components/business/` — May use hooks, must NOT call API directly
- `components/layout/` — Page chrome (Navbar, MobileTabBar)

## Naming

| Type | Convention | Example |
|------|-----------|---------|
| Component | PascalCase | `ImageCard.tsx` |
| Hook | camelCase + `use` | `useGenerateImage.ts` |
| Service | camelCase + `Service` | `generation.service.ts` |
| Constant | SCREAMING_SNAKE | `AI_MODELS`, `ROUTES` |
| Type/Interface | PascalCase | `GenerateRequest` |

## Resilience & Quality Utilities

| Utility | Path | When to use |
|---------|------|-------------|
| Logger | `src/lib/logger.ts` | ALL logging — never use `console.log` in services |
| Retry | `src/lib/with-retry.ts` | Wrap ALL external API calls (AI providers, R2) |
| Circuit Breaker | `src/lib/circuit-breaker.ts` | Per-provider protection against cascading failures |
| Prompt Guard | `src/lib/prompt-guard.ts` | Validate user prompts before sending to AI |
| LLM Validator | `src/lib/llm-output-validator.ts` | Validate LLM outputs (prompt enhance, recipe fusion) |
| Invariants | `src/lib/invariants.ts` | Runtime assertions for programmer errors |

## Common Pitfalls

1. **Adding a model** — must update: `AI_MODELS` enum + model config + i18n (3 files) + provider adapter
2. **Service files** — must start with `import 'server-only'`
3. **Prompt length** — always validate with `prompt-guard.ts` before AI calls
4. **LLM outputs** — always validate with `llm-output-validator.ts` before using
5. **External calls** — always wrap with `withRetry()` from `with-retry.ts`
6. **Zod in routes** — use `.safeParse()` not `.parse()` (latter throws unhandled)

## When Unsure

1. Check `src/constants/` for existing variables
2. Reuse `src/components/ui/` before creating new primitives
3. Follow: Service → Hook → UI order
4. Use Zod for types, never `as` assertions
