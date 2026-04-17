# Studio 优化计划 — 进度与接续指南

> 本文档记录 PixelVault Studio 全面优化的完整状态。
> 下一个 chat session 拿到这个文档即可无缝接续。
>
> **原始设计文档:** `~/.gstack/projects/anteisuba-pixelvault_yang/yang.jian.p-main-design-20260414-113926.md`
> **创建日期:** 2026-04-14
> **最后更新:** 2026-04-14

---

## 一、总体方案：B+ 交替推进（7 周）

测试和 UX 交替进行，每周有可见进展。

| 周  | 内容                                       | 状态                         |
| --- | ------------------------------------------ | ---------------------------- |
| W1  | 核心生成路径测试                           | ✅ 完成                      |
| W2  | 风格预设 + unified-generate hook 测试      | ✅ 完成                      |
| W3  | Quick Mode 简化入口                        | ✅ 完成（commit: `6a5a07e`） |
| W4  | 生成管道抽取（组合函数）+ @ts-nocheck 清理 | ⏳ 未开始                    |
| W5  | 管道测试 + API 路由迁移到 createApiRoute   | ⏳ 未开始                    |
| W6  | Video UI 统一 + 骨架屏 + 模型选择器统一    | ⏳ 未开始                    |
| W7  | 减轻 AI 感 + SEO 基础                      | ⏳ 未开始                    |

### Phase 1 基础层奠基（2026-04-17）

> 基于 01-UI / 02-功能 决策书启动 Phase 1。此批次聚焦数据层和基础设施。

| 任务                                    | 状态       | 产出文件                                                      |
| --------------------------------------- | ---------- | ------------------------------------------------------------- |
| Design Tokens 基础                      | ✅ 完成    | `src/lib/design-tokens.ts`（新建）                            |
| 硬编码 hex 清理（15 处）                | ✅ 完成    | Homepage\*.tsx, MagicCard, TextRepel 等 9 个文件迁移至 tokens |
| Transform Types & Schema                | ✅ 完成    | `src/types/transform.ts`（新建，5 维度 Zod schema）           |
| Transform Presets（6 个 seed）          | ✅ 完成    | `src/constants/transform-presets.ts`（新建）                  |
| Transform Dimensions（5 维度 Provider） | ✅ 完成    | `src/constants/transform-dimensions.ts`（新建）               |
| NotImplementedError                     | ✅ 完成    | `src/lib/errors.ts`（扩展）                                   |
| Toast Helper                            | ✅ 完成    | `src/lib/toast.ts`（新建，封装 sonner）                       |
| with-retry 单测（WP-Infra-01）          | ✅ 9 tests | `src/lib/with-retry.test.ts`（新建）                          |
| i18n Transform namespace                | ✅ 完成    | `src/messages/{en,ja,zh}.json`（三语扩展）                    |

### Phase 1 Service 编排层（2026-04-17）

> image-transform 全栈：service → API route → client → hook → tests

| 任务                       | 状态       | 产出文件                                                               |
| -------------------------- | ---------- | ---------------------------------------------------------------------- |
| handle-style-transform.ts  | ✅ 完成    | `src/services/image-transform/handle-style-transform.ts`（新建）       |
| image-transform.service.ts | ✅ 完成    | `src/services/image-transform.service.ts`（新建，Strategy Pattern）    |
| API route                  | ✅ 完成    | `src/app/api/image-transform/route.ts`（新建，createApiRoute factory） |
| API client                 | ✅ 完成    | `src/lib/api-client/transform.ts`（新建）+ barrel re-export            |
| Hook                       | ✅ 完成    | `src/hooks/use-image-transform.ts`（新建，submit + retry + reset）     |
| Config 扩展                | ✅ 完成    | `RATE_LIMIT_CONFIGS.imageTransform` + `API_ENDPOINTS.IMAGE_TRANSFORM`  |
| Service 单测               | ✅ 6 tests | `src/services/image-transform.service.test.ts`                         |
| Route 单测                 | ✅ 8 tests | `src/app/api/image-transform/route.test.ts`                            |

### Phase 1 Studio Transform UI（2026-04-17）

> 5 个新组件 + 2 个组件测试文件

| 任务                   | 状态       | 产出文件                                                  |
| ---------------------- | ---------- | --------------------------------------------------------- |
| StudioInputImage       | ✅ 完成    | 拖拽/点击上传 + 预览 + 删除 + 文件验证                    |
| StudioFaceConsentModal | ✅ 完成    | shadcn Dialog 人脸 consent 弹窗                           |
| StudioTransformToggle  | ✅ 完成    | 4 Variants / Fast (1×) 切换                               |
| StudioVariantsGrid     | ✅ 完成    | 2×2 / 1×1 网格 + skeleton + 失败重试                      |
| StudioTransformPanel   | ✅ 完成    | 编排器：preset 选择 + 保留度切换 + useImageTransform 调用 |
| InputImage 单测        | ✅ 4 tests | 上传区渲染 / 预览 / 删除回调 / disabled                   |
| VariantsGrid 单测      | ✅ 5 tests | skeleton / 空态 / 成功图片 / 失败重试 / 单列模式          |

---

## 二、已完成的工作（W1-W3）

### W1: 核心生成路径测试（已 commit + push: `0cd5f3b`）

**文件变更：**

- `src/services/generate-image.service.test.ts` — +6 测试 (19 total)
  - MISSING_API_KEY、PLATFORM_KEY_MISSING、requiresReferenceImage
  - UNSUPPORTED_MODEL、R2 上传失败 job 标记、provider fallback
- `src/app/api/studio/generate/route.test.ts` — 新建 10 个测试
  - auth(401)、validation(400)、quick mode、card mode
  - batch fields、referenceImages、service error(400)、unexpected(500)
  - 默认 aspectRatio
- `src/app/api/generate/route.test.ts` — 已有 11 个测试，确认通过

### W2: 风格预设 + hook 测试（已 commit + push: `0cd5f3b`）

**新文件：**

- `src/constants/style-presets.ts` — 6 个风格预设
  - anime、realistic、illustration、watercolor、pixel、cyberpunk
  - 每个预设: `{ id, messageKey, icon, promptPrefix, negativePrompt }`
  - 组合模式: prepend（加在用户 prompt 前），与卡片系统兼容
- `src/hooks/use-unified-generate.test.ts` — 8 个 hook 测试
  - idle 状态、image 生成成功/失败、activeRun 模式
  - audio 生成、无 input 返回 null、retry、reset

**修改文件：**

- `src/contexts/studio-context.tsx` — 新增 `stylePresetId` 状态 + `SET_STYLE_PRESET` action
- `src/components/business/studio/StudioPromptArea.tsx` — 风格 chips UI + prompt 注入逻辑
- `src/messages/{en,ja,zh}.json` — `StylePresets` namespace
- `src/middleware.ts` — 开发环境跳过 Clerk auth.protect()

### W3: Quick Mode（已 commit + push: `6a5a07e`）

**新文件：**

- `src/components/business/studio/QuickSetupDialog.tsx` — API key 快速引导弹窗
  - 流程: 显示 provider 获取链接 → 用户粘贴 key → 调用 createApiKey → 验证 → 自动选中模型
  - 使用 `ADAPTER_API_GUIDES` 提供每个 provider 的注册步骤和链接

**修改文件及具体改动：**

1. **`src/components/business/StudioToolbar.tsx`**
   - 新增 `quickMode?: boolean` prop
   - Quick Mode 下隐藏: Advanced、LayerDecompose、CivitAI Token、LoRA Training
   - Quick Mode 下保留: Enhance、Reverse（图片反向工程）、Reference Image、Aspect Ratio

2. **`src/components/business/studio/StudioToolbarPanels.tsx`**
   - 传入 `quickMode={state.workflowMode === 'quick'}` 给 StudioToolbar

3. **`src/components/business/StudioWorkspace.tsx`**
   - 新增 localStorage 持久化 (`studio-workflow-mode`)
   - mount 时从 localStorage 恢复 workflowMode
   - workflowMode 变化时写入 localStorage

4. **`src/components/business/studio/StudioSidebar.tsx`**
   - Quick Mode 下隐藏项目树（Header + All Generations + Project Tree + Separator）
   - 保留 API Keys 选择区域（用户需要选 key 才能生成）

5. **`src/components/business/studio/StudioPromptArea.tsx`**
   - 新增 inline 模型选择器（输入框底部左侧，DropdownMenu）
   - 模型分组: "可用"（freeTier 或有 saved key）/ "需要 API key"（锁定）
   - 点击锁定模型 → 弹出 QuickSetupDialog
   - 渐进引导: Quick Mode 下成功生成 3 次后 toast 提示"试试卡片模式"
     - localStorage keys: `studio-quick-gen-count`, `studio-pro-nudge-dismissed`

6. **`src/messages/{en,ja,zh}.json`**
   - 新增 `QuickSetup` namespace (title, description, step1, step2, keyPlaceholder, verify, verifying, verifyFailed, success, available, needsKey)
   - 新增 `StudioV2.proModeNudge`, `StudioV2.tryProMode`

---

## 三、W3 已包含的文件（commit `6a5a07e`）

```
Modified:
  src/components/business/StudioToolbar.tsx
  src/components/business/StudioWorkspace.tsx
  src/components/business/studio/StudioPromptArea.tsx
  src/components/business/studio/StudioSidebar.tsx
  src/components/business/studio/StudioToolbarPanels.tsx
  src/messages/en.json
  src/messages/ja.json
  src/messages/zh.json

New:
  src/components/business/studio/QuickSetupDialog.tsx
```

---

## 四、W4-W7 待办详情

### W4: 生成管道抽取（组合函数模式）

**前置条件:**

- [ ] 移除 `src/services/generate-audio.service.ts` 第 2 行的 `@ts-nocheck`，修复所有类型错误

**目标: 创建 `src/services/generation-pipeline.ts`**

从 image/video/audio 三个 service 中提取共享步骤:

```typescript
// 组合函数，非 class 继承
async function resolveRoute(params) // 已存在于 generate-image，提升为独立导出
async function uploadReferenceImage(params) // 从 image + video 两处提取
async function createGenerationRecord(params) // 从三个 service 中提取
async function uploadToR2(params) // 封装通用上传逻辑

// 调用模式:
// Image: resolveRoute → provider.generate → uploadToR2 → createRecord
// Video: resolveRoute → provider.submit → (poll) → uploadToR2 → createRecord
// Audio: resolveRoute → provider.generate → uploadToR2 → createRecord
```

**注意:**

- `generate-video.service.ts` 已经从 image service 导入 `resolveGenerationRoute` 和 `GenerateImageServiceError`
- 保留原有 service 的导出接口不变（向后兼容）
- 重构后 image/video/audio service 变成薄包装，调用管道函数

**高风险模块:**
| 模块 | 导入文件数 | 规则 |
|------|-----------|------|
| `src/types/index.ts` (barrel `@/types`) | ~146 | 只加 optional 字段 |
| `src/constants/models.ts` 单文件 | ~42 | 加模型不删模型 |
| `src/services/generate-image.service.ts` | 13 | 保留原接口 |
| `src/services/storage/r2.ts` | 15 | 只加新方法 |

### W5: 管道测试 + API 路由迁移

- [ ] 为 `generation-pipeline.ts` 每个管道函数写测试
- [ ] 统一三种生成模式的错误响应格式
- [ ] 将剩余 61 个路由迁移到 `createApiRoute` 工厂（当前 18/79 已迁移）
  - 工厂位置: `src/lib/api-route-factory.ts`
  - 迁移模式: 每个路由从手动 auth+validate+handle 改为 `createApiRoute({ schema, handler })`

### W6: Video UI 统一 + 骨架屏

- [ ] 将 `src/components/business/VideoGenerateForm.tsx` (763行) 核心逻辑迁入 `src/components/business/studio/StudioVideoMode.tsx` (当前 32 行 wrapper)
- [ ] Video 使用与 Image 相同的 Studio 布局（TopBar + Canvas + BottomDock）
- [ ] 废弃独立的 `VideoGenerateForm.tsx`
- [ ] 模型选择器统一（当前有 dropdown + pills 两种模式）
- [ ] 添加生成结果骨架屏（当前无 loading 状态）
- [ ] 面板展开/收起添加动画（fade-in + translate-up，300-600ms ease-out）

### W7: 减轻 AI 感 + SEO

- [ ] 减少默认可见的技术参数（guidance_scale/scheduler 默认折叠）
- [ ] 用"创意风格"替代"模型选择"措辞
- [ ] 结果展示区域去掉技术元数据（模型名、耗时放到详情弹窗）
- [ ] 空状态设计: 首次进入展示精选作品画廊
- [ ] SEO: meta tags、Open Graph、多语言 sitemap
  - Landing Page: `src/app/[locale]/page.tsx`
  - Layout: `src/app/[locale]/layout.tsx`

---

## 五、独立计划（不在 7 周路线图内）

### API Key 门槛降低 (ADR)

三个方向，需做成本分析后选一个:

- Option A: 平台代理 API（需商业模型 + 支付体系）
- Option B: 接入国内免翻墙模型（智谱 GLM-4V、通义万相，需新 adapter）
- Option C: 社区 API Key 共享（需信任 + 计费系统）

### 国际增长（持续运营）

| 渠道                                | 优先级 | 内容策略                                                |
| ----------------------------------- | ------ | ------------------------------------------------------- |
| Reddit (r/StableDiffusion, r/AIart) | P0     | "用这个方法让 Gemini 画出不同风格的图" + Arena 对比截图 |
| Twitter/X                           | P1     | 每天 1 条生成作品展示                                   |
| Product Hunt                        | P2     | Phase 3 完成后一次性发布                                |
| Pixiv/note.com                      | P2     | 日语内容，日本市场入口                                  |

---

## 六、变更安全协议

每次改动前执行:

```bash
# 1. 查依赖
grep -r "import.*from.*<模块名>" src/ --include="*.ts" --include="*.tsx" -l | wc -l

# 2. >5 处引用只做向后兼容修改

# 3. 改完后
npx tsc --noEmit
npx vitest run --reporter=verbose
```

**回滚策略:**

- 每 Phase 一个特征分支 (`refactor/phase-N-xxx`)
- 失败判定: tsc 或 vitest 持续红灯超 2 天
- 回滚: `git checkout main && git branch -D refactor/phase-N-failed`

---

## 七、测试覆盖现状

| 文件                                | 测试数 | 覆盖场景                                        |
| ----------------------------------- | ------ | ----------------------------------------------- |
| `generate-image.service.test.ts`    | 19     | 路由解析(9) + 完整流程(10)                      |
| `api/generate/route.test.ts`        | 11     | auth/validate/success/error/advancedParams      |
| `api/studio/generate/route.test.ts` | 10     | auth/validate/quick+card mode/batch/error       |
| `use-unified-generate.test.ts`      | 8      | idle/generate/error/activeRun/audio/retry/reset |
| `studio-context.test.ts`            | 36     | reducer 所有 action + panel toggle              |
| **总计**                            | **84** | 核心生成路径全覆盖                              |

---

## 八、关键代码位置

| 功能                               | 文件路径                                              |
| ---------------------------------- | ----------------------------------------------------- |
| 风格预设常量                       | `src/constants/style-presets.ts`                      |
| Studio 上下文 (3层分离)            | `src/contexts/studio-context.tsx`                     |
| Studio 入口                        | `src/components/business/StudioWorkspace.tsx`         |
| 提示词区域 + 风格 chips + 模型选择 | `src/components/business/studio/StudioPromptArea.tsx` |
| API key 快速引导                   | `src/components/business/studio/QuickSetupDialog.tsx` |
| 工具栏 (Quick/Pro 切换)            | `src/components/business/StudioToolbar.tsx`           |
| 侧边栏 (项目 + API keys)           | `src/components/business/studio/StudioSidebar.tsx`    |
| 生成核心 service                   | `src/services/generate-image.service.ts`              |
| Provider 引导链接                  | `src/constants/providers.ts` → `ADAPTER_API_GUIDES`   |
| API 路由工厂                       | `src/lib/api-route-factory.ts`                        |
| 统一生成 hook                      | `src/hooks/use-unified-generate.ts`                   |
| Dev 环境 auth 跳过                 | `src/middleware.ts` (isDev 判断)                      |

---

## 九、接续步骤

1. ✅ **W3 已 commit + push** (`6a5a07e`)
2. **W4 开始前跑 `/plan-eng-review`** — 锁定 generation-pipeline.ts 接口设计
3. **从 W4 开始** — 先修 `@ts-nocheck`（`src/services/generate-audio.service.ts` 第2行），再抽管道函数
