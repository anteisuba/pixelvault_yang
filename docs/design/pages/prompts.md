# Prompts Page

Last updated: 2026-06-02

This document records current page-level facts for the prompt library. It is
not a redesign spec and not a request to change UI code.

## Current

### Route Surface

| Surface        | Route           | Current UI entry                 | Notes                 |
| -------------- | --------------- | -------------------------------- | --------------------- |
| Prompt library | `/prompts`      | prompt library route composition | mine/inspiration tabs |
| Prompt detail  | `/prompts/[id]` | `PromptTemplateDetailEditor`     | signed-in owner route |

### Structure

`/prompts` structure:

- validates query params with `PromptCreateQuerySchema`
- reads auth state
- renders `PromptLibraryTabs`
- `tab=inspiration` renders `InspirationGrid`
- default `mine` tab renders `MineTab`
- `MineTab` can show create panel, saved recipe list, signed-out panel, or
  empty state

`/prompts/[id]` structure:

- requires Clerk auth
- loads owned recipe through `getRecipe`
- returns `notFound()` if signed out or recipe missing
- renders detail editor
- lists generations created from this prompt recipe

## Current State Matrix

| State      | Current fact                                                                           |
| ---------- | -------------------------------------------------------------------------------------- |
| Loading    | component-level inspiration/list/editor loading; no route loading found for `/prompts` |
| Error      | detail uses `notFound()` for signed-out/missing recipe; create/update failures toast   |
| Empty      | signed-in mine tab empty saved-template state; detail no-generated-assets state        |
| Signed-out | mine tab shows editorial empty/open-Studio panel; inspiration remains available        |
| Signed-in  | create panel, saved recipe list, inspiration grid, detail editor                       |
| No credits | not page-owned                                                                         |

## Page CSS / Layout Rules

Current CSS facts:

- pages use `editorial-page`, `editorial-container`, and `editorial-panel`.
- detail generated assets use `bg-card/70`, `border-border`, badges, and
  responsive grids.
- no broad `prompts-*` CSS family was found.

## Components

| Area        | Components                                    |
| ----------- | --------------------------------------------- |
| route       | `/prompts/page.tsx`, `/prompts/[id]/page.tsx` |
| tabs        | `PromptLibraryTabs`                           |
| create      | `PromptTemplateCreatePanel`                   |
| list        | `PromptTemplateList`                          |
| inspiration | `InspirationGrid`                             |
| detail      | `PromptTemplateDetailEditor`                  |

## Interaction Details

Current page-internal interaction matrix:

| Interaction                | Current trigger / owner                                               | Current state / feedback                                                                                            | Design notes                                                                                 |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tab navigation             | `PromptLibraryTabs` links to `/prompts` or `/prompts?tab=inspiration` | Uses `aria-current="page"` on active tab; route-level query decides current tab                                     | Tabs are route links, not local-only tab state.                                              |
| Create panel initial state | `PromptTemplateCreatePanel` reads query-prefill props                 | `create=1` or prefilled prompt opens panel by default; otherwise panel starts collapsed                             | Query prefill is the main handoff from Assets/Studio.                                        |
| Create form fields         | Prompt, name, model, output type, provider, negative prompt controls  | Changing model also updates output type and default provider                                                        | Model/provider/output fields are coupled.                                                    |
| Create submit              | Create form submit                                                    | Requires compiled prompt, sets saving state, calls create API, toasts success/failure, routes to new detail         | Submit changes route and refreshes.                                                          |
| Create reset/collapse      | Reset and collapse buttons                                            | Reset restores normalized initial values; collapse may reset only when no initial compiled prompt exists            | Collapsing a prefilled form intentionally preserves imported prompt.                         |
| Mine list card open        | `PromptTemplateList` item button                                      | Opens detail-like dialog with transition origin and prompt/template metadata                                        | List card detail is a modal preview, separate from `/prompts/[id]`.                          |
| Mine list prompt actions   | Dialog/list actions                                                   | Copy prompt to clipboard/toast; use in Studio writes sessionStorage and routes by output type; edit links to detail | Use-in-Studio depends on `STUDIO_PREFILL_PROMPT_STORAGE_KEY`.                                |
| Detail edit mode           | `PromptTemplateDetailEditor` edit action                              | Toggles editable fields for name, prompt, negative prompt, provider; reset/cancel restore previous values           | Detail page is owner-only and uses in-place editing.                                         |
| Detail save                | Detail editor save button                                             | Validates prompt, saves recipe API, updates local state, exits edit mode, refreshes route                           | Version is updated from API response.                                                        |
| Detail generated assets    | Generated asset cards in `/prompts/[id]`                              | Link each asset back to Assets with `assetGenerationPath`                                                           | This is a prompt-to-asset traceability path.                                                 |
| Inspiration filters        | `InspirationFilters` search, sort select, category chips              | Updates hook filters for query/category/sort; category chips expose `aria-pressed`                                  | Inspiration filtering is client-side hook-owned.                                             |
| Inspiration load more      | Inspiration grid load-more button                                     | Uses hook pagination; shows loading-more copy and appends results                                                   | Separate from Mine tab pagination.                                                           |
| Inspiration clone          | `InspirationCard` clone action                                        | Can clone inspiration into user recipes; failures toast with PromptLibrary copy                                     | Clone may require signed-in behavior through API/hook.                                       |
| Placeholder fill dialog    | Placeholder-enabled inspiration prompt                                | Opens dialog, extracts placeholders, autofocuses first field, previews applied prompt, applies values               | This is a key interaction for template prompts and long-form copy.                           |
| Prompt assistant component | `PromptAssistantPanel` under prompts component cluster                | Supports presets, model route picker, response language, image file/asset reference, IME-safe Enter submit          | Component is part of prompt tooling, but page placement should be confirmed before redesign. |

## Responsive

Known source facts:

- editorial container and grid utilities provide responsive layout.
- generated assets grid uses `sm:grid-cols-2` and `xl:grid-cols-3`.
- no fresh mobile/tablet screenshot pass was run for this page document.

## Empty / Loading / Error States

Current empty states:

- signed-out mine tab: editorial panel with CTA to Studio.
- signed-in mine tab with no recipes: editorial panel with CTA to Assets and
  Studio.
- detail with no generated assets: rounded card with `noGeneratedAssets`.

## Screenshot Evidence

Not captured in this pass.

Needed later:

- mine tab signed out;
- mine tab signed in empty;
- mine tab with recipes;
- inspiration tab;
- create panel open with prefill;
- detail page with/without generated assets;
- mobile 390 and tablet 768.

## i18n / Accessibility

- Route metadata uses `Metadata.prompts`.
- Page copy uses `PromptLibrary`.
- Detail output-type labels are localized.
- Tabs, create panel, and editor controls need keyboard QA.

## Do Not Break

- Signed-in ownership for prompt detail.
- Query-prefill path from Assets/Studio into create panel.
- Inspiration tab availability.
- Recipe/generation linkage.
- Prompt copy staying translation-ready.

## Unresolved

- Should inspiration and saved prompts feel like the same library or separate
  modes?
- Should empty saved-template state route users to Studio, Assets, or both?
- Which prompt editor states require screenshots before redesign?

## Source Of Truth

- `src/app/[locale]/(main)/prompts/page.tsx`
- `src/app/[locale]/(main)/prompts/[id]/page.tsx`
- `src/components/business/prompts/PromptTemplateCreatePanel.tsx`
- `src/components/business/prompts/PromptTemplateList.tsx`
- `src/components/business/prompts/PromptTemplateDetailEditor.tsx`
- `src/components/business/prompts/inspiration/InspirationGrid.tsx`
- `src/components/business/prompts/inspiration/PromptLibraryTabs.tsx`
- `src/services/prompts/recipe.service.ts`
- `src/constants/routes.ts`
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`

## Last Verified

- Date: 2026-06-02
- Method: code inspection of prompt routes, prompt components, recipe service,
  and message source files listed above.
