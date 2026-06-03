# Components

Last updated: 2026-06-02

This document records current component-system facts for PixelVault. It focuses
on shared UI primitives, overlay primitives, loading/feedback components, form
controls, asset selection, and model pickers.

It is a current-state inventory, not a final component design system and not a
request to change UI code.

## Current

### Component Layers

Current component ownership is split across these layers:

| Layer                        | Current role                                                                 | Source          |
| ---------------------------- | ---------------------------------------------------------------------------- | --------------- |
| `src/components/ui/**`       | shadcn/Radix-style primitives, base controls, overlay wrappers, feedback UI  | UI source       |
| `src/components/layout/**`   | app shell, sidebar, mobile rail/header/tab bar, locale switcher, providers   | layout source   |
| `src/components/business/**` | domain-aware components for Studio, Assets, Gallery, Cards, Profile, etc.    | business source |
| `studio-shared/**`           | shared Studio chrome, model pickers, setup dialogs, workflow controls        | Studio source   |
| domain subfolders            | Node, cards, prompts, image, edit, lora, gallery-specific component clusters | business source |

There is no single `components.md`-style contract in code. Components are
currently organized by source folder and domain usage.

### Shared UI Primitive Inventory

| Primitive family             | Current implementation facts                                                                                         | Notes                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `Button`                     | `class-variance-authority` variants: default, destructive, outline, secondary, ghost, link; sizes include xs/icon-xs | shared baseline button primitive                   |
| `Input`, `Textarea`, `Label` | direct primitives with `data-slot`, focus ring, `aria-invalid`, disabled styles, and shadcn semantic tokens          | no form-field wrapper found in this pass           |
| `Select`                     | Radix Select wrapper with trigger/content/item/scroll buttons and Radix runtime sizing variables                     | used by filters, forms, Studio/3D panels           |
| `Slider`, `Switch`           | Radix wrappers with semantic tokens and focus-visible rings                                                          | dense controls often override sizing locally       |
| `Tabs`                       | Radix Tabs wrapper with `default` and `line` list variants                                                           | used by Cards and prompt/library-like surfaces     |
| `Command`                    | `cmdk` wrapper used for searchable command/model picker surfaces                                                     | default list max height is `300px`                 |
| `Tooltip`                    | Radix Tooltip wrapper with `delayDuration=0` by default                                                              | used inside prompt input actions and compact tools |
| `Skeleton`                   | one primitive: `animate-pulse rounded-md bg-accent`                                                                  | no skeleton taxonomy by page/state                 |
| `Toaster`                    | Sonner wrapper mounted once in main layout, positioned `top-right`                                                   | toast calls import `toast` from `sonner` directly  |

### Overlay Matrix

| Overlay               | Base library / primitive              | Current behavior                                                                                                   | Current concerns to verify                                    |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `Dialog`              | Radix Dialog                          | centered fixed content, black/blur overlay, default close button, `max-w-[calc(100%-2rem)]`, default `sm:max-w-lg` | mobile keyboard and tall content need per-dialog QA           |
| `Sheet`               | Radix Dialog primitive                | side-based fixed panel, default right side, optional close button, `w-3/4`, `sm:max-w-sm` for left/right           | close label is hardcoded as `Close` in primitive              |
| `Drawer`              | `vaul`                                | bottom sheet with overlay, handle bar, rounded top corners, Title/Description wrap vaul/Radix primitives           | page-specific caps are added by callers                       |
| `ResponsiveDialog`    | desktop `Dialog`, mobile `Drawer`     | switches by `useIsMobile`; mobile content caps at `max-h-[95svh]` with safe-area-aware bottom padding              | docs warn not to use `defaultOpen=true`                       |
| `Popover`             | Radix Popover                         | custom interaction guard prevents internal focus/pointer events from closing the popover incorrectly               | many callers add custom width/max-height values               |
| `AssetSelectorDialog` | `Dialog` + `KreaAssetBrowser`         | dark Krea overlay, hidden default close, single/multi select, optional `mediaType`, optional max selection         | not a `ResponsiveDialog`; mobile behavior needs screenshot QA |
| model picker popover  | `Popover` + `Command`                 | searchable grouped model list with saved/platform/locked sections, health dots, and setup handoff                  | old and new model pickers coexist                             |
| API Keys sheet        | `Sheet` through sidebar/account flows | API key management opens inside shell/account context                                                              | keyboard QA found account menu gaps in `layout-shell.md`      |

### Dialog / Sheet / Popover Usage Facts

Observed import counts from source search:

| Import / component                  | Observed refs |
| ----------------------------------- | ------------- |
| `@/components/ui/dialog`            | 17            |
| `@/components/ui/sheet`             | 6             |
| `@/components/ui/popover`           | 15            |
| `@/components/ui/drawer`            | 3             |
| `@/components/ui/responsive-dialog` | 2             |
| `AssetSelectorDialog`               | 39            |
| `BaseModelPickerPanel`              | 29            |
| `MainModelPicker`                   | 44            |
| `PromptInput`                       | 41            |
| direct `sonner` usage               | 77            |

These counts are source-search facts, not a quality score.

## Key Composite Components

### AssetSelectorDialog

`AssetSelectorDialog` is the current reusable asset picker shell.

Current facts:

- wraps `KreaAssetBrowser`;
- uses `Dialog`, not `ResponsiveDialog`;
- suppresses the default Dialog close button and renders its own dark close
  button;
- requires a visually hidden `DialogTitle` and `DialogDescription`;
- supports single select through `onSelect`;
- supports multi-select through `pickerMultiSelect` and `onConfirmMany`;
- supports `maxSelection`;
- supports media-type lock: `image`, `video`, `audio`, `model_3d`;
- closes itself after single select or multi-confirm;
- uses a dark sidebar token surface inside the modal.

Current known callers include Studio reference flows, Studio edit source
selection, Node inspectors, 3D source selection, Storyboard asset selection,
LoRA training, ImageSourcePicker, and prompt assistant flows.

### Model Picker Family

Current picker architecture:

- `StudioModelOption` type currently lives in `ModelSelector.tsx`.
- `BaseModelPickerPanel` is the current shared popover picker.
- `MainModelPicker` dispatches by modality:
  - image
  - video
  - audio
  - `model_3d`
  - `llm_assist`
- `BaseModelPickerPanel` uses `Popover` + `Command`.
- Options are split by `useSplitModelOptions` into saved, platform, and locked
  groups.
- Saved key options can show `ApiKeyHealthDot`.
- Locked options call `onRequestSetup` and close the popover.
- `WorkflowModelPicker` and `EditProviderPicker` reuse
  `BaseModelPickerPanel`.

Legacy / alternate picker fact:

- `ModelSelector` still exists as a larger list-style model selector with
  search, style/provider grouping, collapse state, `role="radiogroup"`, and
  optional compare multi-select.
- New Studio prompt surfaces use `MainModelPicker`; older or specialized flows
  may still depend on the `StudioModelOption` type exported from
  `ModelSelector.tsx`.

### PromptInput

`PromptInput` is a compound input primitive used by Studio.

Current facts:

- owns a context for loading, value, setter, max height, disabled state,
  submit callback, and textarea ref;
- writes `--prompt-max-h` on the root;
- `PromptInputTextarea` uses `react-textarea-autosize`;
- Enter submits, Shift+Enter inserts a line break;
- IME composition is guarded before submit;
- mobile focus runs `scrollIntoView({ block: 'center' })` after a timeout;
- `PromptInputAction` wraps icon actions in tooltips.

This is not a generic form control. It is a specialized creator prompt
surface, mostly used by Studio.

## Loading, Error, Empty, Toast

### Skeleton

Current `Skeleton` is intentionally minimal:

- `animate-pulse`;
- `rounded-md`;
- `bg-accent`;
- accepts caller className.

Route loading pages and component loading states compose their own skeleton
layouts with this primitive.

### Toast

Current toast facts:

- `Toaster` is mounted in `src/app/[locale]/(main)/layout.tsx`.
- Toast position is `top-right`.
- `Toaster` styles Sonner through class names using `bg-card`, `border-border`,
  `text-foreground`, `font-serif`, and destructive/success border variants.
- Business components import `toast` directly from `sonner`.
- There is no central app toast helper or error-message UI wrapper for all
  toasts.

### Error / Empty Components

There is no single shared `EmptyState` or `ErrorState` primitive found in this
pass.

Current empty/error states are page or component-owned:

- Gallery: `GalleryGrid` empty panel.
- Assets: `KreaAssetBrowser.EmptyState`.
- Profile: `PolaroidGrid` empty state.
- Studio: `GenerationPreview`, `StudioGenerationErrorDialog`, and edit shell
  states.
- Cards: manager-specific empty/search-empty states.
- Arena/Storyboard/Prompts: editorial/component-owned empty and error blocks.

## Form Controls

Current form-control facts:

- Base controls are mostly primitive wrappers, not form-field abstractions.
- Validation display is caller-owned.
- `aria-invalid` styles exist on Button/Input/Textarea/Select paths.
- Many domain forms assemble labels, helper copy, error copy, and controls
  locally.
- Dense editor surfaces often override primitive sizing with direct Tailwind
  utilities.

Important specialized form surfaces:

- `ApiKeyForm` uses Input and Select.
- `PromptTemplateCreatePanel` and `PromptTemplateDetailEditor` use Input and
  Textarea.
- Cards managers use Dialog/Input/Textarea and card-specific editors.
- Studio 3D uses Select/Switch and dense direct utility labels.
- Node inspectors use a mix of Input/Textarea/Select-like custom inspector
  fields.

## Problems

These are current-state issues to account for before turning this into a final
component design system:

1. Overlay choice is not yet documented as a rule. Dialog, Sheet, Drawer,
   ResponsiveDialog, Popover, and custom account-menu popover are all used for
   different cases.
2. Several primitive strings are hardcoded in English, such as default
   `Close` labels in Dialog/Sheet-related code.
3. Asset selection is heavily reused but remains a Dialog-based dark overlay;
   mobile behavior and keyboard behavior are not fully documented.
4. Model picking has two visible patterns: modern `BaseModelPickerPanel` and
   legacy/list-style `ModelSelector`.
5. Empty/error/loading states are component-owned and inconsistent across pages.
6. Toast usage is widespread and direct; there is no documented severity/copy
   rule for user-facing toast messages.
7. Form composition is local to each domain, so label/helper/error layout may
   drift by page.
8. Component screenshots and keyboard QA are incomplete. Current facts are from
   source inspection and earlier shell QA, not full component-level browser QA.

## Target To Confirm

Do not treat these as final rules yet. These are the next component-system
questions:

- When should a flow use Dialog, ResponsiveDialog, Drawer, Sheet, or Popover?
- Should `AssetSelectorDialog` become responsive-dialog based, or keep the
  Krea overlay behavior?
- Should `ModelSelector` be retired, or kept for compare/list-style selection?
- Should empty/error/loading states get shared primitives?
- Should toasts go through a shared wrapper for copy/i18n/severity consistency?
- Should form fields get a shared field wrapper for label/helper/error layout?

## Do Not Break

- Radix/shadcn primitive semantics and focus behavior.
- `ResponsiveDialog` mobile Drawer fallback and safe-area padding.
- `Popover` interaction guard behavior.
- `AssetSelectorDialog` single-select, multi-select, media-type lock, and close
  behavior.
- Model picker saved/platform/locked grouping and `onRequestSetup` handoff.
- `ApiKeyHealthDot` display inside model picker options.
- `PromptInput` IME guard and mobile focus scroll behavior.
- `Toaster` being mounted once under the main locale layout.

## Source Of Truth

Documentation:

- `docs/design/system/css-and-tokens.md`
- `docs/design/system/layout-shell.md`
- `docs/design/pages/studio.md`
- `docs/design/pages/assets.md`
- `docs/design/pages/node-workflow.md`
- `docs/design/pages/3d.md`

Code:

- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/slider.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/command.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/drawer.tsx`
- `src/components/ui/responsive-dialog.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/sonner.tsx`
- `src/components/ui/prompt-input.tsx`
- `src/app/[locale]/(main)/layout.tsx`
- `src/components/business/AssetSelectorDialog.tsx`
- `src/components/business/KreaAssetBrowser.tsx`
- `src/components/business/ModelSelector.tsx`
- `src/components/business/studio-shared/pickers/BaseModelPickerPanel.tsx`
- `src/components/business/studio-shared/pickers/MainModelPicker.tsx`
- `src/components/business/node/WorkflowModelPicker.tsx`
- `src/components/business/studio/edit/EditProviderPicker.tsx`
- `src/components/business/studio-shared/setup/QuickSetupDialog.tsx`
- `src/components/business/studio/StudioPromptArea.tsx`

## Last Verified

- Date: 2026-06-02
- Method: documentation review and code inspection of UI primitives, overlay
  components, AssetSelectorDialog, model picker family, PromptInput, toast
  mounting, and source-search usage counts listed above.
