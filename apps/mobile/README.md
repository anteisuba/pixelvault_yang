# Flutter Mobile Plan

## Goal

Build a Flutter mobile app next to the existing Next.js product without duplicating backend business logic.

The mobile app should:

- reuse the current server-side credits, generation, storage, and persistence flow
- stay compatible with the current model catalog and future gallery/profile work
- support `en`, `ja`, and `zh`
- avoid moving secrets, credits rules, or provider logic into the client

## Recommended Repository Shape

Create the mobile client as a sibling app:

```text
apps/
  mobile/
    README.md
    pubspec.yaml
    lib/
      main.dart
      app/
        app.dart
        router.dart
      bootstrap/
        env.dart
        providers.dart
      constants/
        locales.dart
      core/
        auth/
          auth_repository.dart
          auth_token_provider.dart
        network/
          api_client.dart
          api_result.dart
        storage/
          secure_storage.dart
        i18n/
          app_localizations.dart
      features/
        auth/
        gallery/
        studio/
        profile/
        credits/
        api_keys/
      shared/
        widgets/
        models/
```

This keeps Flutter isolated from the web app while leaving room for a future monorepo structure.

## Recommended Architecture

### 1. Keep the existing Next.js app as the backend

Do not build a second backend for Flutter.

Keep these responsibilities on the current server:

- Clerk identity verification
- credit balance checks and deduction
- AI provider routing
- R2 upload and key generation
- Prisma writes
- ownership checks

Flutter should be a client only.

### 2. Add a stable mobile API surface

The existing routes are already close to reusable, but they are still shaped mainly for the current web app.

Recommended next step:

- add a versioned API surface such as `src/app/api/v1/...`
- keep route handlers thin
- reuse existing service modules
- normalize request and response contracts for both web and mobile clients

Suggested first endpoints:

- `POST /api/v1/generate`
- `GET /api/v1/credits`
- `GET /api/v1/images`
- `GET /api/v1/me/generations`
- `GET /api/v1/api-keys`
- `POST /api/v1/api-keys`
- `PUT /api/v1/api-keys/:id`
- `DELETE /api/v1/api-keys/:id`

Why add `v1` instead of calling every existing route directly:

- we avoid coupling Flutter to web-specific route evolution
- we can normalize envelope shapes
- we can introduce stable error codes
- we preserve the current service layer and security boundaries

### 3. Normalize API contracts before Flutter consumes them

A few current backend details are fine for web, but should be cleaned up for mobile:

- `Date` fields in TypeScript become strings over JSON, so mobile DTOs should receive ISO strings explicitly
- `/api/credits` currently returns `{ credits }`, while other routes return `{ success, data, error }`
- user-facing error strings are currently English text, which is not ideal for mobile i18n

Recommended contract direction:

- every API returns `{ success, data, error }`
- `error` contains a stable code plus optional safe message
- dates are always ISO strings
- pagination shapes stay consistent across list endpoints

## Authentication Strategy

### Recommended path

Use Clerk for Flutter sign-in, then call your Next.js API with a bearer session token.

Why this fits the current project:

- your backend already uses Clerk as the source of truth
- your protected routes already rely on Clerk server auth
- you avoid inventing a second auth system

Implementation model:

1. Flutter signs in with Clerk
2. Flutter obtains a session token
3. Flutter sends `Authorization: Bearer <token>` to your protected Next.js API
4. Next.js route handlers continue resolving the authenticated user through Clerk

Important note:

- Clerk's Flutter SDK is currently in public beta, so pin its version carefully and validate the mobile auth flow early before building the rest of the app

### Fallback path

If you do not want beta risk in the first mobile release:

- ship a public-gallery-only Flutter app first
- postpone authenticated generation/profile/API-key management until the auth path is validated

That fallback is slower for feature parity, but safer if mobile auth stability is the main concern.

## Flutter Client Stack

Recommended baseline stack:

- `clerk_flutter` for auth
- `dio` for HTTP
- `flutter_riverpod` for state management
- `go_router` for navigation
- `freezed` + `json_serializable` for typed DTOs
- `intl` for localization
- `flutter_secure_storage` for token-adjacent secure persistence
- `cached_network_image` for gallery rendering
- `image_picker` for reference-image upload

Why this stack:

- strong typing
- predictable async state
- clean feature boundaries
- good fit for a production Flutter client

## Feature Scope Recommendation

### Phase 1: POC

Goal: prove auth + one protected API call + one public API call.

Build only:

- app bootstrap
- locale switching for `en`, `ja`, `zh`
- Clerk sign-in
- `GET /api/v1/images`
- `GET /api/v1/credits`

Exit criteria:

- Flutter can sign in
- Flutter can call one protected route successfully
- public gallery loads from the same backend

### Phase 2: Core mobile MVP

Build:

- studio screen
- model picker
- prompt input
- generate action
- generation result view
- credits badge/state refresh
- public gallery screen

Do not add extra mobile-only business logic.

### Phase 3: Account features

Build:

- profile/history screen
- saved API routes management
- generation history pagination
- retry and empty states

### Phase 4: Mobile polish

Build:

- image saving/sharing
- loading and error refinement
- skeleton states
- tablet layout adjustments
- optional push notification hooks for generation lifecycle later

## Mobile Feature Mapping to Current Backend

### Already reusable now

- public gallery from `/api/images`
- generation flow logic from current generation services
- credits logic from current user services
- API key CRUD from current API-key services

### Missing or worth adding before Flutter feature parity

- authenticated generation history endpoint
- stable mobile DTOs
- stable error codes
- mobile-specific API integration tests for auth header flow

## i18n Plan

Keep the same locale set as web:

- `en`
- `ja`
- `zh`

Recommended rule:

- mobile copy lives in Flutter ARB files
- semantic key naming should match the current web message intent where possible
- do not copy server-side error prose directly into the UI
- use error codes from the API and map them to localized Flutter strings

Suggested mobile key groups:

- `common.*`
- `auth.*`
- `gallery.*`
- `studio.*`
- `profile.*`
- `credits.*`
- `apiKeys.*`

## API Design Rules for Mobile

To stay aligned with the current project rules:

- no direct AI provider calls from Flutter
- no credits math in Flutter
- no user ID trust from Flutter
- no storage key generation in Flutter
- no secret provider keys in Flutter

The Flutter app should only send user intent, not business authority.

## Recommended Flutter Layering

Inside `apps/mobile/lib`, keep this dependency direction:

- `constants/`
- `shared/models/`
- `core/`
- `features/*/data`
- `features/*/domain`
- `features/*/presentation`

Suggested feature example:

```text
features/
  studio/
    data/
      studio_api.dart
      studio_dto.dart
    domain/
      generation_request.dart
      generation_result.dart
    presentation/
      studio_page.dart
      studio_controller.dart
      widgets/
```

This mirrors the web app's current preference for clear layering and keeps UI separate from backend rules.

## Risks To Plan Around

### 1. Clerk mobile auth maturity

Because Flutter support is still beta, validate sign-in and protected API calls first.

### 2. DTO drift between web and mobile

If web and mobile each hand-roll payload shapes independently, maintenance will get noisy.

Mitigation:

- create explicit API schemas for mobile/server boundaries
- keep response envelopes stable

### 3. Upload size and mobile memory pressure

Reference images should be resized/compressed on-device before upload when appropriate.

### 4. Slow generation UX

Generations may take noticeable time, so the mobile app should show clear in-progress, success, and failure states instead of a blank spinner-only flow.

## Practical Rollout Recommendation

The best order for this repository is:

1. Add `api/v1` mobile-friendly contracts on the Next.js side
2. Create `apps/mobile` Flutter shell
3. Validate Clerk sign-in and protected API access
4. Ship public gallery + credits + studio
5. Add profile/history + API route management

This order preserves your current architecture and gives you an early checkpoint before investing in full feature parity.

## What I Would Recommend You Build First

If you want the fastest realistic start:

- create `apps/mobile`
- implement app boot, theme, locale, and router
- prove Clerk sign-in
- consume public gallery
- consume credits

If those pieces work cleanly, the rest of the product can reuse the same patterns.

## Suggested Next Task

The next concrete step should be:

`Scaffold apps/mobile and add a minimal Flutter shell with routing, localization, API client, and placeholder screens for Gallery, Studio, and Profile.`

## Notes Based On The Current Repo

This plan is based on the current codebase shape:

- existing API routes already cover generation, credits, gallery, and API-key CRUD
- business logic is already in services, which is exactly what we want for mobile reuse
- locale support already exists for `en`, `ja`, and `zh`
- mobile will benefit from a new authenticated history endpoint because profile/gallery work is still incomplete

## External References

- Clerk Flutter announcement: <https://clerk.com/changelog/2025-03-26-clerk-flutter-sdk-beta>
- Clerk docs on session tokens in the `Authorization` header: <https://clerk.com/docs/how-to/validate-session-tokens>
- Clerk Next.js server `auth()` token options: <https://clerk.com/docs/references/nextjs/auth>
- Dio package: <https://pub.dev/packages/dio>
- Riverpod package: <https://pub.dev/packages/flutter_riverpod>
- go_router package: <https://pub.dev/packages/go_router>
- flutter_secure_storage package: <https://pub.dev/packages/flutter_secure_storage>
