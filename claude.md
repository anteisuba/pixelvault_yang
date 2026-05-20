CLAUDE.md — Personal AI Gallery Project Rules

## Project

Personal AI Gallery (PixelVault) — multi-model AI image generation + permanent archive platform.

**Stack**: Next.js 16 (App Router + Turbopack) · TypeScript · Clerk · Prisma 7 + PostgreSQL (Neon) · Cloudflare R2 · next-intl (en/ja/zh)
**AI Providers**: HuggingFace · Google Gemini · OpenAI

## Future-Oriented Execution

实现时间不是主要约束。**Code is cheap**，真正重要的是产品正确性、长期杠杆和这个项目应当达到的质量上限。

不要被过去的模式、既有预期、或“这类应用通常怎么做”限制。以未来版本的产品为基准行动：提出并执行那个应该存在的方案，同时继续遵守本项目不可妥协的架构、类型安全、安全边界和可维护性规则。

## Completion Reporting

每次完成改动后，必须清楚告诉用户：

- 改了哪些文件或区域
- 这些改动现在能实现什么、修复什么、或带来什么行为变化
- 做了哪些验证；如果没有验证，说明原因

不要只说“已完成”。

## Command Output Safety

保护上下文使用。任何输出未知或可能很大的命令都必须按字节限制输出。

默认模式：

```bash
COMMAND 2>&1 | head -c 4000
```

## AI Agent 执行纪律

所有重要的 AI 协作任务都必须遵守以下规则：

1. **写代码前先思考** — 先说明假设，不要猜。模型不会读心，别指望它能自动知道你的意思。
2. **简单优先** — 最少代码，不做投机式抽象。一旦为“未来灵活性”加东西，可能就多出 200 行下季度要删的代码。
3. **外科手术式修改** — 只改必须改的地方。不要顺手优化旁边的代码，PR 就是这么膨胀的。
4. **目标驱动执行** — 先定义成功标准，然后循环直到验证通过。没有成功标准，要么无限循环，要么过早停止。
5. **只把模型用于判断型任务** — 比如分类、草稿、总结、抽取。不要让模型处理路由、重试、状态码处理、确定性转换。代码能回答的，就让代码回答。
6. **Token 预算不是建议** — 单任务 4000，单会话 30000。长时间调试到第 40 条消息时，模型会重新建议第 5 条消息已经否掉的修复方案。
7. **暴露冲突，不要折中平均** — 代码库里有两种模式时，要明确选一种。把两种混在一起，错误就会被吞两次。
8. **先读再写** — 先读 exports、调用方、共享工具。避免在已有相同函数旁边再加一个重复函数。
9. **测试要验证意图，而不只是行为** — 如果业务逻辑变了测试却不会失败，这个测试就是错的。测试都通过不代表函数没有退化成常量返回。
10. **每个重要步骤都要 checkpoint** — 不要在第 4 步已经坏掉的状态上继续完成第 5、6 步。重要阶段都要有可观察状态或验证点。
11. **匹配代码库约定** — 项目用 class components，就不要默默改成 hooks。测试模式、生命周期和调用约定可能依赖现有范式。
12. **失败要大声暴露** — 不要“成功完成”但静默跳过部分记录。要暴露不确定性、部分失败和降级路径，不要藏起来。

## Key Entry Points

| Path                       | Role                                               |
| -------------------------- | -------------------------------------------------- |
| `src/constants/`           | All config, enums, routes — **check here first**   |
| `src/types/index.ts`       | Zod schemas + TypeScript types                     |
| `src/services/`            | Server-only business logic (DB, R2, AI)            |
| `src/hooks/`               | Client-side state management                       |
| `src/components/business/` | Stateful UI (uses hooks, no direct API)            |
| `src/components/ui/`       | Stateless shadcn primitives                        |
| `src/app/api/`             | API routes (auth → validate → delegate)            |
| `src/messages/`            | i18n JSON (en/ja/zh — all three must stay in sync) |

## Hard Rules

1. **No magic values** — use `src/constants/`, never hardcode strings/numbers
2. **No `any`** — define types via Zod schemas, infer with `z.infer<typeof schema>`
3. **No fetch in components** — all API calls go through `src/lib/api-client.ts`
4. **API routes do 3 things only** — auth check → Zod validate → call service
5. **No Tailwind arbitrary values** — extend `tailwind.config.ts` instead
6. **Feature dev order** — constants → types → services → hooks → components
7. **Import order** — React/Next → third-party → internal constants/types → components/hooks → styles
8. **API key gates** — never just disable a UI element that needs a missing API key; route the click through `QuickSetupDialog` so the user can configure inline. Applies to every entry point (model picker, LoRA trainer, future provider-gated features). See `src/components/business/studio/QuickSetupDialog.tsx` JSDoc for the reuse pattern.

冲突时的优先级：用户明确指令 > 本项目 Hard Rules > AI Agent 执行纪律 > 默认行为。

## Design Language

See `docs/reference/design-system.md` for full spec. Three surface modes:

**Editorial surfaces** (Studio canvas, Gallery, Account):

- Background: `#faf9f5` (米白) · Text: `#141413` · Brand accent: `#d97757`
- Fonts: Space Grotesk (headings) + Lora (body) — sans + serif pair required

**Marketing surfaces** (Homepage, landing pages, Auth):

- Background pure `#fff` · Primary CTA = black `#141413` (not orange)
- Single Space Grotesk only (no serif)
- Krea-style: minimal chrome, large hero typography, real imagery
- Auth pages share this surface so the funnel reads continuous

**Krea Overlay surfaces** (AppSidebar, full-screen modals, asset browsers):

- Background: dark `--sidebar` token · Text: dark `--sidebar-foreground`
- Activated by adding the `dark` className to the wrapper, which flips
  the sidebar / background / foreground / accent / border tokens to
  their dark-mode oklch values defined in `src/app/globals.css`
- Used for: AppSidebar (always), AssetSelectorDialog (full-screen
  modal), and any other immersive overlay where the canvas is asset
  thumbnails rather than editorial prose
- Pairs with the editorial main surface — the user's eye tracks the
  high-contrast dark chrome to navigation / overlays, then settles on
  the warm editorial canvas for actual creation

Shared:

- Motion: fade-in + translate-up only, 300–600ms ease-out
- **Forbidden**: blue-purple gradients, neon glows, heavy drop shadows, dark-tech aesthetic with blue glow

## Security

- `NEXT_PUBLIC_` only for: Clerk public key, CDN domain, App URL
- API routes must `auth()` from Clerk before processing
- Credit deduction logic must run server-side only

## Docs

文档统一在 `docs/`,按层次分:`getting-started / architecture / reference / guides / plans / progress / product / infrastructure`。

| File                                             | Content                                             |
| ------------------------------------------------ | --------------------------------------------------- |
| `docs/README.md`                                 | 文档总导航                                          |
| `docs/getting-started/overview.md`               | 产品定位与 BYOK 模式                                |
| `docs/getting-started/reading-paths.md`          | 按角色的阅读路径(新人/Studio/后端/视频等)           |
| `docs/architecture/system-architecture.md`       | Directory structure, tech stack, data flow          |
| `docs/reference/design-system.md`                | Colors, typography, layout, motion rules            |
| `docs/reference/database.md`                     | Prisma models, relations, migration workflow        |
| `docs/reference/components.md`                   | Components, hooks & capability system API reference |
| `docs/reference/api/README.md`                   | AI 提供商汇总与能力矩阵                             |
| `docs/progress/phases.md`                        | Development phase tracking                          |
| `docs/progress/current-status-audit.md`          | 当前完整产品状态审计                                |
| `docs/product/roadmap.md`                        | Future features and priorities                      |
| `docs/plans/README.md`                           | 活跃规划导航                                        |
| `docs/plans/frontend/studio-feature-map.md`      | ⭐ Studio 当前真相源(所有 Studio 改动前必读)        |
| `docs/plans/product/unified-development-plan.md` | 3-track 合并计划(参考档案,非真相源)                 |

## Component Tiers

- `components/ui/` — No state, no business logic, pure display
- `components/business/` — May use hooks, must NOT call API directly
- `components/layout/` — Page chrome (Navbar, MobileTabBar)

## Naming

| Type           | Convention            | Example                 |
| -------------- | --------------------- | ----------------------- |
| Component      | PascalCase            | `ImageCard.tsx`         |
| Hook           | camelCase + `use`     | `useGenerateImage.ts`   |
| Service        | camelCase + `Service` | `generation.service.ts` |
| Constant       | SCREAMING_SNAKE       | `AI_MODELS`, `ROUTES`   |
| Type/Interface | PascalCase            | `GenerateRequest`       |

## Resilience & Quality Utilities

| Utility         | Path                              | When to use                                          |
| --------------- | --------------------------------- | ---------------------------------------------------- |
| Logger          | `src/lib/logger.ts`               | ALL logging — never use `console.log` in services    |
| Retry           | `src/lib/with-retry.ts`           | Wrap ALL external API calls (AI providers, R2)       |
| Circuit Breaker | `src/lib/circuit-breaker.ts`      | Per-provider protection against cascading failures   |
| Prompt Guard    | `src/lib/prompt-guard.ts`         | Validate user prompts before sending to AI           |
| LLM Validator   | `src/lib/llm-output-validator.ts` | Validate LLM outputs (prompt enhance, recipe fusion) |
| Invariants      | `src/lib/invariants.ts`           | Runtime assertions for programmer errors             |

## Dev Server

- Dev server runs on port 3000 (`npm run dev`)
- **Do NOT kill an already-running dev server** — if port 3000 is occupied, assume the user started it and reuse it as-is
- Only start a new dev server if nothing is listening on port 3000

## Testing

**Framework**: Vitest + @testing-library/react · Test helpers in `src/test/api-helpers.ts`

### Hard Rules

1. **新增功能必须写测试** — 后端(service/API route)和前端(hook/component)都要有对应的 `.test.ts(x)` 文件
2. **修改功能必须更新测试** — 改了逻辑就要更新对应测试，确保测试反映当前行为
3. **完成功能后自动运行测试** — 写完代码后执行 `npx vitest run --reporter=verbose` 验证通过

### 测试文件放置规则

- API route: 同目录下 `route.test.ts`（如 `src/app/api/images/route.test.ts`）
- Service: 同目录下 `<name>.test.ts`（如 `src/services/generation.service.test.ts`）
- Hook: 同目录下 `<name>.test.ts`（如 `src/hooks/use-gallery.test.ts`）
- Component: 同目录下 `<name>.test.tsx`（如 `src/components/business/ImageCard.test.tsx`）
- Util/Lib: 同目录下 `<name>.test.ts`（如 `src/lib/utils.test.ts`）

### 测试内容要求

- **API route**: auth(401) → validation(400) → service mock → success → error handling(500)
- **Service**: 业务逻辑验证、边界条件、错误抛出
- **Hook**: 状态变化、API 调用 mock、loading/error 状态
- **Component**: 渲染、用户交互、条件显示
- **Zod schema**: safeParse 有效/无效输入、边界值

## Change Safety Protocol

修改任何文件前，必须执行：

1. Grep 确认谁依赖了这个模块（`grep -r "import.*from.*<模块名>" src/`）
2. 如果被引用 >5 处，只做向后兼容的修改（加 optional 字段，不改已有签名）
3. 修改 `types/index.ts` 的核心类型需要列出所有受影响文件

高风险模块（改动前必须确认影响范围）：

- `src/types/index.ts` — 189 files depend on it (see `src/types/CLAUDE.md`)
- `src/services/user.service.ts` — 22 files depend on it
- `src/services/generate-image.service.ts` — orchestrator, 8+ service deps
- `src/contexts/studio-context.tsx` — 23+ studio components (see `src/contexts/CLAUDE.md`)
- `src/constants/models.ts` — 178 files import from constants (see `src/constants/CLAUDE.md`)
- `src/services/storage/r2.ts` — 15 services depend on it

Per-directory CLAUDE.md files exist in: `types/`, `contexts/`, `components/business/studio/`, `hooks/`, `constants/`

## Common Pitfalls

1. **Adding a model** — must update: `AI_MODELS` enum + model config + i18n (3 files) + provider adapter
2. **Service files** — must start with `import 'server-only'`
3. **Prompt length** — always validate with `prompt-guard.ts` before AI calls
4. **LLM outputs** — always validate with `llm-output-validator.ts` before using
5. **External calls** — always wrap with `withRetry()` from `with-retry.ts`
6. **Zod in routes** — use `.safeParse()` not `.parse()` (latter throws unhandled)

## When Unsure

1. Check `src/constants/` for existing variables
2. Reuse `src/components/ui/` before creating new primitives
3. Follow: Service → Hook → UI order
4. Use Zod for types, never `as` assertions

## Memory Maintenance

完成重大功能变更后，检查并更新以下 memory 文件：

- 新增/删除 service → 更新 `ref_services_map.md`
- 新增/删除 hook → 更新 `ref_hooks_map.md`
- 修改 DB schema → 更新 `ref_db_schema.md`
- 修改 constants → 更新 `ref_constants_map.md`
- 发现新的模块陷阱 → 更新 `ref_module_gotchas.md`
- 改变模块依赖关系 → 更新 `ref_change_impact_map.md`

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:

- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
