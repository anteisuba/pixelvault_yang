# Architecture

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router + Turbopack) |
| Language | TypeScript (strict, no `any`) |
| Auth | Clerk (webhook sync + middleware protection) |
| Database | PostgreSQL (Neon) via Prisma 7 + PrismaPg Driver Adapter |
| Storage | Cloudflare R2 (permanent image hosting) |
| AI Providers | HuggingFace Inference API, Google Gemini API, OpenAI API |
| UI | shadcn/ui + Tailwind CSS + CSS Modules |
| i18n | next-intl (en, ja, zh) |

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Root redirect → /en/sign-in
│   └── [locale]/
│       ├── (auth)/                   # Auth pages (no Navbar)
│       │   ├── sign-in/
│       │   └── sign-up/
│       ├── (main)/                   # App pages (with Navbar + MobileTabBar)
│       │   ├── layout.tsx
│       │   ├── studio/page.tsx       # Image generation workspace
│       │   ├── gallery/page.tsx      # Public gallery
│       │   └── profile/page.tsx      # User archive / library
│       └── api/
│           ├── generate/route.ts     # POST — AI generation → R2 → DB
│           ├── images/route.ts       # GET — Public gallery pagination
│           ├── generations/[id]/     # PATCH — Visibility toggle
│           ├── usage-summary/        # GET — User usage stats
│           ├── api-keys/             # CRUD — User saved API routes
│           └── webhooks/clerk/       # POST — Clerk user.created sync
│
├── components/
│   ├── ui/                           # Stateless shadcn primitives
│   ├── business/                     # Stateful business components (use hooks, no direct API)
│   └── layout/                       # Page chrome: Navbar, MobileTabBar, LocaleSwitcher
│
├── hooks/                            # Client-side state management
├── services/                         # Server-only business logic (DB, R2, AI calls)
├── lib/                              # Utilities: Prisma singleton, api-client, cn()
├── constants/                        # Enums, config, routes — no magic values
├── types/                            # Zod schemas + TypeScript interfaces
├── messages/                         # i18n JSON (en.json, ja.json, zh.json)
└── middleware.ts                      # Clerk route protection
```

## Data Flow

```
Browser → API Route → Service → Prisma/R2/AI Provider
                ↓
         Auth (Clerk)
         Validate (Zod)
         Delegate to Service
```

### Generation Flow

1. User submits prompt + model in Studio
2. `use-generate` hook calls `generateImageAPI()` in `api-client.ts`
3. `POST /api/generate` → validates with Zod → calls `generation.service.ts`
4. Service selects AI adapter (HuggingFace / Gemini / OpenAI) → generates image
5. Image buffer uploaded to R2 via `storage/r2.ts`
6. Generation record saved to PostgreSQL via Prisma
7. Usage logged to `ApiUsageLedger`
8. Result returned to client with R2 URL

### Gallery Flow

1. `GalleryFeed` uses `useGallery` hook with IntersectionObserver
2. `fetchGalleryImages()` calls `GET /api/images?page=X&limit=Y`
3. API route queries `getPublicGenerations()` from service
4. `GalleryGrid` renders `ImageCard` components in CSS columns layout
5. Click opens `ImageDetailModal` with full prompt, metadata, download

## Key Patterns

- **No magic values** — All strings/numbers come from `src/constants/`
- **Zod-first types** — Define schema, infer type: `type X = z.infer<typeof XSchema>`
- **Feature dev order** — constants → types → services → hooks → components
- **Component tiers** — ui/ (stateless) → business/ (hooks ok) → layout/ (page chrome)
- **Import order** — React/Next → third-party → internal constants/types → components/hooks → styles
