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

## Source of Truth

- 组件：`src/components/ui/spinner.tsx` · `src/components/business/studio-shared/primitives/StudioGeneratingProgress.tsx`
- 常量：`src/constants/generation-progress.ts`（阶段区间，禁 magic value）
- i18n：`generatingOverlayStages.*`

## Last Verified

- 2026-08-07 · 方法：从三份原任务包（`git show HEAD~1` 可取回）合并，未重新实测组件行为。**下次改加载态时顺手核一遍尺寸档与阶段区间是否仍与代码一致。**
