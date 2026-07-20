# 统一 Spinner 组件 · 收编散装 loading（2026-07-17）

> **性质**：Opus 4.8 施工规格，交 **Sonnet 实现**（纯工程，不过 Fable）。
> **owner 拍板**：本轮只做**统一 Spinner**；页面切换 / 列表骨架 / 图片占位不做（盘点见对话，以后按需再拉）。

## 目标

抽一个统一 `Spinner` 组件，收编全项目 **60+ 处散装** 的 `Loader2 + animate-spin`，一次根治视觉不一致 + 未来新按钮复用。

## 现状

- 60+ 文件各自写 `<Loader2 className="animate-spin size-N …" />`（grep `animate-spin|Loader2`，遍布 node / studio / cards / prompts / assets / api-key），尺寸/颜色/位置各异，无统一组件。
- 已有 `components/ui/skeleton.tsx`（骨架，另一回事，**不动**）。

## 方案

### 新组件 `components/ui/spinner.tsx`

- 入参：`size`（`sm`/`md`/`lg`，尺寸档 token 化，进组件 variant 或 constants）+ `className`（覆盖/定位）+ 可选 `label`（a11y）。
- 内部：`Loader2` + `animate-spin`；`role="status"` + `aria-label`（有 label 用 label，无则默认「加载中」i18n）。
- **reduced-motion**：降级（`motion-reduce:animate-none` 或静态图标）。

### 收编

- grep 全项目 `Loader2` + `animate-spin` 用法，逐个替换成 `<Spinner size=… className=… />`。
- **保留各处尺寸语义**：按钮内小（sm）、内联中（md）、页面/区块级大（lg）；特殊定位/颜色用 `className`。
- ⚠ **只收编「通用 loading spinner」语义**：特定语义的转圈（如 `NodeStatusBadge` 的 queued 状态动画、个别定制动效）先判断上下文，**不无脑全替**——那些可能有专属语义/颜色。

## 验收

- 所有通用 loading spinner 视觉统一（尺寸档/颜色/动画一致）。
- reduced-motion 生效；a11y（`role=status` + label）无回归。
- tsc + vitest 绿；`e2e/visual.spec.ts` 基线更新（spinner 外观变，点名更新受影响快照）。
- 抽查若干调用点（按钮/对话框/列表）尺寸语义未跑偏。

## 约束

- 尺寸档进 `src/constants/` 或组件 variant；无 magic value；无 Tailwind 任意值（新尺寸进 `@theme inline`）。
- 颜色用现有 token（`currentColor` / muted 等），随上下文。
- 不动 `skeleton.tsx` / `StudioSceneProgress` / 刚定的生成中混合进度（那些是别的场景）。

## Source / 分工

- 现状分布：`animate-spin|Loader2` grep（60+ 文件）。
- **先 Fable 设计 loading 视觉语言 → Sonnet 按设计实现**（owner 2026-07-17 纠正：加载中 UI 需要设计）。本规格 = 工程骨架/约束（抽组件 API、收编策略、验收），供 Fable 设计时消费，不替代视觉设计。
