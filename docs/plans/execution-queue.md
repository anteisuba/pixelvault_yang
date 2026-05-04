# Codex 执行队列

> **日期**: 2026-05-04
> **工作流**: Codex 执行 → Claude Code Review → 合入
> **依据**: `optimized-execution-plan.md` Tier 排序

---

## 执行规则

1. 每个 Task 独立一次 Codex 会话
2. 每次 commit 后运行 `npx vitest run --reporter=verbose` 验证
3. Claude Code review 检查：CLAUDE.md 硬规则 + 高风险模块依赖面 + 测试通过
4. 同一 Tier 内的 Task 可并行执行（无依赖关系的）

---

## Tier 1 — 用户直接感知的可靠性

### Task 1.1: 补齐 loading/error 文件（8 个文件）

**子计划**: `backend/2026-04-26-plan-a-a3-error-loading-webhook.md` Task 1
**Codex 指令**:

```
读取 docs/plans/backend/2026-04-26-plan-a-a3-error-loading-webhook.md 的 Task 1，
按步骤执行。创建 8 个文件（5 条路由的 loading.tsx/error.tsx）。
模板来源：error.tsx → src/app/[locale]/(main)/error.tsx，
loading.tsx → src/app/[locale]/(main)/gallery/loading.tsx。
完成后运行 npx vitest run --reporter=verbose。
```

**验收**: 8 个文件存在 + 无 TypeScript 错误 + 测试通过

---

### Task 1.2: 生成失败用户错误反馈 Dialog

**子计划**: `backend/2026-04-26-plan-a-a3-error-loading-webhook.md` Task 2（如有）或按以下 spec 执行
**Codex 指令**:

```
创建 src/components/business/studio/StudioGenerationErrorDialog.tsx。
功能：生成失败时弹窗显示 3 个动作按钮：
1. 重试（相同参数重新提交）
2. 换模型（打开 model selector）
3. 查看原因（展示 GenerationJob.errorMessage 的用户级文案转换）

需要：
- 使用 src/components/ui/dialog.tsx 作为基础
- 错误码 → 用户文案映射加入 src/constants/ 新文件
- 三语 i18n 文案（src/messages/{en,ja,zh}.json 的 Studio 命名空间）
- 组件测试 StudioGenerationErrorDialog.test.tsx（渲染 + 3 按钮点击）
- 接入点：在 generation 失败时触发（通过 hook 状态）

完成后运行 npx vitest run --reporter=verbose。
```

**验收**: 组件 + 测试 + i18n 三语 + constants 文件

---

### Task 1.3: Free-tier 并发原子性

**子计划**: `backend/2026-04-25-plan-a-a1-runtime-stability.md` Task 3
**Codex 指令**:

```
读取 docs/plans/backend/2026-04-25-plan-a-a1-runtime-stability.md 的 Task 3（Free-tier slot atomicity）。
按步骤执行：
1. 写失败测试
2. 实现原子 slot reserve（使用 Prisma interactive transaction + serializable isolation）
3. 修改 usage.service.ts
4. 验证并发安全

完成后运行 npx vitest run --reporter=verbose。
```

**验收**: 新测试断言 20 并发精确通过 + 无漂移

---

## Tier 2 — 首次体验优化

### Task 2.1: Studio 默认样例 prompt

**Codex 指令**:

```
实现 Studio 首次访问时预填一条样例 prompt：
1. src/constants/ 新增 SAMPLE_PROMPTS（每个 workflow 对应一条默认 prompt）
2. src/messages/{en,ja,zh}.json 添加三语样例文案
3. Studio 加载时检查 localStorage 'studio-sample-shown' flag：
   - 未设置 → 预填对应 workflow 的 sample prompt 到 prompt textarea
   - 用户修改后设置 flag，不再预填
4. 修改 src/contexts/studio-context.tsx 或对应 hook，在初始化时注入

注意：不改变 studio-context 的 public API，只在初始化逻辑中加条件。
先 grep "studio-context" 确认影响面。

完成后运行 npx vitest run --reporter=verbose。
```

**验收**: 首次加载有 prompt + 修改后不再出现 + 测试通过

---

### Task 2.2: 首页 Hero 密度瘦身

**Codex 指令**:

```
修改 src/components/business/HomepageHero.tsx + src/messages/{en,ja,zh}.json：
1. Hero 主文案从 11+ 概念砍到：一句话定位 + 一句副标
   - en: "Create with any AI model. Keep everything forever."
   - zh: "用任意 AI 模型创作，永久保存每一张作品"
   - ja: "あらゆるAIモデルで創作、すべての作品を永久保存"
2. 3 CTA → 2 CTA：
   - 主 CTA: 开始创作（链接 Studio）
   - 次 CTA: 浏览画廊（链接 Gallery）
3. 其余概念（Arena、Storyboard、BYOK 等）下沉到 Features section（如已有则保留，只从 Hero 移除）
4. 保持 design-system.md 约束（bg #faf9f5，accent #d97757，Space Grotesk + Lora）

完成后运行 npx vitest run --reporter=verbose。
```

**验收**: Hero 简洁 + 三语同步 + 设计规范合规

---

### Task 2.3: OnboardingTooltip 节奏校准

**Codex 指令**:

```
修改 src/components/business/OnboardingTooltip.tsx + src/messages/{en,ja,zh}.json：
将第 2 步改为"已帮你填好一条示例 prompt，直接点生成试试"
（与 Task 2.1 的样例 prompt 联动）。

步骤序列调整为：
1. welcome
2. "示例 prompt 已就绪"（新文案）
3. 模型说明
4. API Key 引导
5. 生成

三语同步。

完成后运行 npx vitest run --reporter=verbose。
```

**验收**: Tooltip 步骤与 sample prompt 联动 + 三语

---

### Task 2.4: Workflow Shell Phase 6 — i18n + 移动端基础

**Codex 指令**:

```
按 docs/plans/frontend/studio-workflow-shell.md Phase 6 要求执行：
1. 确认 workflow 名称和说明已在 src/messages/{en,ja,zh}.json（如缺则补）
2. 检查 StudioWorkflowPicker 在 mobile（< 640px）下的间距：
   - cards 应 overflow-x-auto 水平滚动
   - 不要过挤（min-width per card）
3. Shell 首屏空态（无选中 workflow 时）显示清晰引导文案
4. 切换 workflow 时 prompt 保留策略：切换不清空 prompt（除非 outputType 变化）

注意：先 grep "StudioWorkflowPicker\|StudioWorkflowGroupTabs" 确认文件位置。
不要改变已有的 workflow constants 结构。

完成后运行 npx vitest run --reporter=verbose。
```

**验收**: 三语 workflow 文案完整 + mobile 不溢出 + 空态有引导

---

## Tier 3 — 工程质量基建（可并行）

### Task 3.1: 高优先级 Service 补测 — user.service

**Codex 指令**:

```
为 src/services/user.service.ts 创建 src/services/user.service.test.ts。
覆盖：
- 正常路径：创建用户、获取用户、更新用户
- 错误路径：用户不存在、重复创建
- 边界：字段验证

先读 user.service.ts 了解 public API，用 vi.mock 模拟 Prisma。
参考已有测试风格：src/services/usage.service.test.ts。

完成后运行 npx vitest run src/services/user.service.test.ts --reporter=verbose。
```

### Task 3.2: 高优先级 Service 补测 — generation.service

**Codex 指令**:

```
为 src/services/generation.service.ts 创建测试。
覆盖 createGeneration、getGenerationById、listUserGenerations 等核心方法。
参考风格：src/services/usage.service.test.ts。
```

### Task 3.3: 高优先级 Service 补测 — arena.service

**Codex 指令**:

```
为 src/services/arena.service.ts 创建测试。
覆盖：创建 match、提交 vote、计算 ELO、获取 leaderboard。
```

### Task 3.4: Card 体系补测

**Codex 指令**:

```
读取 docs/plans/backend/2026-04-25-plan-a-a2-test-coverage.md，
执行 Card 体系补测任务（character-card / background-card / style-card / card-recipe）。
每个 service 至少 1 正常 + 1 错误路径。
```

### Task 3.5: 社群 Service 补测

**Codex 指令**:

```
读取 docs/plans/backend/2026-04-25-plan-a-a2-test-coverage.md，
执行社群 service 补测（follow / like / collection）。
关键 case：幂等性、批量并发、计数一致。
```

### Task 3.6: 签名验证抽取

**子计划**: `backend/2026-04-25-plan-a-a1-runtime-stability.md` Task 1
**Codex 指令**:

```
读取 docs/plans/backend/2026-04-25-plan-a-a1-runtime-stability.md 的 Task 1。
按步骤执行签名验证抽取（创建 src/lib/signature-verifiers/internal-execution.ts）。
```

---

## Tier 4 — 运维与扫尾

### Task 4.1: Clerk webhook 事件扩展

**子计划**: `backend/2026-04-26-plan-a-a3-error-loading-webhook.md` Task 2
**Codex 指令**:

```
读取 docs/plans/backend/2026-04-26-plan-a-a3-error-loading-webhook.md 的 Task 2。
扩展 Clerk webhook：加 user.updated + user.deleted handler。
```

### Task 4.2: 部署后 smoke 自动化

**Codex 指令**:

```
创建 .github/workflows/post-deploy-smoke.yml + scripts/smoke.ts。
smoke 检查：
- GET /api/health → 200
- GET / (首页) → 200
- GET /gallery → 200
- GET /studio → 200（未登录可达部分）
触发条件：deployment_status event 或 workflow_dispatch。
```

---

## Plan B 执行队列（Tier 1-4 完成后启动）

### B.1α-1: Intent Layer（数据层）

**子计划**: `roadmap/能力扩展/创作控制/2026-04-25-plan-b-b11-intent-layer.md`
**Codex 指令**:

```
读取 docs/plans/roadmap/能力扩展/创作控制/2026-04-25-plan-b-b11-intent-layer.md，
按 Task 顺序执行。
```

### B.1α-2: Prompt Compiler

**子计划**: `roadmap/能力扩展/创作控制/2026-04-25-plan-b-b12-prompt-compiler.md`

### B.1β-1: Generation Evaluator

**子计划**: `roadmap/能力扩展/创作控制/2026-04-25-plan-b-b14-generation-evaluator.md`

### B.1β-2: Studio UI 三件套

**子计划**: `roadmap/能力扩展/创作控制/2026-04-25-plan-b-b15-studio-ui.md`

### B.1γ-1: Recipe Persistence

**子计划**: `roadmap/能力扩展/创作控制/2026-04-25-plan-b-b16-recipe-persistence.md`

---

## 执行状态跟踪

| Task                        | 状态                | Codex PR | Review                |
| --------------------------- | ------------------- | -------- | --------------------- |
| 1.1 loading/error           | ✅ 已完成(此前实现) | —        | —                     |
| 1.2 Error Dialog            | ✅ 完成             | —        | PASS                  |
| 1.3 Free-tier 原子性        | ✅ 已完成(此前实现) | —        | —                     |
| 2.1 Sample prompt           | ✅ 完成             | —        | PASS                  |
| 2.2 Hero 瘦身               | ✅ 完成             | —        | PASS(修复后)          |
| 2.3 Onboarding              | ✅ 完成             | —        | PASS                  |
| 2.4 WF Shell Phase 6        | ✅ 完成             | Codex    | PASS                  |
| 3.1 user.service 测试       | ✅ 完成(19 tests)   | —        | PASS                  |
| 3.2 generation.service 测试 | ✅ 完成             | Codex    | PASS                  |
| 3.3 arena.service 测试      | ✅ 完成             | Codex    | PASS                  |
| 3.4 Card 体系测试           | ✅ 完成(已有+补充)  | Codex    | PASS                  |
| 3.5 社群 Service 测试       | ✅ 完成(已有+补充)  | Codex    | PASS                  |
| 3.6 签名验证抽取            | ✅ 已完成(此前实现) | —        | —                     |
| 4.1 Clerk webhook           | ✅ 完成             | Codex    | PASS (P2 fix applied) |
| 4.2 Smoke 自动化            | ✅ 完成             | Codex    | PASS (P2 fix applied) |
| fix: lint + review issues   | ✅ 完成             | Codex    | PASS (4 issues fixed) |
| B.1α-1 Intent Layer         | ⬜ 待 Plan A 完成   | —        | —                     |
| B.1α-2 Prompt Compiler      | ⬜ 待 Plan A 完成   | —        | —                     |
| B.1β-1 Evaluator            | ⬜ 待 B.1α          | —        | —                     |
| B.1β-2 Studio UI            | ⬜ 待 B.1α          | —        | —                     |
| B.1γ-1 Recipe               | ⬜ 待 B.1β          | —        | —                     |
