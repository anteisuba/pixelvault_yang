# Scene · 测试补齐 / 测试维护（testing.md）

> 覆盖：补测试、修失败测试、更新视觉基线、测试策略调整。测试**现状事实**见 `references/testing.md`（本 scene 是"怎么做"）。对应 checklist：`checklists/release.md`。

## 专属 5 问（开工硬门）

1. **补什么类型？覆盖对象清单？**——单元（service / hook / component）· route 五段 · e2e · 视觉基线，逐个列出要覆盖的文件与行为。
2. **现有测试格局？**——同目录已有哪些 `.test.ts(x)`？`src/test/api-helpers.ts` 能复用吗？**先跑一遍现状**确认起点红绿（别在红的基线上写新测试）。
3. **是补测试还是修测试？**——修失败测试前先定性：是测试过时（行为有意变了→测试跟上）还是**代码有 bug**（→停，转 `bugfix.md` 场景并报告 owner）。禁止为了让测试通过而改产品行为。
4. **涉及视觉基线吗？**——基线按 OS 分套（-win32/-darwin）；studio 基线依赖测试用户状态（mask 方案）；更新基线必须在报告里点名改了哪些快照、为什么。
5. **完成标准？**——必须覆盖的边界 case 清单（空/越权/失败路径/幂等）+ 全量 vitest 绿 + 不引入 flaky（新测试连跑两遍都稳才算数）。

## 本场景工作流

1. 问 5 问。
2. 读规矩：`references/testing.md` → 对应域的 `checklists/*.md`（P0 测试项就是验收清单）。
3. **先跑现状**：`npx vitest run <目标目录>` 确认红绿起点，把已红的先定性（第 3 问）。
4. 写测试：同目录放置 · route 走五段模式（401→400→mock→success→500）· Zod 用 `.safeParse()` 测有效/无效/边界 · 组件用 RTL 测交互不测实现细节。
5. 反 flaky：不依赖真实时序/网络/随机（mock 外部、固定 seed/时间）；测试间无共享可变状态。
6. 验证：全量 vitest（新测试连跑两遍）；涉及视觉的加 playwright 对应 spec。
7. 交付报告：新增/修改的测试清单 + 覆盖的边界 case + 全量结果 + （若更新基线）快照点名。

## 必读清单

`references/testing.md` · 对应域 `checklists/*.md` · `src/test/api-helpers.ts`（先看再造）

## 禁改范围默认值

**不为让测试通过而改产品行为**（发现行为 bug → 转 bugfix 问 owner）· 不删既有测试（要删说明理由）· 不加 `.skip`/`.only` 糊弄（临时 .only 提交前必须摘掉）· 测试 key 一次性 dev。

## 验证命令

`npx vitest run <目标>` ×2（稳定性）→ 全量 vitest → 视觉相关 `npx playwright test e2e/visual.spec.ts`（或 studio.visual / mobile 对应 spec）。
