# PixelVault 统一开发计划 v2

> 合并 development-plan.md (9 Sprint) + Studio Redesign Plan (10 Phase) + 两轮 Codex Review。
> 核心策略：Track A 修复优先 → Track B Studio 重构(合并 S4+S5) → Track C 独立功能并行。

---

## 依赖关系图

```
Track A: 基础修复
A1 数据修复 ──→ A2 新模型 ──→ A3 校验+持久化
    │                              │
    ↓                              ↓
Track B: Studio 重构               Track C: 独立功能
B0 快照+ActiveRun                  C3 图片编辑(依赖A2+A3)
    │
    ↓
B1 三栏布局
    │
    ↓
B2 = S4+Phase2+3(合并)
    │
    ↓
B3 = S5+Phase4(合并) ──→ B6 智能Prompt ──→ B5 变体 ──→ B4 对比
                                                               │
并行: C1 Storyboard                                            ↓
                                                    C3 图片编辑 + C2 系列模式
                                                               │
最后: B7 动效+无障碍                                            ↓
                                                        C4 漫画高级
```

---

## Review 记录

| 来源                  | 发现数                                                                               | 状态               |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Dev Plan Codex Review | 9 (F1-F9): credit 成本/能力覆盖/计时器/Model ID/校验/持久化/并行化/重试              | 全部纳入 Track A+B |
| Studio Design Review  | 7 维度评分 4/10→7/10: 信息架构/交互状态/用户旅程/AI Slop/设计系统/响应式/决策        | 全部纳入 Track B   |
| Studio Codex Review   | 8 (P1-P3): snapshot DTO/ActiveRun/保留清单/共享服务/右栏精简/toast策略/i18n收口/测试 | 全部纳入 Track B   |

---

## Track A: 基础修复

### A1 — 数据层修复（原 S1）

**状态:** 已完成 ✅

#### A1a. Credit 成本修复（F1）

- `generate-image.service.ts` — requestCount 改用 `builtInModel?.cost`
- `model-options.ts:20` — 同上

#### A1b. 模型级能力覆盖（F2）

- `provider-capabilities.ts` — 新增 `MODEL_CAPABILITY_OVERRIDES`
- `getCapabilityConfig(adapterType, modelId?)` — 先查 model override 再 fallback
- `AdvancedSettings.tsx` / `CapabilityForm.tsx` / `StudioToolbarPanels.tsx` — 传递 modelId

#### A1c. 图片生成计时器（F4）

- `use-unified-generate.ts` — `generateImage()` 加 `startTimer()` / `stopTimer()`
- `GenerationPreview.tsx` — 显示 `elapsedSeconds`

#### A1d. Model ID 纠正（F5）

- FLUX 2 Max: `fal-ai/flux-2/max` → `fal-ai/flux-2-max`
- Recraft V4 Pro: → `fal-ai/recraft/v4/pro/text-to-image`
- Kontext Pro/Max: 新增正确 ID

**验证:** tsc 通过 + 生成后 DB requestCount = model.cost + 计时器显示

---

### A2 — 新模型接入（原 S2，依赖 A1b）

**状态:** 已完成 ✅

| 模型                   | enum                  | adapterType | cost | 特殊                              |
| ---------------------- | --------------------- | ----------- | ---- | --------------------------------- |
| gemini-2.5-flash-image | GEMINI_25_FLASH_IMAGE | GEMINI      | 1    | —                                 |
| FLUX 2 Max             | FLUX_2_MAX            | FAL         | 3    | —                                 |
| Recraft V4 Pro         | RECRAFT_V4_PRO        | FAL         | 2    | —                                 |
| Kontext Pro            | FLUX_KONTEXT          | FAL         | 2    | requiresReferenceImage            |
| Kontext Max            | FLUX_KONTEXT_MAX      | FAL         | 3    | requiresReferenceImage, multi-ref |

改动文件: `models.ts` + `provider-capabilities.ts` + `fal.adapter.ts` + `messages/{en,ja,zh}.json`

**验证:** 每个模型成功生成图片 + Kontext AdvancedSettings 只显示 seed

---

### A3 — 校验+持久化+并行化（原 S3，依赖 A2）

**状态:** 已完成 ✅

- **3A 参考图校验:** 服务端 `requiresReferenceImage` 检查 + 客户端按钮禁用
- **3B 编辑持久化:** `image-edit.service.ts` 新增 `persistEditedImage()` 保存到 R2/DB
- **3C 上传并行:** `Promise.all([uploadRef, uploadOut])` 替换串行
- **3D 超时:** fal/gemini adapter 加 `AbortSignal.timeout(120_000)`

**验证:** Kontext 无参考图拒绝 + upscale 保存 Gallery + 并行节省 2-3s

---

## Track B: Studio 重构

### B0 — Generation 快照 + ActiveRun 状态模型

**状态:** 部分完成 ⏳

#### 当前已落地

- Prisma `Generation` 已包含 `snapshot` / `runGroupId` / `runGroupType` / `runGroupIndex` / `isWinner` / `seed`
- `types/index.ts` 已有 `GenerationSnapshotSchema`
- `studio-context.tsx` / `use-unified-generate.ts` 已切到 `activeRun` 主状态模型

#### 当前仍待补

- 补齐 snapshot 序列化与回放的回归测试
- 把 compare / variant 的 run-group 约束补全到服务层
- 完成旧记录 `snapshot = null` 的兼容读取路径

#### B0a. GenerationSnapshot DTO

Prisma migration 新增:

```prisma
model Generation {
  snapshot       Json?     // 完整卡片+参数快照
  runGroupId     String?   // compare/variant 归组
  runGroupType   String    @default("single")
  runGroupIndex  Int       @default(0)
  isWinner       Boolean   @default(false)
  seed           BigInt?
}
```

- `types/index.ts` — GenerationSnapshotSchema（含 card snapshots + advancedParams + seed）
- `generation.service.ts` — createGeneration 保存 snapshot
- `studio-generate.service.ts` — 构造 snapshot
- 向后兼容: 旧记录 snapshot=null

#### B0b. ActiveRun 状态模型

```typescript
type ActiveRun = {
  id: string
  mode: 'single' | 'compare' | 'variant'
  items: RunItem[] // 1/2-3/4 items
  selectedItemId: string | null
  prompt: string
}
```

- `studio-context.tsx` — 替换 StudioGenContext 内部状态
- 向后兼容 computed: `isGenerating` / `lastGeneration`
- `use-unified-generate.ts` — 适配 ActiveRun

**验证:** Prisma migrate + snapshot 序列化 test + 单模型回归

---

### B1 — 三栏布局重构

**状态:** 已完成 ✅

#### 已完成范围

- `StudioWorkspace` 已切成项目栏 + 左中右/左右主布局
- `StudioLeftColumn` / `StudioCenterColumn` / `StudioRightColumn` 已承担主要布局职责
- `ProjectSelector`、Image/Video tabs、HistoryPanel、移动端设置面板已迁入新结构
- API 路由入口、卡片管理入口、预览区与历史区都已接回新布局

#### 当前备注

- Video 仍以现有布局逻辑为主，没有做单独重构
- 浏览器级回归仍需结合手动验证清单补一次完整走查

#### 删除

- Hero 统计区 → Navbar tooltip
- 模型排名 section → 已有 `/models` 页
- 页面标题

#### 保留清单

- ProjectSelector → 左栏顶部
- Image/Video tabs → 左栏（Video 走现有布局不重构）
- OnboardingTooltip → 锚点迁移到新布局
- 拖拽 history→reference
- 今日免费额度 → 左栏底部

#### 布局

```
Desktop (>=1024px):  左栏(280px) | 中心(flex-1) | 右栏(320px)
Tablet (768-1023):   左栏折叠(48px icon) | 中心(flex-1) | 右栏叠底
Mobile (<768):       Prompt顶部 + Generate → 预览 → 设置 bottom sheet
```

**验证:** 三栏正确 + responsive + ProjectSelector/Video/Onboarding 回归

---

### B2 — 状态补全 + 重试 + 快捷键（合并 S4 + Phase 2 + Phase 3）

**状态:** 已完成 ✅

#### 来自 S4: 重试基础设施

- `use-unified-generate.ts` — `lastRequestPayload` + `retry()` 方法
- `studio-context.tsx` — 暴露 retry

#### 来自 Phase 2: 交互状态

- **空态**: 中心区引导 + 右栏示例 + 左栏卡片引导
- **进度**: 三阶段 "排队→生成→下载" + blur→clear 渐进加载
- **错误策略**: 生成错误 → preview inline + 重试按钮；非 preview → 保留 toast
- **卡片引导**: "不选择" → "选择角色（可选）"

#### 来自 Phase 3: i18n + 命名 + 快捷键

- i18n namespace 收敛: StudioPage/V2/V3/Projects → 统一 `studio`
- 模式重命名: Quick→"直接生成" Card→"风格组合"
- Cmd+Enter 生成 + Cmd+E 增强 + Cmd+K 聚焦 + Esc 关闭面板
- Generate 按钮显示快捷键提示

#### 已完成范围

- `use-unified-generate.ts` 已补 `lastRequestPayload` + `retry()`
- Preview 区已有 inline error + retry，非 preview 错误仍保留 toast
- Studio 新拆分组件的硬编码文案已回收到消息表，三语文案已补齐
- `Cmd/Ctrl + Enter`、`Cmd/Ctrl + E`、`Cmd/Ctrl + K`、`Esc` 已接入
- 生成状态、工作流标签和屏幕阅读器状态文本已切到统一 `studio` 文案体系

**验证:** `vitest` / `eslint` / `tsc` 已通过；浏览器视觉回归仍需手动补验

---

### B3 — 卡片优化 + 历史元数据 + Remix（合并 S5 + Phase 4）

**状态:** 进行中 ⏳

#### 来自 S5: 卡片功能

- 卡片搜索/筛选（名称/标签） ✅
- 卡片复制 ✅
- 卡片排序（最近使用/创建时间/名称） ✅

#### 来自 Phase 4: Remix + 元数据

- **Remix V1** — 回填 prompt + modelId（现有数据） ✅
- **Remix V2** — 回填完整 snapshot（依赖 B0 数据积累） ⏳
- **历史默认态**: 缩略图 + model badge + prompt 前 30 字 ✅
- **展开态**: 点击 → 完整 prompt + 参数 + Remix 按钮 ✅
- **最近使用入口**: 左栏顶部 3 个最近配置组合 ✅

#### 已完成范围

- History 缩略图已驱动右侧预览，不再默认直接塞入参考图
- Preview 已支持 `Use as reference` 和 `Remix`
- 卡片下拉已支持搜索、排序、最近使用
- 管理面板内部已支持搜索、排序、复制
- 最近配置入口已接到左栏和移动端设置面板

#### 当前仍待补

- `Remix V2` 继续优先消费完整 snapshot
- 浏览器级视觉和交互回归

**验证:** 卡片搜索可用 + Remix V1 回填 + 历史元数据正确

---

### B4 — 多模型对比生成

**状态:** 未开始

- 共享并发服务: `parallel-generate.service.ts`（从 Arena 提取，Arena + Studio 共用）
- 中心区 2-3 模型并排展示
- ActiveRun items[] 支持局部完成
- 配额提示 "本次消耗 N 次"
- isWinner 标记
- API schema 扩展: `mode: 'compare'` + `modelIds[]`

**验证:** parallel-generate service test + API schema test + 并排 UI

---

### B5 — 批量变体 4选1

**状态:** 未开始

- 2x2 网格，同模型不同 seed
- 复用 parallel-generate 服务
- runGroupType = 'variant'
- 配额消耗 4 次

---

### B6 — 智能 Prompt（可与 B4-B5 并行）

**状态:** 未开始

- 模型感知建议（Animagine→Danbooru / Flux→自然语言 / Gemini→文字渲染）
- 10+ 场景模板库
- 灵感按钮（100+ 预置 prompt）
- `prompt-templates.ts` / `prompt-suggestions.ts`

---

### B7 — 动效 + 无障碍

**状态:** 未开始

- MotionReveal: 面板展开 + 结果出现
- 生成仪式感: opacity 0→1 + scale 0.95→1
- 触摸目标 >= 44px
- aria-label / aria-disabled / aria-expanded
- 拖拽键盘替代

---

## Track C: 独立功能线（与 Track B 并行）

### C1 — Storyboard 增量（原 S6）

**状态:** 未开始

- Schema: Story 新增 characterCardId/styleCardId/modelId
- Panel 级图片生成
- 编辑/查看模式切换

### C2 — 系列模式 + 角色一致性（原 S7，依赖 A2+B2）

**状态:** 未开始

- `use-series-generate.ts` — 批量顺序生成 + 自动参考链
- `SeriesGeneratePanel.tsx` — 多场景输入 + 进度
- `recipe-compiler.service.ts` — 多参考图智能裁剪

### C3 — 图片编辑（原 S8，依赖 A2 Kontext + A3 持久化）

**状态:** 未开始

- 指令式编辑（Kontext）
- Outpainting（画布扩展）
- Inpainting（局部重绘 + Canvas mask 编辑器）

### C4 — 漫画高级（原 S9，依赖 C1+C2）

**状态:** 未开始

- 对话气泡叠加（CSS 拖拽）
- 多模板导出 PNG/PDF（4格/6格/8格/条漫）
- 剧本模式（LLM 拆分场景 → 批量生成 → 自动创建 Story）

---

## 推荐执行时间线

```
Week 1-2:  A1 + A2 + A3 (基础修复，消除技术债) ✅ 已完成
Week 2-3:  B0 (快照+ActiveRun，为后续功能打地基) ✅ 已完成
Week 3-4:  B1 (三栏布局，最大视觉变化) ✅ 已完成
Week 4-5:  B2 (合并 S4+Phase2+3: 状态/重试/快捷键/i18n) ✅ 已完成
Week 5-6:  B3 (合并 S5+Phase4: 卡片优化/Remix/元数据) ⏳ 进行中
```

### 后续优先级重排（数据驱动评分, 2026-04-08 更新）

评分维度: 用户影响(5) + 收入潜力(5) + 依赖少(5) + 工作量低(5) + 风险低(5) = 总分25

| 排名 | 功能               |  总分  | 理由                                                         |
| :--: | ------------------ | :----: | ------------------------------------------------------------ |
|  1   | **B6 智能提示词**  | **22** | 零依赖，prompt-presets.ts 已有基础，最高用户体验提升         |
|  2   | **B5 变体 4选1**   | **18** | 比 B4 简单（同模型不同 seed），验证并行生成基础设施          |
|  3   | **B4 多模型对比**  | **17** | 核心差异化功能，可复用 Arena parallel-generate + B5 基础设施 |
|  4   | **C3 图片编辑**    | **17** | Kontext 适配器已就绪(A2)，多参考图支持已完成(W1)             |
|  5   | B7 动效+无障碍     |   16   | 上线前打磨，非功能性                                         |
|  6   | C2 系列模式        |   14   | 角色一致性痛点，依赖 A2+B2 已满足                            |
|  7   | C1 Storyboard 增量 |   14   | 中等价值，中等工作量                                         |
|  8   | C4 漫画高级        |   8    | 依赖 C1+C2，最高工作量，延后                                 |

**与 v1 的关键变化**: B6 提前到 B3 之后（原 v1 中 B4 先于 B5/B6）。理由是 B6 零外部依赖且 `prompt-presets.ts` 已有基础结构，而 B4 需要提取 Arena 的 parallel-generate 逻辑 + B5 先验证并行生成。

```
Week 6:    B6 智能Prompt（模板 + 模型建议 + 灵感按钮）
Week 7:    B5 变体4选1（同模型4种子 2x2 grid）
Week 8-9:  B4 多模型对比（提取 parallel-generate，2-3 模型并排）
Week 9-11: C3 图片编辑（Kontext 指令编辑 + 外扩 + 局部重绘）
Week 11+:  B7 动效 → C2 系列 → C1 Storyboard → C4 漫画
```

## 验证方式

| 阶段  | UI 验证                     | 服务/Schema 测试                 |
| ----- | --------------------------- | -------------------------------- |
| A1    | 生成后 credit 正确          | requestCount = model.cost        |
| A2    | 5 模型各生成成功            | Kontext 能力覆盖生效             |
| A3    | 无参考图拒绝 + 编辑保存     | 并行上传节省时间                 |
| B0    | N/A                         | Prisma migrate + snapshot 序列化 |
| B1    | 三栏 + responsive + 回归    | tsc 零错误                       |
| B2    | 空态+进度+inline错误+快捷键 | i18n-check + retry test          |
| B3    | 卡片搜索+Remix+元数据       | Remix DTO 还原 test              |
| B4    | 对比并排+选择               | parallel-generate service test   |
| B5    | 4-grid+选择                 | variant seed test                |
| B6    | 模板填充+建议               | 数据完整性 test                  |
| B7    | 动效+a11y                   | axe-core scan                    |
| C1-C4 | 各功能验收                  | 对应 service tests               |

## NOT in scope

- 视频模式重构
- 社交/分享功能
- Upscale（需额外 provider）
