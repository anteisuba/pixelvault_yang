# API Key / Provider 选择器统一方案（强度 2：场景级组件家族）

**日期**：2026-05-28
**前置**：[2026-05-28 盘点 spec](./2026-05-28-api-key-selector-audit-design.md) 必须先读 — 本 spec 直接引用其 9 个 picker 编号（#1-#9）和 §4 代码债观察，不复述。
**目标**：把分散的 9 个"选 API / 配 API key"下拉框中的 **7 个**（P1 列 4 个 + P2 列 3 个）收敛到 **2 个场景级组件家族**：`<MainModelPicker>` 与 `<CanvasRoutePicker>`。
**性质**：设计 spec — 含组件接口、迁移步骤、测试策略；**不**直接写代码，落地由独立的执行 spec / PR 拆解。
**继任**：本 spec 不包含 #8 / #9 / i18n 重组 / 数据层 / 错误恢复 — 留给后续 spec。

---

## 1. 背景

### 1.1 上一份 spec 给的事实

[盘点 spec](./2026-05-28-api-key-selector-audit-design.md) 调查了项目里 9 个"选 API / 配 API key"下拉框，结论：

- ✅ 已统一：QuickSetupDialog、`useApiKeysContext`、`ApiKeyHealthDot`
- ⚠️ 形似但分叉：9 个 picker 各自实现 UI，至少 3 处函数级代码复制
- ❌ 明确不统一：辅助 LLM 相关的 3 个 picker（#4/#5/#6）各自硬编码**互不一致**的 capability 集合（#4 缺 DeepSeek、#5 缺 VolcEngine），导致"同样生成文字、能用的模型却不一样"

### 1.2 用户给的统一原则（一句话）

> **维度 A（API 模型类型）按 文字 / 图片 / 视频 / 音色 / 3D 分** — 决定 picker 列表里能选什么。
> **维度 B（UI 形态）按使用场景分** — 决定 picker 长什么样。
> 同场景 → 同一个 UI 组件；同 API 模型类型 → 同一份列表来源。

### 1.3 本轮 spark 已对齐的边界

经四轮 spark 澄清 + 一轮 `/plan-eng-review` 复审确认（参见对话记录 / TaskList / §10 GSTACK REVIEW REPORT）：

| 边界问题                                          | 决策                                                                                                                                                       | 来源                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| #4 (Enhance LLM picker) 归哪个场景？              | 归 P1（与 #1 主选择器同 UI）                                                                                                                               | spark                       |
| #3 (Edit picker) 归哪个场景？                     | 归 P1（与 #1 同 UI）                                                                                                                                       | spark                       |
| 3D 工作区 (#2) 当前布局与 P1 不符怎么办？         | **本 spec 不动 3D 整体布局**；MainModelPicker 接入到 3D 现有卡片布局内作 trigger 子组件，3D 工作区布局重做拆为**独立后续 spec**                            | plan-eng-review D1          |
| 统一强度（弱抽 hook / 中场景组件 / 强单一组件）？ | 强度 2 — 场景级组件家族                                                                                                                                    | spark                       |
| `LLM_CAPABILITY.scopes` 怎么防漂移？              | **Adapter-derived**：每个 adapter 声明自己的 capabilities，scopes 从 adapters 反推导生成（非手动维护数组）                                                 | plan-eng-review D3          |
| `<MainModelPicker>` 内部怎么按 modality 拿列表？  | 内部 dispatcher hook `useModelOptionsFor(modality)`，调用方不感知 5 个底层 hook                                                                            | plan-eng-review D4          |
| LLM 路由的"选择/加 key"逻辑 P1 P2 怎么共享？      | 抽共享 `useLLMRoutePicker(scope)` hook，`<MainModelPicker llm_assist>` 与 `<CanvasRoutePicker variant=planner\|assistant>` 调同一 hook，只做 UI 外壳       | plan-eng-review D5          |
| 视觉回归怎么做？                                  | Playwright `toHaveScreenshot()` snapshot baseline（项目已有 e2e/mobile.spec.ts）                                                                           | plan-eng-review D6          |
| Step 7 完成多久后才能 Step 8 删旧代码？           | **≥7 天 + 生产错误率/用户反馈稳定**后才动                                                                                                                  | plan-eng-review D7          |
| `workflowMode === 'card'` 路径怎么处理？          | card mode 下根本没有 model picker（model 由 style card 内置 `modelId` 决定，line 437-440）— **MainModelPicker 只替换 quick mode 分支**，card mode 完全不动 | plan-eng-review D2 调查结果 |

---

## 2. 统一原则：(API 模型类型) × (UI 场景) 矩阵

### 2.1 矩阵

| API 模型类型 \ UI 场景 | **P1 — Studio 主输入框 / 工作区主操作面**   | **P2 — Node Canvas 节点 inspector** | 不在本 spec |
| ---------------------- | ------------------------------------------- | ----------------------------------- | ----------- |
| **文字 LLM**           | #4 enhance                                  | #5 规划路由 / #6 助手路由           | —           |
| **图片**               | #1 (image mode) / #3 edit                   | #7 Node 媒体 (image)                | #8          |
| **视频**               | #1 (video mode)                             | #7 Node 媒体 (video)                | —           |
| **音色**               | #1 (audio mode)                             | #7 Node 媒体 (audio)                | —           |
| **3D**                 | #2 → 接入到现有 3D 卡片布局内（不重做布局） | —                                   | —           |

**读图**：

- 同一**列**的 picker → 用同一个 React 组件（`<MainModelPicker>` 或 `<CanvasRoutePicker>`）
- 同一**行**的 picker → 共享同一份列表来源（`useImageModelOptions()` / `useVideoModelOptions()` / `useAudioModelOptions()` / `use3DModelOptions()` / `useLLMRouteOptions()`）
- 调用方传入 `modality` prop 决定走哪行的数据源

> 注：**#9 ApiKeyManager** 不在矩阵中 — 它是跨模态的 CRUD 管理面板，不参与"在某个场景下选 API"的流程。本 spec 不动它。

### 2.2 决策依据

- **同一场景下 UI 一样** = 用户使用一致性。在主输入框旁不会突然出现两种风格的 picker。
- **不同场景下 UI 不一样** = 场景 affordance 差异。Node Canvas 上的 picker 要带"单 Agent Key / 自动路由" 这类**节点级语义说明**，不适合塞回主输入框场景。
- **API 模型类型独立于 UI** = 同一份"哪些 provider 能做文字"的真相应用到 #4/#5/#6 三处，消除当前"#4 缺 DeepSeek、#5 缺 VolcEngine"的漂移。

---

## 3. 范围

### 3.1 本 spec 处理

- 实现 `<MainModelPicker>` 组件（P1 场景 UI 外壳）
- 实现 `<CanvasRoutePicker>` 组件（P2 场景 UI 外壳）
- 抽取共享 hooks / utils（强度 1 部分 + plan-eng-review 增量）：
  - `useSplitModelOptions()` — 分组逻辑（§4.D.2 复制代码消除）
  - `useModelOptionsFor(modality)` — modality dispatcher（**plan-eng-review D4**）
  - `useLLMRoutePicker(scope)` — LLM 路由选择/加 key 公共逻辑（**plan-eng-review D5**）
  - `health-status-utils.ts` — 健康状态颜色映射（§4.D.1 复制消除）
  - `formatApiKeyLabel()` — 标签格式化（§4.D.5 复制消除）
  - `LLM_CAPABILITY` 从 **adapter-derived 计算**（**plan-eng-review D3**，非手动维护）
- 把 **7 个 picker** 改造为调用新组件：
  - P1 列：#1 (StudioPromptArea **仅 quick mode 分支**) / #2 (3D 卡片内 trigger 接入) / #3 (EditProviderPicker) / #4 (PromptAssistantPanel)
  - P2 列：#5 (CanvasPlannerRouteSelector) / #6 (CanvasAssistantRouteSelector) / #7 (WorkflowModelPicker)
- 删除旧的独立 picker 实现文件（**Step 7 上线 ≥7 天 + 稳定后**，per plan-eng-review D7）

### 3.2 本 spec **不**处理

明确划出，留给后续 spec：

| 不处理项                                                  | 原因                                                                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3D 工作区布局重做**（卡片 → 输入框 + chip 结构）        | **plan-eng-review D1 拆出**：Studio3DWorkspace 2815 行 + Rodin/Fal 多 provider 路由 + 三 workflow 模式，重做范围远超 "picker 收敛" 价值比。本 spec 仅在现有卡片布局内接入 MainModelPicker。3D 整体布局重做留独立 spec |
| **`workflowMode === 'card'` 路径下的 model 选择 UX**      | card mode 下 model 由 style card 内置 `modelId` 决定，本来就没有 picker UI。MainModelPicker 不需要适配 card mode。Card mode 是否应该 deprecation 是独立问题                                                           |
| #8 StudioQuickRouteSelector                               | 用户未明确要求；它是 inline radio 形态，归属（P4 或归并入 `<MainModelPicker compact>`）留给后续 spec                                                                                                                  |
| #9 ApiKeyManager                                          | CRUD 管理面板，不是"选 API"流程，性质不同                                                                                                                                                                             |
| i18n key 重组                                             | 当前 namespace 分散（QuickSetup / StudioApiKeys / Toasts / 各 picker 局部），统一组件后再做迁移更稳                                                                                                                   |
| `UserApiKey` schema / `useApiKeysContext` 内部 / CRUD API | 数据层稳定，不应在 UI 收敛 spec 里动                                                                                                                                                                                  |
| QuickSetupDialog 内部流程                                 | 复用现有，仅作为新组件的"加 key"出口                                                                                                                                                                                  |
| 错误恢复机制（toast / banner / dialog 形态）              | 跨模态不一致已知（盘点 spec §4.D.3），但属于另一个统一项                                                                                                                                                              |
| 健康状态后台定时刷新                                      | 与本 spec 正交                                                                                                                                                                                                        |

---

## 4. 目标组件设计

### 4.1 `<MainModelPicker>`（P1 场景）

**职责**：在 Studio 工作区主操作面上让用户选"生成主产物 / 服务于生成的 LLM"。统一 #1 / #2 / #3 / #4 的 UI。

**视觉 / 行为锚点**：

- Trigger：chip 形态（圆角，左侧 health dot，中间 model 名 + 副标，右侧 chevron）
- Panel：Popover + Command（带搜索框）
- 列表分组：已配置 API Key / 平台免费额度 / 需要 API KEY（最多三组，按 modality 实际有无渲染）
- 列表项：health dot + 状态文字 + model 名 + 副标（provider + masked key）
- 加 key 入口：列表底部"需要 API KEY"组中点击 → 触发 QuickSetupDialog
- 空状态：modality 下当前无任何模型可用时的 fallback 文案

**Props 签名（伪 TS，最终接口见附录 B）**：

```ts
type MainModelPickerModality =
  | 'image'
  | 'video'
  | 'audio'
  | 'model_3d'
  | 'llm_assist' // 用于 #4 enhance 抽屉

interface MainModelPickerProps {
  modality: MainModelPickerModality
  value: string | null // 当前选中的 model id
  onChange: (modelId: string) => void
  /** modality === 'llm_assist' 时调用方提供 capability scope（如 enhance / reverse / extract） */
  llmCapability?: 'enhance' | 'reverse' | 'extract' | 'style'
  /** 是否启用搜索（默认 true，但部分 modality 模型少时可关闭） */
  enableSearch?: boolean
  /** chip 尺寸（compact / default） */
  size?: 'compact' | 'default'
  /** 缺 key 时点击行为 — 默认走 QuickSetupDialog，调用方可拦截 */
  onRequestSetup?: (modelId: string) => void
}
```

**modality → 列表来源映射**（通过 `useModelOptionsFor(modality)` dispatcher，per plan-eng-review D4 — 不在组件内 if-else 调 hooks，避免 React hooks rule 违规 + 浪费 subscriptions）：

| modality     | 内部底层 hook              | 备注                                                                                                                  |
| ------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `image`      | `useImageModelOptions()`   | 现有 hook，复用                                                                                                       |
| `video`      | `useVideoModelOptions()`   | 现有 hook                                                                                                             |
| `audio`      | `useAudioModelOptions()`   | 现有 hook                                                                                                             |
| `model_3d`   | `use3DModelOptions()`      | **新增**：把 #2 当前 hardcoded 数组 + 用户 key filter 包成 hook，跟其他三个 modality 对齐                             |
| `llm_assist` | `useLLMRoutePicker(scope)` | **新增（D5）**：与 `<CanvasRoutePicker variant=planner\|assistant>` 共享同一 hook，scope 由 `llmCapability` prop 决定 |

> 命名注：`modality` prop 的字符串值与 `OutputType` enum（`IMAGE | VIDEO | AUDIO | MODEL_3D`）保持语义对应；实施时可以选择 reuse `OutputType` + 新增 `LLM_ASSIST` 成员，或单独 type — 该决定属实施细节，本 spec 不锁定。

> **#1 改造范围注（plan-eng-review D2 调查）**：StudioPromptArea 主 Popover 仅在 `state.workflowMode === 'quick'` 时渲染（line 1093）。Card mode 下 model 由所选 style card 内置 `modelId` 决定（line 437-440），无 picker UI。**MainModelPicker 只替换 quick mode 分支，card mode 完全不动**。

**内部结构（伪 JSX）**：

```jsx
<Popover>
  <PopoverTrigger>
    <Chip {...trigger props} />
  </PopoverTrigger>
  <PopoverContent>
    <Command>
      {enableSearch && <CommandInput placeholder={t('searchModel')} />}
      <CommandList>
        {groups.configured.length > 0 && (
          <CommandGroup heading={t('configuredKeys')}>
            {groups.configured.map(opt => <ModelItem {...opt} />)}
          </CommandGroup>
        )}
        {groups.platformQuota.length > 0 && (
          <CommandGroup heading={t('platformQuota')}>
            ...
          </CommandGroup>
        )}
        {groups.needsKey.length > 0 && (
          <CommandGroup heading={t('needsKey')}>
            {groups.needsKey.map(opt => <ModelItem {...opt} onClick={() => triggerSetup(opt)} />)}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

`groups` 由 `useSplitModelOptions(options)` 计算（参见 §4.3）。

---

### 4.2 `<CanvasRoutePicker>`（P2 场景）

**职责**：在 Node Canvas 节点 inspector 上让用户选"路由 / 节点级 LLM / Node 媒体模型"。统一 #5 / #6 / #7。

**视觉 / 行为锚点**：

- Trigger：节点 inspector 内嵌按钮，左侧 icon + 路由名 + masked key
- Panel：Popover + 内嵌按钮列表（不带搜索）
- **特征 1：说明卡片** — 顶部一段 ≤2 行说明文本 + 可选徽标（如 #5 的"单 Agent Key"、#6 的"自动路由"）
- **特征 2：分组按钮列表** — 已配置组（每个 key 一行）+ "添加 ... Key" 子菜单
- **特征 3：加 key 子菜单** — 二级展开的 provider 选择 → 触发 QuickSetupDialog

**Props 签名（伪 TS，最终接口见附录 C）**：

```ts
type CanvasRouteVariant =
  | 'planner' // 规划路由（#5）— 单 Agent Key
  | 'assistant' // 助手路由（#6）— 自动路由
  | 'media' // Node 媒体模型（#7）— image/video/audio

interface CanvasRoutePickerProps {
  variant: CanvasRouteVariant
  value: string | null
  onChange: (keyOrModelId: string) => void
  /** variant === 'media' 时需指定 modality */
  mediaModality?: 'image' | 'video' | 'audio'
  /** 顶部说明文案：调用方可覆盖默认 i18n */
  noticeOverride?: { label: string; description: string }
  /** 顶部徽标（如 "单 Agent Key" / "自动路由"） */
  badge?: { text: string; tone: 'amber' | 'sky' | 'neutral' }
  /** "添加 Key" 按钮文案（如 "添加 API Key" / "添加文本 Key"） */
  addKeyLabel?: string
}
```

**variant → 行为映射**：

| variant     | 列表来源                                                                 | 默认徽标                | 默认 addKeyLabel |
| ----------- | ------------------------------------------------------------------------ | ----------------------- | ---------------- |
| `planner`   | `useLLMRoutePicker('planner')` ← **共享 hook (D5)**                      | "单 Agent Key"（amber） | t('addApiKey')   |
| `assistant` | `useLLMRoutePicker('assistant')` + 顶部 "auto-route via AI Gateway" 选项 | "自动路由"（sky）       | t('addTextKey')  |
| `media`     | `useModelOptionsFor(mediaModality)` ← **共享 dispatcher (D4)**           | 无                      | t('addApiKey')   |

**关键不变量**：

- `planner` / `assistant` 共享 LLM 列表来源 — 彻底消除"#4/#5/#6 capability 不一致"
- `media` 仍使用 modality-specific dispatcher，保持与 P1 主选择器一致的列表逻辑
- **`<MainModelPicker llm_assist>` 与 `<CanvasRoutePicker variant=planner|assistant>` 调用同一个 `useLLMRoutePicker(scope)` hook**（per plan-eng-review D5）— UI 不同但 list/selected/add-key 逻辑物理一致，不靠 lint rule

---

### 4.3 共享 hooks / utils

#### 4.3.1 `useSplitModelOptions(options)` — 解决 §4.D.2

把 `ModelOption[]` 拆为 `{ configured, platformQuota, needsKey }` 三组，按 `sourceType` + `freeTier` 字段。返回 ref-stable object（用 `useMemo` 包裹），避免下游不必要 re-render。

**取代**：`StudioPromptArea.tsx` 内的分组 useMemo、`WorkflowModelPicker.tsx:166-182`（注释 `// Split options the same way StudioPromptArea does` — 自承的代码债）、`StudioQuickRouteSelector.tsx` 中的简化版（保留 #8 现状，但其内部可选迁移到 hook）。

#### 4.3.2 `useModelOptionsFor(modality)` — modality dispatcher（plan-eng-review D4）

**新增**。MainModelPicker 内部调用此 hook，按 modality 路由到 5 个底层 hook 之一：

```ts
function useModelOptionsFor(modality: MainModelPickerModality, opts?: { llmCapability?: LlmCapabilityScope }) {
  // 内部 switch (modality)，每条分支只调一个底层 hook
  // 等价于把 5 个 modality 的 hooks dispatch 集中到一处，
  // 调用方（MainModelPicker）只对接一个统一接口
  ...
}
```

**取代**：每个调用方手写 `if (modality === 'image') useImageModelOptions() else if ...`（违反 React hooks rules）的反模式。

#### 4.3.3 `useLLMRoutePicker(scope)` — LLM 选择/加 key 公共逻辑（plan-eng-review D5）

**新增**。负责 LLM provider 选择的**数据 + 选中状态 + 加 key 触发**逻辑，**两个组件家族共用**：

- `<MainModelPicker modality="llm_assist" llmCapability={scope}>` 内部调它
- `<CanvasRoutePicker variant="planner|assistant">` 内部调它

返回：`{ options, selected, onSelect, onRequestSetup, healthMap }`。

**关键作用**：把"两个组件做同一件事"的语义重叠从"靠 lint rule + 文档"升级为"靠类型 + 共享 hook"。两个 UI 外壳的列表内容、选中行为、加 key 路径在编译期就被强制一致。

**取代**：散在 `PromptAssistantPanel` / `CanvasPlannerRouteSelector` / `CanvasAssistantRouteSelector` 内部的等价但分叉的"过滤 keys + 选 modelId + 触发 QuickSetup"逻辑。

#### 4.3.4 `health-status-utils.ts` — 解决 §4.D.1

导出 `getHealthDotClass(status)` 和 `getHealthLabelKey(status)` 两个纯函数。

**取代**：`CanvasPlannerRouteSelector.tsx:95-125` 与 `CanvasAssistantRouteSelector.tsx:80-110` 中**逐字相同**的两份实现（plan-eng-review 已经核对，确认逐字一致）。

#### 4.3.5 `formatApiKeyLabel(key, options)` — 解决 §4.D.5

统一 `UserApiKey` record 在 UI 中的显示格式。`options` 控制粒度：

```ts
formatApiKeyLabel(key, {
  include: ['keyLabel', 'modelName', 'provider', 'maskedKey'],
})
// → "seedance-gpt · GPT-4o · OpenAI · sk-p****myYA"

formatApiKeyLabel(key, { include: ['keyLabel', 'maskedKey'] })
// → "seedance-gpt · sk-p****myYA"
```

**取代**：`StudioQuickRouteSelector.tsx:113-120`、`CanvasPlannerRouteSelector.tsx:169-173`、`StudioPromptArea` 内部组合的三套不同格式。

#### 4.3.6 `LLM_CAPABILITY` — adapter-derived（plan-eng-review D3）

**避免"手动维护数组漂移"**。每个 adapter 在 `src/services/adapters/*` 里声明自己的 capabilities，`LLM_CAPABILITY.scopes` 从 adapters 反推导生成：

```ts
// src/services/adapters/openai.ts
export const openaiAdapter = {
  type: 'OPENAI',
  capabilities: ['enhance', 'reverse', 'extract', 'style', 'planner', 'assistant'] as const,
  ...
}

// src/constants/llm-capability.ts
export function getLLMCapabilityScope(scope: LlmCapabilityScope): readonly AdapterType[] {
  return getAllAdapters()
    .filter(a => a.capabilities.includes(scope))
    .map(a => a.type)
}
```

**取代**：

- `PromptAssistantPanel.tsx` 的 `LLM_CAPABLE_ADAPTERS` set
- `script-breakdown.service.ts` 的 `SCRIPT_PLANNER_PROVIDER_IDS`
- `CanvasAssistantRouteSelector` 的 `NODE_STUDIO_ASSISTANT_ROUTE_MODELS`

**Contract test 守护**（per Section 3 IRON RULE）：

```ts
// 守护"新加 provider 自动出现在所有匹配 scope"
test('every adapter capability matches a scope; every scope has at least one provider', () => {
  for (const scope of ALL_SCOPES) {
    const providers = getLLMCapabilityScope(scope)
    expect(providers.length).toBeGreaterThan(0)
  }
  for (const adapter of getAllAdapters()) {
    for (const cap of adapter.capabilities) {
      expect(ALL_SCOPES).toContain(cap)
    }
  }
})
```

**好处**：新加 provider 只需要动 adapter 定义一处，`#4 / #5 / #6` 的列表自动同步。新加 scope 时编译器会强制提示所有 adapter 决定是否实现这个 capability。这是用户原话"同样生成文字模型却不一样"的**根因治理**。

---

## 5. 3D 工作区 — 最小改动接入（plan-eng-review D1 缩减后）

> **范围缩减说明**：plan-eng-review 阶段查证 `Studio3DWorkspace.tsx` 真实路径在 `src/components/business/Studio3DWorkspace.tsx`（非 `studio/` 子目录，spec 之前路径写错）、文件 **2815 行**、含 **Rodin/Fal 多 provider 路由**（line 1508 banner 条件 `isRodin ? !hasRodinKey : !hasFalKey`）+ **Rodin 三种互斥 workflow**（line 1533 注释）。"3D 工作区整体重做"远超 picker 收敛 spec 的价值比，**拆为独立后续 spec**。本 spec 仅做最小接入。

### 5.1 本 spec 在 3D 上做的事

- 把 `Studio3DWorkspace.tsx:1474-1503` 的 DropdownMenu 替换为 `<MainModelPicker modality="model_3d">`
- **保留**现有 3D 工作区卡片布局、Rodin/Fal 路由、Rodin 三 workflow、amber banner、参数面板
- MainModelPicker 作为 trigger 子组件嵌入到模型卡片右上原 dropdown 位置
- amber banner 暂时**保留**（缺 key 提示）— "三种缺 key 提示形态统一" 是另一个 spec 的事

### 5.2 本 spec **不**在 3D 上做的事（拆后续 spec）

- 3D 工作区整体布局重做（卡片 → 输入框 + chip 结构）
- amber banner 删除 + 与其他模态对齐的缺 key 提示
- 参数面板降级为 chip
- Rodin/Fal 多 provider 路由的 UI 收敛
- Rodin 三 workflow 模式的 picker 集成

> 上面这些都是有价值的工作，但混在 picker 收敛 spec 里会让 Step 5 成为最大 merge 风险点。**Make the change easy** = 先抽出 MainModelPicker，**then make the easy change** = 后续 spec 用上它重做 3D。

---

## 6. 迁移计划（按执行顺序）

> 每步是一个独立 commit，独立可验证、独立可回滚。

| Step    | 内容                                                                                                                                                          | 验证                                                                                                      | 风险                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **1**   | 抽 `useSplitModelOptions` / `health-status-utils` / `formatApiKeyLabel` + 引入 `useModelOptionsFor` 框架 + 把 `LLM_CAPABILITY` 改为 **adapter-derived**（D3） | 单元测试 + LLM scope contract test + `npm run lint` + `npm run build`；旧 picker 切到新 utils（行为不变） | 低 — 纯 refactor，无 UI 变化             |
| **1.5** | 实现 `useLLMRoutePicker(scope)` 共享 hook（D5）                                                                                                               | hook 单元测试 + 守护 list/onSelect/onRequestSetup 接口契约                                                | 低                                       |
| **2**   | 实现 `<MainModelPicker>` + 单元测试 + **Playwright snapshot baseline**（D6）                                                                                  | 组件测试覆盖：modality 切换、分组渲染、加 key 触发；新增 `toHaveScreenshot()` 基线                        | 中 — 新组件，视觉细节易漂移              |
| **3**   | 把 #1 (StudioPromptArea **quick mode 分支**) 改成调 `<MainModelPicker>`                                                                                       | Playwright snapshot diff（image/video/audio 三 modality）+ card mode regression 守护                      | 高 — StudioPromptArea 是 1371 行巨型组件 |
| **4**   | 把 #3 (EditProviderPicker) + #4 (PromptAssistantPanel) 改成调 `<MainModelPicker>`                                                                             | Playwright snapshot diff + edit / enhance 抽屉手工烟雾                                                    | 中                                       |
| **5**   | **3D 最小接入**（per D1，不重做布局）：替换 `Studio3DWorkspace.tsx:1474-1503` DropdownMenu 为 `<MainModelPicker modality="model_3d">`                         | 3D 工作区端到端：上传 → 模型选 → 生成；Rodin/Fal 切换不退步                                               | 中 — 范围收缩后从高降为中                |
| **6**   | 实现 `<CanvasRoutePicker>` + 单元测试（内部用 D5 共享 hook）                                                                                                  | variant 切换、说明卡片、加 key 子菜单                                                                     | 中                                       |
| **7**   | 把 #5/#6/#7 改成调 `<CanvasRoutePicker>`                                                                                                                      | Node Canvas 端到端 + Playwright snapshot diff                                                             | 中                                       |
| **8**   | 删除旧 picker 文件 + 清理 import + ESLint 边界守护                                                                                                            | `npm run lint && npm run build`；grep 全项目确认无残留 import                                             | 低                                       |

**可并行性**：Step 1 + 1.5 完成后，Step 2-5（P1 链）与 Step 6-7（P2 链）可独立并行。

**回滚边界**：Step 3 / Step 5 / Step 7 是高风险节点。**每个 step 上线后保留至少 7 天观察窗 + 生产错误率/用户反馈稳定**才进下一 step（per plan-eng-review D7）。

**Step 8 启动条件**（per plan-eng-review D7）：

- Step 7 已上线 **≥7 天**
- 生产错误率与 Step 7 上线前持平
- 无用户反馈指向新组件 bug
- 满足以上才可启动 Step 8 删除旧文件 — 否则继续观察

---

## 7. 测试 / 验收策略

### 7.1 每步必跑

- `npm run lint`
- `npm run build`
- `npx vitest run --reporter=verbose`（新 hook / 组件的单元测试）
- `npx playwright test e2e/mobile.spec.ts --project=mobile`

### 7.2 Contract test（IRON RULE — 跨入口 LLM 列表一致性守护）

per plan-eng-review Section 3 IRON RULE，**必须**写一份 contract test，运行在 CI，守护以下不变量：

```ts
// e2e 或 vitest integration
test('LLM scope is consistent across MainModelPicker(llm_assist) and CanvasRoutePicker(planner/assistant)', () => {
  const enhanceList = useLLMRoutePicker('enhance').options
  const plannerList = useLLMRoutePicker('planner').options
  const assistantList = useLLMRoutePicker('assistant').options

  // 这三个 list 必须基于同一 source of truth（adapter capabilities）
  // 任一处加私有 filter 都会触发这个测试失败
  for (const adapter of getAllAdapters()) {
    if (adapter.capabilities.includes('enhance')) {
      expect(enhanceList.find((o) => o.adapter === adapter.type)).toBeDefined()
    }
  }
})
```

**为什么是 IRON RULE 而非 AskUserQuestion**：用户原话"同样生成文字模型却不一样"是 spec 的**主要 motivation**。没有这个 contract test，未来某个 PR 加私有 filter 会悄悄回归到当前状态。

### 7.3 视觉回归 — Playwright snapshot baseline（per plan-eng-review D6）

**取代 spec 早期版本的 "manual screenshot diff"。** 项目已有 `e2e/mobile.spec.ts`（Playwright），加 `toHaveScreenshot()` 成本低。

每个 picker 改造点（Step 3 / 4 / 5 / 7）都要：

1. **改造前**：在 Step 实施开始 commit 前，跑 Playwright snapshot baseline（每个 modality / 每个 picker 状态）
2. **改造中**：每次 push 触发 CI Playwright snapshot diff
3. **改造后**：CI 给出 diff 报告，开发者人工 review 是否是预期的视觉变化
4. **接受**：手工 review 通过后 update baseline

**最少覆盖矩阵**：

| Picker            | modality / variant                             | mobile | desktop |
| ----------------- | ---------------------------------------------- | ------ | ------- |
| MainModelPicker   | image / video / audio / model_3d / llm_assist  | ✅     | ✅      |
| CanvasRoutePicker | planner / assistant / media(image/video/audio) | ✅     | ✅      |

至少 5×2 + 5×2 = 20 个 baseline 截图，覆盖 trigger + popover open 两态 → 40 个状态。

### 7.4 手工烟雾清单（每步对应）

| Step | 手工烟雾                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3    | 打开 image / video / audio 三个工作区，点 chip → 看 popover → 切换 modal → 看列表更换；**特别验证 `workflowMode === 'card'` 时无 picker 渲染、style card 仍能正常应用** |
| 4    | 打开 edit 任务 + image enhance 抽屉，点 picker → 切 provider                                                                                                            |
| 5    | 打开 3D 工作区，确认 picker 切换正常：选 Rodin → 看 banner / 选 Fal → 看 banner；上传图 → 生成                                                                          |
| 7    | 在 Node Canvas 上创建 Agent / Assistant / Media 节点各一个，分别点 picker 切路由                                                                                        |

---

## 8. 明确不动的部分（boundary 守护）

本 spec 实施过程中**禁止**改动以下文件 / 模块，需要时单独发起 spec：

- `src/components/business/studio/StudioQuickRouteSelector.tsx`（#8）
- `src/components/business/ApiKeyManager.tsx`（#9）
- `src/components/business/studio-shared/setup/QuickSetupDialog.tsx`（仅作为新组件的"加 key"出口调用，不改其内部）
- `src/contexts/api-keys-context.tsx` 及 `use-api-keys.ts`
- `prisma/schema.prisma` 的 `UserApiKey` 表
- `src/app/api/api-keys/**`
- `src/messages/{en,zh,ja}.json` 的 namespace 重组（仅增量新增 key，不删/重命名旧 key）
- 错误恢复机制（toast / banner / dialog）
- 健康状态后台刷新机制

---

## 9. 附录

### A. 9 个 picker 编号对照（引用上一份 spec）

> 路径修正：plan-eng-review 阶段查证 #2 `Studio3DWorkspace` 真实路径在 `src/components/business/` 而非 `src/components/business/studio/`。

| #   | 组件                            | 路径                                                                           | 本 spec 命运                                                               |
| --- | ------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 1   | StudioPromptArea inline picker  | `src/components/business/studio/StudioPromptArea.tsx:1094-1218`                | Step 3 改造为调 `<MainModelPicker>`（**仅 quick mode 分支**）              |
| 2   | Studio3DWorkspace dropdown      | `src/components/business/Studio3DWorkspace.tsx:1474-1503`                      | Step 5 **最小接入**（保留卡片布局）                                        |
| 3   | EditProviderPicker              | `src/components/business/studio/edit/EditProviderPicker.tsx:70-178`            | Step 4 改造                                                                |
| 4   | PromptAssistantPanel LLM picker | `src/components/business/prompts/PromptAssistantPanel.tsx:481-519`             | Step 4 改造（用 D5 共享 hook）                                             |
| 5   | CanvasPlannerRouteSelector      | `src/components/business/studio/node/CanvasPlannerRouteSelector.tsx:127-479`   | Step 7 改造为调 `<CanvasRoutePicker variant="planner">`（用 D5 共享 hook） |
| 6   | CanvasAssistantRouteSelector    | `src/components/business/studio/node/CanvasAssistantRouteSelector.tsx:130-404` | Step 7 改造为 variant="assistant"（用 D5 共享 hook）                       |
| 7   | WorkflowModelPicker             | `src/components/business/studio/node/WorkflowModelPicker.tsx:109-386`          | Step 7 改造为 variant="media"                                              |
| 8   | StudioQuickRouteSelector        | `src/components/business/studio/StudioQuickRouteSelector.tsx`                  | **本 spec 不动**                                                           |
| 9   | ApiKeyManager                   | `src/components/business/ApiKeyManager.tsx`                                    | **本 spec 不动**                                                           |

### B. `<MainModelPicker>` 完整 Props 接口

```ts
// src/components/business/studio-shared/pickers/MainModelPicker.tsx
import type { ModelOption, ApiKeyHealthStatus } from '@/types'

export type MainModelPickerModality =
  | 'image'
  | 'video'
  | 'audio'
  | 'model_3d'
  | 'llm_assist'

export type LlmCapabilityScope = 'enhance' | 'reverse' | 'extract' | 'style'

export interface MainModelPickerProps {
  modality: MainModelPickerModality
  value: string | null
  onChange: (modelId: string) => void
  llmCapability?: LlmCapabilityScope // required if modality === 'llm_assist'
  enableSearch?: boolean // default: true
  size?: 'compact' | 'default' // default: 'default'
  onRequestSetup?: (modelId: string, adapterType: string) => void
  className?: string
  disabled?: boolean
}

export interface MainModelPickerGroupState {
  configured: ModelOption[]
  platformQuota: ModelOption[]
  needsKey: ModelOption[]
}
```

### C. `<CanvasRoutePicker>` 完整 Props 接口

```ts
// src/components/business/studio-shared/pickers/CanvasRoutePicker.tsx
export type CanvasRouteVariant = 'planner' | 'assistant' | 'media'

export interface CanvasRoutePickerProps {
  variant: CanvasRouteVariant
  value: string | null
  onChange: (keyOrModelId: string) => void

  // variant === 'media' specific
  mediaModality?: 'image' | 'video' | 'audio'

  // optional UI customization
  noticeOverride?: { label: string; description: string }
  badge?: { text: string; tone: 'amber' | 'sky' | 'neutral' }
  addKeyLabel?: string
  className?: string
  disabled?: boolean
}
```

### D. 风险登记表（plan-eng-review 已更新）

| 风险                                                                               | 概率   | 影响 | 缓解                                                                                                        |
| ---------------------------------------------------------------------------------- | ------ | ---- | ----------------------------------------------------------------------------------------------------------- |
| Step 3 改 StudioPromptArea 触发 1371 行巨型组件的回归                              | 中     | 高   | 先做 Step 2 的 Playwright snapshot baseline；Step 3 一次只切换一个 modality；card mode regression test 守护 |
| Step 5 3D 接入破坏 Rodin/Fal 路由                                                  | 低     | 中   | **范围已缩减**（D1）：仅替换 DropdownMenu，不动布局/banner/路由。改前端到端测试 + Rodin/Fal 切换烟雾        |
| `LLM_CAPABILITY.scopes` 子集决策错误                                               | **低** | 中   | **改为 adapter-derived**（D3）— 不再手动维护，adapter 声明 capabilities + contract test 守护                |
| `<MainModelPicker llm_assist>` 与 `<CanvasRoutePicker planner/assistant>` 语义重叠 | **低** | 低   | **用 `useLLMRoutePicker(scope)` 共享 hook**（D5）— UI 不同但逻辑一致被类型强制，不靠 lint                   |
| 3D mobile UX bug                                                                   | 中     | 中   | Step 5 后必跑 Playwright mobile snapshot                                                                    |
| Step 7 之后立即 Step 8 删除导致难以回滚                                            | 中     | 中   | **Step 8 启动条件 ≥7 天 + 生产稳定**（D7）                                                                  |
| 跨入口 LLM 列表悄悄回归到分叉状态                                                  | 中     | 高   | **Contract test IRON RULE**（Section 7.2）— CI 强制守护                                                     |

### E. 不在本 spec 范围的 follow-up

后续 spec 可能要做（不在本 spec 承诺）：

1. **3D 工作区整体布局重做**（plan-eng-review D1 拆出）：卡片 → 输入框 + chip / amber banner 删除 / 参数面板降级 chip / Rodin/Fal 路由 UI 收敛 / Rodin 三 workflow 模式集成
2. **`workflowMode === 'card'` deprecation 调查**（plan-eng-review D2 引出）：card mode 是否还在大量使用？是否可以收敛到 quick + style card chip？
3. **#8 StudioQuickRouteSelector 收编**：是否可以归到 `<MainModelPicker size="compact">` 的某种内嵌模式
4. **#9 ApiKeyManager 重审**：与 QuickSetupDialog 的职责边界 / 是否拆为子组件
5. **i18n key 重组**：当前散布在 `QuickSetup` / `StudioApiKeys` / `Toasts` / 各 picker 局部 namespace，统一组件后可考虑收编到 `ApiKeyPicker.*` 单一 namespace
6. **错误恢复统一**：盘点 spec §4.D.3 提到的 3 种 surface 形态（toast / banner / dialog）应当独立 spec 收敛
7. **健康状态后台刷新**：盘点 spec Open Q 提到的"key 几小时后失效但 UI 不知道"问题
8. **新场景 P3/P4/P5 的处理**：edit 工具栏 / 侧栏 / 完整管理 — 待用户后续提出需要时再决定

---

**完。本 spec 完成定义**（plan-eng-review 调整后）：

- 7 个 picker 中除 #2 外 6 个完全改造为新组件 + #2 最小接入到 3D 卡片
- 5 套共享 hooks/utils 抽出（含 `useModelOptionsFor` 和 `useLLMRoutePicker` 新增）
- `LLM_CAPABILITY` adapter-derived 改造完毕 + contract test 上线
- Playwright snapshot baseline 建立
- 所有验收清单跑过
- Step 8 启动需 Step 7 上线 ≥7 天 + 生产稳定

---

## 10. GSTACK REVIEW REPORT

| Review                | Trigger               | Why                             | Runs | Status          | Findings                                                    |
| --------------------- | --------------------- | ------------------------------- | ---- | --------------- | ----------------------------------------------------------- |
| CEO Review            | `/plan-ceo-review`    | Scope & strategy                | 0    | —               | —                                                           |
| Eng Review            | `/plan-eng-review`    | Architecture & tests (required) | 1    | ISSUES_RESOLVED | 7 decisions (D1-D7), 1 IRON RULE applied; spec restructured |
| Design Review         | `/plan-design-review` | UI/UX gaps                      | 0    | —               | —                                                           |
| DX Review             | `/plan-devex-review`  | Developer experience gaps       | 0    | —               | —                                                           |
| Outside Voice (Codex) | `/codex review`       | Independent 2nd opinion         | 0    | —               | —                                                           |

**UNRESOLVED**: 0
**CRITICAL GAPS**: 0
**VERDICT**: ENG CLEARED — spec 缩范围 + 增加 contract test + 7 处架构决定全部应用到文档；可进入实施 Step 1

### Review 决定汇总

| 决定 ID            | 主题                                                     | 决定                                                 |
| ------------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| D1 (Step 0)        | 3D 工作区布局重做                                        | 拆为独立后续 spec；本 spec 仅最小接入                |
| D2 (Section 1.1)   | `workflowMode === 'card'` 路径                           | 调查后澄清：card mode 无 picker，spec 不动           |
| D3 (Section 1.2)   | LLM_CAPABILITY drift 守护                                | Adapter-derived（adapter 声明 capabilities）         |
| D4 (Section 1.3)   | MainModelPicker 5 modality hooks                         | 内部 `useModelOptionsFor(modality)` dispatcher hook  |
| D5 (Section 2.1)   | MainModelPicker.llm_assist vs CanvasRoutePicker 语义重叠 | 抽 `useLLMRoutePicker(scope)` 共享 hook，UI 外壳只装 |
| D6 (Section 3.1)   | 视觉回归工具                                             | Playwright `toHaveScreenshot()` snapshot baseline    |
| D7 (Section 3.3)   | Step 8 删除时机                                          | Step 7 上线 ≥7 天 + 生产稳定                         |
| IRON (Section 3.2) | LLM 列表跨入口一致性                                     | Contract test 守护 — 不问 user，必须加               |

### Implementation Tasks（synthesized from review）

- [ ] **T1 (P1, human: ~4h / CC: ~30min)** — utils — 抽 useSplitModelOptions / health-status-utils / formatApiKeyLabel
  - Surfaced by: D3-D5 共享 hook 路线 + 盘点 spec §4.D.1/D.2/D.5
  - Files: `src/hooks/useSplitModelOptions.ts`, `src/lib/health-status-utils.ts`, `src/lib/format-api-key-label.ts`
  - Verify: Vitest unit tests; 旧 picker 切到新 utils 后 npm run build + lint

- [ ] **T2 (P1, human: ~1d / CC: ~2h)** — adapter — 给所有 adapter 加 capabilities 声明 + 改 LLM_CAPABILITY 为 adapter-derived
  - Surfaced by: D3
  - Files: `src/services/adapters/*.ts`, `src/constants/llm-capability.ts`
  - Verify: Contract test (ALL_SCOPES coverage); `getLLMCapabilityScope('enhance')` 等返回符合预期

- [ ] **T3 (P1, human: ~3h / CC: ~30min)** — hook — 实现 useModelOptionsFor(modality) dispatcher
  - Surfaced by: D4
  - Files: `src/hooks/useModelOptionsFor.ts`
  - Verify: Vitest 单元测试 5 个 modality 分支；switch modality 不触发多余 effect

- [ ] **T4 (P1, human: ~4h / CC: ~30min)** — hook — 实现 useLLMRoutePicker(scope) 共享 hook
  - Surfaced by: D5
  - Files: `src/hooks/useLLMRoutePicker.ts`
  - Verify: Vitest 单元测试；scope 切换、加 key 触发、selected state；contract test：output 跨 scope 共享 adapter source

- [ ] **T5 (P1, human: ~1d / CC: ~2h)** — component — 实现 `<MainModelPicker>`
  - Surfaced by: spec §4.1
  - Files: `src/components/business/studio-shared/pickers/MainModelPicker.tsx`
  - Verify: Vitest 组件测试 + Playwright snapshot baseline（5 modality × 2 device）

- [ ] **T6 (P1, human: ~2d / CC: ~4h)** — refactor — Step 3: 改 #1 (StudioPromptArea quick mode)
  - Surfaced by: spec §6 Step 3
  - Files: `src/components/business/studio/StudioPromptArea.tsx`
  - Verify: Playwright snapshot diff (image/video/audio) + card mode regression spec

- [ ] **T7 (P1, human: ~1d / CC: ~2h)** — refactor — Step 4: 改 #3 + #4
  - Surfaced by: spec §6 Step 4
  - Files: `src/components/business/studio/edit/EditProviderPicker.tsx`, `src/components/business/prompts/PromptAssistantPanel.tsx`
  - Verify: Playwright snapshot diff + edit/enhance 手工烟雾

- [ ] **T8 (P1, human: ~4h / CC: ~30min)** — refactor — Step 5: 3D 最小接入
  - Surfaced by: spec §6 Step 5（D1 缩减后）
  - Files: `src/components/business/Studio3DWorkspace.tsx:1474-1503`
  - Verify: 3D 端到端：Rodin/Fal 切换 + 生成；不动布局/banner/参数面板

- [ ] **T9 (P1, human: ~1d / CC: ~2h)** — component — 实现 `<CanvasRoutePicker>`
  - Surfaced by: spec §4.2
  - Files: `src/components/business/studio-shared/pickers/CanvasRoutePicker.tsx`
  - Verify: Vitest 组件测试 3 variant + Playwright snapshot baseline

- [ ] **T10 (P1, human: ~1d / CC: ~2h)** — refactor — Step 7: 改 #5/#6/#7
  - Surfaced by: spec §6 Step 7
  - Files: `src/components/business/studio/node/CanvasPlannerRouteSelector.tsx`, `CanvasAssistantRouteSelector.tsx`, `WorkflowModelPicker.tsx`
  - Verify: Node Canvas 3 节点端到端 + Playwright snapshot diff

- [ ] **T11 (P2, human: ~2h / CC: ~30min)** — test — IRON RULE: 跨入口 LLM 列表一致性 contract test
  - Surfaced by: Section 3 IRON RULE
  - Files: `src/test/llm-capability.contract.test.ts`（新文件）
  - Verify: CI 跑通；故意把某 picker 加 filter 时测试必失败

- [ ] **T12 (P2, human: ~3h / CC: ~30min)** — test — Playwright snapshot baseline 建立
  - Surfaced by: D6
  - Files: `e2e/picker-snapshots.spec.ts`（新文件 / 扩展现有 mobile.spec.ts）
  - Verify: 40 个 baseline 截图 captured；CI 检测到任何变化时高亮 diff

- [ ] **T13 (P3, human: ~1h / CC: 0)** — cleanup — Step 8: 删除旧 picker 文件
  - Surfaced by: spec §6 Step 8
  - Files: 删除 #3/#4/#5/#6/#7 旧文件
  - Verify: grep 全项目无残留 import；**前置条件：Step 7 上线 ≥7 天 + 生产稳定**

**Lake Score**: 7/7 — 所有 review 决定都选了"complete option"（adapter-derived / 共享 hook / contract test / Playwright snapshot），未走 shortcut 路径。
