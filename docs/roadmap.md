# Roadmap — Future Features

Items roughly ordered by impact and dependency.

## Near-term (Phase 4 completion)

### Gallery Search & Filter
- Keyword search on prompt text
- Filter by model / provider
- Sort by date (newest / oldest)
- Scope: API query params + frontend filter bar component

### Image Detail Page (dedicated route)
- `/gallery/[id]` as a shareable permalink
- SEO metadata (Open Graph image, title, description)
- Reuse `ImageDetailModal` layout as full-page variant

### Landing Page Animations
- Fade-in + translate-up entrance on scroll (IntersectionObserver)
- Staggered delays per section card
- Respect `prefers-reduced-motion`

### SEO & Metadata
- Per-page `generateMetadata()` with Open Graph tags
- `sitemap.xml` generation via Next.js App Router
- Structured data (JSON-LD) for gallery images

### Deployment Hardening
- Vercel deployment config (env vars, edge middleware)
- Production CSP headers
- R2 CDN cache rules
- Error monitoring (Sentry or similar)

## Mid-term

### Credits & Billing
- Credit purchase / top-up flow (Stripe or LemonSqueezy)
- Credit balance display in Navbar (currently shows request count)
- Usage analytics dashboard in Profile

### Collections / Albums
- User-created folders to organize generations
- Public collection sharing with permalink

### Social Features
- Like / favorite public images
- User profile pages (public archive view)
- Follow creators

### Advanced Generation
- Batch generation (multiple prompts in one run)
- Image-to-image variations (expand existing img2img)
- Prompt templates / presets library
- Generation history comparison (side-by-side)

## Long-term

### Video Generation
- Support video AI models (schema already has `VIDEO` output type + `duration` field)
- Video player in detail modal
- Video-specific metadata (duration, frame rate)

### API Access
- Public REST API for programmatic generation
- API key management (partially built: `UserApiKey` model exists)
- Rate limiting + usage quotas per key

### Multi-tenant / Team
- Shared workspaces for teams
- Role-based access (admin, editor, viewer)
- Team billing

### Mobile App
- React Native or PWA wrapper
- Push notifications for generation completion
- Offline gallery viewing (cached images)

## Infrastructure

### Performance
- Image CDN optimization (WebP/AVIF auto-conversion)
- Lazy-load with blur placeholder (blurhash)
- ISR for gallery pages
- Database connection pooling tuning

### Observability
- Structured logging (generation success/failure rates)
- Grafana dashboard for API latency
- Alerting on AI provider errors

### Data
- Database backup automation
- R2 lifecycle policies (storage cost management)
- GDPR data export / deletion flow
