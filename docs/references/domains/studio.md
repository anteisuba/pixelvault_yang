# Studio 域 — 创作工作台（现状事实）

> 职责：image / video / audio 的默认创作工作台 + 高级能力入口（画布/LoRA/3D/编辑）。**不负责**：完整素材库（批量管理/文件夹/发布管理归 Assets / Project / Gallery）。产品定位见 `../product.md`。

## 路由面

- `/studio` → 重定向 `/studio/image`；`image` / `video` / `audio` 在共享 `(workspace)` route group 下，**UI 只挂载一次**（`(workspace)/layout.tsx`），各 page 只渲染 `StudioModeSync` 切模式——路由切换不重挂工作台。
- `/studio/node`（画布，见 `plans/canvas-baseline.md`）· `/studio/lora` · `/studio/3d`（搁置）· `/studio/edit(/**)` · `/studio/enhance` / `analyze`（工具路由）。
- 全部 `/studio/*` 包在 `LoraStackProvider` + `ActiveLoraBar` 里（LoRA 挂栈贯穿）。

## 状态架构（高风险：`src/contexts/studio-context.tsx` 47 引用，见 `src/contexts/CLAUDE.md`）

三上下文分治（性能边界，组件只订阅所需）：`StudioFormContext`（prompt/workflow/输出类型/面板/参数）· `StudioDataContext`（卡片/项目/上传/增强/Civitai token/引导/用量）· `StudioGenContext`（useUnifiedGenerate 生成态）。

## 生成路径

`use-unified-generate.ts`（客户端编排）→ `studioGenerateAPI` → `POST /api/studio/generate` → `studio-generate.service`（quick=直接提交 worker job；card=先 `compileRecipe`）→ Cloudflare Worker 执行 → 签名回调 → `Generation`。视频/音频走各自 API + service，**同样返回 job id 轮询**；Next.js 不做同步 provider 执行（Worker-only，见 `../providers.md`）。

## UI 现状事实（2026-07-10 浏览器目检；不是未来设计规范）

以下内容只用于定位当前代码、测试与回归。Studio Image、Video、Audio 的后续视觉方向分别定义，不得把当前 dock、亮纸 composer、chips 或历史评审当作跨域默认皮肤。

- dock 六位工具栏：模型 / 模板 / 助手 / 图像 / 卡片 / 1:1；chip 三态（空/已设值/不支持不渲染）。
- composer = 暗面上唯一「亮纸」（`--surface-composer` 象牙 + 黑丸 CTA，B4 已实装）。
- 空态起手势：eyebrow + 3 示例 chips + 继续创作 ≤6 缩略图 + 教程入口（施工报告在 `archive/reviews/2026-07-05-studio-empty-state.md`）。
- 助手宿主 = 右侧 dock（施工基准 `archive/reviews/2026-07-07-studio-assistant-dock-redesign.md`）。
- 工具面板当前行为与实现见 `references/frontend.md` 及对应代码；旧 `archive/design/direction.md` 仅作历史证据，不再提供视觉契约。

## 不能破坏

共享挂载工作台与 mode 切换 · StudioResizableLayout 是垂直间距唯一负责人 · 触屏软键盘策略（focusUnlessTouch）· 缺 key 走 QuickSetupDialog 不禁用 · studio 视觉基线依赖测试用户状态。

## Source of Truth

`src/app/[locale]/(main)/studio/**` · `src/contexts/studio-context.tsx` · `src/hooks/use-unified-generate.ts` · `src/services/studio-generate.service.ts` · `src/constants/workflows.ts`；历史详版 `git show cddc4384:docs/domains/studio.md`。

## Last Verified

2026-07-10 · 路径与状态架构沿用 2026-06-03 口径 + 07-10 浏览器目检（dock/空态/composer/助手 dock）。
