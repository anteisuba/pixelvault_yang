# Development Phases

## Phase 1: MVP (Core Generation) — COMPLETE

- Single-model image generation
- Prompt input + result display
- Basic UI

## Phase 2: Persistent Storage — COMPLETE

- Prisma + PostgreSQL (Neon) integration
- Cloudflare R2 image upload and permanent hosting
- Generation records saved to database

## Phase 3: User System + Credits — COMPLETE

- Clerk sign-in / sign-up + Navbar UserButton
- Clerk webhook syncs `user.created` to database
- Server-side credit deduction/addition + `GET /api/credits`
- Route protection middleware
- Gallery page (GalleryFeed + GalleryGrid + ImageCard + use-gallery hook + API)
- Profile page (Library/Archive — metric cards + user collection + visibility toggle)

## Phase 4: UI Polish + Gallery Enhancements — COMPLETE

- Hero section redesign (two-column + metrics bar + Gallery Preview as standalone section)
- Landing page rhythm (section spacing 80–128px, staggered animation, CTA hierarchy)
- Mobile responsive pass (LocaleSwitcher, MobileTabBar, Navbar, Hero small-screen spacing)
- ImageCard + GalleryGrid waterfall layout (CSS columns)
- MobileTabBar navigation coherence (3-tab alignment with Navbar, auth state consistency)
- Standalone auth pages (removed HomepageShell auth coupling)
- Image detail modal (full prompt, metadata, download, open original)
- Multi-provider architecture (HuggingFace, Google Gemini, OpenAI, fal.ai, Replicate)
- Per-user API key management (AES-256-GCM encrypted storage)
- Image-to-image generation (reference image support)
- Prompt enhancement (detailed / artistic / photorealistic styles via LLM)
- Image reverse engineering (upload → extract prompt → generate variations)
- AI Model Arena with ELO ranking (blind comparison + voting)
- Storyboard with AI narrative (comic view, drag reorder, PNG export, public share)
- Video generation (5 models via fal.ai — Kling, MiniMax, Luma, WAN, Hunyuan)
- 9 image models + 5 video models across 5 providers
- Gallery search & filter (keyword search, model dropdown, sort by date)
- Image detail page `/gallery/[id]` (shareable permalink + OG/Twitter cards + JSON-LD)
- SEO & metadata (per-page generateMetadata, sitemap.xml, robots.txt, alternate languages)
- Deployment hardening (security headers, remote image patterns, public route config)
- Landing page scroll animations (CSS View Transitions API, staggered hero entrance)

## Phase 5: UX Refinement + Security — COMPLETE

> Branch: `claude/hardcore-fermi` — PR #5

### 5A: Image/Video Distinction
- Gallery type filter (All / Images / Videos) with dynamic model list per type
- Video playback in ImageDetailModal via VideoPlayer component
- Video playback on gallery detail page `/gallery/[id]`
- VideoObject JSON-LD schema for video generations
- API layer `outputType` filter param on `GET /api/images`

### 5B: Profile Enhancement
- Infinite scroll via ProfileFeed client component (reuses `use-gallery` hook with `mine=true`)
- Search, type filter, and sort controls on profile page
- Hard-delete generation with AlertDialog confirmation (DB + R2 cleanup)
- Split stats: total / images / videos / public / private / API requests
- `DELETE /api/generations/[id]` endpoint

### 5C: Mobile + Interaction
- MobileTabBar expanded from 3 to 5 tabs (+Arena, +Stories)
- Toast notifications (sonner) for generation success/failure
- Toaster component added to main layout

### 5D: Security Hardening
- In-memory token bucket rate limiter (`src/lib/rate-limit.ts`)
  - `POST /api/generate` — 10 req/min
  - `POST /api/generate-video` — 5 req/min
  - `POST /api/image/analyze` — 10 req/min
  - `POST /api/prompt/enhance` — 10 req/min
  - `POST /api/arena/matches` — 5 req/min
  - `POST /api/stories/[id]/narrative` — 5 req/min
- Image upload size validation (10MB limit) + MIME type validation (PNG/JPEG/WebP/GIF)
- Error message sanitization — all API routes return generic messages, no `error.message` leakage
- Public story access — unauthenticated `GET /api/stories/[id]` when `isPublic=true`
- Webhook replay protection — reject svix events older than 5 minutes
- R2 storage key: `Math.random()` → `crypto.randomBytes(12)` (non-enumerable)
- Story creation: validate all `generationIds` belong to requesting user

### 5E: Test Coverage
- 97 Vitest tests across 16 API route test files
- Shared test helpers: `src/test/api-helpers.ts` (Clerk auth mock, rate limit mock, request builders)
- Coverage: auth, validation, rate limiting, success paths, error handling for all endpoints
