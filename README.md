**English** | [日本語](README.ja.md) | [中文](README.zh.md)

# PixelVault — Personal AI Gallery

A multi-model AI image & video generation platform with permanent archive, blind arena voting, and storyboard creation.

**Live Demo:** [https://pixelvault-seven.vercel.app/](https://pixelvault-seven.vercel.app/)

---

## Features

- **Multi-model AI generation** — 11 image models + 10 video models across 6 providers
- **Arena (blind voting)** — Compare outputs side-by-side with ELO ranking system
- **Storyboard** — AI-generated comic-style narrative sequences
- **Gallery** — Public feed with search, filter, and infinite scroll
- **Profile** — Personal library with stats, hard-delete with R2 cleanup
- **Prompt enhancement** — LLM-powered prompt improvement (OpenAI / Gemini / DeepSeek)
- **Reverse engineering** — Analyze existing images to extract generation parameters
- **BYOK (Bring Your Own Key)** — Encrypted API key management for premium models
- **Permanent storage** — All generations stored on Cloudflare R2
- **Credit system** — Free credits for new users; per-model cost tiers
- **Multilingual** — English, Japanese, Chinese (`/en`, `/ja`, `/zh`)
- **Mobile-first** — Responsive layout with bottom tab navigation

---

## AI Models

### Image Models

| Model | Provider | Tier | Credits |
|-------|----------|------|---------|
| GPT-Image 1.5 | OpenAI | Premium | 3 |
| Gemini Pro Image | Google | Premium | 2 |
| FLUX 2 Pro | Fal | Premium | 2 |
| Seedream 4.5 | Replicate | Premium | 2 |
| Ideogram 3 | Replicate | Standard | 2 |
| Recraft V3 | Replicate | Standard | 2 |
| Gemini Flash | Google | Standard | 1 |
| FLUX 2 Dev | Fal | Standard | 1 |
| FLUX 2 Schnell | Fal | Budget | 1 |
| Animagine XL 4.0 | HuggingFace | Budget | 1 |
| Stable Diffusion XL | HuggingFace | Budget | 1 |

### Video Models

| Model | Provider | Tier | Credits |
|-------|----------|------|---------|
| Kling V3 Pro | Fal | Premium | 5 |
| Veo 3 | Google | Premium | 5 |
| Sora 2 | OpenAI | Premium | 5 |
| Seedance Pro | Replicate | Premium | 4 |
| MiniMax Hailuo | Fal | Standard | 3 |
| Luma Ray 2 | Fal | Standard | 3 |
| Pika 2.2 | Replicate | Standard | 3 |
| Kling V2 | Fal | Budget | 2 |
| Wan 2.2 | Fal | Budget | 2 |
| HunyuanVideo | HuggingFace | Budget | 2 |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router + Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | Clerk |
| Database | PostgreSQL (Neon) via Prisma 7 |
| Storage | Cloudflare R2 |
| AI Providers | HuggingFace, Google Gemini, OpenAI, Fal, Replicate |
| Validation | Zod |
| Testing | Vitest (97 tests) |
| Deployment | Vercel |

---

## Project Structure

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (auth)/              # sign-in, sign-up
│   │   └── (main)/
│   │       ├── studio/          # Image & video generation
│   │       ├── gallery/         # Public gallery + detail view
│   │       ├── arena/           # Blind voting + leaderboard
│   │       ├── storyboard/      # AI storyboard creation
│   │       └── profile/         # Personal library + stats
│   └── api/
│       ├── generate/            # POST — AI generation → R2 → DB
│       ├── arena/               # Arena matches + voting
│       ├── api-keys/            # BYOK key management
│       ├── models/              # Model listing + health check
│       ├── admin/               # Admin model config CRUD
│       ├── credits/             # User credits
│       └── webhooks/clerk/      # Clerk user.created sync
│
├── components/
│   ├── ui/                      # shadcn/ui atoms (stateless)
│   ├── business/                # Stateful UI (hooks, no direct API)
│   └── layout/                  # Navbar, MobileTabBar
│
├── hooks/                       # Client-side state management
├── services/                    # Server-only business logic
├── constants/                   # Config, enums, routes
├── types/                       # Zod schemas + TypeScript types
├── lib/                         # DB, API client, utilities
└── messages/                    # i18n (en, ja, zh)
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (Neon recommended)
- Cloudflare R2 bucket
- Clerk account
- API keys for at least one AI provider

### Environment Variables

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

# Database
DATABASE_URL=postgresql://...

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
NEXT_PUBLIC_R2_PUBLIC_URL=

# AI Providers (at least one required)
HUGGINGFACE_API_KEY=hf_...
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...
FAL_KEY=...
REPLICATE_API_TOKEN=r8_...
```

### Install & Run

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

---

## Development Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | Done | MVP — core generation flow |
| Phase 2 | Done | Persistence — Prisma + Cloudflare R2 |
| Phase 3 | Done | User system + credits |
| Phase 4 | Done | Gallery, profile, storyboard, arena |
| Phase 5 | Done | UX refinement, security hardening, video generation |

---

## Security

- AES-256-GCM encrypted API key storage
- Token bucket rate limiting (10 req/min generation, 5 req/min video)
- Image upload validation (10MB max, MIME type check)
- Error message sanitization (no internal details leaked)
- Webhook replay protection
- Server-side credit deduction only
- No AI keys or DB credentials exposed via `NEXT_PUBLIC_`

---

## Architecture Principles

- **No magic values** — all config in `src/constants/`
- **Strict TypeScript** — no `any`; types via Zod schemas
- **Layered architecture** — constants → types → services → hooks → components
- **Thin API routes** — auth check + Zod parse + service call only
- **Server-side credit logic** — credits never trusted from client
