# Studio 域 — 创作工作台（现状事实）

> 职责：image / video / audio 的默认创作工作台 + 高级能力入口（画布/LoRA/3D/编辑）。**不负责**：完整素材库（批量管理/文件夹/发布管理归 Assets / Project / Gallery）。产品定位见 `../product.md`。

## 路由面

- `/studio` → 重定向 `/studio/image`；`image` / `video` / `audio` 在共享 `(workspace)` route group 下，**UI 只挂载一次**（`(workspace)/layout.tsx`），各 page 只渲染 `StudioModeSync` 切模式——路由切换不重挂工作台。
- `/studio/node`（画布 v4，基准见 `../pages/node-canvas-v2.md`）· `/studio/lora` · `/studio/3d`（现行页面基准见 `../pages/studio-3d.md`）· `/studio/edit(/**)`（legacy 重定向）。⚠ `/studio/enhance` 与 `/studio/analyze` 已于 2026-09-17 删除（只是占位页；增强 / 解析能力在画布视频节点里）。
- 全部 `/studio/*` 包在 `LoraStackProvider` + `ActiveLoraBar` 里（LoRA 挂栈贯穿）。

## 状态架构（高风险：`src/contexts/studio-context.tsx` 47 引用，见 `src/contexts/CLAUDE.md`）

三上下文分治（性能边界，组件只订阅所需）：`StudioFormContext`（prompt/workflow/输出类型/面板/参数）· `StudioDataContext`（卡片/项目/上传/增强/Civitai token/引导/用量）· `StudioGenContext`（useUnifiedGenerate 生成态）。

图片工作台的提示词、负面提示词与有序参考图 URL 通过 `useStudioDraft` 保存到按账号隔离的 `sessionStorage`，同一标签页刷新后恢复；不恢复生成授权、在飞请求或助手操作按钮。URL 回填支持重复的 `referenceImage` 参数，并在应用后移除已消费的回填参数，避免后续刷新覆盖新草稿。

## 生成路径

`use-unified-generate.ts`（客户端编排）→ `studioGenerateAPI` → `POST /api/studio/generate` → `studio-generate.service`（quick=直接提交 worker job；card=先 `compileRecipe`）→ Cloudflare Worker 执行 → 签名回调 → `Generation`。视频/音频走各自 API + service，**同样返回 job id 轮询**；Next.js 不做同步 provider 执行（Worker-only，见 `../providers.md`）。

## UI 现状事实（2026-07-10 浏览器目检；不是未来设计规范）

以下内容只用于定位当前代码、测试与回归。Studio Image、Video、Audio 的后续视觉方向分别定义，不得把当前 dock、亮纸 composer、chips 或历史评审当作跨域默认皮肤。

- dock 六位工具栏：模型 / 模板 / 助手 / 图像 / 卡片 / 1:1；chip 三态（空/已设值/不支持不渲染）。
- composer = 暗面上唯一「亮纸」（`--surface-composer` 象牙 + 黑丸 CTA，B4 已实装）。
- 空态起手势：eyebrow + 3 示例 chips + 继续创作 ≤6 缩略图 + 教程入口。
- 助手宿主 = 右侧 dock，手机上是同一颗 Dock 里的全屏 Sheet（**现行施工基准见 `../pages/assistant-shell.md`**——2026-09-06 owner 定方向 C「工作日志」：覆盖式面板 inset 24 / 默认 560 · 收起态 48px 图标轨 · 顶部进度带（**助手设置入口 = 带上那颗常驻齿轮**，2026-09-07 起 ⋯ 菜单不再有这一项）· 三档确认 · 计划卡 · @ 看图（**视频档扩成三帧评审卡**）· 助手设置 persona · 检索链 `research` / `read_url` / 官方优先搜图；**第二期视频域主体已落地**（`6e91e0d0` + `48d6fecb`）；画布走自己的一套 op 与提案卡，见 `../pages/node-canvas-v2.md` §13）。
- **视频档参考区 = 三个具名槽**（第二期，`48d6fecb`）：**首帧 / 尾帧 / 参考视频**（`StudioVideoReferenceSlots`，由 `StudioPromptArea` 在视频档挂；状态是 `studio-context` 的 `videoFrameSlots` + `videoReferenceVideos`）。哪些槽出现由**当前模型的发送契约**算（`getVideoWorkbenchSlots` ← `getVideoModelSendContract`），⛔ 不支持的槽**不渲染**、不摆禁用占位。⛔ 首尾帧靠**下标**承载（[0] 首帧、[1] 尾帧）那一套已删——删掉第一张会让尾帧静默升级成首帧；关键帧档下通用的 `ReferenceImageChip` 也不再渲染（那一档发送口不读参考图列表 = 静默失效）。
- 工具面板当前行为与实现见 `references/frontend.md` 及对应代码。

## 不能破坏

共享挂载工作台与 mode 切换 · StudioResizableLayout 是垂直间距唯一负责人 · 触屏软键盘策略（focusUnlessTouch）· 缺 key 走 QuickSetupDialog 不禁用 · studio 视觉基线依赖测试用户状态。

## Source of Truth

`src/app/[locale]/(main)/studio/**` · `src/contexts/studio-context.tsx` · `src/hooks/use-unified-generate.ts` · `src/services/studio-generate.service.ts` · `src/constants/workflows.ts`；历史详版 `git show cddc4384:docs/domains/studio.md`。

## 移动端等级（owner 2026-09-03 拍板，配方见 `../ui-defaults.md §6`）

| 路由                                      | 等级     | 375px 结构                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/studio/image` `/video` `/audio` `/edit` | **降级** | 预览占满，参数面板进底部 vaul 抽屉，生成栏固定在 `safe-area-inset-bottom` 之上；模型选择只用 `layout="drill"`；**助手移动端第一期已做**：图片 / 视频档走 vaul 全屏 Sheet（`100dvh`，复用桌面同一个 `StudioOperatorPanel` 元素）+ 右下 44px 浮标；音频档仍是旧 `PromptAssistantPanel` 抽屉（第四期收编）。配方与取舍见 `../pages/assistant-shell.md §11.6`。⛔ 原「移动端下一轮、`isMobile → return null`」作废；`/studio/image` 落卡见 `../pages/studio-image-mobile-request.md`（owner 2026-09-03 拍板方向 A，本轮只验证图片模式）；`/studio/video` 落卡见 `../pages/studio-video-mobile-request.md`（owner 2026-09-03 拍板，复用图片端 composer 结构换视频 chip，队列条移动端可见优先） |
| `/studio/node`                            | **降级** | 见 `../pages/node-canvas-v2.md` §0.1 移动端节 + `../ui-defaults.md §6`「降级 · 画布」                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/studio/lora`                            | **降级** | 见 `lora.md` 移动端节，训练创建不做；助手仍走 `LoraAssistantDock`（operator Dock 在小屏按域收窄，否则两张面板同屏）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/studio/3d`                              | **完整** | 2026-09-09 owner 确认优化并解除搁置；窄屏预览 + 参数抽屉 + 固定生成操作，见 `../pages/studio-3d.md`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Last Verified

- 2026-09-09 · 3D 改为左设置 / 右预览，窄屏参数抽屉与固定生成操作；保留原生成契约，页面基准见 `../pages/studio-3d.md`。

- 2026-09-08 · 画布 v4 落地：`/studio/node` 三处指针改指 `../pages/node-canvas-v2.md`（现行基准），「现状 / 目标态」两份的说法删除。只改文档。
- 2026-09-07 · 助手第二期视频域落地（`6e91e0d0` + `48d6fecb`）：UI 现状事实节补「三具名槽」一条，助手宿主一句同步（齿轮入口 / 三帧评审卡 / 第二期已落地）。详版见 `../pages/assistant-shell.md` §14 第二期。只改文档。
- 2026-09-06 · 移动端助手落地（`adb0a008`）：图片 / 视频档全屏 Sheet + 44px 浮标，表格该行与 LoRA 行同步；「下一轮不渲染」作废。只改文档。
- 2026-09-06 · 助手改版落卡：指针改指 `../pages/assistant-shell.md`（方向 C 施工基准）；画布补 `../pages/node-canvas-v2.md` 目标态指针。只改文档。
- 2026-09-03 · 新增「移动端等级」节（owner 拍板，配方见 ui-defaults.md §6）。
- 2026-09-03 · `/studio/image` 移动端方向 A 落卡，指针见本表该行。
- 2026-09-03 · `/studio/video` 移动端落卡，指针见本表该行。
  2026-07-10 · 路径与状态架构沿用 2026-06-03 口径 + 07-10 浏览器目检（dock/空态/composer/助手 dock）。
