# Profile Page

Last updated: 2026-06-02

This document records current page-level facts for creator profile pages. It is
not a redesign spec and not a request to change UI code.

## Current

### Route Surface

| Surface         | Route           | Current UI entry                             | Notes               |
| --------------- | --------------- | -------------------------------------------- | ------------------- |
| Creator profile | `/u/[username]` | `CreatorProfileView` or `PrivateProfileView` | public-route shaped |

No standalone `/profile` route is currently implemented.

### Structure

Current route behavior:

- loads profile metadata through `getCreatorProfile`
- resolves authenticated viewer through Clerk when present
- returns `notFound()` if username does not exist
- renders `PrivateProfileView` for private profiles when viewer is not owner
- renders `CreatorProfileView` for public profiles and owner views

Current public profile structure:

- `ProfileHeader`
- `PolaroidGrid`
- owner-only edit and pin/feature actions where available
- load-more flow for public works

## Current State Matrix

| State      | Current fact                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Loading    | route `u/[username]/loading.tsx`; `CreatorProfileView` also shows spinner while client data is missing |
| Error      | route `u/[username]/error.tsx`; component error state if client fetch fails                            |
| Empty      | `PolaroidGrid` empty profile state when no public generations                                          |
| Signed-out | anonymous users can view public profiles; private profiles show limited private view                   |
| Signed-in  | owner can view/edit own profile; non-owner can follow/like where available                             |
| No credits | not page-owned                                                                                         |

## Page CSS / Layout Rules

Current CSS facts:

- profile loading route uses `max-w-content`.
- profile error route uses `editorial-page`.
- profile grid uses `max-w-content`.
- public works use Polaroid component styling.
- empty state uses `bg-primary/5`, rounded icon, and shadcn button primitives.

## Components

| Area                | Components                                    |
| ------------------- | --------------------------------------------- |
| route               | `/u/[username]/page.tsx`, loading/error files |
| header              | `ProfileHeader`, `ProfileEditModal`           |
| public/private view | `CreatorProfileView`, `PrivateProfileView`    |
| works               | `PolaroidGrid`, `PolaroidCard`                |

## Interaction Details

Current page-internal interaction matrix:

| Interaction              | Current trigger / owner                          | Current state / feedback                                                                         | Design notes                                                                  |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Client hydration         | `CreatorProfileView` through `useCreatorProfile` | Shows centered spinner when client profile data is not available yet                             | Route has server initial data, but visible client view still has hydrate gap. |
| Edit profile open        | Owner edit button in `ProfileHeader`             | Opens `ProfileEditModal`; close happens through dialog close/cancel                              | Owner-only action; non-owner gets follow CTA instead.                         |
| Avatar pick              | Avatar button inside `ProfileEditModal`          | Opens hidden file input, stores preview/file locally                                             | Save uploads avatar first, then profile fields.                               |
| Profile field edit       | Modal inputs / textareas                         | Updates local form state                                                                         | Visible fields include display name, bio, location, website, and social URLs. |
| Public profile switch    | Modal `role="switch"` button                     | Toggles `isPublic` local state; saved through profile update                                     | Keep profile visibility separate from generation visibility.                  |
| Profile save             | Modal save button                                | Uploads avatar if needed, calls `updateProfileAPI`, disables while saving, then closes/refreshes | Error path is toast-based.                                                    |
| Banner upload            | Owner banner button in `ProfileHeader`           | Hidden file input; validates type/size, shows uploading spinner, calls `uploadBannerAPI`         | Banner update is immediate from header, not part of edit modal.               |
| Follow/unfollow          | Non-owner follow button                          | Calls `useFollow`; pending button state, follower count update through success callback          | Own profile does not expose follow.                                           |
| Work card expand         | `PolaroidCard` click or keyboard activation      | Opens full-screen-ish `role="dialog"` overlay; Escape/Enter/Space paths are implemented          | Expanded image UX needs mobile visual QA.                                     |
| Work like                | Like button in expanded `PolaroidCard`           | Calls `useLike`; caller updates liked/like count on success                                      | Like is available for public works, separate from profile follow.             |
| Pin / feature work       | Owner-only pin button in expanded `PolaroidCard` | Calls profile visibility/feature path; success/error toast; featured-limit copy exists           | Featured limit is a product rule that must stay server-owned.                 |
| Load more works          | `PolaroidGrid` load-more button                  | Calls `loadMore`; button shows spinner while loading and appends cursor page                     | Empty state and pagination state should not collapse into one design state.   |
| Empty works CTA          | `PolaroidGrid` when no generations are present   | Shows centered icon/copy and Studio CTA                                                          | Empty copy is profile-contextual, not Gallery empty copy.                     |
| Private / not-found view | Route and `PrivateProfileView`                   | Missing username returns `notFound`; private profile shows limited identity surface              | Do not leak private works or hidden profile metadata.                         |

## Responsive

Known source facts:

- grid uses responsive columns.
- Polaroid expanded modal has viewport max-width/max-height constraints.
- no fresh mobile/tablet screenshot pass was run for this page document.

## Empty / Loading / Error States

Current empty state:

- `PolaroidGrid` renders centered icon, `noPublicImages`, and Studio CTA.

Current private/not-found states:

- missing username returns route `notFound()`;
- private profile renders `PrivateProfileView` with limited identity fields.

## Screenshot Evidence

Not captured in this pass.

Needed later:

- public profile with works;
- public profile empty state;
- private profile viewed by non-owner;
- owner profile with edit affordance;
- profile edit modal;
- route loading/error states;
- mobile 390 and tablet 768.

## i18n / Accessibility

- Route metadata and UI copy use `CreatorProfile`.
- Edit modal and upload errors use translated copy.
- Follow/edit/buttons need keyboard QA in owner and non-owner states.

## Do Not Break

- Profile-level visibility separate from generation visibility.
- Prompt redaction on profile works.
- Owner access to private own profile.
- Public anonymous access to public profile.
- Profile avatar/banner storage and update paths.

## Unresolved

- Should `/profile` be added later as owner management route?
- Should public profile visual language be closer to Gallery or a distinct
  creator-homepage surface?
- Which owner-only states need canonical screenshots?

## Source Of Truth

- `docs/domains/profile.md`
- `src/app/[locale]/(main)/u/[username]/page.tsx`
- `src/app/[locale]/(main)/u/[username]/loading.tsx`
- `src/app/[locale]/(main)/u/[username]/error.tsx`
- `src/components/business/CreatorProfileView.tsx`
- `src/components/business/PrivateProfileView.tsx`
- `src/components/business/ProfileHeader.tsx`
- `src/components/business/ProfileEditModal.tsx`
- `src/components/business/PolaroidGrid.tsx`
- `src/components/business/PolaroidCard.tsx`
- `src/services/user.service.ts`
- `src/hooks/use-creator-profile.ts`
- `src/hooks/use-follow.ts`
- `src/hooks/use-like.ts`

## Last Verified

- Date: 2026-06-02
- Method: documentation review and code inspection of Profile domain, route,
  profile views, grid, edit modal, and source files listed above.
