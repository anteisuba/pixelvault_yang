# 节点画布 — 后端集成设计书

## TL;DR

UI 设计完了。后端 **几乎不用新建**：项目已经有完整的 `VideoScript / VideoScriptScene / CharacterCard / BackgroundCard / VoiceCard / Generation / VideoPipeline` 体系 + 全套 `generate-image / generate-video / generate-audio / studio-generate / script-breakdown / video-scene-orchestrator` 服务。

节点画布是**一层 UI 编排器**，每个节点对应已有实体的一个视图。需要新建的只有：

1. **1 张新表** `NodeCanvas`：持久化画布 UI state（节点位置 + 连线 + zoom）
2. **2 个新 service**：`node-canvas.service`（CRUD）+ `node-bridge.service`（节点 ↔ 实体桥接）
3. **2 个新 API route**：`GET/PATCH /api/projects/[id]/canvas` + `POST /api/projects/[id]/canvas/agent-distribute`
4. **1 个 hook 升级**：`use-node-workflow.ts` 加载/保存远端 state

不新增任何 generation 表、不新增 card 表、不新增 pipeline 表、不动 R2 存储。

---

## 节点 ↔ 实体复用矩阵

| 节点类型            | 对应实体                                                                      | 复用 service                                                                             | 复用 API                                                     | 节点 data 字段                                                  |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| **composer**        | 纯 UI state                                                                   | —                                                                                        | —                                                            | `prompt`, `mode`, `attachedImageUrl?`                           |
| **agent**           | `VideoScript`                                                                 | `script-breakdown.service` + `video-script.service`                                      | `POST /api/script-breakdown`                                 | `videoScriptId`, `breakdown`                                    |
| **shot**            | `VideoScriptScene`                                                            | `video-script.service` + `video-scene-orchestrator.service`                              | `POST /api/video-script/[id]/scenes/[idx]/render`            | `sceneId`, `orderIndex`, `cameraShot`, `duration`, `transition` |
| **shotText**        | `VideoScriptScene.action / dialogue`                                          | `scene-prompt-compiler.service`                                                          | scene patch endpoint                                         | `sceneId`, `actionText`, `dialogueText`, `wordCount`            |
| **characterImage**  | `CharacterCard`                                                               | `character-card.service` + `character-refine.service` + `studio-generate.service`        | `POST /api/character-cards` + `POST /api/studio/generate`    | `characterCardId`, `generationId?`（如果是单独生成的图）        |
| **backgroundImage** | `BackgroundCard`                                                              | `background-card.service` + `studio-generate.service`                                    | `POST /api/background-cards` + `POST /api/studio/generate`   | `backgroundCardId`, `generationId?`                             |
| **frameImage**      | `Generation` (`outputType=IMAGE`) + 关联 `VideoScriptScene.frameGenerationId` | `studio-generate.service` + `video-scene-orchestrator.service`                           | `POST /api/studio/generate` + scene patch                    | `generationId`, `sceneId?`, `frameRole`(start/middle/end)       |
| **voice**           | `VoiceCard` + `Generation` (`outputType=AUDIO`)                               | `voice-card.service` + `generate-audio.service` + `fish-audio-voice.service`             | `POST /api/voice-cards` + `POST /api/generate-audio`         | `voiceCardId`, `generationId?`, `text`                          |
| **seedance**        | `VideoPipeline` 或 `VideoScriptScene.clipGenerationId`                        | `generate-video.service` + `video-pipeline.service` + `video-scene-orchestrator.service` | `POST /api/generate-video` + `POST /api/generate-long-video` | `pipelineId?`, `sceneId?`, `generationId?`                      |

> **规律**：每个节点 data 存「实体 id 引用」，不复制实体内容。节点 UI 渲染时通过 id 拉实体细节。

---

## 1. 新表 `NodeCanvas`（持久化 UI state）

```prisma
model NodeCanvas {
  id        String   @id @default(uuid())
  projectId String   @unique  // 一个 Project = 一个 canvas
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  // 整个画布 state 序列化为 JSONB（节点数组 + 边数组 + viewport）
  // 结构：{ nodes: NodeWorkflowNode[], edges: NodeWorkflowEdge[], viewport: { x, y, zoom } }
  state     Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([projectId])
}
```

加到 `Project` 关系：

```prisma
model Project {
  ...
  canvas NodeCanvas?
}
```

迁移：`npx prisma migrate dev --name node_canvas`

**为什么不拆细表（NodeRow / EdgeRow）**：React Flow state 整体读写为主（每次拖动都 patch），拆细表 query 多次往返不划算。jsonb 大字段 + debounce save 简单。

---

## 2. 新 service：`node-canvas.service.ts`

```typescript
import 'server-only'

import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { NodeWorkflowStateSchema } from '@/types'
import { logger } from '@/lib/logger'

export interface LoadCanvasResult {
  state: NodeWorkflowState | null // null = 项目还没初始化 canvas
  updatedAt: Date | null
}

export async function loadCanvas(
  projectId: string,
  userId: string,
): Promise<LoadCanvasResult> {
  // 1. verify project belongs to user
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, isDeleted: false },
    select: { id: true },
  })
  if (!project) throw new Error('Project not found')

  // 2. load canvas
  const canvas = await prisma.nodeCanvas.findUnique({
    where: { projectId },
  })
  if (!canvas) return { state: null, updatedAt: null }

  const parsed = NodeWorkflowStateSchema.safeParse(canvas.state)
  if (!parsed.success) {
    logger.error('node-canvas.invalid-state', {
      projectId,
      error: parsed.error,
    })
    return { state: null, updatedAt: canvas.updatedAt }
  }
  return { state: parsed.data, updatedAt: canvas.updatedAt }
}

export async function saveCanvas(
  projectId: string,
  userId: string,
  state: NodeWorkflowState,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, isDeleted: false },
    select: { id: true },
  })
  if (!project) throw new Error('Project not found')

  await prisma.nodeCanvas.upsert({
    where: { projectId },
    create: { projectId, state },
    update: { state },
  })
  logger.info('node-canvas.saved', { projectId, nodeCount: state.nodes.length })
}
```

约束：

- 必须 `import 'server-only'`
- 所有写都先 verify project ownership（防越权）
- 用 zod parse 验证 jsonb 内容
- 用 `logger.ts` 不要 `console.log`

---

## 3. 新 service：`node-bridge.service.ts`

桥接「节点 data 字段」↔「实体 service 调用」。

```typescript
import 'server-only'

import { prisma } from '@/lib/prisma'
import { createCharacterCardsBatch } from '@/services/character-card.service'
import { createBackgroundCardsBatch } from '@/services/background-card.service'
import { createVideoScript } from '@/services/video-script.service'
import type { ScriptBreakdownResult, NodeWorkflowNode } from '@/types'

/**
 * Agent 拆解后批量创建下游实体 + 返回节点 data 引用。
 * 调用 Frame 14 的"展开为节点"按钮。
 */
export async function distributeAgentBreakdown(args: {
  userId: string
  projectId: string
  agentNodeId: string
  breakdown: ScriptBreakdownResult
}): Promise<{
  characterNodes: Array<{ characterCardId: string; sourceLabel: string }>
  backgroundNodes: Array<{ backgroundCardId: string; sourceLabel: string }>
  shotNodes: Array<{ sceneId: string; orderIndex: number }>
  shotTextNodes: Array<{ sceneId: string; orderIndex: number }>
  videoScriptId: string
}> {
  const { userId, projectId, breakdown } = args

  // 1. Create VideoScript (carries the scenes)
  const script = await createVideoScript({
    userId,
    topic: breakdown.title,
    targetDuration: breakdown.beats.reduce((sum, b) => sum + b.durationSec, 0),
    consistencyMode: 'character_card',
    videoModelId: 'seedance-2-fast',
    // 其余字段先放 placeholder，render 时填
  })

  // 2. Batch create CharacterCards
  const characterCards = await createCharacterCardsBatch({
    userId,
    projectId,
    drafts: breakdown.characters.map((c) => ({
      name: c.nameSuggestion,
      description: c.functionInStory,
      characterPrompt: c.visualSeed,
      attributes: {
        role: c.role,
        personality: c.personality,
        goal: c.goal,
      },
    })),
  })

  // 3. Batch create BackgroundCards
  const backgroundCards = await createBackgroundCardsBatch({
    userId,
    projectId,
    drafts: breakdown.scenes.map((s) => ({
      name: s.label,
      backgroundPrompt: s.visualSeed,
      attributes: {
        locationType: s.locationType,
        timeOfDay: s.timeOfDay,
        mood: s.mood,
        lighting: s.lighting,
      },
    })),
  })

  // 4. Create scenes（每个 shot 一个 scene）
  const scenes = await prisma.videoScriptScene.createMany({
    data: breakdown.shots.map((shot, idx) => ({
      scriptId: script.id,
      orderIndex: idx,
      duration: breakdown.beats[idx]?.durationSec ?? 4,
      cameraShot: shot.cameraMotion,
      action: shot.startState + ' → ' + shot.endState,
      dialogue: null,
      transition: 'cut',
    })),
  })
  const sceneRecords = await prisma.videoScriptScene.findMany({
    where: { scriptId: script.id },
    orderBy: { orderIndex: 'asc' },
  })

  return {
    characterNodes: characterCards.map((c) => ({
      characterCardId: c.id,
      sourceLabel: c.name,
    })),
    backgroundNodes: backgroundCards.map((b) => ({
      backgroundCardId: b.id,
      sourceLabel: b.name,
    })),
    shotNodes: sceneRecords.map((s) => ({
      sceneId: s.id,
      orderIndex: s.orderIndex,
    })),
    shotTextNodes: sceneRecords.map((s) => ({
      sceneId: s.id,
      orderIndex: s.orderIndex,
    })),
    videoScriptId: script.id,
  }
}
```

> **依赖确认**：
>
> - `createCharacterCardsBatch` 可能不存在，需要在 `character-card.service.ts` 加这个批量入口（如已有 `createCharacterCard` 单条，wrap 一层 `Promise.all` 即可）
> - 同理 `createBackgroundCardsBatch`
> - `createVideoScript` 在 `video-script.service.ts` 应已存在，确认签名

---

## 4. 新 API routes

### `GET/PATCH /api/projects/[id]/canvas`

```typescript
// src/app/api/projects/[id]/canvas/route.ts
import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { loadCanvas, saveCanvas } from '@/services/node-canvas.service'
import { NodeWorkflowStateSchema } from '@/types'
import { logger } from '@/lib/logger'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const result = await loadCanvas(params.id, userId)
    return NextResponse.json(result)
  } catch (error) {
    logger.error('canvas.load.failed', { projectId: params.id, error })
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = NodeWorkflowStateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    await saveCanvas(params.id, userId, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('canvas.save.failed', { projectId: params.id, error })
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
```

### `POST /api/projects/[id]/canvas/agent-distribute`

```typescript
// src/app/api/projects/[id]/canvas/agent-distribute/route.ts
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { distributeAgentBreakdown } from '@/services/node-bridge.service'
import { ScriptBreakdownResultSchema } from '@/types'

const BodySchema = z.object({
  agentNodeId: z.string(),
  breakdown: ScriptBreakdownResultSchema,
})

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = BodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  const result = await distributeAgentBreakdown({
    userId,
    projectId: params.id,
    agentNodeId: parsed.data.agentNodeId,
    breakdown: parsed.data.breakdown,
  })
  return NextResponse.json(result)
}
```

---

## 5. 现有 API 复用清单（每种节点的"生成"动作直接接）

| 节点                     | 触发按钮               | 调现有 API                                                                                                                       | 入参重点                                                              |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **composer** send        | 发送箭头               | `POST /api/script-breakdown`（已存在）                                                                                           | `idea, plannerProvider, apiKeyId?`                                    |
| **characterImage** 生成  | 节点内"生成定妆"       | `POST /api/studio/generate`                                                                                                      | `cardIds.character`, `prompt`, modelId                                |
| **backgroundImage** 生成 | 节点内"生成背景"       | `POST /api/studio/generate`                                                                                                      | `cardIds.background`, `prompt`, modelId                               |
| **frameImage** 生成      | 节点内"生成关键帧"     | `POST /api/studio/generate`                                                                                                      | `referenceImages: [characterImage.url, backgroundImage.url]`, modelId |
| **voice** 生成           | 节点内"合成语音"       | `POST /api/generate-audio`                                                                                                       | `voiceCardId, text`                                                   |
| **seedance** 生成        | 节点内"渲染视频"       | `POST /api/generate-video` 或 `POST /api/generate-long-video`                                                                    | `frames: [{generationId, role}], audio: voiceGenerationId, modelId`   |
| **shot** 渲染            | hub 节点底部"生成镜头" | `POST /api/video-script/[id]/scenes/[idx]/render`（需要新增 — 可能 video-scene-orchestrator.service 已有内部入口，包一层 route） | `sceneId`                                                             |

所有响应回写到对应节点 `data.generationId`，前端 reactive 重渲染。

---

## 6. 客户端 hook 升级 `use-node-workflow.ts`

加 3 件事：

1. **初始 load**：mount 时调 `GET /api/projects/[id]/canvas`，无 state 则 seed（保留现有 composer+agent 默认对）
2. **debounce save**：state 变化后 800ms 防抖 PATCH 上去
3. **agent distribute**：从 ComposerNode send 流程拿到 breakdown 后，调 `agent-distribute` API，批量创建下游节点（auto-layout）

```typescript
// 关键签名（不全写）
export function useNodeWorkflow(projectId: string) {
  const [state, setState] = useState<NodeWorkflowState>(...)
  const [isLoaded, setIsLoaded] = useState(false)

  // load on mount
  useEffect(() => {
    apiClient.get(`/api/projects/${projectId}/canvas`).then((res) => {
      if (res.state) setState(res.state)
      setIsLoaded(true)
    })
  }, [projectId])

  // debounce save
  const debouncedSave = useMemo(() => debounce((next) => {
    apiClient.patch(`/api/projects/${projectId}/canvas`, next)
  }, 800), [projectId])
  useEffect(() => {
    if (isLoaded) debouncedSave(state)
  }, [state, isLoaded])

  // agent distribute
  const distributeFromAgent = useCallback(async (agentNodeId, breakdown) => {
    const result = await apiClient.post(
      `/api/projects/${projectId}/canvas/agent-distribute`,
      { agentNodeId, breakdown },
    )
    // 把返回的 ids 创建对应 nodes + auto-layout
    setState((prev) => insertDistributedNodes(prev, agentNodeId, result))
  }, [projectId])

  return { ...state, distributeFromAgent, isLoaded, ... }
}
```

API client 走 `src/lib/api-client.ts`，不要直接 `fetch`。

---

## 7. types 扩展（`src/types/node-workflow.ts`）

加 Zod schema 兼容存盘：

```typescript
import { z } from 'zod'

export const NodeWorkflowPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export const NodeWorkflowModelSelectionSchema = z.object({
  optionId: z.string(),
  modelId: z.string(),
  adapterType: z.nativeEnum(AI_ADAPTER_TYPES),
  providerConfig: z.record(z.unknown()),
  apiKeyId: z.string().optional(),
  label: z.string().optional(),
})

export const NodeWorkflowNodeDataSchema = z
  .object({
    prompt: z.string().default(''),
    model: NodeWorkflowModelSelectionSchema.optional(),
    // 节点 ↔ 实体引用（按类型可选）
    videoScriptId: z.string().optional(),
    sceneId: z.string().optional(),
    characterCardId: z.string().optional(),
    backgroundCardId: z.string().optional(),
    voiceCardId: z.string().optional(),
    generationId: z.string().optional(),
    pipelineId: z.string().optional(),
    // breakdown 在 agent 节点上
    breakdown: ScriptBreakdownResultSchema.optional(),
    plannerLabel: z.string().optional(),
    plannerModelId: z.string().optional(),
    // frame role 在 frameImage 节点上
    frameRole: z.enum(['start', 'middle', 'end']).optional(),
  })
  .passthrough() // 容忍未来扩展

export const NodeWorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(NODE_WORKFLOW_NODE_TYPES),
  position: NodeWorkflowPositionSchema,
  data: NodeWorkflowNodeDataSchema,
  selected: z.boolean().optional(),
})

export const NodeWorkflowEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    animated: z.boolean().optional(),
  })
  .passthrough()

export const NodeWorkflowStateSchema = z.object({
  nodes: z.array(NodeWorkflowNodeSchema),
  edges: z.array(NodeWorkflowEdgeSchema),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number() })
    .optional(),
})

export type NodeWorkflowState = z.infer<typeof NodeWorkflowStateSchema>
```

---

## 8. 不要做的事

- ❌ 不要建 `NodeRow / EdgeRow` 拆细表（jsonb 就够，整体读写为主）
- ❌ 不要在节点 data 里复制实体内容（只存 id）
- ❌ 不要为节点画布建新的 generation / storage 通路（统一走现有 `studio-generate.service`）
- ❌ 不要为每种节点写专门的 generate API（image/video/audio 共用现有 3 个 endpoint）
- ❌ 不要建 `NodeProject` 表（直接用 `Project`）
- ❌ 不要给节点 data 加 prompt 编译逻辑（用 `scene-prompt-compiler` / `prompt-compiler` 已有）

---

## 9. 实施分阶段

### Phase 1 — 持久化 MVP（半天）

- [ ] Prisma 加 `NodeCanvas` 表 + migration
- [ ] 实现 `node-canvas.service.ts`（loadCanvas / saveCanvas）
- [ ] API `GET/PATCH /api/projects/[id]/canvas`
- [ ] hook 加 load + debounce save
- [ ] types 加 Zod schema
- [ ] 测试：刷新页面不丢节点位置和连线
- [ ] **验收**：浏览器拖一个节点，刷新，节点位置保留

### Phase 2 — Agent 一键分发（半天）

- [ ] `character-card.service` + `background-card.service` 加 `Batch` 入口
- [ ] 实现 `node-bridge.service.distributeAgentBreakdown`
- [ ] API `POST /api/projects/[id]/canvas/agent-distribute`
- [ ] hook 加 `distributeFromAgent`，触发后批量创建节点 + 自动布局算法
- [ ] AgentNode 加"展开为节点 →"按钮（done state 时显示）
- [ ] **验收**：composer 输入剧本想法 → 发送 → agent done → 点"展开" → 画布出现 3-8 个下游节点 + 连线

### Phase 3 — 每个节点的单独生成（1 天）

- [ ] characterImage 节点接 `studio-generate` → 写回 generationId
- [ ] backgroundImage 节点同上
- [ ] frameImage 节点引用上游 character + background URL 作 reference image
- [ ] voice 节点接 `generate-audio`
- [ ] 状态机：ready → running → done / failed
- [ ] 节点 done 后 preview 区显示缩略图（拉 generation.url）
- [ ] **验收**：每个节点独立可生成，画布上能看到所有产物缩略图

### Phase 4 — Shot Hub + Seedance（1-2 天）

- [ ] shot 节点 hub UI（4 个 slot 显示上游节点缩略图）
- [ ] shot 节点的"生成镜头"按钮：组合 character + background + frames + voice → 调 `video-scene-orchestrator`
- [ ] seedance 节点接 `generate-video` / `generate-long-video`
- [ ] 进度轮询（pipeline 长时间运行）
- [ ] **验收**：从想法 → 拆解 → 角色/背景/帧 → shot → seedance → 最终视频，端到端跑通

### Phase 5 — 协作 + 持久化增强（可选）

- [ ] 多人协作（CRDT 或 server-sent events）
- [ ] 节点历史（每次 generate 留 generation history）
- [ ] 工作流模板（fork canvas）

---

## 10. 风险点 + 注意

1. **VideoScriptScene 字段够不够**：当前 scene 有 `cameraShot / action / dialogue / frameGenerationId / clipGenerationId`，但没显式存 `characterCardIds[] / backgroundCardId / voiceCardId`。可能需要：
   - 方案 A：scene 加 jsonb 字段 `bindings: { characterIds, backgroundId, voiceId, frameRefIds }`
   - 方案 B：建 SceneNodeBinding 关联表
   - **推荐 A**：jsonb 不破坏关系，scene render 时从 jsonb 读

2. **节点 data 大小**：单节点 data 控制在 < 5KB。breakdown 完整可能大（多个 character / scene），存在 agent 节点 data 里可能 50KB+。建议 agent 节点只存 `videoScriptId`，breakdown 内容查 VideoScript 拉。

3. **Project ↔ Canvas 强耦合**：一个 Project 只有一个 canvas。如果未来要 "一个 project 多个 canvas 版本"，schema 改成 `projectId, name, version` 联合 unique。

4. **Migration 顺序**：Phase 1 的 `NodeCanvas` migration 必须先跑，否则 API 会炸。

5. **Server-only 强制**：所有 service 文件第一行 `import 'server-only'`，否则 hook 误 import 会泄露密钥。

6. **资费拦截**：每个节点的"生成"按钮调用都走现有 generate API，credit 扣减已在 `studio-generate.service` 实现，**不要在 hook 端做扣减**。

---

## 11. codex 执行命令模板

```bash
# Phase 1
codex exec "读 docs/plans/backend/node-workflow-backend-spec.md。实现 Phase 1：Prisma 加 NodeCanvas 表 + 跑 migration + 写 node-canvas.service + 加 GET/PATCH /api/projects/[id]/canvas + 升级 use-node-workflow.ts 加 load/debounce save。每步完成跑 npx tsc --noEmit 验证。所有 service 加 'server-only'，所有 hook 走 api-client，所有 schema 用 Zod。"
```

```bash
# Phase 2
codex exec "在 Phase 1 基础上实现 Phase 2：character/background service 加 batch 入口 + node-bridge.service.distributeAgentBreakdown + POST /api/projects/[id]/canvas/agent-distribute + hook 加 distributeFromAgent + AgentNode 加按钮。"
```

```bash
# Phase 3
codex exec "实现 Phase 3：4 种节点（characterImage / backgroundImage / frameImage / voice）的生成动作各接现有 API（studio-generate / generate-audio），节点 data 写回 generationId，PlaceholderNode done state 渲染缩略图。"
```

每个 phase 之间 ship + 我验证 + 再继续。
