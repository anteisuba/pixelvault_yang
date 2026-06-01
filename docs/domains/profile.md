# Profile Domain

最后更新：2026-06-02

本文档记录 Profile / Creator Profile 业务域的当前事实、已确认目标和未决边界。它不替代 Gallery、Assets、Project、Studio、Auth 或社交功能文档。

## Current

### Route Surface

Current implemented profile route surface:

- `/u/[username]` renders a creator profile page.
- `/u/[username]/loading` and `/u/[username]/error` provide route-level loading and error states.

There is currently no implemented `src/app/[locale]/(main)/profile/page.tsx`.

The app currently routes the signed-in user to their own public-style creator page through `creatorProfilePath(username)`, which builds `/u/[username]`.

### Creator Profile Page

`src/app/[locale]/(main)/u/[username]/page.tsx`:

- loads profile data server-side through `getCreatorProfile`
- resolves the authenticated viewer through Clerk when present
- returns `notFound()` when the username does not exist
- renders `PrivateProfileView` when the profile is private and the viewer is not the owner
- renders `CreatorProfileView` for public profiles and owner views
- generates profile metadata and Open Graph image URLs through `/api/og?type=profile`

The page is public-route shaped. It can be viewed anonymously when the profile is public.

### Profile Header And Editing

`ProfileHeader` displays:

- banner image
- avatar
- display name
- username
- bio
- public work count
- like count
- follower count
- edit button for the owner
- follow button for non-owner viewers

`ProfileEditModal` allows the owner to update:

- username
- display name
- bio
- public profile visibility
- avatar

Banner upload is handled directly from `ProfileHeader`.

Current profile image uploads support JPEG, PNG, and WebP. The configured limits are:

- avatar: 5 MB
- banner: 10 MB

Uploaded avatar and banner files are stored in R2 under `profiles/{userId}/{type}/...`, and old custom profile image objects are best-effort deleted.

### Public / Private Profile Visibility

Current profile visibility is stored on `User.isPublic`.

`getCreatorProfile` behavior:

- owner can view their own profile even when `User.isPublic = false`
- non-owner viewers receive a private profile result when `User.isPublic = false`
- private profile view currently shows limited identity fields: username, display name, and avatar
- public profile view includes profile metadata, counts, viewer relation, and public generations

This is profile-level visibility only. It is separate from generation-level visibility.

### Public Works On Profile

Creator profile works are backed by the shared `Generation` model.

Current public profile query behavior:

- only generations with `userId = profile user id`
- only generations with `isPublic = true`
- ordered by `isFeatured desc`, then `createdAt desc`, then `id desc`
- cursor pagination is supported
- total count is based on public generations
- like count is based on public generations
- viewer like state is included when a viewer is authenticated

Prompt privacy is respected:

- if `isPromptPublic = true`, prompt and negative prompt can be returned
- if `isPromptPublic = false`, prompt is returned as an empty string and negative prompt is returned as `null`

`PolaroidGrid` and `PolaroidCard` render the current works grid. Expanded card prompt preview only appears when `isPromptPublic` is true.

### Follow And Likes

Current code includes follow and like primitives:

- `UserFollow` model
- `UserLike` model
- `POST /api/follows`
- `POST /api/likes`
- `GET /api/likes`
- `useFollow`
- `useLike`

`ProfileHeader` currently renders a follow button for non-owner viewers.

`PolaroidCard` renders like state and like count for profile works.

These are current implementation facts. Product direction still treats broader social expansion as a later phase.

### API Surface

Current Profile-related API surface:

- `GET /api/users/[username]`: fetch creator profile page data.
- `GET /api/users/me/profile`: fetch signed-in user's editable profile fields.
- `PUT /api/users/me/profile`: update signed-in user's profile fields.
- `POST /api/users/me/avatar`: upload signed-in user's avatar.
- `POST /api/users/me/banner`: upload signed-in user's banner.
- `POST /api/users/me/avatar-sync`: sync avatar from Clerk.
- `POST /api/follows`: toggle follow for authenticated viewer.

The `me` routes are authenticated. Public creator profile read can be anonymous.

### Data Model

Current `User` profile fields include:

- `username`
- `displayName`
- `avatarUrl`
- `avatarStorageKey`
- `bannerUrl`
- `bannerStorageKey`
- `bio`
- `isPublic`
- `isDeleted`

`ensureUser` provisions or syncs user profile basics from Clerk:

- username
- display name
- avatar URL
- email

`softDeleteUser` sets `isDeleted = true` and `isPublic = false` while keeping generated assets and relational history.

## Target

### Role

Profile is the creator identity and public creator homepage domain.

It owns:

- creator identity
- profile visibility
- public profile presentation
- public works display on a creator homepage
- owner profile editing

Profile is not the private asset management center and not the main social platform entry in the short term.

### Route Direction

Target route boundary:

- `/profile`: signed-in user's profile management, public profile preview, and possible entry into their own works.
- `/u/[username]`: public creator page seen by other people.

Current code does not yet implement `/profile`. Until it does, owner profile editing is surfaced from the user's own `/u/[username]` page.

### Public Visibility Contract

Profile visibility and generation visibility must stay separate.

Rules:

- `User.isPublic` decides whether other people can view the creator homepage.
- `Generation.isPublic` decides whether a work can appear on public profile surfaces.
- `Generation.isPromptPublic` decides whether prompt text can appear.
- Making a profile public must not automatically publish every generation.
- Making a generation public must not automatically expose its prompt.
- Client-side UI must not be the authorization boundary for private profile or private work visibility.

Recommended product wording:

```text
别人可以看到你公开主页上的所有公开作品。
```

Do not implement the weaker rule:

```text
主页一公开，别人就能看到你生成的所有作品。
```

If the product later adds one-click publish-all or default-publish settings, those must be explicit settings with clear confirmation.

### Public Homepage Shape

The target profile page can move toward a Twitter-like creator profile feel:

- identity header
- avatar and banner
- bio
- public works timeline/grid
- featured or pinned works
- creator interaction affordances later

Short term, it should remain focused on creator identity and public works, not growth mechanics.

### Responsibility

Profile owns:

- username, display name, avatar, banner, bio, and profile visibility
- public creator homepage rendering
- owner profile edit UX
- public profile works list
- profile-level private state
- creator-level counts when they are part of the profile display

Profile does not own:

- generation execution
- model/provider API behavior
- storage key generation or R2 persistence
- private asset library management
- project/folder management
- public gallery feed ranking
- full social feed
- comments
- direct messages
- ranking/leaderboard systems

### Domain Boundaries

Confirmed domain boundary:

- Profile: identity, public homepage, and public works presentation.
- Gallery: public works feed and public generation detail pages.
- Assets: signed-in private asset management.
- Project: private organization and grouping; not a core public homepage surface for now.
- Studio: creation entry and active creation state; it does not own Profile display logic.
- Generation: unified data source of truth for generated works.
- Storage: R2 and durable media persistence source of truth.

### Social Direction

Follow/follower primitives exist today, but short-term social expansion is not the mainline.

Future Profile can evolve toward Twitter-like creator identity after core creation, asset management, API key, provider, and generation flows are stable.

Deferred social capabilities include:

- expanded follow/follower growth loops
- comments
- direct messages
- social feed
- creator discovery
- ranking or leaderboard-style surfaces

## Unresolved

- `/profile` does not currently exist as a route. The target route should be designed before implementation.
- Whether private profiles should show limited identity fields, or hide everything except a generic private-state page, needs explicit product confirmation. Current code shows username, display name, and avatar.
- Public profile page layout is not final. Current code uses a Polaroid grid; target may move closer to a Twitter-like works timeline.
- Current follow support exists, but its final product role is unresolved because broader social expansion is deferred.
- Whether public profiles should expose project/collection groupings later is unresolved. Current target keeps Project as private organization, not a public homepage core.
- Whether profile works should include audio and 3D in the same presentation pattern needs future review.
- Whether deleted users are fully excluded from public profile lookup needs audit. Current `softDeleteUser` sets `isPublic = false`, but public lookup behavior should be reviewed before relying on soft deletion as the only privacy boundary.
- Public profile download/open-original behavior should follow Gallery/media access policy and is not owned here.
- A complete browser QA pass for profile viewing, private profile, editing, avatar/banner upload, follow, like, and pagination has not been run in this documentation pass.

## Source of Truth

- User-confirmed Profile direction in the 2026-06-02 documentation redesign discussion.
- `docs/product/scope.md`
- `docs/domains/gallery.md`
- `docs/domains/studio.md`
- `docs/architecture/auth.md`
- `docs/architecture/storage.md`
- `src/app/[locale]/(main)/u/[username]/page.tsx`
- `src/app/[locale]/(main)/u/[username]/loading.tsx`
- `src/app/[locale]/(main)/u/[username]/error.tsx`
- `src/components/business/CreatorProfileView.tsx`
- `src/components/business/ProfileHeader.tsx`
- `src/components/business/ProfileEditModal.tsx`
- `src/components/business/PrivateProfileView.tsx`
- `src/components/business/PolaroidGrid.tsx`
- `src/components/business/PolaroidCard.tsx`
- `src/hooks/use-creator-profile.ts`
- `src/hooks/use-my-profile.ts`
- `src/hooks/use-follow.ts`
- `src/hooks/use-like.ts`
- `src/lib/api-client/profile.ts`
- `src/services/user.service.ts`
- `src/services/follow.service.ts`
- `src/services/like.service.ts`
- `src/app/api/users/[username]/route.ts`
- `src/app/api/users/me/profile/route.ts`
- `src/app/api/users/me/avatar/route.ts`
- `src/app/api/users/me/banner/route.ts`
- `src/app/api/users/me/avatar-sync/route.ts`
- `src/app/api/follows/route.ts`
- `src/app/api/likes/route.ts`
- `src/app/api/og/route.tsx`
- `src/constants/routes.ts`
- `src/constants/config.ts`
- `src/types/index.ts`
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`
- `prisma/schema.prisma`

## Last Verified

- Date: 2026-06-02
- Method: owner direction confirmation plus route/component/hook/API/service/schema inspection
- External docs: not required for Profile domain facts in this pass
- Runtime: not run
