# Arena Page

Last updated: 2026-06-02

This document records current page-level facts for Arena. It is not a redesign
spec and not a request to change UI code.

## Current

### Route Surface

| Surface     | Route                | Current UI entry                     | Notes                            |
| ----------- | -------------------- | ------------------------------------ | -------------------------------- |
| Arena       | `/arena`             | `ArenaPageClient`                    | battle creation/voting surface   |
| History     | `/arena/history`     | `ArenaHistory`, `ArenaPersonalStats` | personal stats and match history |
| Leaderboard | `/arena/leaderboard` | `ArenaLeaderboard`                   | ranking surface                  |

### Structure

Arena main structure:

- editorial hero with links to leaderboard, history, and stats
- editorial panel
- idle/creating state renders `ArenaForm` inside `ApiKeysProvider`
- generating state renders entry progress list
- voting/revealed state renders prompt, `ArenaGrid`, and result controls
- error block renders beneath active content

History structure:

- editorial hero
- personal stats panel
- match history panel

Leaderboard structure:

- editorial hero
- leaderboard panel

## Current State Matrix

| State      | Current fact                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Loading    | route loading for `/arena`, `/arena/history`, and `/arena/leaderboard`; component loading in history/stats/leaderboard |
| Error      | route `arena/error.tsx`; main page component error block; history/stats/leaderboard error blocks                       |
| Empty      | personal stats/history/leaderboard empty states                                                                        |
| Signed-out | no route-level signed-out page found                                                                                   |
| Signed-in  | battle form, generating progress, voting, revealed result, history, stats, leaderboard                                 |
| No credits | generation/API errors surface through Arena flow; no separate page state found                                         |

## Page CSS / Layout Rules

Current CSS facts:

- Arena surfaces use `editorial-page`, `editorial-container`,
  `editorial-hero`, and `editorial-panel`.
- generating progress uses `bg-background/72`, `border-border`, and status
  colors.
- leaderboard loading uses arbitrary grid columns
  `grid-cols-[64px_1fr_96px]` and responsive variant.

## Components

| Area        | Components                                             |
| ----------- | ------------------------------------------------------ |
| main        | `ArenaPageClient`, `ArenaForm`, `ArenaGrid`            |
| history     | `ArenaHistory`, `ArenaPersonalStats`                   |
| leaderboard | `ArenaLeaderboard`                                     |
| state       | arena loading/error route files                        |
| hooks       | `useArena`, `useArenaHistory`, `useArenaPersonalStats` |

## Interaction Details

Current page-internal interaction matrix:

| Interaction               | Current trigger / owner                                                         | Current state / feedback                                                                                           | Design notes                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Hero route links          | Main page hero buttons                                                          | Link to leaderboard, history, and `history#stats`                                                                  | Arena has three related route surfaces, not one isolated form.                                   |
| Model multi-select        | `ArenaForm` model option buttons                                                | Maintains `selectedOptionIds`; enforces minimum model count; filters not-ready models from derived selected models | Model selection is blind-comparison setup, not normal single model picking.                      |
| Prompt input              | `ArenaForm` textarea                                                            | Tracks prompt and attempted-submit state; missing prompt/model count blocks submit                                 | Validation is form-owned before `useArena.startBattle`.                                          |
| Aspect ratio              | `AspectRatioSelector`                                                           | Updates selected aspect ratio passed into match creation                                                           | Shared selector must stay available before battle creation.                                      |
| Reference image           | `ReferenceImageSection` with `useImageUpload`                                   | Upload/remove reference entries; max count is derived from selected models' adapter capabilities                   | Reference capacity changes with selected model set.                                              |
| Advanced params           | `CapabilityForm` for first selected model adapter                               | Updates advanced params for generation payload                                                                     | Current UI uses first selected model as advanced-param source; this needs design clarity.        |
| Reverse engineer          | `ReverseEngineerPanel` when at least one selected model supports image analysis | Can generate prompt text and write it back through `onUsePrompt`                                                   | Reverse tool is conditional and should not dominate the base form.                               |
| Start battle              | Form submit calls `useArena.startBattle`                                        | Shuffles models, creates match, enters creating/generating states, then generates entries                          | The user does not see model identity during voting.                                              |
| Entry progress            | `ArenaPageClient` renders `entryProgress`                                       | Shows per-model pending/completed/failed state and model labels during generation progress                         | This progress reveals model labels before voting in current UI; design should confirm intention. |
| Vote                      | `ArenaGrid` vote buttons                                                        | Calls `useArena.vote`; switches to revealed state and refetches match for model names/ELO updates                  | Vote buttons have slot-based aria labels before reveal.                                          |
| Revealed result           | `ArenaGrid` with `isRevealed` plus New Battle button                            | Shows actual model labels, winner styling, ELO changes, and reset action                                           | Revealed state is a different information hierarchy from voting state.                           |
| Main error                | `useArena.error` rendered beneath active panel                                  | Shows destructive text block under current state                                                                   | Error does not replace the whole page.                                                           |
| History load more         | `ArenaHistory` load-more button                                                 | Uses `useArenaHistory`, appends match cards, and shows error/empty/loading states                                  | History is personal, not public feed.                                                            |
| Personal stats            | `ArenaPersonalStats`                                                            | Loads total matches and per-model stats; renders loading, empty, and error states                                  | Stats share the history route but are a distinct panel.                                          |
| Leaderboard family filter | `ArenaLeaderboard` family chips                                                 | Toggles `familyFilter`, filters rows locally, and links each row to Gallery model filter                           | Leaderboard is browse/filter, not generation.                                                    |

## Responsive

Known source facts:

- editorial layout handles general page responsiveness.
- leaderboard loading uses responsive grid columns.
- no fresh mobile/tablet screenshot pass was run for this page document.

## Empty / Loading / Error States

Current empty/loading states:

- `ArenaHistory` has loading, empty, error, and load-more states.
- `ArenaPersonalStats` has loading, empty, and error states.
- `ArenaLeaderboard` has loading and empty states.
- main `ArenaPageClient` has generating progress, voting/revealed, and error
  states.

## Screenshot Evidence

Not captured in this pass.

Needed later:

- main idle form;
- creating/generating progress;
- voting grid;
- revealed result;
- main error;
- history empty/non-empty;
- leaderboard empty/non-empty;
- mobile 390 and tablet 768.

## i18n / Accessibility

- Metadata uses `Metadata.arena`.
- Main copy uses `ArenaPage`.
- History/stats/leaderboard use `ArenaHistory`, `ArenaPersonalStats`, and
  `ArenaLeaderboard`.
- Voting grid needs keyboard/focus QA before redesign.

## Do Not Break

- Arena match generation/voting flow.
- API key provider boundary around form.
- ELO/winner reveal behavior.
- History and stats loading.
- Leaderboard route.

## Unresolved

- Should Arena remain editorial, or become more game/tool-like?
- Should signed-out state be explicit before battle creation?
- Which voting states need canonical screenshot evidence?

## Source Of Truth

- `src/app/[locale]/(main)/arena/page.tsx`
- `src/app/[locale]/(main)/arena/layout.tsx`
- `src/app/[locale]/(main)/arena/loading.tsx`
- `src/app/[locale]/(main)/arena/error.tsx`
- `src/app/[locale]/(main)/arena/history/page.tsx`
- `src/app/[locale]/(main)/arena/history/loading.tsx`
- `src/app/[locale]/(main)/arena/leaderboard/page.tsx`
- `src/app/[locale]/(main)/arena/leaderboard/loading.tsx`
- `src/components/business/ArenaPageClient.tsx`
- `src/components/business/ArenaForm.tsx`
- `src/components/business/ArenaGrid.tsx`
- `src/components/business/ArenaHistory.tsx`
- `src/components/business/ArenaPersonalStats.tsx`
- `src/components/business/ArenaLeaderboard.tsx`
- `src/hooks/use-arena.ts`

## Last Verified

- Date: 2026-06-02
- Method: code inspection of Arena routes, components, hooks, loading/error
  files, and source files listed above.
