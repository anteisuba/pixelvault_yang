# 生成中进度感 · 混合阶段进度 + 抽共享（2026-07-17）

> **性质**：Opus 4.8 施工规格，交 **Sonnet 实现**（有现成组件框架，不过 Fable）。
> **owner 拍板**：形态 = **C 混合**（阶段分段 + 段内缓动）；范围 = **抽共享统一所有单次生成**。
> ⚠ **呈现形态已被设计升级取代（2026-07-17 owner 拍板）**：视觉以 `docs/plans/loading-language-2026-07.md` §2「裱框显影」为准（SVG 框线描边 + 中心大数字 + 参数行，`GenerationStatusChrome` 整体重构）；本文的阶段区间 / 缓动算法 / 抽共享范围 / 验收骨架照用。「顶部进度条换实条」的描述不再是最终形态。

## 目标

生成中 loading 从「无限滑动条」改成「有推进感的混合进度」：阶段分段 + 段内缓动填充；抽共享组件让图/视频/音频单次生成统一；多步任务（多镜/训练）保留真进度。

## 现状（2026-07-17 核实）

- image/video/audio 单次生成中（无结果）**已共用** `GenerationPreview` 的 placeholder + `GenerationStatusChrome`（不分模态，`GenerationPreview.tsx:159-203`）。
- `GenerationStatusChrome`（`:647`）：已有 4 阶段 label（`getGeneratingStageKey` `:52`——preparing&lt;2s / connecting&lt;8s / rendering&lt;45s / waiting&gt;45s）+ elapsed；顶部进度条 = `studio-generation-status-line` **`w-1/3` 无限滑动**（要换的就是这条）。
- 重新生成（有旧结果）overlay：**只 image 有**（imageContainer `:327`）；video/audio 容器无 overlay。
- 真进度组件：`StudioSceneProgress`（shadcn `Progress` + `status.progress`，多镜用）——**保留不动**。

## 方案（混合进度）

### 阶段 → 进度区间映射（进 `src/constants/`，禁 magic value）

| 阶段           | elapsed | 进度区间                       |
| -------------- | ------- | ------------------------------ |
| preparing      | 0–2s    | 0–20%                          |
| connecting     | 2–8s    | 20–45%                         |
| rendering      | 8–45s   | 45–88%                         |
| waiting        | &gt;45s | 88–95%（**渐近，永不到 100**） |
| 完成（有结果） | —       | 跳 100%                        |

- 段内：`progress = 段起% + easeOut((elapsed − 段起s)/段时长s) × 段宽%`；waiting 段用渐近曲线（越久越慢、逼近 95%）。
- **完成瞬间跳 100% 再淡出**（避免从 88% 突兀消失）。
- **reduced-motion**：不缓动，直接显示当前段末 %（无连续动画）。

### 抽共享

- 新组件 `StudioGeneratingProgress`（`studio-shared/`）：入参 `elapsedSeconds` + 可选 `realProgress`（有真进度时优先用真值 → 视频/训练走真进度、单次生成走阶段估算，一个组件两条路）。
- `GenerationStatusChrome` 的进度条改用它；video/audio 重生成 overlay 补齐（一致性）。
- 阶段 label 复用现有 i18n `generatingOverlayStages.*`。

## 验收

- image 生成中进度条从 0 **连续推进**（非原地滑动），配合阶段 label；&gt;45s 停 ~95% 不满，完成跳 100%。
- video/audio 单次生成中态一致（含重生成 overlay）。
- 多镜/训练仍真进度（`StudioSceneProgress` 不回归）。
- reduced-motion 无连续动画。
- tsc + vitest + `e2e/visual.spec.ts`（基线更新点名）绿；i18n 三语（如有新键）。

## 约束

- 复用 `getGeneratingStageKey` / `elapsedSeconds` / `GenerationStatusChrome` 框架；别新造一套。
- 阶段区间 / 缓动参数进 `src/constants/`；无 magic value；无 Tailwind 任意值（新尺寸进 `@theme inline`）。
- 颜色用 Studio 现有 token（不强加画布石绿）。

## Source / 分工

- 现状：`GenerationPreview.tsx`（`:647` GenerationStatusChrome、`:52` getGeneratingStageKey）· `StudioSceneProgress.tsx` · `components/ui/progress.tsx`。
- **先 Fable 设计 loading 视觉语言 → Sonnet 按设计实现**（owner 2026-07-17 纠正：加载中 UI 需要设计，不是纯工程）。本规格 = 工程骨架/约束（混合进度算法、现状锚点、验收），供 Fable 设计时消费，不替代视觉设计。
