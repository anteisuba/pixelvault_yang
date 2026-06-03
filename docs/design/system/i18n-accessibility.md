# i18n And Accessibility

Last updated: 2026-06-02

This document records current i18n and accessibility facts for PixelVault before
future UI direction is confirmed. It is a system-level audit note, not a final
accessibility specification and not a request to change UI code.

## Current

### i18n Architecture

Current i18n facts:

- The app uses `next-intl`.
- Supported locales are `en`, `ja`, and `zh`.
- Default locale is `en`.
- Locale prefix is always present in routes.
- `src/i18n/routing.ts` is the locale source of truth.
- Runtime messages load from `src/messages/{locale}.json`.
- `src/app/[locale]/layout.tsx` wraps marketing/auth surfaces with a reduced
  message subset.
- `src/app/[locale]/(main)/layout.tsx` re-wraps main app surfaces with the full
  message bundle.
- Clerk localization is wired through `src/i18n/clerk.ts`.
- The root layout sets `lang` from the locale.
- `src/app/globals.css` has `html:lang(ja)` and `html:lang(zh)` font overrides.

Current message inventory:

| Locale | Top-level namespaces | Leaf keys |
| ------ | -------------------- | --------- |
| `en`   | 80                   | 3456      |
| `ja`   | 80                   | 3456      |
| `zh`   | 80                   | 3456      |

The inspected key sets match across all three locale files.

Existing automated coverage:

- `src/i18n/completeness.test.ts` checks locale key parity.
- `src/i18n/completeness.test.ts` checks static `useTranslations` and
  `getTranslations` calls against `en.json`.
- `src/i18n/completeness.test.ts` checks model label/description translations
  for `AI_MODELS`.
- `src/i18n/completeness.test.ts` checks provider translations under
  `StudioApiKeys.providers`.
- `e2e/i18n.spec.ts` checks `html lang`, root locale redirect, and `/gallery`
  reachability across locales.

This coverage verifies key existence and basic routing, not copy quality,
namespace quality, visible layout fit, or keyboard accessibility.

### Namespace Naming Quality

Namespace facts from `src/messages/en.json`:

| Namespace family                                                                                                           | Current quality read                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Homepage`, `AssetsPage`, `GalleryPage`, `CreatorProfile`, `PromptLibrary`, `ArenaPage`, `StoryBoard`, `Model3DGenerate`   | Mostly page/domain-oriented and understandable.                                                                                   |
| `Common`, `Errors`, `Toasts`, `Metadata`, `Models`, `Navbar`                                                               | Shared namespaces exist and are used across pages.                                                                                |
| `StudioV2`, `StudioV3`, `StudioForm`, `StudioPromptArea`, `StudioPage`, `StudioImageEdit`, `StudioPanels`, `StudioToolbar` | Studio copy is split across versioned, page, form, panel, and legacy-like namespaces. Highest naming drift risk.                  |
| `CharacterCard`, `StyleCard`, `BackgroundCard`, `CardSlot`, `Cardify`                                                      | Card copy has domain-specific namespaces, but Cards page components still reuse `StudioV2` for toolbar/manager text.              |
| `StudioNode`                                                                                                               | Very large domain namespace: 611 leaf keys in English. It centralizes Node copy, but is too broad for quick ownership scanning.   |
| `audioParams`, `audioFeedback`, `sceneFeedback`, `sceneProgress`, `workflows`                                              | Lowercase top-level namespace names coexist with PascalCase namespaces. This is a naming consistency issue, not a key parity bug. |

Current quality judgment:

- Good: locale parity is strong, and major pages have recognizable namespaces.
- Good: `Models` and `StudioApiKeys.providers` are covered by dedicated tests.
- Weak: namespace naming mixes page names, component names, feature versions,
  lowercase names, and domain names.
- Weak: `StudioV2` and `StudioV3` are still active copy sources, so the message
  architecture leaks implementation history into current UI.
- Weak: shared primitive copy does not have a clear shared component namespace.

### Page Copy Concentration Matrix

This matrix records where visible page copy currently appears. It is a source
fact map, not a translation rewrite plan.

| Page doc           | Primary namespaces / copy sources                                                                                   | Current read                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `home.md`          | `Homepage`, `Common`, `Metadata`, `Models`, `Navbar`                                                                | Fairly concentrated; marketing subset in `messages-split.ts` supports this surface.                      |
| `studio.md`        | `StudioV2`, `StudioV3`, `StudioForm`, `StudioPromptArea`, `StudioPage`, `StudioImageEdit`, plus modality namespaces | Most fragmented page family; versioned namespaces and shared workspace copy need future consolidation.   |
| `assets.md`        | `AssetsPage`, `Common`, `PromptLibrary`, `Errors`                                                                   | Mostly concentrated under `AssetsPage`; detail sheet borrows shared domains where appropriate.           |
| `gallery.md`       | `GalleryPage`, `GalleryCard`, `ImageDetail`, `Common`, `Models`, `Metadata`                                         | Split between feed/card/detail; understandable but page and component ownership should stay explicit.    |
| `profile.md`       | `CreatorProfile`, `ErrorBoundary`                                                                                   | Concentrated.                                                                                            |
| `cards.md`         | `StudioV2`, `CharacterCard`, `StyleCard`, `BackgroundCard`, `CardSlot`, `Cardify`                                   | Mixed ownership; Cards still depends on Studio copy for manager and toolbar labels.                      |
| `node-workflow.md` | `StudioNode`, `Models`, `Errors`                                                                                    | Centralized but oversized; sub-namespace ownership inside `StudioNode` matters more than top-level name. |
| `3d.md`            | `Model3DGenerate`, `StudioForm`, `Models`                                                                           | Mostly concentrated; dense 3D controls still borrow generic Studio form copy.                            |
| `prompts.md`       | `PromptLibrary`, `PromptAssistant`, `PromptEnhance`, `PromptFeedback`, `Common`                                     | Mostly concentrated.                                                                                     |
| `arena.md`         | `ArenaPage`, `ArenaHistory`, `ArenaLeaderboard`, `ArenaPersonalStats`, `Models`, `Metadata`                         | Split by route section; understandable.                                                                  |
| `storyboard.md`    | `StoryBoard`, `Metadata`                                                                                            | Concentrated.                                                                                            |

### Hardcoded UI Copy Findings

These are inspected source facts. The list is not exhaustive for every literal
in the repository, but it captures the main user-visible or accessibility-name
patterns found in this pass.

| Source                                                                   | Current hardcoded copy / fallback                                | Why it matters                                                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/dialog.tsx`                                           | default `closeLabel = 'Close'`; footer close button text `Close` | Shared primitive can leak English into any caller that does not override the label.                                             |
| `src/components/ui/sheet.tsx`                                            | sr-only close text `Close`                                       | Shared Sheet close accessibility name is English-only.                                                                          |
| `src/components/ui/sidebar.tsx`                                          | `Sidebar`, `Displays the mobile sidebar.`, `Toggle Sidebar`      | Sidebar primitive labels and hidden dialog copy bypass message files.                                                           |
| `src/components/business/studio-shared/pickers/BaseModelPickerPanel.tsx` | fallback `Select model`, `Search models...`, `No models found`   | Callers often pass translated labels, but the shared fallback remains English.                                                  |
| `src/components/business/StudioWorkspaceUI.tsx`                          | skip link text `Skip to prompt`                                  | Visible-on-focus accessibility text is English-only.                                                                            |
| `src/components/business/studio/lora/LoraWorkbench.tsx`                  | `aria-label="clear"`                                             | Icon-only clear action has an untranslated accessibility name.                                                                  |
| `src/components/business/cards/StyleCardEditor.tsx`                      | placeholder `LoRA URL (Civitai / HuggingFace)`                   | Visible input hint bypasses locale files.                                                                                       |
| `src/components/business/cards/SimpleCardManager.tsx`                    | placeholder `https://civitai.com/api/download/models/...`        | URL example may be acceptable as data copy, but it should be deliberately classified as non-localized.                          |
| `src/components/business/Studio3DWorkspace.tsx`                          | placeholders `auto`, `W`, `H`, `L`                               | Short technical placeholders may be acceptable, but they need an explicit localization decision.                                |
| `src/app/global-error.tsx`                                               | manual `GLOBAL_ERROR_COPY` map from message JSON                 | This is not hardcoded English, but it bypasses normal `next-intl` retrieval because global errors run outside normal providers. |

Current read:

- Most major page copy uses message files.
- Hardcoded English is concentrated in shared primitives, accessibility-only
  labels, and fallback props.
- Some technical placeholders may be intentionally non-localized, but the rule
  is not documented yet.

### Accessibility / Keyboard / Focus Facts

Current positive facts:

- Root and locale layouts set page language through `lang`.
- Main layout provides a skip link to `#main-content`.
- `StudioWorkspaceUI` provides a skip link to `#studio-prompt`.
- Mobile tab navigation has an `aria-label` from `Navbar.mobileNavigation`.
- Mobile tab links use `aria-current="page"` for active tabs.
- `PromptInputTextarea` receives an aria label from `StudioForm.promptLabel`.
- Studio Generate button has an aria label from `StudioV2.generate`, sets
  `aria-busy`, and exposes loading text through sr-only content.
- `ModelSelector` uses `role="radiogroup"` and `role="radio"` or
  `role="checkbox"` for selectable model options.
- `AssetSelectorDialog` includes sr-only `DialogTitle` and
  `DialogDescription`.
- Base Input/Textarea/Select paths include focus ring and `aria-invalid`
  styling support.
- Many overlays use Radix primitives, so baseline focus trapping and escape
  behavior come from Radix where the primitive is used directly.

Current issues or gaps:

| Surface / source                                          | Current fact / risk                                                                                                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed-in account menu in `AppSidebar`                    | Custom motion popover, not Radix DropdownMenu. QA showed Enter/Space open and Tab traversal works, but Escape did not close and ArrowDown did not move focus between menu items.    |
| Signed-in account menu roles                              | Menu items are plain buttons without menu/menuitem roles in the inspected DOM.                                                                                                      |
| Signed-in account trigger naming                          | Account trigger and first menu item both expose "View Profile", which can be ambiguous once the menu is open.                                                                       |
| `StudioWorkspaceUI` tabpanel                              | Uses `role="tabpanel"` and `aria-labelledby="studio-tab-${outputType}"`, but matching `studio-tab-*` IDs were not found during source search.                                       |
| Studio mobile virtual keyboard                            | User-provided real-device screenshots show Image, Audio, and Video prompt docks are covered or clipped by the system keyboard/accessory bar.                                        |
| Studio Generate disabled semantics                        | Button is disabled for generating/audio text over-limit, but also sets `aria-disabled={!canGenerate}` while handler gating covers other invalid states. Needs a deliberate pattern. |
| Base model picker popover                                 | Uses `Popover` + `Command`; keyboard traversal and search behavior were not yet captured as browser evidence.                                                                       |
| Dialog/Sheet close labels                                 | Shared close labels can be English unless every caller overrides them.                                                                                                              |
| Dense editor controls in Cards, 3D, Node, and Studio Edit | Many compact inputs/buttons need per-page focus order, label association, text overflow, and keyboard QA.                                                                           |
| Route loading/error screens                               | Visual states exist, but route-level focus restoration, announcement behavior, and localized error copy quality have not been systematically tested.                                |

Accessibility evidence already recorded elsewhere:

- `docs/design/system/layout-shell.md` records signed-in account menu keyboard
  QA.
- `docs/design/system/layout-shell.md` records automated and real-device mobile
  keyboard QA for Studio prompt surfaces.
- `docs/design/pages/studio.md` records Studio page-level prompt, picker,
  generate button, and edit workspace interaction facts.

### en / ja / zh Long Text Risk

Current message-length facts from `src/messages/{locale}.json`:

- The longest English namespaces by leaf count are `StudioNode` with 611 keys,
  `Model3DGenerate` with 185 keys, `Homepage` with 124 keys, `AssetsPage` with
  119 keys, and `LoraTraining` with 119 keys.
- Many long strings are explanatory help text, provider capability notes, model
  descriptions, and empty-state descriptions.
- In the inspected locale files, English is usually longer than Japanese and
  Chinese by character count.
- Japanese and Chinese still carry layout risk because CJK text has different
  wrapping behavior, font metrics, and no whitespace-based word breaks in many
  labels.

Longest / high-risk copy examples:

| Key                                                    | English length | Japanese length | Chinese length | Risk type                                 |
| ------------------------------------------------------ | -------------- | --------------- | -------------- | ----------------------------------------- |
| `StudioNode.videoGeneration.audioCallout.ignored.body` | 290            | 156             | 125            | long callout / dense panel text           |
| `Model3DGenerate.rodinMeshFirstHint`                   | 203            | 102             | 68             | dense 3D helper text                      |
| `Homepage.featureSections.imageEditing.description`    | 171            | 76              | 62             | marketing description                     |
| `Homepage.modelLineup.description`                     | 168            | 73              | 65             | marketing description with count variable |
| `StudioNode.voiceProfile.outputHint`                   | 158            | 61              | 45             | Node inspector helper text                |
| `StudioForm.errorCodes.NOVELAI_TIER_LIMIT`             | 145            | 64              | 53             | error dialog / form message               |
| `PromptLibrary.placeholderDescription`                 | 141            | 63              | 43             | pluralized prompt detail copy             |
| `Errors.provider.safetyBlocked`                        | 139            | 76              | 48             | provider error copy                       |
| `StudioImageAdvancedParams.seedHint`                   | 138            | 76              | 70             | advanced parameter helper text            |
| `StudioPromptArea.samplePrompts.quickImage`            | 114            | 34              | 32             | sample prompt content                     |

Current quality read:

- Long copy is concentrated in helper text, callouts, descriptions, and errors,
  not just page heroes.
- Compact chips, buttons, tabs, model picker rows, mobile bottom bars, and
  dense editors remain the highest i18n layout risk even when copy is not long.
- Future QA should include `en`, `ja`, and `zh` screenshots for the same page
  state, especially Studio, Cards, Node, 3D, Gallery detail, and route error
  states.

## Problems

1. Namespace key parity is strong, but namespace ownership is not yet clean.
2. Studio copy is fragmented across versioned and domain namespaces.
3. Cards page copy still depends on `StudioV2`, which makes page ownership
   unclear.
4. Shared primitives can leak English fallback labels.
5. Accessibility-only strings are easier to miss because they are not always
   visible in screenshots.
6. The signed-in account menu is visually usable, but not yet a complete
   keyboard menu pattern.
7. Studio has known mobile virtual-keyboard reachability problems from
   real-device screenshots.
8. Long-text and CJK wrapping QA has not been run systematically page by page.
9. Route loading/error/empty states have not been audited for announcement,
   focus, keyboard recovery, and localized copy quality.

## Target To Confirm

Before turning this into a final design-system rule set, confirm:

- Should namespace names move toward page/domain names instead of implementation
  versions such as `StudioV2` and `StudioV3`?
- Should shared primitive copy live under `Common`, a new `Components`
  namespace, or caller-provided required labels only?
- Which technical tokens and placeholders are intentionally non-localized
  examples, such as `auto`, `W`, `H`, `L`, and URL examples?
- Should the signed-in account menu be replaced with a Radix DropdownMenu or
  hardened as a custom menu?
- Should route loading/error/empty states use a shared accessible state pattern?
- What is the expected mobile keyboard behavior for Studio prompt surfaces?

## Do Not Break

Preserve these current contracts while improving i18n/accessibility later:

- Locale-prefixed routes: `/en`, `/ja`, `/zh`.
- `DEFAULT_LOCALE = 'en'`.
- Clerk localization wiring.
- Marketing message subset optimization in `src/i18n/messages-split.ts`.
- Full message bundle re-wrap in `(main)/layout.tsx`.
- Existing `src/i18n/completeness.test.ts` coverage.
- Existing page/domain message keys until a migration plan is confirmed.
- Radix primitive focus behavior where existing overlays rely on it.
- Studio prompt IME guard, mobile focus scroll behavior, paste/drop flows, and
  route mode sync.

## Source Of Truth

Primary source files inspected:

- `src/i18n/routing.ts`
- `src/i18n/request.ts`
- `src/i18n/messages-split.ts`
- `src/i18n/completeness.test.ts`
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`
- `src/app/[locale]/layout.tsx`
- `src/app/[locale]/(main)/layout.tsx`
- `src/app/global-error.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/MobileTabBar.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/business/StudioWorkspaceUI.tsx`
- `src/components/business/studio/StudioPromptArea.tsx`
- `src/components/business/studio-shared/pickers/BaseModelPickerPanel.tsx`
- `src/components/business/ModelSelector.tsx`
- `src/components/business/AssetSelectorDialog.tsx`

Related design docs:

- `docs/design/system/layout-shell.md`
- `docs/design/system/components.md`
- `docs/design/pages/studio.md`

## Last Verified

Verified on 2026-06-02 by source inspection and local scripts:

- Top-level namespace count: `80` for `en`, `ja`, and `zh`.
- Leaf key count: `3456` for `en`, `ja`, and `zh`.
- Missing key diff against English: `0` for `ja`, `0` for `zh`.
- Extra key diff against English: `0` for `ja`, `0` for `zh`.
- Long-copy examples generated from `src/messages/{locale}.json`.
- Hardcoded UI copy examples found with source search.
- Accessibility facts cross-checked against layout-shell and Studio page docs.

Not yet verified in this pass:

- Full browser keyboard QA for every page.
- Screen reader behavior.
- Axe/Lighthouse accessibility audit.
- en/ja/zh screenshots for every route loading/error/empty/success state.
- Real-device mobile keyboard QA for `/studio/edit/*`, Node, 3D, Cards, and
  prompt/template dialogs.
