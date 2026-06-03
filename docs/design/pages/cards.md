# Cards Page

Last updated: 2026-06-02

This document records current page-level facts for Cards. It is not a redesign
spec and not a request to change UI code.

## Current

### Route Surface

| Surface | Route    | Current UI entry   | Notes                          |
| ------- | -------- | ------------------ | ------------------------------ |
| Cards   | `/cards` | `CardsPageContent` | signed-in card management page |

### Structure

Route behavior:

- resolves Clerk auth on the server
- signed out: renders editorial sign-in panel
- signed in: renders `CardsPageContent`

Current signed-in structure:

- dark sidebar-colored page surface
- header with card management title/hint
- tabs:
  - characters
  - styles
  - backgrounds
- tab bodies reuse existing card manager components

## Current State Matrix

| State      | Current fact                                                          |
| ---------- | --------------------------------------------------------------------- |
| Loading    | manager-level loading states in character/style/background managers   |
| Error      | manager/form errors and toast paths; no route-level Cards error found |
| Empty      | per-manager empty and search-empty states                             |
| Signed-out | editorial sign-in panel with CTA                                      |
| Signed-in  | tabbed card manager surface                                           |
| No credits | not page-owned                                                        |

## Page CSS / Layout Rules

Current CSS facts:

- signed-in page uses `dark min-h-[calc(100svh-3rem)] bg-sidebar
text-sidebar-foreground`.
- signed-out page uses `editorial-page`, `editorial-container`, and
  `editorial-panel`.
- managers use shadcn primitives and many small labels.
- arbitrary values include dialog `max-h-[85vh]`, `text-[10px]`, chip width
  caps, and manager-specific small controls.

## Components

| Area        | Components                                                                        |
| ----------- | --------------------------------------------------------------------------------- |
| route       | `src/app/[locale]/(main)/cards/page.tsx`                                          |
| page        | `CardsPageContent`                                                                |
| managers    | `CharacterCardManager`, `StyleCardManager`, `SimpleCardManager`                   |
| create/edit | `CharacterCardCreateForm`, `StyleCardEditor`, background manager forms            |
| cards       | `CharacterCardItem`, `CharacterCardTile`, shared card dropdown/gallery components |

## Interaction Details

Current page-internal interaction matrix:

| Interaction                   | Current trigger / owner                            | Current state / feedback                                                                                          | Design notes                                                                           |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Initial tab                   | `CardsPageContent` reads `tab` search param        | Chooses characters/styles/backgrounds when valid; falls back to characters                                        | URL param only chooses initial tab; tab changes are local Radix Tabs state.            |
| Tab switching                 | `TabsTrigger` in `CardsPageContent`                | Switches mounted manager surface                                                                                  | Three tabs share one page frame but have different interaction density.                |
| Manager search/sort           | `CardManagerToolbar`                               | Search filters cards; select sort switches recent/created/name; search-empty is separate from true empty          | Toolbar pattern is reused by card managers.                                            |
| Character create              | Character manager create button or empty-state CTA | Opens inline `CharacterCardCreateForm`; create disabled while loading/creating                                    | Create form is inline, not a modal.                                                    |
| Character source image upload | Character create form file input                   | Adds source image entries, supports removing entries and assigning source image view type                         | Multi-image/view-type controls are important card facts.                               |
| Cardify preview               | Character create submit with cardify enabled       | Renders `CardifyPreview`; user can accept, regenerate, use original, or cancel preview                            | This is a blocking preview step before card creation.                                  |
| Character active selection    | Character card tile/item select controls           | Maintains `activeCardIds`; supports multiple active character cards                                               | Selection is generation-context state, not just list selection.                        |
| Character detail dialog       | Character card tile open-detail action             | Opens `Dialog` with full `CharacterCardItem` content; closing resets `detailCardId`                               | Detail dialog reuses item component and must preserve action semantics.                |
| Character variants            | Character item variant controls                    | Can expand variants, show variant form, and create variant under parent card                                      | Variant UX is nested and may be hard to read on mobile.                                |
| Character prompt edit/refine  | Character item edit/refine actions                 | Saves prompt changes; refine paths can generate/score outputs and show `CharacterCardGallery`                     | Refinement is a high-risk async path for future design.                                |
| Style manager view states     | `StyleCardManager` `view` state                    | Switches between list, create, edit, and confirm-delete views                                                     | Style manager swaps whole panel content instead of opening modals for create/edit.     |
| Style create/edit             | `StyleCardEditor`                                  | Edits name, mode, model, reference image or LoRA configuration, prompt, and advanced params; save returns to list | Mode switch resets selected model; LoRA placeholder is currently hardcoded.            |
| Style detail dialog           | Style card open-detail action                      | Opens `Dialog` with edit, duplicate, and delete actions                                                           | Duplicate creates a new style card from existing data.                                 |
| Background manager            | `SimpleCardManager` in background tab              | Supports create, edit prompt, delete, active selection, image upload, optional LoRA fields, search/sort/detail    | Background uses a generic manager rather than a dedicated component family.            |
| Card dropdown reuse           | `CardDropdown` in card-consuming surfaces          | Popover can search/sort cards, pick none, select card, open detail, or create new                                 | This is not only `/cards`, but it is part of the Cards interaction system.             |
| Loading/empty distinction     | Each manager                                       | Separate manager loading, no-card empty, search-empty, and gallery empty states                                   | Do not collapse these states into one generic empty message without confirming intent. |

## Responsive

Known source facts:

- page max width is `max-w-5xl`.
- tabbed manager content is flex/min-height based.
- no fresh mobile/tablet screenshot pass was run for this page document.

## Empty / Loading / Error States

Current empty facts:

- `CharacterCardManager` has no-cards and search-empty messages.
- `StyleCardManager` has empty/search-empty/no-model messaging.
- `SimpleCardManager` has empty/search-empty states.
- `CharacterCardGallery` has loading and empty states for card generations.

## Screenshot Evidence

Not captured in this pass.

Needed later:

- signed-out Cards;
- signed-in characters tab empty and non-empty;
- style/background tabs empty and non-empty;
- create form/dialog;
- search-empty;
- mobile 390 and tablet 768.

## i18n / Accessibility

- Route metadata uses `Metadata.cards`.
- Signed-out copy uses `StudioV2` and `Navbar`.
- Managers use `StudioV2`, `BackgroundCard`, and card-specific namespaces.
- Tabs, create forms, image uploads, and dialogs need keyboard QA before
  redesign.

## Do Not Break

- Auth gate for card management.
- Character/style/background CRUD flows.
- Active card selection state.
- Card reuse from Studio and Node workflow.
- Card ownership and project relationships.

## Unresolved

- Should Cards keep borrowing `sidebar-*` tokens for page background?
- Should CardRecipe get a first-class page tab?
- Should VoiceCard belong in this page or remain Studio/Node-owned?

## Source Of Truth

- `docs/domains/cards.md`
- `src/app/[locale]/(main)/cards/page.tsx`
- `src/components/business/cards/CardsPageContent.tsx`
- `src/components/business/cards/CharacterCardManager.tsx`
- `src/components/business/cards/StyleCardManager.tsx`
- `src/components/business/cards/SimpleCardManager.tsx`
- `src/components/business/cards/CharacterCardCreateForm.tsx`
- `src/hooks/cards/use-character-cards.ts`
- `src/hooks/cards/use-style-cards.ts`
- `src/hooks/cards/use-background-cards.ts`
- `src/constants/routes.ts`
- `src/services/cards/**`

## Last Verified

- Date: 2026-06-02
- Method: documentation review and code inspection of Cards domain, route,
  page content, managers, hooks, and source files listed above.
