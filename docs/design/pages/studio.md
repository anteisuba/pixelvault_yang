# Studio Page

Last updated: 2026-06-02

This document records the page-level structure for Studio before future design
direction is confirmed. It is a current-state split, not a redesign spec and not
a request to change UI code.

## Current

### Route Split

Studio has multiple page surfaces:

| Surface           | Route                                | Current UI entry                         | Notes                                                       |
| ----------------- | ------------------------------------ | ---------------------------------------- | ----------------------------------------------------------- |
| Studio base       | `/studio`                            | route redirect                           | redirects to `/studio/image`                                |
| Image mode        | `/studio/image`                      | `StudioModeSync` inside shared workspace | page file is an invisible mode sync emitter                 |
| Video mode        | `/studio/video`                      | `StudioModeSync` inside shared workspace | page file is an invisible mode sync emitter                 |
| Audio mode        | `/studio/audio`                      | `StudioModeSync` inside shared workspace | page file is an invisible mode sync emitter                 |
| Edit overview     | `/studio/edit`                       | `EditWorkspaceShell` + `EditTaskGrid`    | source image shell plus task grid                           |
| Edit tasks        | `/studio/edit/*`                     | `EditWorkspaceShell` + task page         | task routes preserve source image state through layout      |
| Node workflow     | `/studio/node`                       | `StudioNodeWorkbench`                    | separate advanced workspace; document in `node-workflow.md` |
| LoRA              | `/studio/lora`                       | `LoraWorkbench`                          | separate advanced capability; not expanded here             |
| 3D                | `/studio/3d`                         | `Studio3DWorkspace`                      | separate branch workspace; document in `3d.md`              |
| Enhance / Analyze | `/studio/enhance`, `/studio/analyze` | `ToolPlaceholder`                        | placeholder routes                                          |

### Shared Image / Video / Audio Workspace

Image, Video, and Audio do not render independent page layouts. The current
visible workspace is mounted once by the `(workspace)` layout:

- `(workspace)/layout.tsx` wraps the routes in `StudioProvider`.
- `StudioWorkspaceUI` renders the shared visual shell once.
- Individual Image / Video / Audio page files only render `StudioModeSync`.
- Route changes update the selected output type without remounting the whole
  workspace.

Current shared workspace structure:

- `StudioWorkspaceUI`
  - skip link to `#studio-prompt`
  - `role="tabpanel"` wrapper
  - `StudioFlowLayout`
    - `StudioCanvas`
    - `StudioBottomDock`
  - `StudioCommandPalette`
- `StudioBottomDock`
  - optional `StudioCardSection` in card mode for non-audio modes
  - `StudioPromptArea`
  - `StudioDockPanelArea`
  - `StudioKeepChangePanel`
- `StudioPromptArea`
  - model picker in quick mode
  - prompt template picker
  - reference image preview strip
  - prompt textarea
  - icon-only Send/Generate button
  - compact tool panel row
  - audio character/minute/credit meta in audio mode

### Image Mode

Current Image mode is the default Studio creation path.

Current structure:

- Route `/studio/image` emits `StudioModeSync mode="image"`.
- Canvas empty state uses `XiaoheiGuideCarousel` with image-specific guide copy.
- Prompt placeholder comes from Studio page/message namespaces.
- Image model options come from `useImageModelOptions`.
- Quick mode uses `MainModelPicker`.
- Card mode can show `StudioCardSection` and style/character/background context.
- Reference image input appears through drag/drop, paste/upload, and image chip
  flows.
- Result actions include remix, use as reference, edit with AI, download/detail,
  feedback, and variant/winner flows where available.

### Video Mode

Current Video mode shares the same visible shell as Image mode.

Current structure:

- Route `/studio/video` emits `StudioModeSync mode="video"`.
- Canvas empty state uses `XiaoheiGuideCarousel` with video-specific guide copy.
- Video model options come from `useVideoModelOptions`.
- Prompt area switches modality for `MainModelPicker`.
- Video-specific params and script controls open through Studio dock panels.
- Canvas preview can render video results through `VideoPlayer`.
- Reference capability lookup is video-aware and can differ from image models.

### Audio Mode

Current Audio mode also shares the same visible shell as Image mode.

Current structure:

- Route `/studio/audio` emits `StudioModeSync mode="audio"`.
- Canvas empty state uses `XiaoheiGuideCarousel` with audio-specific guide copy.
- Audio model options come from `useAudioModelOptions`.
- Prompt area treats the main text as TTS/script text, not an image prompt.
- Voice cards are loaded only when audio mode is active.
- Audio reference text can block generation when incomplete.
- Prompt meta shows character count, maximum text length, estimated minutes, and
  estimated credit cost.
- Canvas preview can render audio through `AudioPlayer`.
- Audio feedback can patch prompt/voice/pronunciation settings and retry.

### Edit Workspace

Edit is a separate page shell, not part of the shared Image / Video / Audio
workspace.

Current structure:

- `/studio/edit/layout.tsx` wraps all edit pages in `EditWorkspaceShell`.
- `EditWorkspaceShell` owns source image state through `ImageEditProvider`.
- Source state survives task-route navigation.
- Source input supports asset picker, upload, paste, and pasted URL/image flows.
- Overview route `/studio/edit` shows the shared source shell plus `EditTaskGrid`.
- Task routes show the same source shell plus a task-specific tool panel.
- Task pages use a two-column desktop layout and stack below `lg`.

Current edit task status:

| Task              | Route                            | Current page status   |
| ----------------- | -------------------------------- | --------------------- |
| Super resolution  | `/studio/edit/upscale`           | implemented task page |
| Remove background | `/studio/edit/remove-background` | implemented task page |
| Inpaint           | `/studio/edit/inpaint`           | implemented task page |
| Outpaint          | `/studio/edit/outpaint`          | implemented task page |
| Layer decompose   | `/studio/edit/decompose`         | implemented task page |
| Extract element   | `/studio/edit/extract-element`   | implemented task page |
| Object replace    | `/studio/edit/object-replace`    | placeholder           |
| Style transfer    | `/studio/edit/style-transfer`    | placeholder           |
| Text render       | `/studio/edit/text-render`       | placeholder           |

## Problems

These are current page-level issues to account for before design direction:

- Image / Video / Audio share one shell, but their user intent is different.
  Video should feel more like shot direction; Audio should feel more like script
  and voice work. Today those differences are mostly hidden inside the same dock
  controls.
- Mobile Studio has too much persistent chrome for the creator task: global rail,
  mobile header, bottom tab bar, and Studio dock all compete for the viewport.
- Real-device mobile keyboard screenshots show the system keyboard covering most
  of the prompt dock in Image, Video, and Audio modes.
- At 768px the shell enters desktop sidebar mode while Studio content is visibly
  clipped.
- Studio loading UI uses a horizontal skeleton by source and is not clearly
  mobile-safe.
- Edit mixes implemented task pages and placeholders, so the overview grid can
  look more complete than the actual task surface is.
- Edit overview and task pages use a shadcn card/panel language that feels
  separate from the darker canvas-first Studio workspace.
- Some Studio accessibility/i18n issues belong to the shell/system docs, but
  page design should not ignore them: hardcoded "Skip to prompt" exists and the
  current `tabpanel` label points to `studio-tab-*` ids that were not found in
  source search.

## Target To Confirm

Do not treat these as final direction. They are the next page-level questions.

### Image

- What current UI should be kept: canvas-first preview, bottom dock, reference
  input, model/template chips, card mode, remix/edit/reference result actions.
- What feels wrong today: mobile keyboard behavior, dense dock controls,
  tablet clipping, unclear tool priority.
- Future feeling to confirm: a quiet image creation workstation where the canvas
  and prompt dominate, and advanced tools stay secondary.
- Must not break: route sync, prompt prefill/replay, reference image flows,
  card mode, result persistence, remix/edit handoff.

### Video

- What current UI should be kept: shared route persistence, video model picker,
  video params/script panels, video preview, reference capabilities.
- What feels wrong today: video can feel like image mode with a different model
  selector instead of a shot-planning workflow.
- Future feeling to confirm: directorial shot workspace focused on motion,
  scene change, camera direction, and script/sequence intent.
- Must not break: existing video generation path, status polling, provider
  selection, reference constraints, result playback.

### Audio

- What current UI should be kept: long text input, voice cards, clone/voice
  panels, audio script tools, character/minute/credit meta, audio feedback.
- What feels wrong today: long text and voice controls are squeezed into the
  same compact dock pattern as image prompt generation.
- Future feeling to confirm: script-to-voice workspace where text readability
  and voice selection are first-class.
- Must not break: TTS length limits, incomplete reference gating, voice card
  selection, pronunciation and feedback retry flows.

### Edit

- What current UI should be kept: persistent source image state, task grid,
  task routes, asset/upload/paste source intake, result actions.
- What feels wrong today: task completion status is mixed, and the shell feels
  visually separate from the main Studio workspace.
- Future feeling to confirm: focused image editing bench where source, task, and
  result are obvious at all breakpoints.
- Must not break: source state persistence across `/studio/edit/*`, source
  dimensions, result save/import flows, asset picker constraints.

## Page CSS / Layout Rules

Current page-owned layout hooks:

- `.studio-layout-v2`
- `.studio-canvas`
- `.studio-dock`
- `StudioFlowLayout`
- `PromptInput` / `PromptInputTextarea` / `PromptInputActions`
- `EditWorkspaceShell` shadcn card/panel layout utilities

Do not promote these into final design-system rules until the Studio page
direction is confirmed. The token and layout-shell facts live in:

- `docs/design/system/css-and-tokens.md`
- `docs/design/system/layout-shell.md`

### Current CSS / Token Usage Facts

This is a source-level map for Studio only. It records current dependencies,
not a refactor target.

| Area                   | Current classes / tokens                                                                             | Arbitrary or runtime values observed                                                                                | Notes                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Shared workspace root  | `StudioWorkspaceUI` applies `.studio-layout-v2`                                                      | none at root found in this pass                                                                                     | page shell is mounted once for Image / Video / Audio                  |
| Canvas                 | `StudioCanvas` applies `.studio-canvas transition-all`; preview uses `bg-muted`, `border-border`     | generated media max heights use `max-h-[45vh]`, `max-h-[60vh]`, and mobile drawer `max-h-[70vh]`                    | media sizing is viewport-dependent and should be QA'd before redesign |
| Bottom dock            | `StudioBottomDock` applies `.studio-dock`; prompt/card/panel areas use direct shadcn primitives      | prompt root sets `[--studio-prompt-max-h:160px]` and `md:[--studio-prompt-max-h:320px]`                             | prompt max height is a local CSS variable, not a global token         |
| Prompt/template tools  | `PromptInput`, `MainModelPicker`, `PromptTemplatePicker`, `BaseModelPickerPanel` use shadcn surfaces | template picker uses `w-[28rem]` and `max-w-[calc(100vw-2rem)]`; model picker popover uses Radix available-height   | popover sizing mixes product and Radix/runtime constraints            |
| Tool panels/dialogs    | `StudioDockPanelArea` and tool components use `ResponsiveDialog`, `Dialog`, `Drawer`, and `Popover`  | common caps include `max-h-[70vh]`, `max-h-[95svh]`, `w-[min(...)]`, `max-w-[calc(...)]` in shared dialog utilities | dialog sizing should be documented per panel before visual changes    |
| Edit shell             | `EditWorkspaceShell` uses `bg-background`, `bg-card`, `border-border`, `bg-muted`, `text-muted-*`    | `2xl:max-w-[88rem]`, `lg:grid-cols-[minmax(0,1fr)_360px]`, source image `max-h-[70svh]`                             | Edit has no edit-specific token family today                          |
| Edit task placeholders | `EditTaskPlaceholder` uses dashed `border-border`, `bg-card/60`, `bg-muted`, provider pills          | provider pill text uses `text-[11px]`                                                                               | placeholder visual language differs from dark Studio canvas           |
| Route loading          | `studio/loading.tsx` uses direct flex/skeleton utilities                                             | `h-[calc(100svh-4rem)]`                                                                                             | loading state should be captured separately on mobile                 |

## Components

Primary current component map:

| Area                   | Components                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Shared workspace shell | `StudioWorkspaceUI`, `StudioFlowLayout`, `StudioCommandPalette`                                     |
| Canvas / result        | `StudioCanvas`, `GenerationPreview`, `CompareGrid`, `VariantGrid`, result feedback components       |
| Dock / prompt          | `StudioBottomDock`, `StudioPromptArea`, `StudioToolbarPanels`, `StudioDockPanelArea`                |
| Model / workflow       | `MainModelPicker`, `StudioModeSync`, workflow constants and selectors                               |
| Image-specific tools   | `StudioImageAdvancedParams`, `StudioKeepChangePanel`, `StudioInpaintEditor`, `StudioOutpaintEditor` |
| Video-specific tools   | `StudioVideoParams`, `StudioScriptPanel`, video preview/player components                           |
| Audio-specific tools   | `StudioAudioParams`, `VoiceTrainer`, `StudioAudioFeedback`, audio player components                 |
| Edit workspace         | `EditWorkspaceShell`, `EditTaskGrid`, task pages, `EditResultActions`, `EditProviderPicker`         |

## Interaction Details

This section records source-level interaction facts for page design. It is not a
complete keyboard QA result.

### Shared Workspace Interaction Matrix

| Interaction              | Current source behavior                                                                                                                                                                                                                                                                   | Source                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Route mode switch        | Image / Video / Audio pages only render `StudioModeSync`; the shared workspace stays mounted while route changes update output type / workflow state.                                                                                                                                     | `StudioModeSync`, `(workspace)/layout.tsx`        |
| Model selector           | `MainModelPicker` chooses the option source by modality: image, video, audio, 3D, or LLM assist. Standard Studio uses image/video/audio.                                                                                                                                                  | `MainModelPicker.tsx`                             |
| Model picker popover     | `BaseModelPickerPanel` uses a Popover + Command list. It groups options into configured keys, platform quota, and needs-key groups. Selecting available options calls `onChange` and closes the popover; selecting locked options calls `onRequestSetup` and closes the popover.          | `BaseModelPickerPanel.tsx`                        |
| Quick setup              | In quick mode, locked model selection can open `QuickSetupDialog`; setup state lives in `StudioPromptArea`.                                                                                                                                                                               | `StudioPromptArea.tsx`, `QuickSetupDialog`        |
| Prompt template picker   | `PromptTemplatePicker` is a Popover. When inspiration is available, it uses tabs for `mine` and `inspiration`. It can save the current prompt, apply a saved recipe, or apply an inspiration prompt.                                                                                      | `PromptTemplatePicker.tsx`                        |
| Placeholder fill         | Inspiration prompts with placeholders can open `PlaceholderFillDialog` before applying prompt content.                                                                                                                                                                                    | `StudioPromptArea.tsx`, `PlaceholderFillDialog`   |
| Prompt typing            | `PromptInput` owns the textarea value through Studio form state. The textarea uses `STUDIO_PROMPT_TEXTAREA_ID` and an aria label from `StudioForm.promptLabel`.                                                                                                                           | `StudioPromptArea.tsx`                            |
| Prompt submit            | `PromptInput` calls `handleGenerate` on submit. `useStudioShortcuts` also triggers generation from the configured shortcut path.                                                                                                                                                          | `StudioPromptArea.tsx`, `use-studio-shortcuts.ts` |
| Generate button          | The icon-only Send button calls `handleGenerate`, shows a spinner while generating, sets `aria-busy`, and sets `aria-disabled={!canGenerate}`. It is only actually disabled for generating or audio prompt over-limit; other `canGenerate` failures rely on handler gating and messaging. | `StudioPromptArea.tsx`                            |
| Generate gating          | `canGenerate` requires an available model or active style-card model, a trimmed prompt, required reference image when the model needs one, valid reference capability, audio length under limit, and complete audio reference text.                                                       | `StudioPromptArea.tsx`                            |
| Generate request event   | `StudioPromptArea` listens for `state.generateRequestId` changes and calls `handleGenerate`; this lets other UI such as Keep/Change request a generate without owning generation logic.                                                                                                   | `StudioPromptArea.tsx`, `StudioBottomDock.tsx`    |
| Prompt paste/drop        | The prompt area handles paste and drag/drop through `imageUpload` paths, then returns focus to the prompt where appropriate.                                                                                                                                                              | `StudioPromptArea.tsx`                            |
| Canvas asset drop        | `StudioCanvas` accepts dragged `studio-generation` items, adds them as reference images, and focuses the prompt.                                                                                                                                                                          | `StudioCanvas.tsx`                                |
| Reference image chip     | `ReferenceImageChip` combines Upload and Select Asset into one chip. Upload reads a file as data URL; Select Asset opens `AssetSelectorDialog` locked to images. Both paths write into `imageUpload`.                                                                                     | `ReferenceImageChip.tsx`                          |
| Reference preview strip  | Attached reference entries render in `ImageAttachmentPreviewStrip`; removal and over-limit/unsupported tooltips are passed from ImageChip messages.                                                                                                                                       | `StudioPromptArea.tsx`, `ReferenceImageChip.tsx`  |
| Toolbar row              | `StudioToolbarPanels` switches by output type. Image gets shared image toolbar; Video gets enhance, reference image, aspect ratio, video params, script; Audio gets enhance, voice, clone, transcribe.                                                                                    | `StudioToolbarPanels.tsx`                         |
| Toolbar roving context   | Video and Audio toolbar rows wrap controls in Radix `Toolbar.Root` so shared toolbar buttons can use the roving-focus context.                                                                                                                                                            | `StudioToolbarPanels.tsx`                         |
| Floating panels          | `StudioDockPanelArea` owns centered `ResponsiveDialog` surfaces for panels that used to render inline: advanced, Civitai, layer decompose, video params, script, audio params, voice selector/trainer, transcribe.                                                                        | `StudioDockPanelArea.tsx`                         |
| Dynamic panel loading    | Heavy panel bodies are dynamic imports with `PanelLoadingFallback` spinners.                                                                                                                                                                                                              | `StudioDockPanelArea.tsx`                         |
| Tool popovers vs dialogs | Reference image, aspect ratio, enhance, transform, and related self-contained tools keep their own popovers/dialogs instead of going through `StudioDockPanelArea`.                                                                                                                       | `StudioToolbarPanels.tsx`, tool component files   |
| Result actions           | `GenerationPreview` routes use-as-reference, remix, edit, retry, download/detail, feedback, and media-specific preview actions through Studio callbacks/state.                                                                                                                            | `GenerationPreview.tsx`, `StudioCanvas.tsx`       |
| Error dialog actions     | `StudioGenerationErrorDialog` exposes Retry, Switch Model, and expandable details.                                                                                                                                                                                                        | `StudioGenerationErrorDialog.tsx`                 |

### Mode-Specific Interaction Notes

Image mode:

- Quick mode uses `MainModelPicker` plus template/reference/tool controls.
- Card mode can reveal `StudioCardSection` before the prompt area.
- Reference images are accepted by chip upload, asset picker, paste/drop, and
  canvas drop.
- Advanced image settings are toggled through the image toolbar and rendered by
  `StudioDockPanelArea`.

Video mode:

- The model picker uses `useVideoModelOptions`.
- Video params and script are toolbar buttons that toggle centered dialogs.
- Reference capability lookup is video-aware, so reference limits can differ by
  model.
- The result preview path can render `VideoPlayer`.

Audio mode:

- The model picker uses `useAudioModelOptions`.
- Voice selection, clone/training, and transcription are toolbar buttons.
- The prompt input is long-form TTS/script text with character/minute/credit
  meta.
- Audio reference text can block generation when incomplete.
- Audio feedback can patch state and request a retry generation.

### Edit Interaction Matrix

| Interaction          | Current source behavior                                                                                                                                        | Source                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Source persistence   | `EditWorkspaceShell` wraps all edit pages in `ImageEditProvider`, so source/result state survives `/studio/edit/*` route changes.                              | `EditWorkspaceShell.tsx`, `image-edit-context.tsx` |
| Back to task grid    | Task pages show a Back to tasks link when pathname matches `/studio/edit/<task>`.                                                                              | `EditWorkspaceShell.tsx`                           |
| Source picker        | Empty and loaded source states can open `AssetSelectorDialog` locked to image media.                                                                           | `EditWorkspaceShell.tsx`                           |
| Upload source        | Hidden file input accepts `USER_UPLOAD_ACCEPTED_MIME_TYPES`; Upload button invokes the file input and shows a spinner while uploading.                         | `EditWorkspaceShell.tsx`                           |
| Paste source         | Source panel is focusable and handles paste through `handlePaste`; helper copy tells the user to focus the panel and press paste shortcut.                     | `EditWorkspaceShell.tsx`                           |
| Source dimensions    | Loaded source/result image displays dimensions and uses `max-h-[70svh]` with object-contain.                                                                   | `EditWorkspaceShell.tsx`                           |
| Error banner         | `maskEditError` or `bannerError` renders a dismissible `role="alert"` banner.                                                                                  | `EditWorkspaceShell.tsx`                           |
| Task grid navigation | `EditTaskGrid` renders one link per `EDIT_TASKS` entry and routes to `/studio/edit/<task>`.                                                                    | `EditTaskGrid.tsx`, `edit-tasks.ts`                |
| Provider picker      | Implemented task pages can use `EditProviderPicker`, which reuses `BaseModelPickerPanel` for multi-model tasks and shows a static pill for single-model tasks. | `EditProviderPicker.tsx`                           |
| BYOK setup signal    | For BYOK-only edit models without a configured key, `EditProviderPicker` calls `onRequestSetup` instead of switching selection.                                | `EditProviderPicker.tsx`                           |
| Implemented tasks    | Upscale, remove background, inpaint, outpaint, decompose, and extract-element render task pages.                                                               | `src/app/[locale]/(main)/studio/edit/*/page.tsx`   |
| Placeholder tasks    | Object replace, style transfer, and text render render `EditTaskPlaceholder` with provider chips.                                                              | `EditTaskPlaceholder.tsx`                          |

### Interaction QA Gaps

- Model picker keyboard traversal and search behavior have not been captured for
  each modality.
- Prompt template tabs and placeholder-fill dialog have not been visually QA'd
  on mobile.
- Asset selector behavior from the Studio reference chip and from Edit source
  picker has not been compared side by side.
- Prompt paste/drop and canvas drop need browser QA with real images.
- Generate button disabled semantics need review because `aria-disabled` can be
  true while the button remains clickable for several `canGenerate` failure
  cases.
- Dynamic panel loading fallback has not been screenshot-tested.
- ResponsiveDialog/Dialog/Popover behavior under real mobile keyboard has not
  been fully verified beyond the prompt dock screenshots.
- Edit paste-source flow requires manual QA because it depends on clipboard
  permissions and focused panel state.

## Responsive

Known responsive facts:

- The shared main app shell owns the mobile rail, mobile header, and bottom tab
  bar.
- Studio adds its own dock inside that shell.
- Real-device keyboard screenshots currently show the prompt dock is not safe
  when the mobile system keyboard opens.
- 768px is a known shell breakpoint problem for Studio and should not be
  designed around as a good current state.
- Edit task pages stack below `lg`; desktop uses source plus a 360px task panel.

## Empty / Loading / Error States

### State Ownership

Current state ownership:

- Standard workspace empty state lives in `GenerationPreview`.
- Image / Video / Audio empty states use `XiaoheiGuideCarousel`.
- Generating state in `GenerationPreview` uses an aspect-ratio-aware reveal
  placeholder and elapsed stage copy.
- Error-only preview state lives in `GenerationPreview`.
- Generation failure dialog lives in `StudioGenerationErrorDialog`.
- Route-level Studio error page uses the shared `ErrorBoundary` message
  namespace and editorial layout.
- Route-level Studio loading page uses a horizontal skeleton layout.
- Edit empty source states live in `EditWorkspaceShell`.
- Edit placeholder task states live in `EditTaskPlaceholder`.

### Empty State Detail Matrix

| Surface                    | Trigger                                       | Current owner                 | Current UI facts                                                                                     | Design risk to check later                                              |
| -------------------------- | --------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Image empty canvas         | no generation, not generating, no error       | `GenerationPreview`           | returns `XiaoheiGuideCarousel` with `guideId="image"` inside a padded centered wrapper               | empty guide competes with prompt dock on short mobile viewports         |
| Video empty canvas         | no generation, not generating, no error       | `GenerationPreview`           | same wrapper and carousel path, keyed by `state.outputType`                                          | video intent is mostly copy-driven; layout does not yet feel shot-first |
| Audio empty canvas         | no generation, not generating, no error       | `GenerationPreview`           | same wrapper and carousel path, keyed by `state.outputType`                                          | long-script/voice context is not visible in the empty preview itself    |
| Non-standard output empty  | no generation for output types beyond normal  | `GenerationPreview`           | rounded `Sparkles` empty block with `emptyStateTitle` and `emptyStateHint`                           | fallback exists but is not the main Image / Video / Audio path          |
| Generating preview         | generation is running                         | `GenerationPreview`           | generating overlay uses scan/status chrome over the media container; button also shows spinner       | screenshot should distinguish loading preview from route loading        |
| Preview error              | Studio generation error exists                | `GenerationPreview`           | destructive-tinted inline error with optional Retry button                                           | dialog and inline error can both matter for final state hierarchy       |
| Generation failure dialog  | failed generation with reason/detail          | `StudioGenerationErrorDialog` | Retry, Switch Model, and expandable details; `insufficient_credits` maps to daily free limit copy    | no-credit treatment is dialog-level, not a dedicated no-credit page     |
| Edit overview no source    | `/studio/edit` and no source image            | `EditWorkspaceShell`          | compact row with `emptyStateTitle`, asset picker button, upload button, and paste support            | compactness may undersell first-run editing setup                       |
| Edit task no source        | `/studio/edit/*` and no source image          | `EditWorkspaceShell`          | taller source panel with image icon, title/subtitle, asset picker, upload, and paste shortcut helper | task tool can be present while source requirement is unresolved         |
| Edit placeholder task      | task route exists but feature not implemented | `EditTaskPlaceholder`         | dashed card with construction icon, translated placeholder copy, and provider labels                 | overview grid may imply task readiness that placeholder route lacks     |
| Edit extracted materials   | extraction produces no material list          | `ExtractedElementsGrid`       | renders `extract.materialsEmpty` copy in the task result area                                        | local task empty state needs task-page capture                          |
| API Keys from account menu | no keys / no displayed built-in route groups  | `ApiKeyManager` account sheet | dashed `emptyModel` blocks inside account-menu/API-key management, not inside the Studio page body   | belongs to shell/settings docs unless Studio opens it from setup flows  |

### Current State Matrix

This table records current source facts. It does not mean each state has already
passed visual QA.

| Surface               | Loading                                                                                         | Error                                                                                                         | Empty / no data                                                      | Signed-out                                                  | Signed-in / success                                                                            | No credits / quota                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `/studio`             | not applicable                                                                                  | not applicable                                                                                                | not applicable                                                       | same redirect behavior                                      | redirects to `/studio/image`                                                                   | not applicable                                                                                |
| Image mode            | route `studio/loading.tsx`; `GenerationPreview` generating placeholder; Generate button spinner | route `studio/error.tsx`; preview error; `StudioGenerationErrorDialog`                                        | no generation shows image `XiaoheiGuideCarousel`                     | no route-level signed-out branch found in workspace source  | image result preview with remix/reference/edit/download/detail/feedback actions                | `StudioGenerationErrorDialog` maps `insufficient_credits` to daily free generation limit copy |
| Video mode            | route `studio/loading.tsx`; shared generating placeholder and video status flow                 | route `studio/error.tsx`; preview/dialog errors; video polling errors surface through generation state        | no generation shows video `XiaoheiGuideCarousel`                     | no route-level signed-out branch found in workspace source  | video result preview through `VideoPlayer`; voting/status/result actions stay in shared canvas | no separate page state found; expected to surface through generation error path               |
| Audio mode            | route `studio/loading.tsx`; shared generating placeholder; audio generation/status flow         | route `studio/error.tsx`; preview/dialog errors; audio feedback retry errors surface through generation state | no generation shows audio `XiaoheiGuideCarousel`                     | no route-level signed-out branch found in workspace source  | audio result preview through `AudioPlayer`; audio feedback can patch settings and retry        | no separate page state found; expected to surface through generation error path               |
| Edit overview         | route `studio/loading.tsx` if route segment suspends; upload spinner in source shell            | route `studio/error.tsx`; `EditWorkspaceShell` banner error                                                   | compact source-empty row plus `EditTaskGrid`; no selected source yet | no route-level signed-out branch found in edit shell source | source loaded plus task grid                                                                   | no separate page state found                                                                  |
| Edit task implemented | route `studio/loading.tsx`; task busy/upload/mask-edit loading states                           | route `studio/error.tsx`; source/banner/task error states                                                     | task page can show "load source first" when no source exists         | no route-level signed-out branch found in edit task source  | task result saved/imported and `EditResultActions` shown                                       | no separate page state found                                                                  |
| Edit task placeholder | route `studio/loading.tsx` if route segment suspends                                            | route `studio/error.tsx`                                                                                      | placeholder panel with provider chips                                | no route-level signed-out branch found                      | placeholder only, no real task success state                                                   | not applicable                                                                                |

### State Notes

- Route-level Studio loading is currently one horizontal skeleton:
  fixed-height shell, left `w-64` skeleton column, and a flexible canvas/dock
  skeleton. Source suggests it is not mobile-safe.
- Image / Video / Audio signed-out behavior is not expressed as a page-level
  branch in the workspace files. The visible shell can render before generation
  or API calls enforce auth/server rules.
- The no-credit state is not a separate page. The only direct UI fact found in
  this pass is the `StudioV2.generationError.reasons.insufficient_credits`
  message used by `StudioGenerationErrorDialog`.
- Edit task completion is uneven: six task routes render implemented pages;
  object replace, style transfer, and text render render placeholders.
- Real-device mobile keyboard screenshots already show Image / Video / Audio
  prompt dock coverage when the system keyboard opens; that state belongs to
  responsive/layout QA, not route fallback.

## i18n / Accessibility

Current translation namespaces used by this surface include:

- `StudioPage`
- `StudioForm`
- `StudioPromptArea`
- `StudioV2`
- `StudioV3`
- `StudioImageEdit`
- `ImageChip`
- `Models`

Known page-level a11y/i18n facts:

- The visible prompt textarea has an aria label from `StudioForm.promptLabel`.
- The Generate button has an aria label from `StudioV2.generate`.
- `StudioWorkspaceUI` currently hardcodes `Skip to prompt`.
- `StudioWorkspaceUI` uses `role="tabpanel"` and `aria-labelledby` pointing at
  `studio-tab-${outputType}`; matching tab ids need verification before final
  a11y direction.
- Edit source and error states use translated strings from `StudioImageEdit`.

## Do Not Break

- `/studio -> /studio/image` redirect.
- Image / Video / Audio shared workspace persistence.
- `StudioModeSync` route-to-mode behavior.
- `StudioProvider` context split and generation hook ownership.
- Prompt prefill, replay, remix, and reference-image flows.
- Reference image drag/drop and paste behavior.
- Model selection and BYOK/API key boundaries staying outside UI business logic.
- Generated outputs persisting as `Generation` records.
- Edit source image state across `/studio/edit/*` navigation.
- Edit asset picker/upload/paste source intake.
- Locale-prefixed routes.
- Translation readiness for any future visible UI copy.

## Unresolved

- Should `studio.md` own LoRA page design, or should LoRA get its own page doc?
- Should mobile Studio keep rail + bottom tab + Studio dock, or should the page
  direction ask for a reduced mobile creator shell?
- Should Image / Video / Audio remain visually identical with mode-specific
  panels, or should each mode get a clearer first-screen task hierarchy?
- What should the mobile keyboard-safe prompt behavior be?
- Should Edit visually align with the dark Studio creator workspace or remain a
  separate shadcn task bench?
- Should `canGenerate` failures visibly disable the Generate button, show inline
  reasons, or keep the current handler-gated behavior?
- Should Studio use one consistent dialog/sheet rule for tool panels, or keep
  the current mix of popovers, dialogs, and responsive dialogs?

## Source Of Truth

- `docs/domains/studio.md`
- `docs/design/system/current-ui-inventory.md`
- `docs/design/system/css-and-tokens.md`
- `docs/design/system/layout-shell.md`
- `src/app/[locale]/(main)/studio/page.tsx`
- `src/app/[locale]/(main)/studio/layout.tsx`
- `src/app/[locale]/(main)/studio/(workspace)/layout.tsx`
- `src/app/[locale]/(main)/studio/(workspace)/image/page.tsx`
- `src/app/[locale]/(main)/studio/(workspace)/video/page.tsx`
- `src/app/[locale]/(main)/studio/(workspace)/audio/page.tsx`
- `src/app/[locale]/(main)/studio/edit/layout.tsx`
- `src/app/[locale]/(main)/studio/edit/page.tsx`
- `src/app/[locale]/(main)/studio/edit/*/page.tsx`
- `src/components/business/StudioWorkspaceUI.tsx`
- `src/components/business/StudioModeSync.tsx`
- `src/components/business/studio-shared/chrome/StudioCanvas.tsx`
- `src/components/business/studio-shared/chrome/StudioBottomDock.tsx`
- `src/components/business/studio-shared/chrome/StudioResizableLayout.tsx`
- `src/components/business/studio/StudioPromptArea.tsx`
- `src/components/business/studio/GenerationPreview.tsx`
- `src/components/business/studio/PromptTemplatePicker.tsx`
- `src/components/business/studio/ReferenceImageChip.tsx`
- `src/components/business/studio/StudioToolbarPanels.tsx`
- `src/components/business/studio/StudioDockPanelArea.tsx`
- `src/components/business/studio-shared/pickers/MainModelPicker.tsx`
- `src/components/business/studio-shared/pickers/BaseModelPickerPanel.tsx`
- `src/components/business/studio/edit/EditWorkspaceShell.tsx`
- `src/components/business/studio/edit/EditTaskGrid.tsx`
- `src/components/business/studio/edit/EditProviderPicker.tsx`
- `src/components/business/studio/edit/EditTaskPlaceholder.tsx`
- `src/constants/edit-tasks.ts`
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`

## Last Verified

- Date: 2026-06-02
- Method: documentation review and code inspection of the Studio route,
  workspace, prompt, canvas, model picker, template picker, reference image
  chip, toolbar panels, dock panel dialogs, edit shell, edit provider picker,
  edit task, loading, error, and message files listed above.
