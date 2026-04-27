# Claude Code 规划工作流

## 目的

固定 Claude Code 在本仓库中的职责边界：**只做规划与文档，不改代码**。代码修改与 review 全部交给 Codex。

这份文档是长期规范，和 `codex-thread-operating-model.md`、`codex-development-workflow.md` 配套使用。

---

## 核心原则

本项目在 Codex 四线程（`规范` / `探索` / `前端` / `后端`）之上，引入一条**规划侧外脑**：Claude Code。

角色分工：

| 角色                  | 主要职责                                                                | 产出落点                                                                  |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Claude Code           | 规范沉淀、任务理解与拆解、计划制定、Codex 实现后的独立 review、地图回流 | `docs/guides/*`、`docs/plans/*`、`01/02/03/04/05` 映射与清单、`AGENTS.md` |
| Codex `前端` / `后端` | 按任务包执行代码修改，自审                                              | `src/**` diff、测试、必要的自审记录                                       |
| Codex `探索`（可选）  | 跨层 review 第二意见                                                    | 直接回写对应 plan 文档的 review 段落                                      |

Claude Code **永远不直接修改 `src/**`、`prisma/**`、`scripts/**`、`e2e/**` 等代码路径**。如果发现需要改代码，产出任务包，交 Codex。

---

## 角色边界

### Claude Code 允许产出

- `docs/guides/**` 新建或更新长期规范
- `docs/plans/**` 新建或更新计划、任务包、review 结论
- `docs/plans/ui/**`、`docs/plans/feature/**`、`docs/plans/qa/functional/**`、`docs/plans/qa/ui/**` 现状映射与工作包的回流更新
- `docs/plans/roadmap/**` 未来规划归档
- `AGENTS.md`、`claude.md`、`CLAUDE.md`、顶层 `README*.md`、`WBS-*.md` 中与协作规则、任务组织相关的条目
- `.claude/settings.local.json` 里的权限与钩子元配置

### Claude Code 不允许做

- 直接写或改 `src/**`、`prisma/**`、`scripts/**`、`e2e/**`、`apps/**`、`components/**`、`public/**`、`.github/workflows/**`
- 改顶层构建 / 依赖配置：`package.json`、`package-lock.json`、`pnpm-lock.yaml`、`next.config.ts`、`tsconfig*.json`、`tailwind.config.ts`、`eslint.config.mjs`、`playwright.config.ts`、`postcss.config.mjs`、`vitest.config.ts`、`vitest.setup.ts`、`instrumentation*.ts`、`middleware.ts`、`components.json`、`.husky/**`
- 跑会改仓库状态的命令：`git commit`、`git push`、`git reset --hard`、`rm -rf` 代码路径等。只读命令（`git status`、`git diff`、`git log`、`npx tsc --noEmit`、`npm run lint`、`npx vitest run`）允许用来判断状态

这些边界通过 `.claude/settings.local.json` 的 `permissions.deny` 硬锁，不依赖 prompt 自律。

---

## 任务分流

不是所有改动都要走 Claude Code 规划线。进来一个请求时，先判断归类：

### 直接交给 Codex（Claude Code 不介入）

- 打字错误、单条文案修正
- 不跨层、不碰高风险文件、预期 diff 小于 ~10 行
- 纯重命名、import 排序、prettier 整理
- Codex 已经有明确计划的纯执行步骤

这类任务由用户直接在 Codex 线程发指令即可，Claude Code 不产任务包。

### 必须走 Claude Code 规划线

- 新功能、新能力线
- 跨层改动（前端 + 后端）
- 碰到 `src/types/index.ts`、`src/contexts/studio-context.tsx`、`src/services/generate-image.service.ts`、`src/constants/models.ts`、`src/services/storage/r2.ts` 等高风险文件
- 改变架构模式、数据流、权限边界
- 任何会让 `01/02/03/04` 的现状映射产生结构性变化的改动
- 用户明确说要"先规划"

### 边界情况

中等复杂度但不清晰的任务，默认走规划线；与其走短路径又返工，不如多一轮任务包。

---

## 标准工作流

### 1. 任务归类

先按 codex-development-workflow.md 第 3 节的分类：UI / 功能 / 功能测试 / UI 测试 / 跨层。

### 2. 读地图

按归类优先读：

- UI：`docs/plans/ui/02-現狀映射.md` + `docs/plans/qa/ui/02-現狀映射.md`
- 功能：`docs/plans/feature/02-現狀映射.md` + `docs/plans/qa/functional/02-現狀映射.md`
- 跨层：四者都读，只聚焦相关条目

**不要默认重读整个仓库。** 只有任务是全局复盘、或者明显感觉地图已经落后于代码时，才扩大阅读范围。

### 3. 代码切片只读

Claude Code 读 `src/**` 是允许的，只是不能写。读取范围限定在本次任务相关的：

- 目标路由 / 组件 / hook / service
- 对应测试
- 同目录 `CLAUDE.md`

### 4. 制定任务包

任务包是 Claude Code 到 Codex 的唯一 handoff 格式。见下节模板。每份任务包应该能被单独复制到 Codex 对话的第一条 prompt 里而不需要额外上下文补充。

### 5. Codex 执行

用户把任务包交给对应的 Codex 线程（前端 / 后端）。Codex 按 plan 模式实现、自审、commit。Claude Code 此时**不介入**，等 Codex 完成信号。

### 6. Claude Code 独立 review

Codex 完成后，Claude Code 拉 `git diff`（只读），对照任务包的"允许修改的文件范围 / 完成定义"做独立 review。重点找：

- 是否有越界修改
- 是否违反 `AGENTS.md` 的分层约束
- 是否漏测 / 漏 i18n / 漏空态
- 是否动到任务包外的高风险文件

结论写回同一份 plan 文档的"Review & 回流"段落。

### 7. 回流到地图

如果改动改变了页面 / 能力域 / 测试域的结构，Claude Code 同步更新：

- 对应的 `0X-現狀映射.md` 条目
- 相关 `0X-工作包細分.md` 或实作清单
- 必要时更新 `docs/guides/**` 或 `AGENTS.md`

回流不做就视为任务没真正完成，哪怕 CI 是绿的。

---

## 任务包模板

每份 plan 文档尾部必须挂一个"Codex 执行包"段落，格式固定：

```md
## Codex 执行包

- **Goal**：一句话说清要完成什么
- **Non-goals**：明确不做的事，避免范围漂移
- **对应地图**：01-UI 1.x.x / 02-功能 2.x.x / 03-功能測試 3.x.x / 04-UI測試 4.x.x
- **涉及层**：前端 / 后端 / 跨层
- **Related plan**：docs/plans/... 或 `none`
- **Plan status before execution**：active / stale / none
- **Last verified commit**：`<git sha>`，没有则写 `unverified`
- **Required sync check**：`git diff --name-only <last-verified-commit>..HEAD -- <code areas>`
- **Read first**：
  - AGENTS.md §相关小节
  - docs/guides/相关 guide
  - docs/guides/plan-synchronization-workflow.md
  - docs/plans/本计划文档
  - 代码切片清单（绝对路径）
- **允许修改的文件范围**：
  - 列出白名单路径，不在列表里的默认不改
- **禁止修改**：
  - 高风险文件如 `src/types/index.ts` 等如本次不在 scope，写进禁止
- **验证命令**：
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npx vitest run <范围>`
  - 必要时 `npm run build`
- **完成定义**：
  - 功能可观测的断言清单
  - 测试通过
  - 地图回流位置（留给 Claude Code）
```

任务包写完后，在计划文档的"回流位置"段落预留 Claude Code 在第 7 步要更新的地图条目清单。

---

## Review 工作流

Claude Code 做 review 时，输入至少包含：

- 任务包
- 对应计划文档
- 对应 `01/02/03/04` 条目
- `git diff` 当前 PR / commit 范围

优先检查顺序：

1. **边界**：有没有超出任务包"允许修改的文件范围"
2. **架构**：是否把逻辑塞进 route / component、是否引入第二种架构模式
3. **类型与 schema**：是否用 `any`、是否绕过 Zod
4. **安全**：auth / ownership / credits / provider fallback 是否被破坏
5. **i18n**：新用户可见文案是否三语齐、是否 translation-ready
6. **测试**：改动是否有对应测试、是否更新了已有测试
7. **地图**：`01/02/03/04` 是否需要更新

review 结论分三类写回 plan 文档：

- `Pass`：可以合并，记录地图回流清单
- `Pass with follow-up`：可合并，但列出必须在下一个任务包跟进的项
- `Needs rework`：点名问题，Codex 重做后再 review

---

## 一句话纪律

Claude Code 负责理解、拆解、规范、回流；Codex 负责写代码、review diff。

代码改动必须先有任务包，任务包必须指向 `01/02/03/04`。

Codex 跑完不等于完成，Claude Code review 过且地图回流才算完成。

越界就是故障，不是便利。
