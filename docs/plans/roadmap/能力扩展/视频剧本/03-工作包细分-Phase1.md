# Phase 1 · VideoScript 后端骨架 + 剧本生成 LLM — 工作包细分

> 创建于 2026-04-18 · 对应 `视频剧本-路线决策结论书.md` §6 Phase 1
>
> **前置**：Phase 0 v3 已 merge 到 main（cd7d671 + ba0571b + 2acd349）
>
> **范围边界**：只到"LLM 生成结构化剧本 + 用户编辑确认 + `status = SCRIPT_READY` 入库"。分镜图 / 视频 clip / 拼接在 Phase 2-4。

---

## 0. 速查

- **WP 数量**：10（L01-L10）
- **Effort 分布**：S × 6 · M × 4
- **关键路径**：L01 → L02 → L04 → L05 → L06 → L07 → L08（UI 链）
- **可并行**：L03 与 L02 并行 · L09 i18n 与 L07/L08 并行 · L10 测试贴各 WP 写
- **验收点**：用户主题输入 → LLM 出结构化剧本 → 编辑 → 确认 → DB 有 `status = SCRIPT_READY` 记录

---

## 1. 依赖图

```
L01 Prisma
  │
  └─→ L02 Types ──┐
                  ├─→ L04 Service ──→ L05 API ──→ L06 Hooks ──→ L07 UI ──→ L08 Studio 集成
  ┌─→ L03 Const ──┘                                                              │
  │                                                                              │
  │                                              L09 i18n ─────────────────────────┘
  │                                              L10 Tests（贴各层）
```

---

## 2. 工作包明细

### WP-P1-L01 · Prisma schema + migration

**Effort**: S

**目标**：把 `VideoScript` + `VideoScriptScene` + 2 enum 落到 Prisma schema 并跑 migration。

**改动文件**：

- `prisma/schema.prisma`（加 2 model + 2 enum + `User.videoScripts` 反向关系）
- `prisma/migrations/<ts>_add_video_script/migration.sql`（`prisma migrate dev` 自动生成）

**字段参考**：决策书 §4.1。注意 VS10 决策：`frameGenerationId` / `clipGenerationId` 为普通 `String?`，**不加**外键约束。

**验收**：

- `npx prisma migrate dev --name add_video_script` 成功
- `npx prisma generate` 后 `PrismaClient` 有 `videoScript` / `videoScriptScene` / `VideoScriptStatus` / `VideoScriptSceneStatus`
- Neon 远端 schema 同步（`prisma migrate deploy` 在 CI 路径）

---

### WP-P1-L02 · Types + Zod schemas

**Effort**: S

**目标**：定义领域类型 + Zod 校验，统一给 service / API / UI 使用。

**改动文件**：

- `src/types/video-script.ts`（新）
- `src/types/index.ts`（re-export）

**内容骨架**：

```ts
// VideoScriptStatus / VideoScriptSceneStatus enum re-export from Prisma
// ConsistencyMode = 'character_card' | 'first_frame_ref'
// TargetDuration = 30 | 60 | 120
// VideoScriptSceneSchema = z.object({ orderIndex, duration, cameraShot, action, dialogue?, transition })
// VideoScriptSchema = z.object({ id, userId, topic, targetDuration, totalScenes, status, consistencyMode, characterCardId?, styleCardId?, videoModelId, scenes: VideoScriptSceneSchema[] })
// CreateVideoScriptInputSchema  ← POST body
// UpdateVideoScriptScenesInputSchema  ← PATCH body
// LLMScriptOutputSchema  ← LLM 输出校验（去掉 userId/id 等服务端字段）
```

**验收**：

- `z.infer` 出的 TS 类型与 Prisma 类型一致（用 `Expect<Equal<...>>` 测试）
- 所有字段有注释标注来源（VS1-VS11）

---

### WP-P1-L03 · Constants + LLM system prompt

**Effort**: S

**目标**：时长档、场景数反推、transition 字面量、LLM system prompt 全部集中到 constants。

**改动文件**：

- `src/constants/video-script.ts`（新）

**内容**：

```ts
export const VIDEO_SCRIPT_TARGET_DURATIONS = [30, 60, 120] as const
export const SCENE_DURATION_RANGE = { min: 5, max: 8 } as const
export const CONSISTENCY_MODES = ['character_card', 'first_frame_ref'] as const
export const CAMERA_SHOTS = [
  'close-up',
  'medium',
  'wide',
  'establishing',
  'over-the-shoulder',
] as const
export const TRANSITIONS = ['cut', 'fade', 'dissolve'] as const
export const PHASE_1_TRANSITION = 'cut' as const // Phase 4 前只用 cut

export const VIDEO_SCRIPT_VIDEO_MODELS = [
  'seedance-2-fast',
  'kling-pro',
] as const // VS7

export function deriveSceneCount(targetDuration: number): number {
  return Math.round(targetDuration / 6)
}

export const VIDEO_SCRIPT_SYSTEM_PROMPT = `You are a video script writer...`
// 要求 LLM 输出 JSON schema 对齐 LLMScriptOutputSchema
```

**验收**：

- `deriveSceneCount` 单测覆盖 30/60/120 → 5/10/20
- system prompt 显式要求 JSON（便于 `llm-output-validator` 校验）
- 三语化文案（i18n key）放 L09，此处只放 prompt 本身（英文）

---

### WP-P1-L04 · Service layer

**Effort**: M

**目标**：`video-script.service.ts` 封装所有业务逻辑。

**改动文件**：

- `src/services/video-script.service.ts`（新，`'server-only'`）
- `src/services/video-script.service.test.ts`（L10 一起写）

**导出方法**：

| 方法                                 | 行为                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `generateScript(input, userId)`      | 校验输入 → 调 LLM（**VS9** 降级：`withRetry` 3 次 + provider 切换）→ 校验输出 → 写 DB |
| `updateScenes(id, scenes, userId)`   | ownership 检查 → 全量替换 scenes（简单）或增量 PATCH（按 `orderIndex`）               |
| `confirmScript(id, userId)`          | ownership → 设 `status = SCRIPT_READY`                                                |
| `listByUser(userId, { page, size })` | 分页查列表                                                                            |
| `getById(id, userId)`                | ownership → 返回含 scenes 的完整对象                                                  |
| `deleteScript(id, userId)`           | ownership → 硬删 VideoScript + Scene（**VS10**：不动 Generation）                     |

**关键细节**：

- LLM 调用必须走 `withRetry` + `llm-output-validator`（已有 `src/lib/` 工具）
- Provider 切换策略：第 1-2 次用 Gemini（默认），第 3 次切 OpenAI；两个都全挂才报错
- 所有 log 用 `logger`，不要 `console.log`

**验收**：

- 6 个方法全有单测（mock Prisma + mock LLM）
- VS9 降级路径有专项测试（Gemini 连挂 2 次 → OpenAI 成功）
- VS10 删除测试：删剧本后，关联 Generation 记录仍在

---

### WP-P1-L05 · API routes

**Effort**: M

**目标**：4 个路由，严格走 CLAUDE.md §API routes "auth → validate → delegate"。

**改动文件**：

- `src/app/api/video-script/route.ts`（POST = 创建+生成 · GET = 列表）
- `src/app/api/video-script/[id]/route.ts`（GET · PATCH · DELETE）
- 各自 `route.test.ts`（L10）

**路由语义**：

| 方法 & 路径                     | 入参                     | 行为                                                |
| ------------------------------- | ------------------------ | --------------------------------------------------- |
| `POST /api/video-script`        | `CreateVideoScriptInput` | 创建 + 调 `generateScript` → 返回含 scenes 的新对象 |
| `GET /api/video-script`         | `?page=&size=`           | 列表（分页）                                        |
| `GET /api/video-script/[id]`    | -                        | 详情（含 scenes）                                   |
| `PATCH /api/video-script/[id]`  | `{ scenes?, status? }`   | 编辑 scenes · 或切 status 到 `SCRIPT_READY`         |
| `DELETE /api/video-script/[id]` | -                        | 硬删（VS10）                                        |

**验收**：

- 每个路由 5 个测试：401 / 400(Zod) / 404(ownership) / 200 / 500
- `safeParse` 不用 `parse`

---

### WP-P1-L06 · Client hooks + api-client

**Effort**: S

**目标**：封装客户端调用，UI 不直接 fetch。

**改动文件**：

- `src/lib/api-client.ts`（加 4 个方法：`createVideoScriptAPI` / `listVideoScriptsAPI` / `getVideoScriptAPI` / `updateVideoScriptAPI` / `deleteVideoScriptAPI`）
- `src/hooks/use-video-script.ts`（新：`useVideoScript(id)` + `useVideoScriptList()`）
- `src/hooks/use-video-script.test.ts`（L10）

**hook 语义**：

- `useVideoScript(id)`: `{ script, isLoading, error, refresh, save(scenes), confirm(), remove() }`
- `useVideoScriptList()`: `{ scripts, isLoading, error, loadMore, hasMore }`

**验收**：

- loading / error 状态正确切换
- `save` 和 `confirm` 调用后自动 `refresh`

---

### WP-P1-L07 · UI 组件：ScriptEditor + StudioScriptPanel

**Effort**: M

**目标**：Studio video mode 下新增"剧本面板"。

**改动文件**：

- `src/components/business/studio/StudioScriptPanel.tsx`（新，dock panel 容器）
- `src/components/business/studio/ScriptEditor.tsx`（新，场景列表 + 内联编辑）
- `src/components/business/studio/ScriptTopicInput.tsx`（新，主题输入 + 时长/一致性/模型三选一）

**UI 结构**：

```
StudioScriptPanel
├── (空态) ScriptTopicInput
│   ├── <textarea> 主题
│   ├── <select> 时长 30/60/120s（显示 "→ 5 场景/10/20"）
│   ├── <select> 一致性模式（character_card / first_frame_ref）+ 条件选 CharacterCard
│   ├── <select> styleCardId（可选）
│   ├── <select> videoModelId（seedance-2-fast / kling-pro）
│   └── <button> 生成剧本
└── (有剧本) ScriptEditor
    ├── 场景列表（每条显示 orderIndex / cameraShot / action / dialogue / duration / transition）
    ├── 每条可内联编辑（dialogue 字段按 VS11 展示）
    ├── 总时长核对（sum(scene.duration) vs targetDuration）
    ├── <button> 重新生成 / 保存草稿 / 确认（→ status=SCRIPT_READY）
    └── <button> 删除剧本
```

**设计约束**（CLAUDE.md）：

- bg `#faf9f5`，text `#141413`，accent `#d97757`
- Space Grotesk 标题 + Lora 正文
- 无蓝紫渐变、无霓虹
- 动效只用 fade-in + translate-up，300-600ms

**验收**：

- 空态 → 主题输入 → 生成 → 剧本列表展示，链路通
- 场景可编辑、可保存
- 确认按钮 disabled 条件：所有场景必填 `cameraShot` + `action` + `duration`
- ScriptEditor 组件测试覆盖渲染 + 交互

---

### WP-P1-L08 · Studio 集成（toolbar / panel 系统）

**Effort**: S

**目标**：让 `StudioScriptPanel` 在 video mode 下可被打开。

**改动文件**：

- `src/components/business/studio/StudioToolbarPanels.tsx`（video 分支加"剧本"按钮）
- `src/components/business/studio/StudioPanelSheets.tsx`（mobile drawer：加 `script` case）
- `src/components/business/studio/StudioPanelPopovers.tsx`（desktop popover：加 `script` case）
- `src/contexts/studio-context.tsx`（`PanelName` 加 `'script'`）

**验收**：

- video mode 下 toolbar 出现"剧本"按钮
- 点击打开面板（sheet on mobile / popover on desktop）
- image / audio mode 下按钮不显示

---

### WP-P1-L09 · i18n（VideoScript 命名空间）

**Effort**: S

**目标**：en / ja / zh 三语文案。

**改动文件**：

- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`

**新增 key（`VideoScript` namespace）**：

```
panelTitle, emptyStateHint, topicLabel, topicPlaceholder,
durationLabel, duration30s, duration60s, duration120s, sceneCountPreview,
consistencyModeLabel, consistencyCharacterCard, consistencyFirstFrameRef,
characterCardLabel, styleCardLabel, videoModelLabel,
generateButton, regenerateButton, saveDraftButton, confirmButton, deleteButton,
deleteConfirmTitle, deleteConfirmBody,
sceneFieldCameraShot, sceneFieldAction, sceneFieldDialogue, sceneFieldDuration, sceneFieldTransition,
totalDurationMismatch, generateFailed, generateFailedRetry,
statusDraft, statusScriptReady
```

**验收**：

- 三个文件 key 完全对齐（没有某语言漏 key）
- Chinese 文案符合"米白/暖橙/编辑化"的语言调性（非 AI 套话）

---

### WP-P1-L10 · 测试

**Effort**: M（分布在各 WP，此处是汇总验收）

**目标**：完成度与 Phase 0 对齐（479 → 新增 Phase 1 覆盖）。

**测试清单**：

| 层         | 位置                            | 重点                                         |
| ---------- | ------------------------------- | -------------------------------------------- |
| Constants  | `video-script.test.ts`          | `deriveSceneCount` 边界                      |
| Zod schema | `video-script.test.ts`（types） | safeParse 有效/无效/边界                     |
| Service    | `video-script.service.test.ts`  | 6 方法 + VS9 降级 + VS10 删除不动 Generation |
| API routes | `route.test.ts` × 2             | auth/validate/200/500 per route              |
| Hook       | `use-video-script.test.ts`      | loading/error/save/confirm 流程              |
| Component  | `ScriptEditor.test.tsx`         | 渲染 / 内联编辑 / 确认按钮 disabled 条件     |

**目标**：`npx vitest run` 全通过 · 新增测试数 ≥ 30 · TypeScript 编译干净

---

## 3. 执行顺序建议

1. **Day 1**：L01 → L02 → L03（后端基座，小、快）
2. **Day 2**：L04（Service，中等）+ 写 service 单测
3. **Day 3**：L05（API routes）+ 写 route 测试
4. **Day 4**：L06（hooks + api-client）+ hook 测试
5. **Day 5**：L07（UI 主体）
6. **Day 6**：L08 + L09（Studio 集成 + i18n）
7. **Day 7**：L10 尾测 · 跑一遍 Phase 1 端到端 · commit & push

（以上是"顺序建议"，非硬承诺时长；实际按工作节奏走。）

---

## 4. 验收清单（Phase 1 收尾）

- [ ] Prisma schema 有 `VideoScript` + `VideoScriptScene` + 2 enum
- [ ] `/api/video-script` 4 个端点齐全，各 5 个测试通过
- [ ] Studio video mode 下 toolbar 有"剧本"按钮，点击打开面板
- [ ] 用户输入主题 → 提交 → LLM 生成 → 展示 N 个场景 → 可编辑 → 确认 → DB 有 `status=SCRIPT_READY` 记录
- [ ] VS9 降级：Gemini 故障时能切 OpenAI（单测或手工模拟）
- [ ] VS10 删除：删剧本后关联 Generation 在 Gallery 仍存在
- [ ] VS11：dialogue 字段在编辑器中可见可编辑
- [ ] en / ja / zh 三语 key 对齐
- [ ] `npx vitest run` 全绿 · `npx tsc --noEmit` 干净
- [ ] commit 粒度按 WP 拆（或至少按层拆），每 commit 附上对应 WP 编号

---

## 5. 不在 Phase 1 范围

（再次明确，避免作用域蔓延）

- ❌ 调任何 image provider（Phase 2）
- ❌ 调任何 video provider（Phase 3）
- ❌ 拼接成片（Phase 4）
- ❌ Credit 扣费（Phase 2+ 再接，现在 LLM 成本忽略）
- ❌ 剧本模板 / 市集 / 分享（Phase 5+）
- ❌ TTS 朗读台词（VS11 明确 Phase 5+ 再接）
- ❌ 多 Character 切换（VO1，Phase 2 再定）
- ❌ 转场效果 `fade` / `dissolve`（Phase 4 前只存字段 + 限定 `cut`）

---

## 6. 本文件维护

- Phase 1 进行中：跟踪 WP 进度，在各 WP 栏加 ✅/🟡/❌ 状态
- Phase 1 完成：写 Phase 1 完成后的"现状映射"（`04-现状映射-Phase1.md` 或直接更新 `02-现状映射.md`）
- Phase 2 启动前：写 `03-工作包细分-Phase2.md`（分镜图生成），不回改此文件
