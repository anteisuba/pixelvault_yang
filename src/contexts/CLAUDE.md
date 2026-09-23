# src/contexts/ — React Context Providers

## Risk Level: HIGH (Studio context 消费方遍布 Studio，数量按 Change Checklist 的 grep 取)

## Studio Context Split (3 providers by update frequency)

```
StudioFormContext  (HOT)  — prompt, aspectRatio, panels — changes per keystroke
StudioDataContext  (WARM) — cards, projects, civitai, upload — changes on user actions
StudioGenContext   (COLD) — generation state — changes only during generation
```

**Why split?** Putting fast-changing state (prompt text) in the same context as slow-changing state (cards list) causes unnecessary re-renders across every consumer. The split prevents cascade renders.

## Studio 视频档具名槽

`StudioFormState` 两个视频专属字段，改它们前先读 `studio-context.tsx` 里各自的头注：

- `videoFrameSlots: { first: string | null; last: string | null }` — 首帧 / 尾帧**具名槽**，只在关键帧档（`videoMode === 'keyframe'`）成立；另外两档里图片是内容参考，仍走 `imageUpload`。action `SET_VIDEO_FRAME_SLOT`，`url: null` = 清空那个槽（⛔ 不是「删掉一个下标」——位置承载那一套已删，它会让尾帧静默升级成首帧）。
- `videoReferenceVideos: string[]` — 参考视频槽；传输口是**早就在的** `videoUrls`，⛔ 不新造字段。上限由模型契约的 `slots.videos` 在发送口夹，不由数组自己夹。
- 两者都存 URL 不存 File（发送口原样透传），并随 `RESET` 一起清空。

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
- `useUsageSummary` (credit display)

## Consumer Hooks

| Hook              | Context     |
| ----------------- | ----------- |
| `useStudioForm()` | FormContext |
| `useStudioData()` | DataContext |
| `useStudioGen()`  | GenContext  |

## Change Checklist

1. Grep `useStudioForm\|useStudioData\|useStudioGen` to find all consumers
2. If changing `StudioFormState` shape, update the reducer + all dispatch call sites
3. If adding a hook injection, ensure it doesn't cause re-render loops
4. Run Studio E2E tests after changes

## Files

- `studio-context.tsx` — The 3-provider context + reducer + hooks
- `studio-context.test.ts` / `studio-context.test.tsx` — Unit tests
- `api-keys-context.tsx` — Separate API key management context (isolated, low risk)
- `studio-operator-host.tsx` — 助手宿主契约（含 `face`），四份宿主各自实现
