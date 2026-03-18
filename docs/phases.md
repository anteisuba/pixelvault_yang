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

## Phase 4: UI Polish + Gallery Enhancements — IN PROGRESS

### Completed

- Hero section redesign (two-column + metrics bar + Gallery Preview as standalone section)
- Landing page rhythm (section spacing 80–128px, staggered animation, CTA hierarchy)
- Mobile responsive pass (LocaleSwitcher, MobileTabBar, Navbar, Hero small-screen spacing)
- ImageCard + GalleryGrid waterfall layout (CSS columns)
- MobileTabBar navigation coherence (3-tab alignment with Navbar, auth state consistency)
- Standalone auth pages (removed HomepageShell auth coupling)
- Image detail modal (full prompt, metadata, download, open original)

### Remaining

- See `docs/roadmap.md` for planned features
