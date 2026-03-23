# Architecture

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router + Turbopack) |
| Language | TypeScript (strict, no `any`) |
| Auth | Clerk (webhook sync + middleware protection) |
| Database | PostgreSQL (Neon) via Prisma 7 + PrismaPg Driver Adapter |
| Storage | Cloudflare R2 (permanent image/video hosting) |
| AI Providers | HuggingFace, Google Gemini, OpenAI, fal.ai, Replicate |
| UI | shadcn/ui + Tailwind CSS v4 (OKLch colors) + CSS Modules |
| i18n | next-intl (en, ja, zh) |
| Testing | Vitest + @testing-library/react |
| Deployment | Vercel |

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Root redirect → /en
│   ├── robots.ts                     # SEO robots.txt
│   ├── sitemap.ts                    # SEO sitemap.xml
│   └── [locale]/
│       ├── (auth)/                   # Auth pages (no Navbar)
│       │   ├── sign-in/
│       │   └── sign-up/
│       ├── (main)/                   # App pages (with Navbar + MobileTabBar + Toaster)
│       │   ├── layout.tsx
│       │   ├── studio/page.tsx       # Image/video generation workspace
│       │   ├── gallery/page.tsx      # Public gallery (infinite scroll + filter)
│       │   ├── gallery/[id]/page.tsx # Image/video detail (OG cards + JSON-LD)
│       │   ├── profile/page.tsx      # User archive (infinite scroll + filter + delete)
│       │   ├── arena/page.tsx        # Blind model comparison
│       │   ├── arena/leaderboard/    # ELO rankings
│       │   ├── storyboard/page.tsx   # Visual narratives
│       │   └── storyboard/[id]/      # Story detail (comic/scroll view)
│       └── api/                      # ← See "API Routes" section below
│
├── components/
│   ├── ui/                           # Stateless shadcn primitives (+ sonner Toaster)
│   ├── business/                     # Stateful business components (use hooks, no direct API)
│   └── layout/                       # Page chrome: Navbar, MobileTabBar, LocaleSwitcher
│
├── hooks/                            # Client-side state management
├── services/                         # Server-only business logic (DB, R2, AI calls)
│   ├── storage/r2.ts                 # R2 upload/delete with crypto-secure storage keys
│   └── providers/                    # AI adapter registry (HF, Gemini, OpenAI, fal, Replicate)
├── lib/                              # Utilities: Prisma, api-client, crypto, rate-limit
├── constants/                        # Enums, config, routes — no magic values
├── types/                            # Zod schemas + TypeScript interfaces
├── messages/                         # i18n JSON (en.json, ja.json, zh.json)
├── test/                             # Shared test helpers (api-helpers.ts)
└── middleware.ts                      # Clerk route protection + i18n
```

## API Routes

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/generate` | Yes | 10/min | Image generation |
| POST | `/api/generate-video` | Yes | 5/min | Video generation (submit to queue) |
| GET | `/api/generate-video/status` | Yes | — | Poll video generation status |
| GET | `/api/images` | Optional | — | Gallery pagination (+`mine=1` for user's own) |
| DELETE | `/api/generations/[id]` | Yes | — | Hard-delete generation (DB + R2) |
| PATCH | `/api/generations/[id]/visibility` | Yes | — | Toggle public/private |
| POST | `/api/image/analyze` | Yes | 10/min | Reverse-engineer image → extract prompt |
| POST | `/api/image/analyze/[id]/variations` | Yes | — | Generate variations from analysis |
| POST | `/api/prompt/enhance` | Yes | 10/min | LLM-based prompt enhancement |
| GET | `/api/api-keys` | Yes | — | List user's saved API keys |
| POST | `/api/api-keys` | Yes | — | Create API key (AES-256-GCM encrypted) |
| PUT | `/api/api-keys/[id]` | Yes | — | Update API key (label, isActive) |
| DELETE | `/api/api-keys/[id]` | Yes | — | Delete API key |
| POST | `/api/arena/matches` | Yes | 5/min | Create blind comparison match |
| GET | `/api/arena/matches/[id]` | Yes | — | Poll match status |
| POST | `/api/arena/matches/[id]/vote` | Yes | — | Submit vote + update ELO |
| GET | `/api/arena/leaderboard` | No | — | Public model rankings |
| GET | `/api/stories` | Yes | — | List user's stories |
| POST | `/api/stories` | Yes | — | Create story (validates generation ownership) |
| GET | `/api/stories/[id]` | Optional | — | Get story (owner or public) |
| PUT | `/api/stories/[id]` | Yes | — | Update story |
| DELETE | `/api/stories/[id]` | Yes | — | Delete story |
| POST | `/api/stories/[id]/narrative` | Yes | 5/min | Generate AI narrative |
| PATCH | `/api/stories/[id]/reorder` | Yes | — | Reorder panels |
| GET | `/api/usage-summary` | Yes | — | User usage stats (30-day lookback) |
| POST | `/api/webhooks/clerk` | Svix | — | Clerk user.created sync |

## Data Flow

```
Browser → API Route → Service → Prisma/R2/AI Provider
                ↓
         Auth (Clerk)
         Rate Limit (token bucket)
         Validate (Zod)
         Delegate to Service
```

### Generation Flow

1. User submits prompt + model in Studio
2. `use-generate` hook calls `generateImageAPI()` in `api-client.ts`
3. `POST /api/generate` → rate limit → validates with Zod → calls `generation.service.ts`
4. Service selects AI adapter (HuggingFace / Gemini / OpenAI / fal / Replicate) → generates image
5. Image buffer uploaded to R2 via `storage/r2.ts` (crypto-secure storage key)
6. Generation record saved to PostgreSQL via Prisma
7. Usage logged to `ApiUsageLedger`
8. Result returned to client with R2 URL
9. Toast notification shown (success or error)

### Video Generation Flow (submit + poll)

1. User submits prompt + model in Studio (video tab)
2. `POST /api/generate-video` → rate limit → submit job to fal.ai queue
3. Returns `{ jobId }` immediately
4. `use-generate-video` hook polls `GET /api/generate-video/status?jobId=X`
5. On COMPLETED: video URL returned, toast shown
6. On timeout (MAX_POLL_ATTEMPTS): error shown

### Gallery Flow

1. `GalleryFeed` uses `useGallery` hook with IntersectionObserver
2. `fetchGalleryImages()` calls `GET /api/images?page=X&limit=Y&type=image`
3. API route queries `getPublicGenerations()` from service
4. `GalleryGrid` renders `ImageCard` components in CSS columns layout
5. Click opens `ImageDetailModal` — uses `VideoPlayer` for videos, `<img>` for images

### Profile Flow

1. Server component loads initial data (stats, first page of generations)
2. `ProfileFeed` client component uses `useGallery({ mine: true })`
3. `GET /api/images?mine=1` returns user's own generations (including private)
4. Filter bar: search + type filter (All/Images/Videos) + sort
5. Delete: AlertDialog confirmation → `DELETE /api/generations/[id]` → DB + R2 cleanup

## Security

- **Auth**: Clerk middleware protects all routes except `/`, `/gallery`, `/gallery/[id]`, `/arena/leaderboard`
- **Rate Limiting**: In-memory token bucket per user (NOTE: not production-ready for multi-instance — see roadmap)
- **Encryption**: API keys encrypted with AES-256-GCM via `src/lib/crypto.ts`
- **Storage Keys**: `crypto.randomBytes(12)` — non-enumerable, non-guessable
- **Error Sanitization**: All API routes return generic error messages, internal errors logged server-side only
- **Webhook Protection**: Svix signature verification + 5-minute timestamp expiry (replay protection)
- **Input Validation**: Zod schemas on all endpoints; image uploads validated for MIME type + 10MB size limit
- **Ownership Checks**: Story creation validates generationIds belong to requesting user

## Testing

- **Framework**: Vitest (v4.1) + jsdom environment
- **Test Count**: 97 tests across 19 files (16 API route tests + 3 i18n/component tests)
- **Pattern**: Mock Clerk auth + service functions → test auth/validation/success/error paths
- **Shared Helpers**: `src/test/api-helpers.ts` — mock auth, rate limiter, request builders, fake data
- **Run**: `npm test` (watch mode) or `npm run test:run` (CI mode)

## Key Patterns

- **No magic values** — All strings/numbers come from `src/constants/`
- **Zod-first types** — Define schema, infer type: `type X = z.infer<typeof XSchema>`
- **Feature dev order** — constants → types → services → hooks → components
- **Component tiers** — ui/ (stateless) → business/ (hooks ok) → layout/ (page chrome)
- **Import order** — React/Next → third-party → internal constants/types → components/hooks → styles
- **Thin API routes** — Auth → Rate Limit → Zod validate → delegate to service (no business logic)
