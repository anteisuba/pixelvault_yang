# 按域搬进 `src/features/`（施工单第 3 批 `f-*`）

2026-11-01 定（owner 放手：「你自己定」）。目的：以后改哪个域只开那一个文件夹；最后用 eslint 管住跨域直引。

## 目录长什么样

```
src/features/<域>/
  components/   这个域自己的有状态 UI（原 components/business/<域>/）
  hooks/        这个域自己的 hook
  services/     这个域自己的服务端逻辑（仍是唯一碰 DB / 外部 API 的层）
  lib/          这个域自己的纯函数
  constants.ts  这个域自己的常量（多了再拆 constants/）
  index.ts      对外入口：客户端能用的（组件、hook、常量、纯函数）
  server.ts     对外入口：只给服务端（services），首行 `import 'server-only'` 的照旧
```

- 层次规矩不变：constants/types → services → hooks → components；域内照 `CLAUDE.md` 的 Hard Rules 写。
- **留在原处的共享层**（不归任何一个域）：`components/ui/`、`lib/api-client/`（Hard Rule 3：API 调用都走它）、`types/index.ts` 的 Zod schema、`constants/` 里跨域的（模型、路由、config）、`services/` 里跨域的（storage、providers、user、credit）、`messages/`（已按模块分文件夹）。
- 两个入口分开，是为了客户端组件 import 域入口时不把服务端代码一起打进浏览器包。
- 域内互相引用写完整路径 `@/features/<域>/...`；域外只走 `@/features/<域>` 或 `@/features/<域>/server`（`f-boundary` 用 eslint 拦）。
- `app/` 路由文件也走入口。测试文件跟着被测文件一起搬（`git mv`，保留历史）。

## 怎么搬

- 一次一个域、一个提交：`git mv` → 改所有 import（同一个提交里改完，⛔ 留转发垫片）→ tsc + eslint + 这个域和改了 import 的文件的测试 → 推 main。
- 只搬「明确属于这个域」的文件；跨域用的留在共享层，等到它真的只剩一个域在用再搬。
- 每搬完一个域，改 `docs/references/` 里写到旧路径的地方（`frontend.md`、`domains/<域>.md`）。

## 顺序

1. `f-small`：提示词库（prompts）→ 画廊（gallery）→ 素材（assets）→ 设置（settings）
2. `f-cards-lora`：角色卡 → LoRA
3. `f-studio`：工作台
4. `f-assistant-canvas`：助手（`features/assistant/` 已在，补 `index.ts` / `server.ts`）→ 画布
5. `f-boundary`：eslint `no-restricted-imports` 拦 `@/features/*/` 深路径（域内除外）

## 各域清单

### prompts（提示词库 / 配方）

- `components/business/prompts/*` → `features/prompts/components/`
- `hooks/use-prompt-template-model-label.ts`、`hooks/use-prompt-template-use.ts`、`hooks/prompts/use-recipes.ts` → `features/prompts/hooks/`
- `constants/prompt-library.ts` → `features/prompts/constants.ts`
- `services/prompts/recipe.service.ts` → `features/prompts/services/`
- 留着：`hooks/prompts/use-civitai-*`、`use-runner-usage`（LoRA 域，随 `f-cards-lora`）；`services/prompts/prompt-tag-stack`（标签）、`seedance-prompt-plan`、`prompt-feedback`（工作台，随 `f-studio`）；`constants/image-prompt-templates`、`lib/image-prompt-templates`（画布与助手共用）
