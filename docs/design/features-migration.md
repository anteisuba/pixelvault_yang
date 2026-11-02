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
  index.ts      对外入口：客户端组件
  hooks/index.ts 对外入口（按需）：客户端 hook——只要 hook 时走 `@/features/<域>/hooks`，不会把整个域的组件一起加载
  server.ts     对外入口：只给服务端（services），首行 `import 'server-only'` 的照旧
  core.ts       对外入口（按需）：纯函数与常量，两边都能引
```

- 层次规矩不变：constants/types → services → hooks → components；域内照 `CLAUDE.md` 的 Hard Rules 写。
- **留在原处的共享层**（不归任何一个域）：`components/ui/`、`lib/api-client/`（Hard Rule 3：API 调用都走它）、`types/index.ts` 的 Zod schema、`constants/` 里跨域的（模型、路由、config）、`services/` 里跨域的（storage、providers、user、credit）、`messages/`（已按模块分文件夹）。
- 入口分开，是为了客户端组件 import 域入口时不把服务端代码一起打进浏览器包。
- `hooks` 入口（11-02 加）：`studio-context` 只要一个 `useCharacterCards`，走 `index.ts` 就把整个角色卡页面连带助手面板一起加载进来（main 上的 CI 因此红过一次）。共享层（`contexts/` `lib/` `hooks/`）只许引 `hooks` / `core` / `server` 这种轻入口
- `core.ts`（11-01 LoRA 搬家时加）：别的域只要一个纯函数时，走 `index.ts` 会把整个域的组件一起加载（测试慢一倍、服务端还会引到客户端组件）。所以 `lib/`、`constants` 里被域外用到的，统一从 `core.ts` 出。
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

### gallery / assets / settings（11-01 已搬）

- 留着的共享层：`use-gallery`、`gallery-cache`、`api-client/gallery`；`constants/asset-dnd`（拖拽 MIME 跨域）、`constants/assets-grid`（共用的排版 hook 在用）、`constants/asset-folder-tree`、`lib/asset-links`、`lib/asset-recipe-text`；API key 那一套（`apiKey.service`、`constants/api-keys`、`use-api-keys`、`use-open-key-settings`）跨域，不归设置

### cards（角色卡，11-01 已搬）

- `components/business/cards/*`、`hooks/cards/*`（域内 `hooks/index.ts` 汇总保留）、`services/cards/*`、`lib/character-gaps`、`lib/card-cache` → `features/cards/`
- 留着：`constants/cards/*`（`types/` 在引，类型层不能反过来引域）、`lib/card-bus*`、`lib/character-works`、`lib/character-looks`、`lib/tavern-card` 等画布 / 工作台 / 助手都在用的

### lora（11-01 已搬）

- `components/business/studio/lora/**`、`LoraTrainingDialog`、名字带 lora / civitai / huggingface 的 hooks / services / lib / constants、`services/lora/*`、`hooks/prompts/use-civitai-*`、`use-runner-usage` → `features/lora/`
- 留着：`constants/lora.ts`、`constants/lora-candidate.ts`（`types/` 在引）、`lib/civitai-lora-reference`（`api-client` 在引）、`lib/assistant-v3-lora-board`（助手）、`services/runner/*`（执行层）
- 测试里 `vi.mock` 仍按域内完整路径 mock（入口是转出口，mock 底下那个文件对入口同样生效）；要 mock 入口本身时，用到的名字得全给

### studio（工作台，11-02 已搬）

- `components/business/studio/**`（除 `shell/`、`assistant-operator/`）、`components/business/image/*`、`StudioWorkspaceUI` / `Studio3DWorkspace` / `StudioModeSync`、只给工作台用的 `use-studio-*` hook、`studio-generate` / `studio-conversation-activity` 服务 → `features/studio/`
- `prompt-tags/` 只有 LoRA 台在用 → `features/lora/components/prompt-tags/`；`GenerationLayerStrip`（画廊和大图弹窗用）、`VoiceTrainer`（声音用）不归工作台，回到 `components/business/`
- 留着：`studio-shared/`（九个域都在用，是共享层）、`studio/shell/`（外壳）、`contexts/studio-context`、`use-image-*` / `use-studio-run-models` / `use-studio-video-assets` 等共享层在用的 hook

### assistant（助手，11-02 已搬）

- `studio/assistant-operator/**` → `features/assistant/components/operator/`，`assistant-settings/*` → `components/settings/`；`use-studio-operator-*` / `use-assistant-*` / 各宿主 hook → `hooks/`；`services/assistant-*`、`services/kernel/assistant-*` → `services/`
- 留着：`services/kernel/assistant-route` / `assistant-completion`（大模型调用层，人人在用）、`use-assistant-persona` / `use-studio-operator-history` / `use-studio-operator-store`（共享层在用）、`lib/` 与 `constants/` 里的助手纯函数（类型层在引）

### canvas（画布，11-02 已搬）

- `components/business/node/**` → `features/canvas/components/`（含目录 `CLAUDE.md`）、`hooks/node/*`、`services/node/*`、`lib/node-assistant-op-plan` → `features/canvas/`
- `parse-mentions` 是共享层纯函数 → `src/lib/node-parse-mentions.ts`；`VoiceAvatar` 归声音 → `components/business/voices/`
- 留着：`lib/node-*` 其余纯函数（剪辑台、助手快照等共享代码在用）、`constants/node-*`

## 边界（`f-boundary`，11-02）

`eslint.config.mjs` 的 `no-restricted-imports`：域外引 `@/features/<域>/…` 深路径一律报错，只放行 `@/features/<域>`、`/hooks`、`/core`、`/server`；域内随便。测试文件不拦。组件 / hook / service 不引 `@/app/**`（样式表除外）。前台请求门（组件 / hook 不裸 `fetch`）同样管到 `features/*/components`、`features/*/hooks`。
