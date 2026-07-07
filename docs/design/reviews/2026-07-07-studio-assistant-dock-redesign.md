# Studio 助手 Dialog → 右侧 dock 重设计（2026-07-07）

> **触发**：owner 对比节点编辑器的侧边栏助手后判「放进侧边栏更好」。本文是施工前草稿，
> **取代** 2026-06-13「助手=居中 Dialog」决策中的宿主形态部分（通用跨模态、并入看图反推
> 等内容决策仍有效）。
>
> 线框：[`svg/studio-assistant-dock-redesign.svg`](svg/studio-assistant-dock-redesign.svg)。

## 1. 背景与结论

Studio 助手（`PromptAssistantPanel`，由 `StudioEnhanceButton` 用 `ResponsiveDialog`
居中弹出）已经从「一次性变换工具」漂移成「对话伙伴」：有对话流、模型选择、响应语言、
联网/附件/参考图。多轮对话放在 modal 里是容器错配：

- modal 遮挡画布和 prompt 框，「生成 → 问助手 → 填入 → 再生成」每一环都要开关面板；
- 对话上下文随弹窗关闭在视觉上消失，重开有心理成本；
- 与节点编辑器的右侧常驻助手 dock 是两套心智模型。

**结论**：改为右侧常驻 dock，与 `StudioNodeAssistantDock` 同构。`PromptAssistantPanel`
内容保持容器无关，只换宿主。06-13 当时对比的是 Dialog vs popover（popover 小视口会裁），
侧边栏未被评估过，本次补上。

## 2. 设计定案

### D1 位置与开合

- dock 挂在 `StudioWorkspaceUI` 层，作为 `StudioFlowLayout` 的**水平 flex 兄弟节点**
  （不进 `StudioResizableLayout` 内部——它是垂直间距唯一负责人，且空态 flex 链有特殊处理，
  不动它的语义）。画布区 `flex-1 min-w-0` 自然收窄，底部 dock 行为不变。
- 工具栏「助手」chip 从 `ResponsiveDialogTrigger` 改为**开合 toggle**：开=chip 高亮
  （`studioChipActiveClass`），再点=收起。与 node 侧 `CanvasAssistantToggle` 语义一致。
- 打开状态放 `StudioFormState.panels`（新 PanelName `assistant`，reducer dispatch 控制，
  匹配现有 panels 约定），image/video/audio 三模式共用——助手本来就是跨模态的。
- 默认收起；不做「记住上次开合」第一版（宽度记住、开合不记住，与 node dock 现状对齐）。

### D2 尺寸与拖拽

参数照抄 node dock（用户已在节点编辑器学过这套手感）：

| 参数     | 值                                                       |
| -------- | -------------------------------------------------------- |
| 默认宽   | 448px                                                    |
| 拖拽范围 | 320–720px                                                |
| 手柄     | 左缘 6px，键盘步进 20px，双击复位                        |
| 持久化   | localStorage `pixelvault.studio.assistantDock.layout.v1` |

- 新常量 `STUDIO_ASSISTANT_DOCK_RESIZE`（`src/constants/`），值与
  `NODE_STUDIO_DOCK_RESIZE` 相同但**语义独立**——不共享 storageKey，不 import 对方；
  两边都稳定后再评估抽 `studio-shared` dock 原语（长期建模：先同构验证，再抽象）。
- 不做 node dock 的 ⤢ 展开态（那是给 ScriptDoc 双栏的，Studio 助手没有第二栏）。

### D3 dock 内容结构（自上而下）

1. **头部**：Bot 图标 + 「助手」标题 + ▸ 收起。（施工偏差 2026-07-07：⊕ 新对话不放头部
   ——对话 clear 状态在 `PromptAssistantPanel` 内部，composer 已有「清空」按钮；为一个
   头部图标把对话状态抬升到壳层不值得，待对话状态有第二个壳层消费者时再抬。）
2. **快捷动作 chips**：原 Dialog 顶部的 4 个动作预设（图片风格 / 详细 / LoRA 转换 / 标签，
   `ACTION_PRESETS`）保留为对话上方一行 chips，逻辑不变（`applyPreset`）。
3. **对话区**：flex-1 滚动。空态=现有 3 条 starter 示例；消息流、结果卡「填入 / 追加 / 复制」
   全部沿用 `PromptAssistantPanel` 现有实现。
4. **composer**：textarea + 模型选择（`MainModelPicker` LLM 分支）+ 响应语言 +
   灵感上下文 + 图片入口（**合并为一个按钮**，见 D4），含 Gemini 快捷配置路径
   （Hard Rule 8：缺 key 走 `QuickSetupDialog`，不禁用）。

### D4 参考图入口收敛 + 拖拽进 dock（2026-07-07 owner 补充拍板）

现状助手有三个图片入口，全部写同一个**单图参考槽**（`referenceImage` 本地 state）：
① `referenceImageData` prop 自动种入（Studio 当前参考图预填）；② Paperclip 本地上传；
③ Images 按钮开 `AssetSelectorDialog`。加上 Studio 本体的 `ReferenceImageChip`，
用户面对四个视觉入口，重复。

- **主路径 = 拖拽**：整个 dock 是 drop zone。dragover 时对话区浮现虚线高亮覆盖层
  （「拖到这里作为参考图」）。接受三种来源：
  1. 画布结果——复用 `studio-generation` dataTransfer 协议（`StudioCanvas` 已用同一
     协议收 drop，画布侧的可拖能力已存在）；
  2. prompt 区参考图 strip 缩略图——缩略图补 `draggable`，发同一 payload（这是
     「Studio 参考图 → 助手」最顺的手势，取代自动种入之外的手动路径）；
  3. OS 文件 `image/*`（`dataTransfer.files`）。
- **按钮入口收敛为一个**（2026-07-07 owner 二次细化）：composer 里 Paperclip + Images
  合并成**一个图片按钮**，点击开 **popover**（非两项菜单）：
  - 上半：拖拽 / 粘贴 / 上传混合入区（虚线 drop 提示，点击也可选本地文件）；
  - 下半：最近素材图缩略网格（点选即用）；
  - 底部：「素材库」链接进全量 `AssetSelectorDialog`。
    拖拽是增强不是唯一路径（UX 规则 gesture-alternative）；移动端 Drawer 无拖拽，
    全靠这个 popover（退化为 sheet 时上传/素材网格仍可用）。
- **粘贴**：composer 聚焦时粘贴图片也进参考槽，与 Studio prompt 粘贴行为对齐。
- **只进输入框，绝不触发生成**：以上所有路径（dock 拖入 / popover 点选 / 粘贴 / 上传）
  一律只写 composer 参考槽（textarea 上方预览条），不碰生成；「填入 / 追加」也只写
  prompt 文本。生成永远由用户在 Studio prompt 区按生成键，助手无生成权。
- **语义不变**：仍是单图槽，拖入/选入=替换当前参考图（现有 `replaceImage` 文案语义）；
  校验复用 `ASSISTANT_REFERENCE_MAX_BYTES`（10MB）+ `readImageFileAsBase64`。
- **自动种入保留**：打开 dock 时 Studio 当前参考图预填——它是上下文延续，不算重复入口。
- **边界**：dock 与画布的 drop 目标物理分离（dock 在画布外），`studio-generation`
  拖到画布=加生成参考、拖到 dock=给助手看图，互不抢。

### D5 联网研究 toggle（对齐 node 助手，2026-07-07 owner 补充拍板）

- composer 加 Globe 图标 toggle，交互与 node dock 完全同构：`aria-pressed`、开启时
  `bg-primary/10 text-primary`。**常驻只有图标**，不加文字 label；说明走 tooltip
  （`title` + `aria-label`，hover/长按显示「开启后回答会联网搜索」）——node 侧已是
  `title` 模式，对齐。
- **BookOpen「灵感上下文」开关 v1 从 dock composer 撤下**（2026-07-07 owner 质疑后
  核实拍板）：它的真实行为是拿用户输入对公共 `InspirationPrompt` 表做**朴素子串匹配**，
  命中前 3 条作 few-shot 塞 system prompt（仅首轮）——不是个人灵感库，且中文输入对
  英文库子串匹配基本命不中，开关形同虚设。`buildInspirationContext` service 与
  hook 参数**保留不删**（prompt-enhance 也在用），等灵感检索升级为语义匹配后再评估
  是否回归 UI。composer 图标位因此只剩：Globe（联网）+ 图片按钮。
- 请求链路：`use-prompt-assistant` send 参数加 `research?: boolean` →
  `chatPromptAssistantAPI` → 服务端 prompt-assistant 路由**复用 node 已有的
  `resolveResearchRoute` 通路**（绕 gateway，混合知识源），不另起一套。
- 输出形态与 node 一致：对话内给分析 + 建议 + 可直接填入的提示词。
- 移动端 Drawer 同样可用（纯按钮交互，无拖拽依赖）。

### D6 模型池放开：DeepSeek 进 Studio 助手（2026-07-07 owner 补充拍板）

对齐 node 助手的模型池（node 侧 DeepSeek/Qwen 已全放开）。**正确做法是拆能力，
不是塞名单**——已知根因：助手按 `enhance` capability 过滤，而 `enhance` 把
「文本提示词」（DeepSeek 能做）和「视觉反推」（需多模态）捆成一个能力，DeepSeek
无视觉被整体挡掉。

- **落地 = 方案甲**（拆能力）：`llm-capability` 把 `enhance` 拆为文本与视觉两个维度
  （命名施工时定），助手按**本次请求是否看图**过滤模型：
  - 纯文本动作（详细 / LoRA 转换 / 标签 / 自由输入无图）→ DeepSeek / Qwen / Gemini / GPT 全可选；
  - 带参考图或「图片风格」看图 preset → 仅多模态模型；
  - 已选 DeepSeek 时拖入参考图 → 提示切换模型（不静默失败，失败要大声）。
- ⚠ `assistant` scope **不能挪用**——它是 node 画布助手专用，llm-capability.test.ts
  强约束每个 assistant-capable adapter 必须在 `NODE_STUDIO_ASSISTANT_ROUTE_MODELS`
  有条目。三 scope 分工不变：enhance=Studio 助手 / planner=node 规划器 /
  assistant=node 画布助手。
- 施工前联网核验 DeepSeek 当前多模态能力现状，勿凭记忆。
- **分工注记**：D5/D6 含服务端改动（route / service / llm-capability），按
  「UI 走 Claude、service 走 Codex」分工可拆两半——dock UI 壳先把 `research` /
  模型过滤 props 留好，服务端拆能力可独立交付。

### D7 移动端（<lg）

- 不渲染 dock；「助手」chip 保持现状打开 Drawer（`ResponsiveDialog` 移动分支原行为）。
- 判定用现有 `useIsMobile`，与 node dock 同一套。

### D8 状态 / a11y / 主题

- dock 容器 `role="complementary"` + `aria-label`（i18n）；收起按钮和新对话按钮
  `aria-label` 必填（icon-only）。
- 触屏键盘策略：打开 dock **不自动聚焦** composer（`focusUnlessTouch` /
  `isTouchPrimary` 守卫，全局既定策略）。
- dock 是暗面容器，内部对话滚动区要显式 `color-scheme: dark`——否则原生滚动条渲染浅色
  白竖条（画布详情面板踩过的坑）。
- 开合动画：宽度 transition ≤200ms，`prefers-reduced-motion` 降级为直切；拖拽中禁用
  transition（node dock 同款处理）。
- 所有点击目标 ≥44px 触达区（chips 视觉 h-9 + hit area 扩展沿用现约定）。

## 3. 实现落点

| 改动                                                                                               | 文件                                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 新常量 `STUDIO_ASSISTANT_DOCK_RESIZE`                                                              | `src/constants/`（新条目）                                                                                                                     |
| 新组件 `StudioAssistantDock`（壳：头部/拖拽/开合，内容挂 `PromptAssistantPanel`）                  | `src/components/business/studio-shared/chrome/`                                                                                                |
| 挂载点：水平 flex 包 `StudioFlowLayout` + dock                                                     | `src/components/business/StudioWorkspaceUI.tsx`                                                                                                |
| 「助手」chip 改 toggle（桌面）/保留 Drawer（移动）                                                 | `src/components/business/studio/StudioEnhanceButton.tsx`                                                                                       |
| `panels` 增加 `assistant` PanelName + reducer                                                      | `src/contexts/studio-context.tsx`（高危 47 引用，只做 additive）                                                                               |
| dock drop zone（`studio-generation` payload + `image/*` 文件 + 高亮覆盖层）                        | `StudioAssistantDock`（壳层职责，写入 panel 的参考槽）                                                                                         |
| 参考图 strip 缩略图补 `draggable` + 同一 payload                                                   | `src/components/business/studio/StudioPromptArea.tsx`（strip 渲染处）                                                                          |
| composer Paperclip + Images 合并为单图片按钮 → 素材 popover（drop 区 + 最近素材网格 + 素材库链接） | `PromptAssistantPanel.tsx`（composer 局部，仅此一处例外动它）+ 新 popover 子组件                                                               |
| Globe tooltip 说明（title + aria-label）；BookOpen 灵感开关从 composer 移除（逻辑保留）            | `PromptAssistantPanel.tsx` composer 行 + i18n                                                                                                  |
| composer Globe 联网研究 toggle + `research` flag 贯通                                              | `PromptAssistantPanel.tsx` / `use-prompt-assistant.ts` / `api-client` / prompt-assistant 路由（服务端复用 `resolveResearchRoute`，可拆 Codex） |
| `enhance` capability 拆文本/视觉 + 助手按动作过滤模型                                              | `src/constants/llm-capability.ts` + 助手模型过滤处（服务端部分可拆 Codex）                                                                     |
| i18n：dock aria-label / 新对话 / 收起 / 拖放提示 / 素材 popover / 联网与灵感 tooltip               | `src/messages/{en,ja,zh}.json` 三语同步                                                                                                        |

**不动**：`PromptAssistantPanel` 业务逻辑（composer 图片入口合并除外）、`use-prompt-assistant` hook、
`StudioResizableLayout`、`src/app/api/**`、services。

## 4. Do Not Break

- 填入 / 追加回写 prompt（`onUsePrompt` / `onAppendPrompt` → FormContext）。
- 参考图注入助手（`referenceImageData`）与资产选择器路径。
- LLM key 过滤（`adapterHasCapability('enhance')`）与 QuickSetup 内联配置。
- 移动端 Drawer 行为、触屏不自动弹键盘。
- image/video/audio 三模式切换时 dock 不重挂（workspace 单次挂载语义）。
- `/prompts` 页对 `PromptAssistantPanel` 的复用（改壳不改内容签名）。

## 5. 落地验证（UI 确认阶梯，施工时逐项报告）

1. `npm run lint && npm run build` 绿。
2. `npx vitest run` 相关测试 + 视觉回归 `e2e/visual.spec.ts`（dock 打开态需新增基线，
   win32/darwin 两套）。
3. 断言具体值：dock 默认宽 448px（`toHaveCSS`）、拖拽 clamp 320/720、chips 44px 触达、
   `role="complementary"`。
4. 交互实跑（claude-in-chrome，preview\_\* 已知连不上）：开合 toggle、拖拽、双击复位、
   填入/追加写 prompt、移动端 Drawer、Esc/键盘路径、暗面滚动条颜色；三来源拖入
   （画布结果 / strip 缩略图 / OS 文件）+ 粘贴；联网研究 toggle 开关与输出；
   DeepSeek 选中态纯文本可用、拖入图片出切换提示。
5. 报告附手动验证步骤。

## 6. Unresolved（待 owner 拍板）

- 生成中（canvas 忙）时 dock 是否保持可交互？倾向保持——对话与生成本就应并行。
- 视频/音频模式下快捷动作 chips 是否按模态换预设（如音频给「口播稿润色」）？第一版先
  沿用现有 4 个（它们已按 `modelId` 上下文工作），模态化预设留给音频域 Phase 后续。

## Source of Truth

- `src/components/business/prompts/PromptAssistantPanel.tsx`
- `src/components/business/studio/StudioEnhanceButton.tsx`
- `src/components/business/node/StudioNodeAssistantDock.tsx`
- `src/constants/node-studio.ts`（`NODE_STUDIO_DOCK_RESIZE`）
- `src/components/business/StudioWorkspaceUI.tsx`
- `docs/design/pages/studio.md`

## Last Verified

- 2026-07-07，代码检读 + owner 截图对照；未实测（施工前草稿）。
