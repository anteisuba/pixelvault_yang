# Roadmap — Future Features

Items roughly ordered by impact and dependency.

## Next up

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
- Prompt templates / presets library
- Generation history comparison (side-by-side)

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

---

## Already Completed (moved from roadmap)

These items were originally planned for mid/long-term but have been implemented:

- ~~Video Generation~~ — 8 models via fal.ai (Veo 3, Kling 3.0 Pro, Seedance Pro, Kling V2, MiniMax, Luma Ray 2, WAN, Hunyuan) with queue-based architecture, I2V support, and parameter tuning
- ~~API Key Management~~ — Full CRUD with AES-256-GCM encryption per user per provider
- ~~Image-to-Image~~ — Reference image support in generation
- ~~Prompt Enhancement~~ — LLM-based enhancement (3 styles)
- ~~Image Reverse Engineering~~ — Upload → extract prompt → generate variations
- ~~AI Model Arena~~ — Blind comparison with ELO ranking system
- ~~Storyboard~~ — AI narrative generation, comic/scroll view, drag reorder, PNG export
- ~~Landing Page~~ — Hero redesign, metrics bar, gallery preview section
- ~~Gallery Search & Filter~~ — Keyword search, model filter, date sort
- ~~Image Detail Page~~ — `/gallery/[id]` with OG/Twitter cards, JSON-LD
- ~~SEO & Metadata~~ — Per-page generateMetadata, sitemap.xml, robots.txt, alternate languages
- ~~Deployment Hardening~~ — Security headers, remote image patterns, public route config
- ~~Landing Page Animations~~ — CSS View Transitions scroll reveal, staggered hero entrance
