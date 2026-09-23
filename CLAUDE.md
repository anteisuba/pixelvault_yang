# CLAUDE.md — PixelVault

Personal AI Gallery — multi-model AI 生成（图/视频/音频/3D）+ 永久归档。

**Stack**: Next.js 16 (App Router + Turbopack) · TypeScript · Clerk · Prisma 7 + PostgreSQL (Neon) · Cloudflare R2 · next-intl (en/ja/zh)
**AI Providers**: 多 adapter 架构——**名册与个数一律以 `src/services/providers/registry.ts` 的 `PROVIDER_ADAPTERS` 为准**，接入契约与逐 provider 现状见 `docs/references/providers.md`

任务授权与流程以 `AGENTS.md` 和 `docs/WORKFLOW.md` 为准；本文件补充代码约束和目录入口，客户端专属工具说明只适用于该客户端。

**语言**：对话默认用中文回复（代码标识符、文件路径、专有名词保留英文）。

## 任务入口（必读）

按 [WORKFLOW](docs/WORKFLOW.md) 选择最小 scene/业务域阅读集与验证。问题先从已有上下文和代码回答，缺少实质决策时才问 owner。代码修改前读 `docs/forbidden.md` 的相关节。

## 工程原则

共享原则只维护在 [AGENTS.md](AGENTS.md)：最小端到端切片、现有依赖优先、模块边界、删除过时实现和授权范围。

## Hard Rules

1. **业务常量** — 模型 ID、配置与重复业务值复用 `src/constants/`；不为局部无歧义字面量制造常量层
2. **No `any`** — 用 Zod schema + `z.infer<typeof schema>`
3. **No fetch in components** — 所有 API 调用走 `src/lib/api-client.ts`
4. **API routes 三件事** — auth → Zod validate → call service（优先走 `src/lib/api-route-factory.ts`）
5. **No Tailwind arbitrary values** — 扩展 `globals.css` 的 `@theme inline`（Tailwind 4，项目无 tailwind.config.ts）
6. **分层实现** — 沿依赖关系贯通 constants/types → services → hooks → components；只修改当前切片需要的层
7. **Import order** — React/Next → 第三方 → 内部 constants/types → components/hooks → styles
8. **API key gates** — 缺 API key 时不禁用 UI，路由到 `QuickSetupDialog` 内联配置

## Key Entry Points

| Path                       | Role                                                  |
| -------------------------- | ----------------------------------------------------- |
| `src/constants/`           | All config, enums, routes — **check here first**      |
| `src/types/index.ts`       | Zod schemas + TypeScript types                        |
| `src/services/`            | Server-only business logic（唯一碰 DB/外部 API 的层） |
| `src/hooks/`               | Client-side state management                          |
| `src/components/business/` | Stateful UI (uses hooks, no direct API)               |
| `src/components/ui/`       | Stateless shadcn primitives                           |
| `src/app/api/`             | API routes（工厂式）                                  |
| `src/messages/`            | i18n JSON (en/ja/zh — 三个必须同步)                   |

命名：Component=PascalCase · Hook=`use`+camelCase · Service=`<name>.service.ts` · Constant=SCREAMING_SNAKE。Resilience 工具清单（logger/withRetry/breaker/prompt-guard/llm-output-validator）见 `docs/references/backend.md`。

## Change Safety — High-Risk Modules

改这些前先用 `rg` 搜索模块的导入与调用方，确认影响范围。**grep 的目的是把所有调用方在同一个改动里一起改完**，不是给旧签名留垫片（见 AGENTS.md 工程原则）：

- `src/types/index.ts`（see `src/types/CLAUDE.md`）
- `src/services/user.service.ts`
- `src/services/image/generate-image.service.ts` — 路由解析 + 上传模块（不是 orchestrator；provider 调用走 execution worker）
- `src/contexts/studio-context.tsx`（see `src/contexts/CLAUDE.md`）
- `src/constants/models.ts`（see `src/constants/CLAUDE.md`）
- `src/services/storage/r2.ts`

Per-directory CLAUDE.md 存在于：`types/`、`contexts/`、`components/business/studio/`、`components/business/node/`、`hooks/`、`constants/`、`services/`、`app/api/`、`prisma/`（以 `find src prisma -name CLAUDE.md` 为准）。

## Security

- `NEXT_PUBLIC_` 只用于 Clerk public key、CDN domain、App URL
- API route 必须先 `auth()` from Clerk；ownership 服务端校验
- Credit 扣减逻辑只能跑在服务端

## Dev Server

- 端口 3000（`npm run dev`）；**不要 kill 已在跑的 dev server**，3000 被占 = 用户开的，直接复用
- **owner 已开 dev 时绝不另起实例**（双实例毁 .next）；需要 dev server 日志直接向 owner 要
- UI 实跑/目检使用当前会话可用且能访问该 URL/登录态的浏览器工具；不可用时报告缺口，不假定另一客户端工具可调用
- dev 跑着时不并行 build

## Design / Testing / Ship（指针）

- **UI 任务（现行设计治理）**：**动任何 UI 先读 `docs/references/ui-defaults.md`（字体三槽 / 颜色脊柱 / 动效配方 / 移动端配方 / 8 项完成定义）**；日常 UI 任务可用 `docs/templates/ui-request.md` 核对移动端与交互，已有上下文足够时不重复填卡。改版级再读 `docs/brand-dna.md`，按 `docs/scenes/ui-page.md`（或 ui-marketing.md）进入对应业务域，并过 `docs/checklists/ui.md`。改版必须先完成域定义 → 三方向 → 关键切片 → owner 确认，之后才实现。全局只统一薄品牌脊柱、行为与品质底线；旧方向、当前页面和共享组件皮肤均不能充当新设计答案。
- **demo / 原型是例外**：探索阶段的原型**不受**上述任何设计文档约束——`brand-dna.md`、`forbidden.md`、`docs/references/pages/*`、现有 token 体系、现有页面皮肤全部不适用，可以换配色、换字体、换材质、换整个视觉世界。闸门只管**要合入 `src/` 的代码**。理由：沿用现有令牌的原型看不出新东西，约束会抵消探索的价值。同一轮宁可并排给几个视觉世界，也别只给一个安全版本。
- **测试**：策略与闸门见 `docs/references/testing.md`；按 WORKFLOW 的影响面选择定向或全量检查并准确报告；视觉基线按 OS 分套；测试 key 一次性 dev 实例。
- **Commit / Push**：规则见 `docs/WORKFLOW.md`——owner 点头才提交；push main = 生产部署，先过 `docs/checklists/release.md`。
- **CI/CD 与部署状态查询**：`docs/references/cicd.md`（gh CLI + Vercel MCP 操作手册）。

## Docs

文档导航 [`docs/README.md`](docs/README.md)；常驻结论全在 `docs/references/`。

仓库没有归档目录，也没有在飞任务包目录（不建 `docs/archive/`、`docs/plans/`）：历史证据从 git 历史取，在飞约束留在对话里，结论直接沉淀进 `references/` 对应文档。

## Skill Routing

按当前客户端实际可用的技能选择，不因关键词把整套技能串联起来。Codex 从 `.agents/skills/` 发现，Claude Code 从 `.claude/skills/` 发现；缺少快捷工具时可读取实际存在的 SKILL.md，不虚构调用成功。

- Bug：`debug-pixelvault-runtime`（Codex 项目入口）或 `diagnosing-bugs`（复杂诊断）。
- UI：由 `docs/scenes/ui-page.md` / `ui-marketing.md` 选择设计、审计或打磨技能。
- 测试：用户要求测试先行时用 `tdd`；需要全量闸门时 Claude Code 可用 `full-gate`。
- 文档：Codex 用 `sync-pixelvault-docs`；其他客户端遵循 WORKFLOW 文档同步节。
- OpenCLI：仅在实际使用时读 `opencli-usage`，再按需进入浏览器或 adapter 技能。

动画库：app 内部只用 `motion`（从 `motion/react` 引入；`framer-motion` 被 eslint 拦截）；GSAP 仅用于首页营销域且动态导入。GSAP 技能的推荐不覆盖此边界。
