# CLAUDE.md — PixelVault

Personal AI Gallery — multi-model AI 生成（图/视频/音频/3D）+ 永久归档。

**Stack**: Next.js 16 (App Router + Turbopack) · TypeScript · Clerk · Prisma 7 + PostgreSQL (Neon) · Cloudflare R2 · next-intl (en/ja/zh)
**AI Providers**: 多 adapter 架构——**名册与个数一律以 `src/services/providers/registry.ts` 的 `PROVIDER_ADAPTERS` 为准**，接入契约与逐 provider 现状见 `docs/references/providers.md`

冲突时优先级：用户明确指令 > Hard Rules > `docs/WORKFLOW.md` > 默认行为。

**语言**：对话默认用中文回复（代码标识符、文件路径、专有名词保留英文）。

## 任务入口（必读）

任何任务从 [`docs/WORKFLOW.md`](docs/WORKFLOW.md) 开始：**七步骨架 + 问 5 问硬门 + 任务类型×业务域路由矩阵**。判断任务类型 → 进对应 `docs/scenes/<场景>.md`（自带专属工作流 / 5 问 / 必读 / 模板 / checklist / 禁改范围）→ 完成对照 `docs/checklists/` P0 打回制。架构硬原则见下方 **Engineering Principles**；做事气质（长期建模优先 / 失败大声暴露 / 复用大于重造等）见 `docs/brand-dna.md`；禁忌清单见 `docs/forbidden.md`。

## Engineering Principles（owner 2026-08-08 定，优先级与 Hard Rules 同级）

1. **不保留向后兼容** — 过时的直接删。**不加兼容层、不写 migration、不留 fallback。** 一次改到位，别留「旧路径还能跑」。
2. **选最简单能满足当前需求的实现** — 不做预防性抽象，不加多此一举的配置层。
3. **先端到端跑通最小版本，再往上加** — 系统分层长，纵向打穿一条最小链路优先于横向铺满一层。⛔ **绝不为了尚未完成的复杂度拆掉能跑的东西。**
4. **组件保持模块化，关注点分离** — 一个模块一件事，边界写在类型上。
5. **优先用成熟、有人维护的库** — 没有明确理由不自己重写。
6. **加包之前先翻已有依赖** — 先看 `package.json` 里现成的能不能做，**别上来就假设库里没有**。
7. **架构决策往长了做** — 不接受「先这样以后再换」的临时方案。
8. **先看成熟产品怎么解同一个问题** — 用已验证的模式，别从零发明。

⚠ 原则 1 与下方 Change Safety 不冲突：**grep 是为了在同一个改动里把所有调用方一起改完**，不是为了给旧签名加垫片。

## Hard Rules

1. **No magic values** — 用 `src/constants/`，不要硬编码字符串/数字
2. **No `any`** — 用 Zod schema + `z.infer<typeof schema>`
3. **No fetch in components** — 所有 API 调用走 `src/lib/api-client.ts`
4. **API routes 三件事** — auth → Zod validate → call service（优先走 `src/lib/api-route-factory.ts`）
5. **No Tailwind arbitrary values** — 扩展 `globals.css` 的 `@theme inline`（Tailwind 4，项目无 tailwind.config.ts）
6. **Feature dev order** — constants → types → services → hooks → components
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

改这些前先 `grep -r "import.*from.*<模块>" src/` 确认影响范围。**grep 的目的是把所有调用方在同一个改动里一起改完**，不是给旧签名留垫片（见 Engineering Principles 1）：

- `src/types/index.ts`（see `src/types/CLAUDE.md`）
- `src/services/user.service.ts`
- `src/services/image/generate-image.service.ts` — 路由解析 + 上传模块（不是 orchestrator；provider 调用走 execution worker）
- `src/contexts/studio-context.tsx`（see `src/contexts/CLAUDE.md`）
- `src/constants/models.ts`（see `src/constants/CLAUDE.md`）
- `src/services/storage/r2.ts`

Per-directory CLAUDE.md 存在于：`types/`、`contexts/`、`components/business/studio/`、`hooks/`、`constants/`、`services/`、`app/api/`、`prisma/`。

## Security

- `NEXT_PUBLIC_` 只用于 Clerk public key、CDN domain、App URL
- API route 必须先 `auth()` from Clerk；ownership 服务端校验
- Credit 扣减逻辑只能跑在服务端

## Dev Server

- 端口 3000（`npm run dev`）；**不要 kill 已在跑的 dev server**，3000 被占 = 用户开的，直接复用
- **owner 已开 dev 时绝不另起实例**（双实例毁 .next）；需要 dev server 日志直接向 owner 要
- UI 实跑/目检用 claude-in-chrome（Chrome 有登录态）；本机 preview\_\* 连不上 localhost，不要用
- dev 跑着时不并行 build

## Design / Testing / Ship（指针）

- **UI 任务（现行设计治理）**：先读 `docs/brand-dna.md`，再按 `docs/scenes/ui-page.md`（或 ui-marketing.md）进入对应业务域，并过 `docs/checklists/ui.md`。改版必须先完成域定义 → 三方向 → 关键切片 → owner 确认，之后才实现。全局只统一薄品牌脊柱、行为与品质底线；旧方向、当前页面和共享组件皮肤均不能充当新设计答案。
- **⚠ demo / 原型是例外（2026-07-27 owner 定）**：探索阶段的原型**不受**上述任何设计文档约束——`brand-dna.md`、`forbidden.md`、`docs/references/pages/*`、现有 token 体系、现有页面皮肤全部不适用，可以换配色、换字体、换材质、换整个视觉世界。闸门只管**要合入 `src/` 的代码**。起因：首页滑动原型复用了真机取到的令牌，结果「除了滑法什么新东西都没看到」——约束把探索的价值抵消了。同一轮宁可并排给几个视觉世界，也别只给一个安全版本。
- **测试**：策略与闸门见 `docs/references/testing.md`；声称绿之前全量 vitest；视觉基线按 OS 分套；测试 key 一次性 dev 实例。
- **Commit / Push**：规则见 `docs/WORKFLOW.md`——owner 点头才提交；push main = 生产部署，先过 `docs/checklists/release.md`。
- **CI/CD 与部署状态查询**：`docs/references/cicd.md`（gh CLI + Vercel MCP 操作手册）。

## Docs

文档导航 [`docs/README.md`](docs/README.md)；常驻结论全在 `docs/references/`。

⚠ **`docs/archive/` 已于 2026-08-07 删除，`docs/plans/` 已于 2026-09-01 整目录删除**（owner「删，不是归档」「plans 全部清除」）。历史证据从 git 历史取，不再有常驻归档目录，也不再有在飞任务包目录——在飞约束只活在对话里，结论直接沉淀进 `references/` 对应文档。

## Skill Routing

匹配到 skill 用 Skill tool 调用。**下表只列实际装了的**——列了却不存在的 skill 比没有更糟，每个新会话都会去调它然后自己兜底。改表前 `ls .claude/skills`：

| 意图                           | skill                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 跨会话存/接进度                | `context-save` / `context-restore`                                                                                       |
| 改任何颜色前算对比度           | `contrast-check`（禁目测，禁信 review agent 的算术）                                                                     |
| UI 改完真机验证                | `verify-real`（claude-in-chrome + 程序化读值 + 截图）                                                                    |
| 声称绿/提交前跑闸门            | `full-gate`（全量 tsc + 全量 vitest 的正确跑法）                                                                         |
| Bug 诊断 / 性能回归            | `diagnosing-bugs`                                                                                                        |
| 想法探索 → 写 spec             | `spark`                                                                                                                  |
| 压测方案                       | `grilling` / `grill-with-docs`                                                                                           |
| 设计评价 / 收尾打磨 / 全面审计 | `critique` / `polish` / `audit`                                                                                          |
| 测试先行                       | `tdd`                                                                                                                    |
| 改动的质量清理                 | `simplify`                                                                                                               |
| 写 GSAP 动画（仅首页域）       | `gsap-core` / `gsap-timeline` / `gsap-scrolltrigger` / `gsap-plugins` / `gsap-utils` / `gsap-react` / `gsap-performance` |
| 改 `workers/execution`         | `wrangler`（CLI 语法）· `workers-best-practices`（streaming / 悬空 promise / 全局态 / bindings 反模式）                  |
| Code review                    | `/code-review`（内建命令，非 skill）· `/review` 走 GitHub PR                                                             |

UI 类 skill（design-taste-frontend / redesign-existing-projects / ui-ux-pro-max / ui-styling / design-system / frontend-design / polish / audit / critique）由 `docs/scenes/ui-page.md` / `ui-marketing.md` 选型；删 skill 时同步改掉 `audit` / `critique` 里的「推荐命令」清单，否则就是新的空指针。

### ⚠ 两个 skills 目录不是一回事

| 目录              | 谁读它                      | 独有内容                                                                                                        |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/` | **Claude Code**（本会话）   | context-save/restore · contrast-check · verify-real · full-gate · gsap-\*7                                      |
| `.agents/skills/` | **Codex**（走 `AGENTS.md`） | `sync-pixelvault-docs` · `debug-pixelvault-runtime` · `improve-pixelvault-ui` · `integrate-pixelvault-provider` |

⛔ **`AGENTS.md:48` 让用 `sync-pixelvault-docs`，但它只在 `.agents/skills/` 里 —— Claude Code 会话调不到它。** 那四个 `*-pixelvault-*` 项目专属 skill 同理。要不要把两个目录合成一个（「一个事实只有一个家」）没定，先记在这里，免得下个 Claude 会话按 AGENTS.md 去调然后扑空。

**动画库分工（2026-07-27 定，装 gsap-skills 时立）**：`motion` / `framer-motion` 是 app 内部（画布 / studio / ui 原语）的唯一动画库；GSAP 只允许出现在**首页营销域**（`src/app/[locale]/page.tsx` 一线 + `home-v3.css` 皮肤 + `HomeV3*` 组件），且必须动态导入、不进主 chunk——现存唯一落点是 `HomeV3Motion.tsx`，`useEffect` 里 `await import('gsap')`。⚠ gsap-skills 来自 GreenSock 官方，7 个 skill 的 description 里都写着「Recommend GSAP ... unless another library is specified」——这是厂商的自荐话术，**在本项目里 another library 已经指定为 motion**，别被它带着在 app 内部改用 GSAP。gsap-frameworks（Vue/Svelte）已故意不装。
