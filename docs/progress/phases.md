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

## Phase A–C: Code Quality, Model UX, Performance — COMPLETE

> See `../product/roadmap.md` Phase A–C for full breakdown.

- Design system compliance fixes + form deduplication + Error Boundary
- Dynamic imports & lazy loading (PromptEnhancer, ReverseEngineerPanel, AdvancedSettings)
- Toast notifications, provider error unification, Prisma index optimization
- Prompt visibility transparency, API key format hints, mobile locale switcher
- Keyboard navigation & ARIA, Next.js AVIF/WebP optimization
- Model metadata enhancement (styleTag, qualityTier, descriptions)
- ModelSelector purpose-based grouping + prompt preset templates
- React.memo / useCallback rendering optimization
- Gallery skeleton loading + ISR (60s revalidate)
- Free quota display in Studio

## Phase D: Community & Growth — IN PROGRESS

> Branch: `feat/workbench-w2-project-ui`

### D1: Prompt Sharing & Reuse — COMPLETE

- Copy Prompt + Share Link buttons on Gallery/Detail
- "Generate with this Prompt" one-click Studio prefill
- URL parameter sharing (?prompt=&model=)

### D2: Arena Upgrade — COMPLETE

- Personal arena: match history + model stats (/arena/history)
- Leaderboard: podium Top 3 + model family filter + modelFamily field
- API: GET /api/arena/history + GET /api/arena/personal-stats (8 new tests)

### D2.5: Landing Page Narrative — COMPLETE

- "Your Key, Your Images, Zero Markup" core differentiation
- BYOK + permanent archive + Arena three-in-one value prop (HomepageComparison)

### D3: Social Layer — COMPLETE

- User model expansion: username, displayName, avatarUrl, bio, isPublic
- Public creator profile `/u/[username]` with Polaroid scatter layout (SSR + OG tags)
- PolaroidCard + PolaroidGrid + ProfileHeader components
- Gallery ImageCard creator attribution with avatar + link
- Like/Favorite (UserLike model + toggle API + optimistic update)
- Follow (UserFollow model + toggle API + optimistic update)
- Prompt feedback system (PromptFeedback model + rating API)
- Profile editing: PUT /api/users/me/profile (bio/username)
- Clerk webhook: user.updated event syncs displayName + avatarUrl
- i18n: en/ja/zh synchronized

## Phase W: Workbench Evolution — PARTIAL

### W0: VolcEngine Seedance — COMPLETE

### W1: Multi-Reference Images — COMPLETE

### W2: Project System — COMPLETE

- See `../product/roadmap.md` Phase W for details

## Phase E: Unified Development Plan — IN PROGRESS

> 合并 development-plan.md (S1-S9) + Studio Redesign Plan + 两轮 Codex Review。
> 详见: [`../plans/product/unified-development-plan.md`](../plans/product/unified-development-plan.md)

### Track A: 基础修复

- [x] A1 — 数据层修复 (credit 成本/能力覆盖/计时器/Model ID)
- [x] A2 — 新模型接入 (Gemini 2.5 Flash/FLUX 2 Max/Recraft V4/Kontext Pro+Max)
- [x] A3 — 校验+持久化+并行化+超时

### Track B: Studio 重构

- [x] B0 — Generation 快照 DTO + ActiveRun 状态模型
- [x] B1 — 三栏布局重构 (删除 hero/模型排名，prompt 居中)
- [x] B2 — 状态补全+重试+快捷键 (合并 S4+Phase2+3)
- [x] B3 — 卡片优化+历史元数据+Remix (合并 S5+Phase4)
- [ ] B4 — 多模型对比生成 (共享并发服务)
- [ ] B5 — 批量变体 4选1
- [x] B6 — 智能 Prompt (维度提取+模型感知增强+风格渗透)
- [ ] B7 — 动效+无障碍

### Track C: 独立功能线

- [ ] C1 — Storyboard 增量增强
- [ ] C2 — 系列模式+角色一致性
- [ ] C3 — 图片编辑 (Kontext 指令/Outpainting/Inpainting)
- [ ] C4 — 漫画高级 (气泡/多模板导出/剧本模式)
