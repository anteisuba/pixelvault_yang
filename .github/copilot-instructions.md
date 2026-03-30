# PixelVault — GitHub Copilot Instructions

## Project
Multi-model AI image/video generation + permanent archive. Next.js 16 + TypeScript + Prisma 7 + Clerk + Cloudflare R2.

## Architecture
```
src/constants/  → config, enums, routes (check FIRST)
src/types/      → Zod schemas + TypeScript types (NEVER use `any`)
src/services/   → server-only business logic (DB, R2, AI providers)
src/hooks/      → client state (all API via src/lib/api-client.ts)
src/components/ → ui/ (stateless) | business/ (stateful) | layout/
src/app/api/    → routes: auth → validate → delegate to service
src/messages/   → i18n JSON (en/ja/zh — keep in sync)
```

## Rules
- No `any` — use Zod + `z.infer<>`
- No fetch in components — use `src/lib/api-client.ts`
- No business logic in API routes — delegate to services
- Services must `import 'server-only'`
- Use `src/lib/logger.ts` not `console.log`
- Use `src/lib/with-retry.ts` for external API calls
- Use `src/lib/prompt-guard.ts` before sending prompts to AI
- i18n: always update all 3 locale files (en/ja/zh)

## AI Providers
7 adapters: huggingface, gemini, openai, fal, replicate, novelai, volcengine
Registry: `src/services/providers/registry.ts`
Models: `src/constants/models.ts` (AI_MODELS enum)

## Design
Background: #faf9f5 (never #fff) · Text: #141413 · Accent: #d97757
No blue-purple gradients, no neon, no heavy shadows
