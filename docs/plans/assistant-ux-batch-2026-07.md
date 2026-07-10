# 助手体验批次任务包（2026-07-10 拍板）

> 调查与拍板：Fable（2026-07-10 会话）。执行目标读者：Sonnet。
> 三项拍板结论：①对话持久化走 DB 会话表；②图像入口三处全统一、最终删 `ImageSourcePicker`；③助手打开过渡做动画 + 预取，Studio 与 Node 两侧都做。
> 三片相互独立，可按 A → C → B 或并行执行；每片单独提交、单独过闸。

---

## 背景（调查结论摘要）

- **图片助手**（`usePromptAssistant` → `PromptAssistantPanel`）：消息挂在面板组件 state；桌面 dock `StudioAssistantDock.tsx` 在关闭时 `return null`、移动端 drawer 关闭时卸载内容 → **关闭即全丢**，刷新更丢。
- **Node 助手**（`useAssistantConversation` → `StudioNodeAssistantDock`）：dock 组件常驻（关闭只渲染悬浮按钮）→ 页面内开关可保留，刷新 / 换项目 / 换设备丢。
- **数据库**：`prisma/schema.prisma` 无任何会话模型。
- **两边发给 LLM 的历史均无截断**：`prompt-assistant.service.ts` 的 `flattenConversation` 全量拼接；node 侧 `messages` 全量发（`NODE_STUDIO_ASSISTANT_LIMITS` 只限节点数）。持久化后会话变长，必须加重放窗口。
- **过渡**：桌面点「助手」chip → dock 从 `null` 瞬间插入 448px（flex 兄弟，画布一帧内被挤压），首开还有 `next/dynamic` chunk 下载 spinner。Node 侧 dock 是 absolute overlay，同样瞬间 mount（`.node-canvas-panel-motion` 只管宽度 resize，不管 enter/exit）。
- **图像入口两套实现**：助手弹层 `AssistantImagePopoverBody`（`PromptAssistantPanel.tsx` 内，拖/粘/传一体入区 + 最近素材 8 格 + 素材库）体验优；Studio「图像」chip 用老的 `ImageSourcePicker`（两大卡 + 图层分解行，无最近素材）。owner 拍板以助手弹层为准反向统一。
- 顺手修的隐性缺陷：助手弹层文案含「粘贴」但弹层内 paste 未接线（只在 composer textarea 生效）；老 `ImageSourcePicker` 反而支持。共享组件须合并两者优点。

---

## Slice A — 对话持久化（DB 会话表）

### A0 前置：图片助手 state 提出卸载边界

- 把 `usePromptAssistant` 的会话 state（messages / isLoading / error）改为模块级 store + `useSyncExternalStore`，模式照抄 `StudioAssistantDock.tsx` 里 dock 宽度的 `storedLayout` 实现（module-level 变量 + listeners Set）。
- 效果：关闭 dock / drawer 再打开，消息仍在（达到 Node 助手水位）。这是纯前端改动，可独立提交先行。

### A1 Prisma 模型

```prisma
enum AssistantSurface {
  STUDIO
  NODE_CANVAS
}

model AssistantConversation {
  id        String           @id @default(uuid())
  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  surface   AssistantSurface
  /// NODE_CANVAS 时指向 NodeWorkflowProject.id；STUDIO 为 null
  projectId String?
  /// 首条用户消息截断生成（会话列表备用）
  title     String?
  /// [{ role, content, createdAt }] — 只存文本 + R2 URL，严禁 base64
  messages  Json
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  @@index([userId, surface, updatedAt(sort: Desc)])
  @@index([projectId])
}
```

- `User` 模型加反向 relation。改完跑 `npx prisma migrate dev --name assistant_conversation` + `npx prisma generate`。
- **不给 NodeWorkflowProject 加外键约束**（projectId 只是弱引用，项目软删后会话仍可读），但删除项目的 service 里追加清理该 projectId 的会话。

### A2 Service + API

- 新建 `src/services/assistant-conversation.service.ts`（`'server-only'`）：
  - `upsertConversation(clerkId, { id?, surface, projectId?, messages })` — 每轮 assistant 回复完成后由客户端调用一次，整体覆盖 messages 数组；无 id 时创建并从首条 user 消息生成 title（截断，长度常量进 `src/constants/`）。
  - `getLatestConversation(clerkId, surface, projectId?)` — dock 首开恢复用。
  - 服务端校验 ownership（userId 必须匹配）。
- 路由 `src/app/api/assistant/conversation/route.ts`（POST upsert / GET latest），走 `api-route-factory`，Zod schema 进 `src/types/`（messages 数组元素 schema 复用现有 `PromptAssistantMessage` / `NodeAssistantMessage` 形状，加 `createdAt`）。
- `src/lib/api-client.ts` 加 wrapper；endpoint 常量进 `src/constants/config.ts`。

### A3 客户端接线

- **图片助手**：A0 的模块级 store 加两个动作——初始化时（首次打开 dock）GET latest 恢复；`send` 成功收到回复后 POST upsert。`clear` 语义改为「新会话」：本地清空 + 下次 upsert 走新 id（旧会话保留在库里）。
- **Node 助手**：`useAssistantConversation` 同样接恢复 + 每轮落库；key 为 `(NODE_CANVAS, projectId)`。流式期间不写库，`readTextStream` 完成后写一次。换项目回来能恢复对应会话。
- 参考图：消息体里如出现图片引用，只允许 R2/远程 URL；base64 引用不进 upsert payload（发 LLM 的请求仍可带 base64，与落库解耦）。

### A4 LLM 重放窗口（必做，与持久化同批）

- 新常量 `ASSISTANT_REPLAY_WINDOW`（建议 12，放 `src/constants/config.ts` 或 `node-studio.ts` 各自域）。
- `prompt-assistant.service.ts` 的 `flattenConversation` 与 node 侧 prompt 组装只取最近 N 条；UI 展示不受影响（全量本地渲染）。

### A 验收

- 图片助手：发两轮 → 关 dock → 重开（消息在）→ 刷新页面（消息在）→ 点清空 → 发新消息 → 刷新（只见新会话）。
- Node 助手：项目 P1 发消息 → 切项目 P2（空）→ 切回 P1（恢复）→ 刷新（恢复）。
- DevTools Network：每轮回复完成后恰好一次 `POST /api/assistant/conversation`；打开 dock 时一次 GET。
- 长会话（>窗口条数）时检查发往 `/api/prompt/assistant` 的 payload 只含最近 N 条。

---

## Slice B — 助手打开过渡

### B1 Studio 桌面 dock（`StudioAssistantDock.tsx`）

- `<aside>` 常驻不再 `return null`（移动端仍然 null）；关闭态 `width: 0`，打开态 `width: layout.widthPx`。
- 过渡复用 motion canon：`transition: width var(--duration-slow) var(--ease-standard)`——直接复用/参照 `globals.css` 的 `.node-canvas-panel-motion`（含 `[data-resizing='true']` 抑制拖拽期动画；reduced-motion 已全局中和）。CSS 类加在 `@layer` 相应位置，不写 Tailwind 任意值。
- 防回流：内层内容容器固定 `min-width`（= 当前 widthPx），外层 `overflow-hidden`，收窄时文字不换行抖动；内容叠 opacity 淡入（`duration-slow ease-standard` 工具类）。
- 关闭态要把 drop-target / 事件解除（现 effect 已依赖 `open`，确认常驻后依赖仍正确）；`aria-hidden` / `inert` 处理关闭态焦点。

### B2 chunk 预取

- 「助手」chip（`StudioEnhanceButton`）`onMouseEnter` / `onFocus` 时触发一次 `import('@/components/business/prompts/PromptAssistantPanel')` 预热（幂等，模块级 flag）。可再加 workspace mount 后 `requestIdleCallback` 兜底。

### B3 Node 画布 dock（`StudioNodeAssistantDock.tsx`）

- 入场/退场加 transform + opacity（右滑入，`duration-slow ease-standard`）；它是 absolute overlay，不需要 width 动画。悬浮按钮与 dock 切换时避免两者同帧闪现。
- 移动端 bottom-sheet 形态同理加 translateY 入场（已有 keyboard-inset 逻辑不动）。

### B 验收

- 桌面 `/studio/image` 点「助手」：画布平滑让位（无一帧跳变）；关闭反向同轨；拖拽调宽时无动画滞后（data-resizing 生效）。
- 首次打开无 spinner（hover 已预取）；`prefers-reduced-motion` 下直接跳变。
- Node 画布开/关助手 dock：滑入滑出，无瞬间闪现。

---

## Slice C — 图像入口统一（共享 ImagePickerPopoverBody）

### C1 抽共享组件

- 新建 `src/components/business/studio-shared/ImagePickerPopoverBody.tsx`，以 `PromptAssistantPanel.tsx` 内的 `AssistantImagePopoverBody` 为蓝本迁出，接口：
  - `onPickFile()` / `onDropFile(file)` / `onPickAsset(generation)` / `onOpenLibrary()`
  - 可选 slot：`headerSlot`（图像 chip 放 `ImageAttachmentPreviewStrip` 多图预览 + 上限徽标）、`footerSlot`（图像 chip 放图层分解行）
  - 文案全走 props（两宿主各自 ns），最近素材数量复用 `STUDIO_ASSISTANT_RECENT_ASSETS`。
- **补 paste 接线**：入区容器 `tabIndex={0}` + `onPaste`（从 `ImageSourcePicker` 迁移 `getImageFileFromDataTransfer` 逻辑），让「拖拽 / 粘贴 / 点击上传」三个承诺都成立。
- 最近素材请求保持 `fetchGalleryImages(1, N, { mine: true, type: 'image', sort: 'newest' })`；弹层每次打开时拉取（现状行为）。

### C2 宿主迁移（分两步提交）

1. **第一步**：`ReferenceImageChip.tsx`（Studio 图像 chip）换用共享组件——保留多图 append 语义、`maxRefImages` 上限、数量/警示徽标、图层分解入口、`AssetSelectorDialog` 兜底；`PromptAssistantPanel` 同步改为消费共享组件（单槽 replace 语义不变）。
2. **第二步**：`LoraReferenceImageChip.tsx`、`ReverseEngineerPanel.tsx` 迁移 → 删除 `ImageSourcePicker.tsx` + `ImageSourcePicker.test.tsx`。

### C3 i18n 与测试

- 三语（en/ja/zh）同步：入区文案 / 最近素材 / 素材库等键，评估合并 `ImageChip` 与 `PromptAssistant` ns 中重复键（新共享键建议放 `ImagePicker` ns）。
- 测试跟改：`ReferenceImageChip.test.tsx`、`PromptAssistantPanel.test.tsx`、新增 `ImagePickerPopoverBody` 单测（拖放 / 粘贴 / 最近素材点选 / 素材库跳转）；第二步删 `ImageSourcePicker.test.tsx`。

### C 验收

- Studio「图像」chip 弹层与助手弹层视觉/交互一致（入区 + 最近素材 + 素材库）；chip 侧多选多张后预览条与上限徽标仍工作；图层分解入口仍在。
- 弹层内 Ctrl+V 粘贴截图 → 直接入参考槽（两个宿主都验）。
- LoRA 生成页参考图 chip、反推面板走查一遍（第二步后）。

---

## 禁改范围

- 生成链路（`useImageUpload` store 语义、`use-unified-generate`、generation services）不动——本批只动弹层 UI 与会话存取。
- `studio-context` reducer 的 `panels` 契约不动（`refImage` / `enhance` 开关语义保持）。
- Node 助手的路由选择 / research / ScriptDoc 流程不动（Slice A 只在流结束后追加落库）。
- NSFW / 素材库过滤逻辑不动（最近素材沿用现有 `fetchGalleryImages` 行为）。

## 全局闸门

- 全量 `tsc`（后台跑、显式捕获 exit code，~4 分钟，不许因超时跳过）+ 全量 vitest（~4.5 分钟）绿才算绿。
- i18n 三语同步检查（`i18n-check`）。
- dev server 在跑时不并行 build；UI 走查用 claude-in-chrome。
- 源码只用 Edit/Write 工具改（PS 编码会毁 UTF-8 中文注释）。
- owner 点头才提交；每片一个 commit。
