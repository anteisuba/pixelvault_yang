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

| 周  | 内容                                     | 状态                      |
| --- | ---------------------------------------- | ------------------------- |
| W1  | 核心生成路径测试                         | ✅ 完成                   |
| W2  | 风格预设 + unified-generate hook 测试    | ✅ 完成                   |
| W3  | Quick Mode 简化入口                      | ✅ 完成已推送 (`6a5a07e`) |
| W4  | @ts-nocheck 清理 + audio async 路径修复  | ⏳ 未开始                 |
| W5  | 管道测试 + API 路由迁移到 createApiRoute | ⏳ 未开始                 |
| W6  | Video UI 统一 + 骨架屏 + 模型选择器统一  | ⏳ 未开始                 |
| W7  | 减轻 AI 感 + SEO 基础                    | ⏳ 未开始                 |

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

### W3: Quick Mode（待 commit — 当前 working tree 中）

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

## 三、待 commit 的文件清单

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

**建议 commit message:**

```
feat: W3 Quick Mode — 简化入口 + 内联模型选择 + API key 快速引导

- Quick Mode 工具栏: 隐藏 Advanced/LayerDecompose/CivitAI/LoRA，保留 Enhance/Reverse/RefImage/AspectRatio
- 侧边栏: Quick Mode 隐藏项目树，保留 API Keys
- 内联模型选择器: 输入框底部，分"可用/需要 API key"两组
- QuickSetupDialog: 选锁定模型 → 显示获取链接 → 输入 key → 验证 → 自动激活
- localStorage 持久化 workflowMode
- 渐进引导: 3 次生成后 toast 提示卡片模式
- i18n: en/ja/zh QuickSetup namespace
```

---

## 四、W4-W7 待办详情

### W4: @ts-nocheck 清理 + audio async 路径修复（精简版）

> **Scope 调整说明（2026-04-14 eng-review）**: 原计划的 `generation-pipeline.ts` 已被推迟。
> `resolveGenerationRoute` 和 `uploadToR2` 已经存在，无需重新抽取。
> 更重要的是发现了 audio async 路径有功能性 bug + 安全问题需优先修复。

**任务清单:**

- [ ] `src/services/generate-audio.service.ts`
  - 删除第 2 行 `@ts-nocheck`，修复所有类型错误
  - 修 `generateAudioForUser`：补充 `sampleRate` 字段转发给 adapter（当前缺失，Fish Audio adapter 期望此字段）
  - 修 `createApiUsageEntry` 调用：统一用 `generationJobId` 模式（与 image service 一致）
  - 修 `getProviderAdapter(adapterType as never)`：改为有类型的 `AI_ADAPTER_TYPES` 转换
  - `submitAudioGeneration` + `checkAudioGenerationStatus`：添加 TODO 注释，说明需等 FAL adapter 实现 `submitAudioToQueue`/`checkAudioQueueStatus` 后再修 job lifecycle

- [ ] `src/services/generate-audio.service.test.ts`（新建，目前 0 个测试）
  - `generateAudioForUser` 同步路径: 成功 / UNSUPPORTED_MODEL / ProviderError / R2失败
  - 不测试 submit/status 异步路径（adapter 层未实现，留到后续）

**遵循模式:** 参考 `generate-image.service.test.ts` 的 mock 模式

**已推迟（等 FAL adapter 实现 audio queue 后）:**

- `submitAudioGeneration` job lifecycle 修复
- `checkAudioGenerationStatus` 改为 jobId 接收 + 幂等锁
- API key 前端暴露安全问题（status route）
- 相关类型修复：`GenerateAudioResponse` 应有 `jobId`、`AudioStatusResponseData` 应有 `jobId`

**已推迟时的注意事项:**

- Re-resolve route 有 key 漂移风险：应存 `apiKeyId` 到 externalRequestId，poll 时按 ID 查找
- 幂等锁：参考 `generate-video.service.ts:277` 的 optimistic lock 实现

**高风险模块（改动前确认影响范围）:**
| 模块 | 导入文件数 | 规则 |
|------|-----------|------|
| `src/services/generate-audio.service.ts` | 2 文件调用 | 只有 route.ts 和 status route，同步改 |
| `src/services/generate-image.service.ts` | 20 文件 | 本次不改此文件 |

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

1. ~~先 commit + push W3~~ — 已完成（`6a5a07e`）
2. ~~W4 前跑 /plan-eng-review~~ — 已完成（2026-04-14），scope 调整为精简版
3. **开始 W4** — 按上方任务清单实施（同步音频路径：@ts-nocheck + sampleRate + 测试）
4. W4 完成后：`npx tsc --noEmit` + `npx vitest run --reporter=verbose`

---

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                             | Runs | Status       | Findings                                                                       |
| ------------- | --------------------- | ------------------------------- | ---- | ------------ | ------------------------------------------------------------------------------ |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 2    | CLEAR        | 6 proposals, 6 accepted, 0 deferred                                            |
| Codex Review  | `/codex review`       | Independent 2nd opinion         | 1    | issues_found | FAL audio queue 未实现（可行性）; sampleRate 未转发; async path key drift 风险 |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 4    | CLEAR (PLAN) | 4 issues, 1 critical gap — scope 已精简                                        |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 1    | CLEAR        | score: 3/10 → 8/10, 7 decisions                                                |
| DX Review     | `/plan-devex-review`  | Developer experience gaps       | 0    | —            | —                                                                              |

**VERDICT:** ENG CLEARED — 可以开始 W4 实现。Codex 发现的 FAL audio queue 未实现已纳入推迟计划，不阻塞 W4。
