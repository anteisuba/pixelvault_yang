# src/contexts/ — React Context Providers

## Risk Level: HIGH (Studio context drives 23+ components)

## Studio Context Split (3 providers by update frequency)

```
StudioFormContext  (HOT)  — prompt, aspectRatio, panels — changes per keystroke
StudioDataContext  (WARM) — cards, projects, civitai, upload — changes on user actions
StudioGenContext   (COLD) — generation state — changes only during generation
```

**Why split?** Putting fast-changing state (prompt text) in the same context as slow-changing state (cards list) causes unnecessary re-renders across 23+ components. The split prevents cascade renders.

## Rules

1. **Adding new state**: decide which context based on update frequency, not logical grouping
   - Changes per keystroke → FormContext (HOT)
   - Changes on user click/action → DataContext (WARM)
   - Changes only during generation → GenContext (COLD)
2. **Adding a new panel**: add name to `PanelName` union type + `initialPanels` record
3. **Never merge contexts back** — the split is intentional for performance

## Injected Hooks (changing any one affects all of Studio)

StudioDataContext initializes these hooks at mount time:

- `useCharacterCards`, `useBackgroundCards`, `useStyleCards` (card management)
- `useProjects` (project CRUD)
- `useCivitaiToken` (external token)
- `usePromptEnhance` (LLM prompt enhancement)
- `useImageUpload` (reference image upload)
- `useUnifiedGenerate` (core generation orchestrator)
- `useOnboarding` (first-time user flow)
- `useUsageSummary` (credit display)

## Consumer Hooks

| Hook              | Context     | Consumers      |
| ----------------- | ----------- | -------------- |
| `useStudioForm()` | FormContext | ~43 components |
| `useStudioData()` | DataContext | ~26 components |
| `useStudioGen()`  | GenContext  | ~18 components |

## Change Checklist

1. Grep `useStudioForm\|useStudioData\|useStudioGen` to find all consumers
2. If changing `StudioFormState` shape, update the reducer + all dispatch call sites
3. If adding a hook injection, ensure it doesn't cause re-render loops
4. Run Studio E2E tests after changes

## Files

- `studio-context.tsx` — The 3-provider context + reducer + hooks
- `studio-context.test.ts` — Unit tests
- `api-keys-context.tsx` — Separate API key management context (isolated, low risk)
