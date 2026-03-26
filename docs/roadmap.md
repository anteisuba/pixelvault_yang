# Roadmap — Future Features

Items roughly ordered by impact and dependency.

## Next up

### Security — Production Readiness
- **Replace in-memory rate limiter with upstash/ratelimit + Redis** (current implementation doesn't persist across Vercel serverless instances — highest priority for production)
- API key encryption key entropy validation (currently accepts any 32-byte key, should enforce randomness)
- API key decryption failure alerting (currently silently swallows errors, should notify user)
- R2 orphan cleanup job (if R2 delete fails, file remains after DB record deletion)

### Credits & Billing
- Credit purchase / top-up flow (Stripe or LemonSqueezy)
- Credit balance display in Navbar (currently shows request count)
- Usage analytics dashboard in Profile (per-model / per-day / per-type charts)

### Performance
- Image blur placeholder (blurhash) — large images show white during load
- Image CDN optimization (WebP/AVIF auto-conversion)
- Gallery skeleton loading grid
- ISR for gallery pages
- Database connection pooling tuning

### Collections / Albums
- User-created folders to organize generations
- Public collection sharing with permalink

### Social Features
- Like / favorite public images
- User profile pages (public archive view)
- Follow creators

### Advanced Generation
- Batch generation (multiple prompts in one run)
- Prompt templates / presets library
- Generation history comparison (side-by-side)
- Batch operations on profile (bulk public/private/delete)

### UX — Lower the API Key Barrier (mid-term)
- **Platform credits mode** — users pay the platform directly (Stripe/LemonSqueezy), platform calls providers with its own keys. Users never touch API keys. Needs billing, cost accounting, and margin calculation.
- **OAuth provider login** — for providers that support OAuth (Google, GitHub), allow users to authenticate and authorize directly instead of copying API keys manually.
- **Guided video tutorials** — short embedded video walkthroughs per provider showing exactly where to find the API key page.
- **API key auto-import** — browser extension or bookmarklet that auto-fills the key from the provider's dashboard page.

## Long-term

### Multi-tenant / Team
- Shared workspaces for teams
- Role-based access (admin, editor, viewer)
- Team billing

### Mobile App
- React Native or PWA wrapper
- Push notifications for generation completion
- Offline gallery viewing (cached images)

## Infrastructure

### Observability
- Structured logging (generation success/failure rates)
- Grafana dashboard for API latency
- Alerting on AI provider errors

### Data
- Database backup automation
- R2 lifecycle policies (storage cost management)
- GDPR data export / deletion flow

### CI/CD (when project stabilizes)
- GitHub Actions: `tsc --noEmit` + `vitest run`
- Currently not needed — Vercel auto-builds on push

---

## Already Completed (moved from roadmap)

- ~~Video Generation~~ — 5 models via fal.ai (Kling, MiniMax, Luma, WAN, Hunyuan)
- ~~API Key Management~~ — Full CRUD with AES-256-GCM encryption per user per provider
- ~~Image-to-Image~~ — Reference image support in generation
- ~~Prompt Enhancement~~ — LLM-based enhancement (4 styles)
- ~~Image Reverse Engineering~~ — Upload → extract prompt → generate variations
- ~~AI Model Arena~~ — Blind comparison with ELO ranking system
- ~~Storyboard~~ — AI narrative generation, comic/scroll view, drag reorder, PNG export
- ~~Landing Page~~ — Hero redesign, metrics bar, gallery preview section
- ~~Gallery Search & Filter~~ — Keyword search, model filter, type filter, date sort
- ~~Image Detail Page~~ — `/gallery/[id]` with OG/Twitter cards, JSON-LD, video playback
- ~~SEO & Metadata~~ — Per-page generateMetadata, sitemap.xml, robots.txt, alternate languages
- ~~Deployment Hardening~~ — Security headers, remote image patterns, public route config
- ~~Landing Page Animations~~ — CSS View Transitions scroll reveal, staggered hero entrance
- ~~Image/Video Distinction~~ — Type filter, VideoPlayer in modal/detail, VideoObject JSON-LD
- ~~Profile Enhancement~~ — Infinite scroll, search/filter, hard-delete, split stats
- ~~Mobile Navigation~~ — 5-tab MobileTabBar (Gallery/Studio/Arena/Stories/Archive)
- ~~Toast Notifications~~ — Sonner integration for generation feedback
- ~~Rate Limiting~~ — Token bucket per-user on all generation/AI endpoints
- ~~Security Hardening~~ — Error sanitization, MIME validation, webhook replay protection, storage key crypto
- ~~API Tests~~ — 97 Vitest tests covering all GET/POST/PUT/DELETE endpoints
