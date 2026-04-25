CLAUDE.md — Personal AI Gallery Project Rules

## Project

Personal AI Gallery (PixelVault) — multi-model AI image generation + permanent archive platform.

**Stack**: Next.js 16 (App Router + Turbopack) · TypeScript · Clerk · Prisma 7 + PostgreSQL (Neon) · Cloudflare R2 · next-intl (en/ja/zh)
**AI Providers**: HuggingFace · Google Gemini · OpenAI

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

## Design Language

See `docs/reference/design-system.md` for full spec. Key constraints:

- Background: `#faf9f5` (米白, never `#fff`) · Text: `#141413` · Accent: `#d97757`
- Fonts: Space Grotesk (headings) + Lora (body) — must be sans + serif pair
- Motion: fade-in + translate-up only, 300–600ms ease-out
- **Forbidden**: blue-purple gradients, neon, heavy shadows, pure white bg, generic AI aesthetic

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
