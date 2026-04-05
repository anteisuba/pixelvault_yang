# AI Developer Quick Reference

> This file helps AI coding assistants (Claude, Copilot, Cursor) understand the project fast.
> Keep this under 200 lines — it's the "map", not the "territory".

## What Is This?

PixelVault — multi-model AI image/video generation + permanent archive.
Users bring their own API keys (BYOK) or use platform credits to generate images across 7 AI providers.

## Tech Stack (one line each)

- **Framework**: Next.js 16 (App Router + Turbopack) — `src/app/`
- **Language**: TypeScript strict — no `any`, Zod for runtime types
- **Auth**: Clerk — `auth()` in every API route
- **DB**: Prisma 7 + PostgreSQL (Neon) — `prisma/schema.prisma`
- **Storage**: Cloudflare R2 (S3-compatible) — `src/services/storage/r2.ts`
- **i18n**: next-intl — `src/messages/{en,ja,zh}.json`
- **UI**: shadcn/ui + Tailwind + Radix

## Data Flow

```
User → API Route → Service → Provider Adapter → AI Provider (external)
                      ↓
                   Prisma DB
                      ↓
                   R2 Storage
```

## Directory Map

```
src/
├── app/api/          # API routes (auth → validate → delegate)
├── components/
│   ├── ui/           # Stateless shadcn primitives
│   ├── business/     # Stateful (uses hooks, no direct API)
│   └── layout/       # Navbar, MobileTabBar
├── constants/        # ★ CHECK FIRST — all config, enums, routes
├── hooks/            # Client state + API calls via api-client.ts
├── lib/              # Utilities (see below)
├── messages/         # i18n JSON (en/ja/zh — keep in sync!)
├── services/         # ★ SERVER ONLY — DB, R2, AI providers
│   └── providers/    # 7 AI adapter implementations
└── types/            # Zod schemas → TypeScript types
```

## Key Lib Utilities

| File | Purpose |
|------|---------|
| `lib/logger.ts` | Structured logging — use instead of console.log |
| `lib/with-retry.ts` | Exponential backoff for external calls |
| `lib/circuit-breaker.ts` | Per-provider circuit breaker |
| `lib/prompt-guard.ts` | Prompt validation + injection detection |
| `lib/llm-output-validator.ts` | LLM output quality checks |
| `lib/invariants.ts` | Runtime assertions |
| `lib/rate-limit.ts` | In-memory rate limiter |
| `lib/api-client.ts` | Client-side API caller (components use this) |
| `lib/db.ts` | Prisma client instance |
| `lib/crypto.ts` | AES-256-GCM encryption for API keys |

## AI Provider System

7 adapters, all in `src/services/providers/`:

| Adapter | Models | Capabilities |
|---------|--------|-------------|
| huggingface | SDXL, Animagine, SD 3.5 | Image |
| gemini | Gemini Flash/Pro | Image |
| openai | GPT Image 1.5 | Image |
| fal | FLUX variants, Ideogram, Recraft, Kling, MiniMax, etc | Image + Video |
| replicate | Illustrious XL | Image + LoRA |
| novelai | NAI Diffusion 3/4/4.5 | Image |
| volcengine | Seedream, Seedance | Image + Video |

**Adding a new model checklist:**
1. Add to `AI_MODELS` enum in `src/constants/models.ts`
2. Add model config (adapter, family, cost tier)
3. Update i18n: `src/messages/{en,ja,zh}.json` (all 3!)
4. Test with health check endpoint

## Card/Recipe System

Composable prompt system with 4 card types:
- **Character Card** — who (appearance, traits, LoRA refs)
- **Background Card** — where (environment, setting)
- **Style Card** — how (art style, medium)
- **Model Card** — which AI model + adapter

Recipe compilation: cards → LLM fusion → compiled prompt → AI generation
Fallback: if LLM fusion fails → template concatenation

## Generation Pipeline

```
1. Validate (Zod) → 2. Resolve route (model + adapter + API key)
→ 3. Compile recipe (if cards used) → 4. Validate prompt (prompt-guard)
→ 5. Generate (with-retry + circuit-breaker) → 6. Upload to R2
→ 7. Save to DB → 8. Track usage
```

## Database Key Models

| Model | Purpose |
|-------|---------|
| Generation | Generated images/videos |
| GenerationJob | Tracks generation status (QUEUED→RUNNING→COMPLETED/FAILED) |
| ApiUsageLedger | Usage tracking per request |
| CharacterCard | Character definitions with LoRA |
| BackgroundCard, StyleCard, ModelCard | Recipe components |
| UserApiKey | Encrypted BYOK API keys |
| ArenaMatch, ArenaEntry | Side-by-side model comparison |
| VideoPipeline, VideoPipelineClip | Long video generation |
| Collection | User-created galleries |

## Hard Rules (NEVER violate)

1. No `any` — Zod + `z.infer<>`
2. No fetch in components — use `lib/api-client.ts`
3. No business logic in API routes — delegate to services
4. Services must `import 'server-only'`
5. No magic values — use `src/constants/`
6. No console.log in services — use `lib/logger.ts`
7. External calls must use `withRetry()`
8. LLM outputs must be validated before use
9. i18n: update ALL 3 locale files
10. Background color: `#faf9f5` (never `#fff`)
