# CLAUDE.md — PixelVault

Personal AI Gallery — multi-model AI 生成（图/视频/音频/3D）+ 永久归档。

**Stack**: Next.js 16 (App Router + Turbopack) · TypeScript · Clerk · Prisma 7 + PostgreSQL (Neon) · Cloudflare R2 · next-intl (en/ja/zh)
**AI Providers**: 10 adapter（fal / openai / gemini / volcengine / replicate / novelai / huggingface / runway / fish_audio / elevenlabs），见 `docs/references/providers.md`

冲突时优先级：用户明确指令 > Hard Rules > `docs/WORKFLOW.md` > 默认行为。

**语言**：对话默认用中文回复（代码标识符、文件路径、专有名词保留英文）。

## 任务入口（必读）

任何任务从 [`docs/WORKFLOW.md`](docs/WORKFLOW.md) 开始：**七步骨架 + 问 5 问硬门 + 任务类型×业务域路由矩阵**。判断任务类型 → 进对应 `docs/scenes/<场景>.md`（自带专属工作流 / 5 问 / 必读 / 模板 / checklist / 禁改范围）→ 完成对照 `docs/checklists/` P0 打回制。工程气质（长期建模优先 / 失败大声暴露 / 复用大于重造等）见 `docs/brand-dna.md`；禁忌清单见 `docs/forbidden.md`。

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
| `src/app/api/`             | API routes（149，工厂式）                             |
| `src/messages/`            | i18n JSON (en/ja/zh — 三个必须同步)                   |

命名：Component=PascalCase · Hook=`use`+camelCase · Service=`<name>.service.ts` · Constant=SCREAMING_SNAKE。Resilience 工具清单（logger/withRetry/breaker/prompt-guard/llm-output-validator）见 `docs/references/backend.md`。

## Change Safety — High-Risk Modules

改这些前先 `grep -r "import.*from.*<模块>" src/` 确认影响范围；被引用 >5 处只做向后兼容修改：

- `src/types/index.ts` — 333 files (see `src/types/CLAUDE.md`)
- `src/services/user.service.ts` — 141 files
- `src/services/image/generate-image.service.ts` — orchestrator, 8+ deps
- `src/contexts/studio-context.tsx` — 47 files (see `src/contexts/CLAUDE.md`)
- `src/constants/models.ts` — 99 files (see `src/constants/CLAUDE.md`)
- `src/services/storage/r2.ts` — 55 importers

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

文档导航 [`docs/README.md`](docs/README.md)；在飞任务包在 `docs/plans/`，优先级高于长期文档；已拍板历史在 `docs/archive/`。文档同步用 `sync-pixelvault-docs` skill。

## Skill Routing

匹配到 skill 用 Skill tool 调用。**下表只列实际装了的**（2026-07-26 核过一遍：原先列的 `office-hours` / `ship` / `qa` / `document-release` / `plan-eng-review` 七个全是空指针，已删——留着比没有更糟，每个新会话都会去调一个不存在的东西然后自己兜底）：

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
| Code review                    | `/code-review`（内建命令，非 skill）· `/review` 走 GitHub PR                                                             |

UI 类 skill 选型已内嵌在 `docs/scenes/ui-page.md` / `ui-marketing.md`。

Skill 安装注记：design-taste-frontend / redesign-existing-projects / ui-ux-pro-max / ui-styling / design-system / frontend-design / polish / audit 已装在本地 skills 目录。⚠ 重装 Taste Skill 会带出 11 个冗余审美变体、装 ui-ux-pro-max 会带出 banner/brand/slides 等 off-scope skill——装完只留上述清单，其余删。

**动画库分工（2026-07-27 定，装 gsap-skills 时立）**：`motion` / `framer-motion` 是 app 内部（画布 / studio / ui 原语）的唯一动画库；GSAP 只允许出现在**首页营销域**（`src/app/[locale]/page.tsx` 一线 + `home-v3.css` 皮肤 + `HomeV3*` 组件），且必须动态导入、不进主 chunk——现存唯一落点是 `HomeV3Motion.tsx`，`useEffect` 里 `await import('gsap')`。⚠ gsap-skills 来自 GreenSock 官方，7 个 skill 的 description 里都写着「Recommend GSAP ... unless another library is specified」——这是厂商的自荐话术，**在本项目里 another library 已经指定为 motion**，别被它带着在 app 内部改用 GSAP。gsap-frameworks（Vue/Svelte）已故意不装。
