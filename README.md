# PixelVault — Personal AI Gallery

A multi-model AI image generation and permanent archive platform.

**Live Demo:** [https://pixelvault-seven.vercel.app/](https://pixelvault-seven.vercel.app/)

---

## Features

- **Multi-model AI image generation** — Choose from 3 AI models across 2 providers
- **Permanent image storage** — All generated images stored on Cloudflare R2
- **Credit-based system** — New users receive 10 credits; each generation costs 1–2 credits
- **User authentication** — Sign in / sign up via Clerk
- **Multilingual UI** — English, Japanese, Traditional Chinese (`/en`, `/ja`, `/zh`)
- **Multiple aspect ratios** — 1:1, 16:9, 9:16, 4:3, 3:4

---

## AI Models

| Model | Provider | Credits | Description |
|-------|----------|---------|-------------|
| Stable Diffusion XL | HuggingFace | 1 | High-resolution, detailed image generation |
| Animagine XL 4.0 | HuggingFace | 1 | High-quality anime-style image generation |
| Gemini 3.1 Flash Image | Google Gemini | 2 | Google's state-of-the-art image generation |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router + Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | Clerk |
| Database | PostgreSQL (Neon) via Prisma 7 + PrismaPg Driver Adapter |
| Storage | Cloudflare R2 |
| AI Providers | HuggingFace Inference API, Google Gemini API |
| Validation | Zod |
| Deployment | Vercel |

---

## Project Structure

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (auth)/          # sign-in, sign-up
│   │   └── (main)/
│   │       └── studio/      # AI generation studio (requires login)
│   └── api/
│       ├── generate/        # POST — AI generation → R2 → DB
│       ├── credits/         # GET  — current user credits
│       └── webhooks/clerk/  # Clerk user.created sync
│
├── components/
│   ├── ui/                  # shadcn/ui atoms (stateless)
│   ├── business/
│   │   ├── GenerateForm.tsx # Prompt + model selector + preview
│   │   └── ModelSelector.tsx
│   └── layout/
│       └── Navbar.tsx       # Logo + credits + UserButton
│
├── hooks/
│   ├── use-generate.ts      # Generation state management
│   └── use-credits.ts       # Credits query
│
├── services/
│   ├── generation.service.ts
│   ├── user.service.ts      # Credits deduction / addition
│   └── storage/r2.ts        # Cloudflare R2 upload
│
├── lib/
│   ├── db.ts                # Prisma singleton
│   ├── api-client.ts        # Frontend API wrapper
│   └── utils.ts
│
├── constants/
│   ├── models.ts            # AI model enum + options
│   ├── routes.ts            # Route constants
│   └── config.ts            # Credits, limits, pagination
│
└── types/index.ts           # TypeScript types + Zod schemas
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (Neon recommended)
- Cloudflare R2 bucket
- Clerk account
- HuggingFace API key
- Google Gemini API key

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

# AI Providers
HUGGINGFACE_API_KEY=hf_...
GEMINI_API_KEY=AIza...
```

### Install & Run

```bash
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run dev
```

---

## Development Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | Done | MVP — core generation flow |
| Phase 2 | Done | Persistence — Prisma + Cloudflare R2 |
| Phase 3 | Mostly done | User system + credits |
| Phase 4 | In progress | Gallery page + UI polish + deployment |

### Remaining Work

- [ ] `gallery/page.tsx` — public image gallery with infinite scroll
- [ ] `profile/page.tsx` — personal generation history + credits
- [ ] `ImageCard.tsx` — image card with hover effects
- [ ] `GalleryGrid.tsx` — masonry layout
- [ ] `MobileTabBar.tsx` — bottom navigation for mobile
- [ ] Landing page (currently redirects to sign-in)

---

## Post-Deployment Setup

After deploying to Vercel, configure the Clerk webhook:

1. Clerk Dashboard → **Webhooks** → **Add Endpoint**
2. URL: `https://pixelvault-seven.vercel.app/api/webhooks/clerk`
3. Enable event: `user.created`
4. Copy the Signing Secret → set `CLERK_WEBHOOK_SECRET` in Vercel environment variables

---

## Architecture Principles

- **No magic values** — all model IDs, routes, and config in `src/constants/`
- **Strict TypeScript** — no `any`; all types via interfaces or Zod schemas
- **Layered architecture** — constants → types → services → hooks → components
- **Thin API routes** — auth check + Zod parse + service call only
- **Server-side credit logic** — credits never trusted from client
- **Secrets never exposed** — no AI keys or DB credentials with `NEXT_PUBLIC_` prefix
