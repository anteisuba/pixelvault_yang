# Loading 参考 — 加载态与生成进度契约（现状事实）

> 定位：全站加载态的共享行为契约。**沉淀自三份已交付并删除的任务包**（`spinner-unify-2026-07` 工程骨架 · `generating-progress-2026-07` 算法 · `loading-language-2026-07` 视觉，均 2026-07-17 拍板、2026-07 落地）。
> 视觉身份分层见 `brand-dna.md`；共享组件行为见 `frontend.md`。

## 统一语言

**loading 是一条线：不确定时它绕圈（spinner），确定时它前进（进度条）。**

| 不变量 | 值                                                                                       |
| ------ | ---------------------------------------------------------------------------------------- |
| 颜色   | 共享组件默认 `currentColor` / 语义 token；域级 variant 可覆盖，但要维持对比度与状态语义  |
| 线帽   | 圆头（spinner = `Loader2` 自带 round cap；进度框线 `stroke-linecap: round`）             |
| 曲线   | 状态切换用 `--ease-standard`；持续运动用 `linear`（匀速 = 诚实，缓动留给「到位」的瞬间） |

⚠ 2026-07-19 治理更新：本文只定义**中性 fallback 与状态可读性**，不锁定所有业务域的 loading 皮肤。域可通过 component/domain variant 改皮，但**不得用装饰掩盖真实进度**。

## Spinner（`src/components/ui/spinner.tsx`）

- 图形 = lucide `Loader2`（270° 弧），`strokeWidth` 全档默认 2，**不按档调粗细**。
- 三档尺寸：`sm` 14px（密排行内）· `md` 16px（**默认**，按钮/菜单/对话框行内）· `lg` 24px（区块/页面级居中）。
- **页面级不用 32px 大转圈**：`lg` + 下方 `text-xs text-muted-foreground` 一行 i18n 文案。存在感交给文字。
- 颜色：按钮/行内默认 `currentColor`；独立居中用 `text-muted-foreground`。⛔ 禁止彩色 spinner，禁止在非 primary 表面上用 `text-primary` 抢焦点。
- 动效：`animate-spin` 原样（1s linear），**不新造时长 token**。reduced-motion 走 `motion-reduce:animate-none` + `motion-reduce:opacity-70`。
- a11y：`role="status"` + `aria-label`（默认「加载中」i18n）。
- ⚠ 收编边界：只收「通用 loading spinner」语义。特定语义的转圈（如 `NodeStatusBadge` 的 queued 动画）不无脑替换。`skeleton.tsx` 是另一回事，不动。

## 生成中混合进度（`src/constants/generation-progress.ts` · `StudioGeneratingProgress`）

形态 = **阶段分段 + 段内缓动**（owner 2026-07-17 拍板 C 混合）。阶段 → 进度区间：

| 阶段           | elapsed | 进度区间                       |
| -------------- | ------- | ------------------------------ |
| preparing      | 0–2s    | 0–20%                          |
| connecting     | 2–8s    | 20–45%                         |
| rendering      | 8–45s   | 45–88%                         |
| waiting        | >45s    | 88–95%（**渐近，永不到 100**） |
| 完成（有结果） | —       | 跳 100% 再淡出                 |

- 段内：`progress = 段起% + easeOut((elapsed − 段起s)/段时长s) × 段宽%`。
- `StudioGeneratingProgress` 入参含可选 `realProgress` —— **有真进度时优先用真值**（视频/训练走真进度，单次生成走阶段估算）。
- reduced-motion：不缓动，直接显示当前段末 %。
- `StudioSceneProgress`（多镜真进度）是另一条线，不受本节约束。

## 生成中的样子：边即进度（加载态 A · owner 2026-09-27）

设计画布「加载态 A · 全部状态」拍板（替掉「裱框显影」的三条线叠一起）。**只有一条线**：图框 / 卡片自己的边在生成时退成浅灰轨道，前景色线从**上沿正中顺时针**走，走满一圈就是原来的边。

- **同一处、同一粗细**：线宽 1.5px。画布卡压在盒子外侧半个线宽上 —— 与选中环（`outline` 1.5px）重合：卡生成时把边交出去（`NodeCardShell` 的 `edgeBusy`，线画在不裁切的 `edgeOverlay` 层），走满、停一拍后再还回来，选中环 / 细灰边在淡出的线底下回来，看不出接缝。工作台的宿主（舞台图框、图墙格、LoRA 出图卡）和手机镜头卡都裁切自己的盒子，线收在边内侧（`edgePlacement` 缺省 `inside`；⛔ 在裁切的宿主里传 `outside`，外半条会被切掉）。路径按盒子实测尺寸算（`buildGenerationEdgePath`，配 `pathLength=100`）。
- **中间只有两样**：中号百分比 + 一句阶段词；舞台新生成多一行参数。窄于 160px 的格子只写百分比，阶段词只给读屏（CSS 走 `@max-4xs/progress:`；画布是 transform 缩放，由宿主按缩放后宽度传 `hideStageLabel`）。
- **等太久**：45 秒后线照样渐近地爬（最多 95），⛔ 不再呼吸闪烁。
- **图框本身没有别的装饰**：舞台新生成就是一块素底图框，边就是那条线；⛔ 虚线外框、⛔ 流光（shimmer）。底部输入框布局里，这块图框和出来的图都按舞台剩下的地方等比放到最大（`studio-fit-box`，框的比例就是图的比例；⛔ 按视口算 —— 矮屏会切掉下沿，线走到下面就看不见了）；结果图外面也不再套一圈虚线卡片，重画时线跑在图自己的边上。
- **出图**：线 240ms 线性补满合拢 → 停 140ms → 线与数字 200ms 淡出，结果在底下显出。重画已有图时旧图留着、盖一层白纱；新图到了先压在白纱（和图上的模糊）底下，线开始淡出那一拍（`onEdgeRelease`）白纱撤掉、模糊收掉。结果换掉舞台图框时进度层是新挂上的，线也先按当时的读数画一帧再补满（⛔ 一出现就是满的）。图片出图就是结果原地出现，⛔ 再弹成功 toast（视频 / 音频的完成提示照旧）。
- **取消（✕ / ■）**：线与数字直接收掉，卡回到之前的样子（有旧图就是旧图，没有就是空卡），⛔ 留半截线（owner 2026-09-27，不做淡出）。
- **失败就地说**：线停在原处变灰，中间一句原因 +「重试」（窄格写短句，原因留给读屏）；⛔ 红框、⛔ 错误对话框。工作台新生成失败就留在那块图框里说；重画失败时旧图留着盖白纱，原因 +「重试」压在图上。点「重试」从 0 重新走（换一条新线，⛔ 从停住的地方往回退）。图墙失败的那一格只重来它自己（`retryRunItem`，用它当初那份请求）。说一次就够：⛔ 再弹同一句 toast；视频的失败由队列条那一行说（原因 +「重试这条」），舞台不再压一层。
- 音频矮卡画不下一圈，还是一条线（浅灰轨道 + 前景色线 + 右边百分比），同一条估算。

## Source of Truth

- 组件：`src/components/ui/spinner.tsx` · `src/components/business/studio-shared/primitives/StudioGeneratingProgress.tsx`
- 常量：`src/constants/generation-progress.ts`（阶段区间，禁 magic value）
- i18n：`generatingOverlayStages.*`

## Last Verified

- 2026-09-27 · 加载态 A：`/dev/ui-states` 的「加载态 A」样板间（真计时驱动同一份组件：舞台图框、真卡壳、对比图墙大格 / 小格、音频矮卡，出图 / 失败 / 重新开始走真实收尾路径）在 Chrome 里逐态核过；边线路径有单测（`buildGenerationEdgePath`）。
- 2026-08-07 · 方法：从三份原任务包（`git show HEAD~1` 可取回）合并，未重新实测组件行为。**下次改加载态时顺手核一遍尺寸档与阶段区间是否仍与代码一致。**
