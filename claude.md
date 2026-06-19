# CLAUDE.md — PixelVault

Personal AI Gallery — multi-model AI image generation + permanent archive.

**Stack**: Next.js 16 (App Router + Turbopack) · TypeScript · Clerk · Prisma 7 + PostgreSQL (Neon) · Cloudflare R2 · next-intl (en/ja/zh)
**AI Providers**: HuggingFace · Google Gemini · OpenAI

冲突时优先级：用户明确指令 > Hard Rules > Execution Discipline > 默认行为。

## Execution Discipline (项目特有，补充末尾通用准则)

- **Code is cheap** — 以未来版本的产品为基准行动，质量上限优先于完成速度。
- **先读再写** — 改之前先 grep exports 和调用方，避免重复实现。
- **匹配代码库约定** — 不要默默把 class 改 hooks，不要把现有模式换成你偏好的。
- **暴露冲突不要折中** — 代码库有两种模式时明确选一种，不要混在一起。
- **失败要大声暴露** — 不要"成功完成"但静默跳过部分记录；不确定性要 surface。
- **完成时必须报告** — 改了哪些文件 / 现在能做什么 / 做了什么验证。不要只说"已完成"。
- **命令输出按字节限制** — 输出未知大小的命令默认用 `COMMAND 2>&1 | head -c 4000`。
- **只把 LLM 用于判断型任务** — 路由、重试、状态码、确定性转换全交给代码。

## Agent Skills

Matt Pocock engineering skills are installed under `.claude/skills/` and can be
invoked directly by name, including `grill-with-docs`, `diagnosing-bugs`,
`tdd`, `to-prd`, `to-issues`, `triage`, and `improve-codebase-architecture`.

Use them as execution loops only. Project rules in this file, `AGENTS.md`,
`docs/README.md`, and `docs/engineering/agent-loops.md` still win. See
`docs/engineering/matt-pocock-skills.md` for the installed list and adapter
rules.

## Hard Rules

1. **No magic values** — 用 `src/constants/`，不要硬编码字符串/数字
2. **No `any`** — 用 Zod schema + `z.infer<typeof schema>`
3. **No fetch in components** — 所有 API 调用走 `src/lib/api-client.ts`
4. **API routes 三件事** — auth → Zod validate → call service
5. **No Tailwind arbitrary values** — 扩展 `tailwind.config.ts`
6. **Feature dev order** — constants → types → services → hooks → components
7. **Import order** — React/Next → 第三方 → 内部 constants/types → components/hooks → styles
8. **API key gates** — 缺 API key 时不要禁用 UI，路由到 `QuickSetupDialog` 让用户内联配置。见 `src/components/business/studio-shared/setup/QuickSetupDialog.tsx` JSDoc。

## Key Entry Points

| Path                       | Role                                             |
| -------------------------- | ------------------------------------------------ |
| `src/constants/`           | All config, enums, routes — **check here first** |
| `src/types/index.ts`       | Zod schemas + TypeScript types                   |
| `src/services/`            | Server-only business logic (DB, R2, AI)          |
| `src/hooks/`               | Client-side state management                     |
| `src/components/business/` | Stateful UI (uses hooks, no direct API)          |
| `src/components/ui/`       | Stateless shadcn primitives                      |
| `src/app/api/`             | API routes                                       |
| `src/messages/`            | i18n JSON (en/ja/zh — 三个必须同步)              |

## Naming

| Type           | Convention            | Example                 |
| -------------- | --------------------- | ----------------------- |
| Component      | PascalCase            | `ImageCard.tsx`         |
| Hook           | camelCase + `use`     | `useGenerateImage.ts`   |
| Service        | camelCase + `Service` | `generation.service.ts` |
| Constant       | SCREAMING_SNAKE       | `AI_MODELS`, `ROUTES`   |
| Type/Interface | PascalCase            | `GenerateRequest`       |

## Resilience Utilities

| Utility         | Path                                  | When to use                               |
| --------------- | ------------------------------------- | ----------------------------------------- |
| Logger          | `src/lib/logger.ts`                   | 所有 service 日志，不要用 `console.log`   |
| Retry           | `src/lib/with-retry.ts`               | 包裹所有外部 API 调用                     |
| Circuit Breaker | `src/lib/circuit-breaker.ts`          | Per-provider 防止级联失败                 |
| Prompt Guard    | `src/services/kernel/prompt-guard.ts` | 校验用户 prompt 再发给 AI                 |
| LLM Validator   | `src/lib/llm-output-validator.ts`     | 校验 LLM 输出（prompt 增强、recipe 融合） |

## Design Language

UI 任务**必读** [`docs/design/`](docs/design/README.md)：`system/` 是全局 CSS/token/布局的现状事实，`pages/` 是各页面现状事实，`reviews/` 是 UI 审查报告（最新：[`reviews/2026-06-11-ui-audit-pass1-code.md`](docs/design/reviews/2026-06-11-ui-audit-pass1-code.md)）。

方向文档：[`docs/design/direction.md`](docs/design/direction.md)（主基调 v1 **已确认**，2026-06-11：双面模式 / 无彩反相 CTA / 落地顺序，含按面参考集）。`system/`、`pages/` 是现状快照而非方向；页面 `Target` 段为空时以 direction.md 为准，再有缺口先停下来问用户。

**Anti-slop 红线**：禁止紫蓝渐变、霓虹光晕、玻璃形态滥用、过度 hero 空白、深色科技蓝光风、随意动效。Motion 只在澄清状态/连续性/反馈时使用，不做装饰。

## Testing

**Framework**: Vitest + @testing-library/react · 助手在 `src/test/api-helpers.ts`

- 新增/修改功能必须有对应 `.test.ts(x)`，与源文件同目录
- 写完代码自动跑 `npx vitest run --reporter=verbose`
- API route 必测：auth(401) → validation(400) → service mock → success → error(500)
- Service / Hook / Component 分别测：业务逻辑边界 / 状态变化与 API mock / 渲染与交互
- Zod schema 用 `.safeParse()`（不要 `.parse()`），测有效/无效/边界

E2E / 视觉回归 / API key 测试准备见 [`docs/development/testing.md`](docs/development/testing.md)。**视觉基线按 OS 分套**（`-win32`/`-darwin`/`-linux`，Playwright 自动选）——本项目 Mac + PC 双机开发,换到 Mac 要先 `--update-snapshots` 生成 darwin 那套;**studio 基线依赖测试用户状态**(含 mask 方案)。测试用 key 必须是一次性/dev 实例,**严禁用生产 key**。

## Change Safety — High-Risk Modules

改这些前先 `grep -r "import.*from.*<模块>" src/` 确认影响范围；被引用 >5 处只做向后兼容修改：

- `src/types/index.ts` — 333 files (see `src/types/CLAUDE.md`)
- `src/services/user.service.ts` — 141 files
- `src/services/image/generate-image.service.ts` — orchestrator, 8+ deps
- `src/contexts/studio-context.tsx` — 47 files (see `src/contexts/CLAUDE.md`)
- `src/constants/models.ts` — 99 files (see `src/constants/CLAUDE.md`)
- `src/services/storage/r2.ts` — 55 importers

Per-directory CLAUDE.md 存在于：`types/`、`contexts/`、`components/business/studio/`、`hooks/`、`constants/`、`services/`、`app/api/`、`prisma/`。

## Common Pitfalls

1. **加模型** — 必须同步：`AI_MODELS` enum + 模型配置 + i18n (3 files) + provider adapter
2. **Service 文件** — 必须 `import 'server-only'` 开头
3. **Prompt** — 调 AI 前用 `prompt-guard.ts` 校验
4. **LLM 输出** — 用前用 `llm-output-validator.ts` 校验
5. **外部调用** — 用 `withRetry()` 包裹
6. **API route 里的 Zod** — `.safeParse()` 不要 `.parse()`

## Security

- `NEXT_PUBLIC_` 只用于 Clerk public key、CDN domain、App URL
- API route 必须先 `auth()` from Clerk
- Credit 扣减逻辑只能跑在服务端

## Dev Server

- 端口 3000（`npm run dev`）
- **不要 kill 已经在跑的 dev server** — 3000 被占假设是用户开的，直接复用
- 只在 3000 没有任何监听时才启动新的

## Docs

文档导航见 [`docs/README.md`](docs/README.md)。Studio 改动前必读 [`docs/domains/studio.md`](docs/domains/studio.md)。

## Skill Routing

匹配到 skill 时必须用 Skill tool 调用：

- 产品创意 / 是否值得做 → `office-hours`
- Bug / 500 / "怎么坏了" → `investigate`
- Ship / deploy / PR → `ship`
- QA / find bugs → `qa`
- Code review → `review`
- 文档更新 → `document-release`
- Weekly retro → `retro`
- Architecture review → `plan-eng-review`
- Save/resume progress → `context-save` / `context-restore`
- Code health → `health`

### UI / 设计任务路由

任何 UI 改动前先读 `docs/design/README.md` 与最新 `docs/design/reviews/` 审查报告。然后按任务类型选 skill：

- **首页 / Landing / 视觉升级 / 反 AI-slop** → `Taste Skill`（外部安装，见下）
- **生产级产品 UI 实现** → `frontend-design`（Anthropic plugin via `/plugin`）
- **全站 UX 审查（按钮 / 表单 / 卡片 / 响应式 / a11y / 动效）** → `ui-ux-pro-max-skill`
- **设计系统一致性 / token 治理** → `hue design-system`
- **Plan-stage 设计评审（写代码前）** → `plan-design-review`（gstack 内置）
- **Live 视觉审计（部署后）** → `design-review`（gstack 内置）

**外部 skill 安装**（用户需要手动跑一次）：

```bash
# Taste Skill
npx skills add Leonxlnx/taste-skill
# Anthropic frontend-design — Claude Code 里跑：/plugin → marketplace → anthropics/claude-code
# ui-ux-pro-max / hue — 同样通过 /plugin 安装
```

**UI 工作流契约**（与 [[feedback-design-first]] memory 一致）：

1. 审查（audit only，不改代码）→ 输出问题清单 + 文件路径 + 严重程度 + 修复方案
2. 非琐碎改动先出 Figma 改动清单，等设计稿
3. 拿到设计稿后用 `mcp__figma__get_design_context` 拉参考代码
4. 一次只改一个页面/组件
5. 跑 `npm run lint && npm run build && npx playwright test e2e/mobile.spec.ts --project=mobile`
6. UI-only 任务**不动** `src/app/api/**`、`prisma/**`、`src/services/**`、Clerk 配线、credit/billing — 需要时停下来 surface 冲突

**UI 确认阶梯**（每次优化/修改 UI 后**逐项**走一遍并在完成报告里逐条说明结果，不要只截图"看一眼"）：

1. **机械检查** — `npm run lint && npm run build` 通过（绿才继续）。
2. **视觉回归** — 跑 `npx playwright test e2e/visual.spec.ts`，截图 diff 必须为空；有意改动则更新基线 `--update-snapshots` 并在报告里点名改了哪些快照。截图不是替代品。
3. **token / a11y / 响应式断言** — 改动涉及间距、颜色、断点、触达区、role 时，用 `toHaveCSS` / `toHaveClass` / `getByRole` 断言**具体值**（呼应 Hard Rule 5「No arbitrary values」与 44px 触达区）。
4. **Figma 对比** — 有设计稿时用 `mcp__figma__get_design_context` / `get_screenshot` 拉源并与渲染结果并排核对，差异要么修要么记。
5. **交互验证** — hover / focus / loading / 空态 / 报错态 / 键盘导航 用 `verify` skill 或 Chrome MCP 实跑一遍；静态截图看不出这些。

机械步骤（1、2）可跑可断言；判断步骤（3-5）靠 agent 执行，**每一项都要在报告里给出结论**，跳过哪项要写明原因。

---

# General Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
