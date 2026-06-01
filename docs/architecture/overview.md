# 架构总览

最后更新：2026-06-01

本文档只记录当前代码事实和未决项，不定义新的架构方向。

## Current Architecture Facts

### Runtime and Framework

- 应用使用 Next.js App Router。
- `package.json` 当前显示：Next.js 16.2.6、React 19.2.3、TypeScript 5、Prisma 7.7.0、Clerk、next-intl、Tailwind CSS 4、Vitest、Playwright。
- `package.json` 的 `engines.node` 指向 Node 22.x。
- 当前有 35 个 `page.tsx` 和 137 个 API `route.ts`。

### Routing and Layout

- 根布局在 `src/app/layout.tsx`，负责全局字体、metadata、dev-only `LocatorSetup` 和可选 Vercel Toolbar。
- Locale 布局在 `src/app/[locale]/layout.tsx`，负责 locale 校验、ClerkProvider、next-intl provider、Clerk redirect URL 和 locale metadata。
- 主应用布局在 `src/app/[locale]/(main)/layout.tsx`，负责 sidebar、mobile header/tab bar、toast、full message bundle 和主内容容器。
- 公开首页在 `src/app/[locale]/page.tsx`。
- Auth 页面位于 `src/app/[locale]/(auth)/sign-in` 和 `src/app/[locale]/(auth)/sign-up`。
- 主业务页面位于 `src/app/[locale]/(main)/...`，当前包括 Studio、Gallery、Profile、Assets、Cards、Prompts、Arena、Storyboard、3D 等入口。

### Locale and i18n

- Locale source of truth 在 `src/i18n/routing.ts`。
- 当前支持 `en`、`ja`、`zh`，默认 locale 是 `en`。
- 消息文件位于 `src/messages/en.json`、`src/messages/ja.json`、`src/messages/zh.json`。
- `src/app/[locale]/layout.tsx` 对 marketing/auth surface 使用 message subset。
- `src/app/[locale]/(main)/layout.tsx` 重新包裹 full message bundle，用于主应用 client components。

### Auth Boundary

- Middleware 位于 `src/proxy.ts`。
- `src/proxy.ts` 结合 Clerk middleware 和 next-intl middleware。
- 非 API 页面先经过 i18n routing，再按 public route 配置保护非公开页面。
- API routes 跳过 i18n 处理。
- `src/proxy.ts` 中列出的 public 或 Clerk-bypassed routes 包括 health、public images、voices、Clerk webhook、internal execution callback/key resolve、fal webhook 等。
- 部分 API routes 使用 `src/lib/api-route-factory.ts` 统一处理 Clerk auth；也存在直接调用 `auth()` 的 route。

### API Boundary

- API route 文件位于 `src/app/api/**/route.ts`。
- `src/lib/api-route-factory.ts` 提供标准 route factory：Clerk auth、rate limit、JSON parse、Zod validation、handler 调用、统一 error response。
- Path-param route、GET route、internal signature route 等也由 `src/lib/api-route-factory.ts` 提供部分工厂支持。
- API route 的常量路径集中在 `src/constants/config.ts` 的 `API_ENDPOINTS`。
- Client API 调用模块集中在 `src/lib/api-client.ts` 和 `src/lib/api-client/*`。

### Server Services

- `src/services/` 是主要服务层，目前有 94 个非测试 TypeScript service 文件和 73 个 service 测试文件。
- 服务层覆盖 generation、image/video/audio/3D generation、storage、usage、API keys、users、gallery、projects、cards、LoRA、node workflow、arena、storyboard/video script、provider adapters 等。
- 多数数据库访问集中在 services 中，通过 `src/lib/db.ts` 引入共享 Prisma client。
- Server-only service 文件大量使用 `import 'server-only'`。

### Database and Prisma

- Prisma schema 位于 `prisma/schema.prisma`。
- Prisma client 输出到 `src/lib/generated/prisma`。
- Prisma access 集中入口是 `src/lib/db.ts`。
- `src/lib/db.ts` 使用 PrismaPg driver adapter，并用 `DATABASE_POOL` 控制 pool 参数。
- 非生产环境通过 `globalThis.prisma` 复用 client。
- 当前 schema 包含核心模型：`User`、`Generation`、`GenerationJob`、`ApiUsageLedger`、`FreeTierSlot`、`UserApiKey`、`Project`、`NodeWorkflowProject`、cards、collections、arena、video pipeline、LoRA、video script、extracted elements 和 inspirations。

### Models and Providers

- Built-in model ID source of truth 在 `src/constants/models/enum.ts`。
- Model option 聚合入口是 `src/constants/models.ts`。
- Model option 按类型拆在 `src/constants/models/image.ts`、`video.ts`、`audio.ts`、`model-3d.ts`。
- 当前本地常量中有 57 个 model option：28 image、21 video、2 audio、6 3D。
- 当前本地常量中 32 个 model option 标记为 available，25 个标记为 unavailable/retired。
- Provider adapter type 集中在 `src/constants/providers.ts`。
- Provider adapter registry 在 `src/services/providers/registry.ts`。
- Registry 当前包含 HuggingFace、Gemini、OpenAI、FAL、Runway、Replicate、NovelAI、VolcEngine、Fish Audio。
- `HYPER3D_RODIN` 在 provider constants 中存在，但 registry 注释显示它不是普通 provider adapter 路径，而是由 3D generation service 直接派发到 Worker。

### Generation and Media

- Studio generation service 在 `src/services/studio-generate.service.ts`。
- Image generation service 在 `src/services/image/generate-image.service.ts`。
- Generic generation persistence/query service 在 `src/services/generation.service.ts`。
- Video、audio、3D、long video、multiview、node workflow 分别有独立 service 和 API route。
- R2 storage service 在 `src/services/storage/r2.ts`。
- R2 key 由 `generateStorageKey` 根据 output type 和 userId 生成，当前覆盖 image、video、audio、model_3d。
- `Generation` schema 当前支持 `IMAGE`、`VIDEO`、`AUDIO`、`MODEL_3D` output type，并保存 URL、storage key、preview/thumbnail、model file、prompt、model/provider、visibility、project、cards、run group 等信息。

### Frontend State and UI Boundaries

- Client interaction logic主要位于 `src/hooks/`，当前有 75 个非测试 hook 文件。
- Business components 位于 `src/components/business/`。
- Layout components 位于 `src/components/layout/`。
- UI primitives 位于 `src/components/ui/`。
- 当前仍存在至少一个业务组件直接调用业务 API：`src/components/business/cards/CharacterCardCreateForm.tsx` 调用 `/api/generate`。这与项目规则中的 API client 方向存在潜在不一致，需要后续单独处理。
- `src/components/ui/audio-player.tsx` 直接 fetch media URL 用于 waveform 解析；这属于媒体资源读取，不等同于业务 API 调用。

## Current Boundary Map

```text
src/app/
  Route entry, layouts, API route boundaries

src/components/layout/
  Application shell, sidebar, mobile navigation, providers

src/components/business/
  Domain-aware UI and client orchestration

src/components/ui/
  Reusable presentational primitives

src/hooks/
  Client-side interaction state and API-client orchestration

src/lib/api-client*
  Browser/client API call wrappers

src/app/api/
  Request/response boundary, auth validation, schema validation, service calls

src/services/
  Server-side business logic, provider dispatch, DB coordination, storage, credits/usage

src/constants/
  Model IDs, provider IDs, routes, config, UI/domain options

src/types/
  Zod schemas, DTOs, shared domain types

src/lib/db.ts
  Shared Prisma client entry

prisma/schema.prisma
  Database schema source of truth
```

## Known Uncertainties

- `architecture/overview.md` does not decide whether the current API route factory coverage is sufficient. Some routes use factories; some routes still use direct `auth()` and custom handling.
- The intended long-term boundary between classic Studio, workspace routes, and Node workflow is not yet documented.
- The intended unified abstraction for image/video/audio/3D generation is not yet documented.
- Credit deduction, free tier accounting, failed generation policy, and refund behavior need `docs/architecture/credits.md`.
- Generation request flow, provider dispatch, job handling, fallback behavior, and persistence need `docs/architecture/generation.md`.
- Storage retention policy for originals, previews, thumbnails, uploaded references, videos, audio, and 3D files is not yet documented.
- Current provider/model/API correctness has not been checked against official provider docs in this architecture pass.
- Browser flows, build health, tests, and deployment behavior were not verified for this overview.
- `package.json` still contains `models:check-docs` scripts that point at deleted `docs/reference/api/model-doc-monitor.snapshot.json`; the replacement location for provider/model verification artifacts is undecided.
- The direct business fetch in `src/components/business/cards/CharacterCardCreateForm.tsx` needs a future decision or fix, but this overview does not change it.

## Source of Truth

- `package.json`
- `src/app/layout.tsx`
- `src/app/[locale]/layout.tsx`
- `src/app/[locale]/(main)/layout.tsx`
- `src/proxy.ts`
- `src/lib/api-route-factory.ts`
- `src/lib/api-client.ts`
- `src/lib/api-client/`
- `src/lib/db.ts`
- `src/i18n/routing.ts`
- `src/i18n/request.ts`
- `src/messages/`
- `src/constants/config.ts`
- `src/constants/routes.ts`
- `src/constants/models.ts`
- `src/constants/models/`
- `src/constants/providers.ts`
- `src/services/`
- `src/services/providers/registry.ts`
- `src/services/storage/r2.ts`
- `src/types/index.ts`
- `prisma/schema.prisma`

## Last Verified

- Date: 2026-06-01
- Method: code inspection, file counts, targeted `rg`, and source reads
- External docs: not checked for this overview
- Runtime validation: not run
