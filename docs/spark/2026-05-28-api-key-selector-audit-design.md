# API Key / Provider 选择器全量盘点（诊断报告）

**日期**：2026-05-28
**类型**：诊断报告（audit-only）— 不含统一决策、不含实施步骤
**范围**：项目里所有"让用户在 UI 中选 API / 选已配置 key / 加新 key / 选 provider 路由"的下拉框 / popover / picker / inline select 组件
**目标**：把分散在代码各处的同类 UI 组件拉到一张表上，让"哪些已经统一 / 哪些应当统一 / 哪些应当保持分叉"的决策有事实依据
**继任**：本报告的结论留给**下一轮 spark / spec** 决定统一组件方案与实施顺序

---

## 0. 摘要

### 0.1 核心结论（一句话）

项目里有 **9 个独立的 "选 API / 配 API key" 下拉框**，做的事情高度相似（"在用户已配置的多个 key 之间选一个 + 缺 key 时引导新建"），但 **UI 样式有 5 套、可选模型清单逻辑有 6 种、加 key 入口的位置有 4 种**。其中 4 处共享同一段代码（image / video / audio / Node 媒体），其余 5 处各自独立实现。已经在多处出现**完全相同**的辅助函数（如 health-status 颜色映射）被复制 2 次以上。

### 0.2 5 模态全局矩阵

按用户最初要求的分类（文字 / 图片 / 视频 / 声音 / 3D），列出每个模态下涉及哪些下拉框：

| 模态                 | 涉及的下拉框 #（参见 §1）                        | 主选择器是否统一     | 辅助 LLM 是否参与       | UI 样式统一度 |
| -------------------- | ------------------------------------------------ | -------------------- | ----------------------- | ------------- |
| **文字**（辅助 LLM） | #4 Enhance / #5 规划路由 / #6 助手路由           | N/A（无主选择器）    | 是（这是文字的全部）    | 低（3 种 UI） |
| **图片**             | #1 主 / #3 编辑 / #7 Node 媒体 / #8 快速路由     | 部分（#1+#7 共代码） | 间接（通过 #4-#6 调用） | 中            |
| **视频**             | #1 主 / #7 Node 媒体                             | 共代码               | 间接                    | 高            |
| **声音**             | #1 主 / #7 Node 媒体                             | 共代码               | 间接                    | 高            |
| **3D**               | #2 3D 选择器                                     | 是（独立 1 处）      | 否                      | 高（仅 1 处） |
| **跨模态**           | #9 ApiKeyManager（全量管理面板，非"选 API"流程） | N/A                  | N/A                     | N/A           |

> "文字"在 PixelVault 里**没有独立工作区**。`OutputType` 只定义 `IMAGE | VIDEO | AUDIO | MODEL_3D`。所有文字输出都是**辅助 LLM 调用**（prompt enhance / 规划 / 助手 / script breakdown），散布在 4 个不同的下拉框里。

### 0.3 一句话快速诊断

- ✅ **已统一**：QuickSetupDialog 是唯一的"加新 key"模态出口；`useApiKeysContext()` 是唯一的数据上下文；`ApiKeyHealthDot` 是唯一的健康状态视觉元件。
- ⚠️ **形似但分叉**：9 个下拉框各自重写"列表渲染 / 分组逻辑 / 加 key 触发方式"，至少 3 处函数级代码复制。
- ❌ **明确不统一**：辅助 LLM（"文字"）相关的 3 个下拉框（#4 / #5 / #6）各自硬编码自己的"可选 provider 清单"，导致用户看到同一类任务（生成文字）能用的模型却不一样。

---

## 1. 全量盘点：9 个下拉框逐个详

按发现顺序编号（#1-#9）。每条包含：入口、UI 类型、组件路径、列表来源、是否分组、健康标签、加 key 入口。

---

### #1 主模型选择器（image / video / audio 共用）

| 字段            | 值                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| **入口**        | `/studio/image`、`/studio/video`、`/studio/audio` 工作区底部 prompt 输入框上方的 chip                    |
| **UI 类型**     | Popover + Command（带搜索框）                                                                            |
| **组件**        | `src/components/business/studio/StudioPromptArea.tsx:1094-1218`                                          |
| **列表来源**    | `useImageModelOptions()` / `useVideoModelOptions()` / `useAudioModelOptions()` — 按 modality 走不同 hook |
| **分组**        | ✅ 三组：已配置 API Key / 平台免费额度 / 需要 API KEY                                                    |
| **健康标签**    | ✅ `ApiKeyHealthDot` + 文字（"未验证 / 已配置 / 失败"）                                                  |
| **加 key 入口** | ✅ 列表底部"需要 API KEY"组中点击 → 触发 QuickSetupDialog                                                |
| **截图对应**    | 用户截图 1（图像主模型 popover）                                                                         |

---

### #2 3D 主模型选择器

| 字段            | 值                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **入口**        | `/studio/3d` 工作区右上的模型卡片                                                                 |
| **UI 类型**     | DropdownMenu（朴素下拉）                                                                          |
| **组件**        | `src/components/business/studio/Studio3DWorkspace.tsx:1474-1503`                                  |
| **列表来源**    | Hardcoded 数组（Hunyuan3D v3 / Trellis 2 / Rodin Gen-2.5 等少数模型）                             |
| **分组**        | ❌ 无                                                                                             |
| **健康标签**    | ❌ 无                                                                                             |
| **加 key 入口** | ⚠️ 不在下拉里 — 通过下方 amber inline banner 跳转 QuickSetupDialog（仅 3D 独有 banner，见 §4.D3） |

---

### #3 图像编辑 provider picker

| 字段            | 值                                                                       |
| --------------- | ------------------------------------------------------------------------ |
| **入口**        | `/studio/edit/*` 各编辑任务页面的工具栏                                  |
| **UI 类型**     | DropdownMenu                                                             |
| **组件**        | `src/components/business/studio/edit/EditProviderPicker.tsx:70-178`      |
| **列表来源**    | `EDIT_MODELS` 常量数组（fal / gemini / openai 三个 provider 的编辑模型） |
| **分组**        | ❌ 无                                                                    |
| **健康标签**    | ⚠️ 有 Lock 徽标表示"需要 key"，无健康点                                  |
| **加 key 入口** | ✅ 通过 `onRequestSetup` callback 让父层触发 QuickSetupDialog            |

---

### #4 Prompt Assistant LLM picker

| 字段            | 值                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **入口**        | image studio prompt 输入框上方 "增强 / 风格抽取 / LoRA 转换" 等 tab 抽屉底部                                                         |
| **UI 类型**     | DropdownMenu（小 inline）                                                                                                            |
| **组件**        | `src/components/business/prompts/PromptAssistantPanel.tsx:481-519`                                                                   |
| **列表来源**    | prop 传入的 `llmApiKeys` 数组（由父层从 `useApiKeysContext().keys` filter by `LLM_CAPABLE_ADAPTERS = {GEMINI, OPENAI, VOLCENGINE}`） |
| **分组**        | ❌ 无                                                                                                                                |
| **健康标签**    | ❌ 无                                                                                                                                |
| **加 key 入口** | ❌ 无（只能选已配置的 key；缺 key 时按钮置灰）                                                                                       |
| **截图对应**    | 用户截图 2（小 inline dropdown：seedance-gpt / OpenAI / VolcEngine / gemini）                                                        |

---

### #5 规划模型路由选择器

| 字段            | 值                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **入口**        | Node Canvas 上 Agent 节点 inspector 中                                                                                                            |
| **UI 类型**     | Popover + 内嵌按钮列表 + "添加 API Key" 侧边子菜单                                                                                                |
| **组件**        | `src/components/business/studio/node/CanvasPlannerRouteSelector.tsx:127-479`                                                                      |
| **列表来源**    | `useApiKeysContext().keys` filter by `adapterType ∈ SCRIPT_PLANNER_PROVIDER_IDS`（{ DeepSeek, OpenAI, Gemini }） + `SCRIPT_PLANNER_MODEL_OPTIONS` |
| **分组**        | ✅ 两组：已配置 / 添加 API Key                                                                                                                    |
| **健康标签**    | ✅ Health dot + 文字标签                                                                                                                          |
| **加 key 入口** | ✅ 列表底部 "添加 API Key" → 选 provider → 触发 QuickSetupDialog                                                                                  |
| **特殊**        | 带橙色 "**单 Agent Key**" 徽标 + 说明"更改此路由只会影响当前 Agent 节点"                                                                          |
| **截图对应**    | 用户截图 3                                                                                                                                        |

---

### #6 画布助手路由选择器

| 字段            | 值                                                                                      |
| --------------- | --------------------------------------------------------------------------------------- |
| **入口**        | Node Canvas 右侧 Studio Node Assistant Dock 上方                                        |
| **UI 类型**     | Popover + 内嵌按钮列表 + "添加文本 Key" 子菜单                                          |
| **组件**        | `src/components/business/studio/node/CanvasAssistantRouteSelector.tsx:130-404`          |
| **列表来源**    | `useApiKeysContext().keys` filter by `adapterType ∈ NODE_STUDIO_ASSISTANT_ROUTE_MODELS` |
| **分组**        | ✅ 三组：自动路由 / 已配置 / 添加文本 Key                                               |
| **健康标签**    | ✅ Health dot                                                                           |
| **加 key 入口** | ✅ 列表底部 "添加文本 Key" → 选 provider → 触发 QuickSetupDialog                        |
| **特殊**        | 带"**自动路由**"标签 + 说明"自动路由会优先使用 AI Gateway，否则使用工作区默认文本路由"  |
| **截图对应**    | 用户截图 4                                                                              |

---

### #7 Node Workflow 媒体模型选择器

| 字段            | 值                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------- |
| **入口**        | Node Canvas 上 image / video / audio 媒体节点 inspector                                  |
| **UI 类型**     | Popover + 内嵌按钮列表（无搜索）                                                         |
| **组件**        | `src/components/business/studio/node/WorkflowModelPicker.tsx:109-386`                    |
| **列表来源**    | 父组件 prop `options`（来自 `useImageModelOptions()` 等共享 hook），按 `sourceType` 拆分 |
| **分组**        | ✅ 三组：已配置 / 平台免费 / 需要 key                                                    |
| **健康标签**    | ❌ 无（与 #1 主选择器不同）                                                              |
| **加 key 入口** | ✅ 触发 QuickSetupDialog                                                                 |

---

### #8 Studio 快速路由选择器（compact 版）

| 字段            | 值                                                                            |
| --------------- | ----------------------------------------------------------------------------- |
| **入口**        | Studio 侧边栏顶部（compact / 折叠态）                                         |
| **UI 类型**     | Inline radio buttons（不弹 popover，直接平铺）                                |
| **组件**        | `src/components/business/studio/StudioQuickRouteSelector.tsx:25-170`          |
| **列表来源**    | `useImageModelOptions()` filter by `sourceType === 'saved'`（只显示已配置的） |
| **分组**        | ❌ 无                                                                         |
| **健康标签**    | ✅ Health dot（主选项右上）                                                   |
| **加 key 入口** | ⚠️ 展开 inline `ApiKeyManager`（不走 QuickSetupDialog）                       |

---

### #9 API Key 管理面板

| 字段            | 值                                                              |
| --------------- | --------------------------------------------------------------- |
| **入口**        | Studio 侧边栏按钮 / #8 快速路由展开 / 用户主动打开              |
| **UI 类型**     | Tree view（可折叠分组）+ inline `ApiKeyForm`                    |
| **组件**        | `src/components/business/ApiKeyManager.tsx:48-200+`             |
| **列表来源**    | `useApiKeysContext().keys` 全量（按 provider / model 分组）     |
| **分组**        | ✅ 按 provider × model 树形                                     |
| **健康标签**    | ✅ Health dot + 状态文字                                        |
| **加 key 入口** | ✅ Inline `ApiKeyForm`（不弹 QuickSetupDialog —— 这是"完整"版） |

---

## 2. 按 "在选什么类型的 API" 分组

### 组 A — 选"生成主产物"的 API

包含：**#1 主选择器**、**#2 3D**、**#3 图像编辑**、**#7 Node 媒体**、**#8 快速路由**

- 选择的对象：用什么模型生成图片 / 视频 / 音频 / 3D / 编辑后的图片
- 共同特征：列表受 modality 约束（image picker 看不到 video model）
- **共享代码**：#1 + #7 + #8 都基于 `useImageModelOptions()` / `useVideoModelOptions()` / `useAudioModelOptions()` 这套 hook 拉数据
- **分叉点**：#2（3D）单独 hardcode 一个数组；#3（编辑）使用 `EDIT_MODELS` 单独常量

### 组 B — 选"辅助文字 / LLM"的 API（你说的"文字"模态）

包含：**#4 Prompt Assistant**、**#5 规划路由**、**#6 画布助手路由**、**#9 KeyMgr 里的 LLM 部分**

- 选择的对象：用什么 LLM 增强 prompt / 规划 Agent / 当画布助手
- 共同特征：都只看 "LLM-capable" 的 key（GEMINI / OPENAI / VOLCENGINE / DEEPSEEK 这几个 adapter）
- **分叉点**：四处各自硬编码自己的"可选 provider 清单"：
  - #4 用 `LLM_CAPABLE_ADAPTERS = { GEMINI, OPENAI, VOLCENGINE }`（无 DeepSeek！）
  - #5 用 `SCRIPT_PLANNER_PROVIDER_IDS = { DeepSeek, OpenAI, Gemini }`（无 VolcEngine）
  - #6 用 `NODE_STUDIO_ASSISTANT_ROUTE_MODELS = { OpenAI, Gemini, DeepSeek, ...}`（可能还有 AI Gateway 自动路由）
  - #9 KeyMgr 不过滤，全量显示

**👉 这就是用户在题目里描述的现象**：

> "同样是生成文字。但是能使用的 API 模型不一样"

**根本原因**：四处独立硬编码 + 各自维护 capability 集合，没有 single source of truth 来回答"哪些 provider 能做文字生成"。

### 子组 C — 管理 / 配置

包含：**#9 ApiKeyManager**

- 选择的对象：N/A（这是 CRUD 面板，不是"选 API" 而是"管 API"）
- 单独成组，与 A/B 不同性质，不应跟 A/B 合并

---

## 3. 三维事实对照表

### 3.1 列表内容来源（5 种数据源模式）

| 下拉框         | 数据源                                                                 | 模式                    |
| -------------- | ---------------------------------------------------------------------- | ----------------------- |
| #1 主          | `useImageModelOptions()` 等                                            | Hook + modality filter  |
| #2 3D          | Hardcoded 数组                                                         | 静态常量                |
| #3 编辑        | `EDIT_MODELS` 常量                                                     | 静态常量                |
| #4 Enhance LLM | `keys.filter(k => k.adapterType ∈ LLM_CAPABLE_ADAPTERS)`               | Adapter set filter (V1) |
| #5 规划路由    | `keys.filter(k => k.adapterType ∈ SCRIPT_PLANNER_PROVIDER_IDS)`        | Adapter set filter (V2) |
| #6 助手路由    | `keys.filter(k => k.adapterType ∈ NODE_STUDIO_ASSISTANT_ROUTE_MODELS)` | Adapter set filter (V3) |
| #7 Node 媒体   | prop `options`（同 #1 数据源）                                         | Prop pass-through       |
| #8 快速路由    | `useImageModelOptions().filter(sourceType === 'saved')`                | Hook + saved filter     |
| #9 KeyMgr      | `keys` 全量                                                            | No filter               |

**结论**：组 B（辅助 LLM 选择）有 **3 套不同的 adapter capability set 常量**，应当合并为单一 source。

### 3.2 UI 样式（7 维对照）

| 下拉框 | 容器         | 搜索框 | 分组   | Health 点 | Lock/未验证 | 说明卡片     | 加 key 入口 | 宽度      |
| ------ | ------------ | ------ | ------ | --------- | ----------- | ------------ | ----------- | --------- |
| #1     | Popover+Cmd  | ✅     | ✅3 组 | ✅        | ✅          | ❌           | 列表底部    | 288px     |
| #2     | DropdownMenu | ❌     | ❌     | ❌        | ❌          | ❌           | 无          | auto      |
| #3     | DropdownMenu | ❌     | ❌     | ❌        | ✅Lock      | ❌           | callback    | auto      |
| #4     | DropdownMenu | ❌     | ❌     | ❌        | ❌          | ❌           | 无          | auto      |
| #5     | Popover      | ❌     | ✅2 组 | ✅        | ❌          | ✅"单 Agent" | 子菜单      | 256-320px |
| #6     | Popover      | ❌     | ✅3 组 | ✅        | ❌          | ✅"自动路由" | 子菜单      | 256-320px |
| #7     | Popover      | ❌     | ✅3 组 | ❌        | ❌          | ❌           | 列表底部    | 256-320px |
| #8     | inline radio | ❌     | ❌     | ✅        | ❌          | ❌           | 展开 KeyMgr | 全宽      |
| #9     | Tree view    | ❌     | ✅树形 | ✅        | ✅          | ✅           | inline 表单 | 全宽      |

**结论**：**至少 5 套独立 UI 实现** — `Popover+Command`（仅 #1）/ `DropdownMenu`（#2 #3 #4）/ `Popover+按钮列表`（#5 #6 #7）/ `inline radio`（#8）/ `Tree view`（#9）。

### 3.3 "加新 key" 入口形态（6 种模式）

| 模式                                        | 出现于  |
| ------------------------------------------- | ------- |
| 列表底部"需要 API KEY"组 → QuickSetup       | #1 / #7 |
| Banner 跳转 → QuickSetup                    | #2      |
| Callback → 父层决定打开 QuickSetup          | #3      |
| 列表底部 "添加 API Key" 子菜单 → QuickSetup | #5 / #6 |
| 路由到完整 `ApiKeyManager` 面板             | #8 / #9 |
| 无（仅选已有，缺时按钮置灰）                | #4      |

---

## 4. 跨组件复用与代码债观察

### D.1 健康状态颜色映射函数完全相同地写了 2 次

- `CanvasPlannerRouteSelector.tsx:95-125` 中 `getHealthDotClass` + `getHealthLabelKey`
- `CanvasAssistantRouteSelector.tsx:80-110` 中同样的 `getHealthDotClass` + `getHealthLabelKey`
- 两份代码逐字相同。应当提取到共享 utils。

### D.2 "已配置 / 平台免费 / 需要 key" 分组的 useMemo 逻辑写了 2-3 次

- `StudioPromptArea.tsx` 中（注释 "Split options the same way..."）
- `WorkflowModelPicker.tsx:168-182` 中同样逻辑
- `StudioQuickRouteSelector.tsx` 中只取 `saved` 那一组的简化版
- 应当提取为共享 hook `useSplitModelOptions()`。

### D.3 "缺 key inline banner" 只在 3D 工作区有

- `Studio3DWorkspace.tsx:1507-1530` amber banner
- 其他 4 个生成模态（image / video / audio / edit）的缺 key 状态是 "按钮置灰 + click 时 toast + 弹 QuickSetup"
- **不一致来源**：是设计选择（3D 模型清单短，banner 不影响）还是历史遗漏，需要决策方确认。

### D.4 QuickSetup `onVerified` 后处理路径每处不同

- #5 `CanvasPlannerRouteSelector.tsx:246-262` 验证成功后**手动查 model 再调 onChange**
- #7 `WorkflowModelPicker.tsx:372-384` **直接传 modelId**，依赖父层处理
- #3 `EditProviderPicker.tsx` **通过 onRequestSetup callback**，让父层决定
- 三种模式无文档化的"最佳实践"。

### D.5 API key label 在 UI 中的显示格式有 ≥3 种组合

- `StudioQuickRouteSelector.tsx:113-120`：`"keyLabel · modelLabel · provider · maskedKey"`
- `CanvasPlannerRouteSelector.tsx:169-173`：用 `savedMeta` i18n 模板（不同格式）
- #1 主选择器：`"未验证 / 已配置 · ModelName · Provider"`
- 同一个 `UserApiKey` record 在不同下拉里显示不一致。

---

## 5. Open Questions（留给下一轮决策）

以下问题**本报告不回答**，由后续 spark / spec 决定方向：

1. **辅助 LLM capability 集合是否应合并为单一 source？** — 现状 #4 / #5 / #6 各有一份 `*_ADAPTERS` 常量，且互不一致（#4 缺 DeepSeek、#5 缺 VolcEngine）。是设计差异还是历史漂移？

2. **"加 key" UX 是否要统一为单一模式？** — 现状 6 种入口形态（列表底部 / banner / callback / 子菜单 / inline 展开 / 无）。统一会有什么 trade-off？

3. **Popover + Command（带搜索）的搜索能力是否应推广到 #5 #6 #7？** — #1 主选择器有搜索，但 Node 区 popover 全部没有。Node 区模型数量是否多到需要搜索？

4. **3D inline amber banner 是设计选择还是遗漏？** — 是否其他模态也该有类似形态？或者 3D 应改成与其他一致？

5. **是否要 `useSplitModelOptions()` 共享 hook + `health-status-utils.ts` 共享工具？** — D.1 D.2 D.4 D.5 都指向"应该有 single source"，但拆出来的接口形态由谁决定？

6. **`#8 StudioQuickRouteSelector` 和 `#1 主选择器` 的角色边界**：#8 是 #1 的 compact 版还是不同 UX 路径？两者是否可以合并为同组件的不同 prop 模式？

7. **`#9 ApiKeyManager` 全量管理面板与 `QuickSetupDialog` 快速设置的边界是否清晰？** — 二者职责重叠点在哪？是否应明确"QuickSetup 是 #9 的子集 + 上下文化版本"，文档化这个关系？

8. **i18n 文案的命名 namespace 是否要重组？** — 现状跨 `QuickSetup` / `StudioApiKeys` / `Toasts` / 各 picker 局部 namespace 散布，统一组件后是否需要先做 i18n 重组？

---

## 6. 附录

### A. 用户截图与下拉框对照

| 截图 | 路径示例              | 对应下拉框 #              |
| ---- | --------------------- | ------------------------- |
| 1    | 图像主模型 popover    | #1 主选择器（image 模式） |
| 2    | 图像 enhance 抽屉底部 | #4 Prompt Assistant LLM   |
| 3    | Node 规划模型 popover | #5 规划路由               |
| 4    | Node 画布助手 popover | #6 助手路由               |

### B. 调研依据

本报告综合三轮 Explore subagent 调研（grep + 文件检查），涵盖 `src/components/business/`、`src/services/`、`src/hooks/`、`src/contexts/`、`src/constants/`、`src/messages/` 全部相关路径。所有组件名 + 行号引用都已在调研过程中实际打开文件验证。

### C. 本报告**不包含**的内容

明确划出范围之外、留给后续 spec 的内容：

- ❌ 数据层（`UserApiKey` schema、`useApiKeysContext` 内部、CRUD API）的全面盘点
- ❌ i18n key 三语漂移的完整对照
- ❌ 错误恢复 / toast / dialog 形态的完整盘点
- ❌ 任何"应当如何统一"的方案建议
- ❌ 任何拆分 / 合并 / 重命名的实施步骤

> 这些内容如果未来需要，可以在新的 spark 里基于本报告的 9 个 picker 清单展开。
