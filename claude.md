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

See `docs/design-system.md` for full spec. Key constraints:

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
| `docs/architecture.md` | Directory structure, tech stack, data flow |
| `docs/design-system.md` | Colors, typography, layout, motion rules |
| `docs/database.md` | Prisma models, relations, migration workflow |
| `docs/components.md` | Components, hooks & capability system API reference |
| `docs/phases.md` | Development phase tracking |
| `docs/roadmap.md` | Future features and priorities |

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

## When Unsure

1. Check `src/constants/` for existing variables
2. Reuse `src/components/ui/` before creating new primitives
3. Follow: Service → Hook → UI order
4. Use Zod for types, never `as` assertions
