import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { applyCanvasBatchV4, mintCanvasId } from '@/lib/node-canvas-batch-v4'
import { applyNodeMediaPatch } from '@/lib/node-media-patch'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import {
  NODE_V4_UPGRADE_OUTCOMES,
  upgradeNodeWorkflowStateToV4,
} from '@/lib/node-workflow-v4-upgrade'
import {
  getNodeWorkflowProject,
  NodeWorkflowProjectConflictError,
  updateNodeWorkflowProject,
} from '@/services/node/node-workflow.service'
import { AUDIO_CLIP_SOURCE } from '@/constants/audio-options'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeWorkflowStateV4 } from '@/types/node-workflow'

/**
 * 导出成片落回画布 —— **在服务端**（docs/references/mcp.md §7）。
 *
 * 以前是浏览器轮询到「完成」之后自己建卡、回填、逐条连线：浏览器关了、或者导出是
 * Claude 经 MCP 发起的，卡就永远落不下来。现在成片回调里直接写进项目，开着的画布
 * 靠实时跟随（§6）跟上。⛔ 浏览器那条落卡已删 —— 两条路会落两张卡。
 *
 * 一次落卡 = 一张 `video.shot`（⛔ 不复活 `video.merge`）+ 每张来源卡连一条
 * `reference`（端口表上唯一收视频的口）+ 成片那一版的来源写 `render`。建卡与连线
 * 走与图引擎同一个批量纯函数，回填走与 `setMedia` 同一个纯函数。
 */

/** 批内给新卡起的别名（同批的 connect 靠它引用）。 */
const CUT_REF = 'cut'

/** 版本号撞车时在最新那份上重来几次 —— 纯新增，重来不会盖掉用户的改动。 */
const LAND_MAX_ATTEMPTS = 3

/** 新卡离最右边那张来源卡多远。 */
const LAND_GAP_PX = 80

export interface RenderLandingInput {
  readonly userId: string
  readonly canvasProjectId: string
  readonly sourceNodeIds: readonly string[]
  readonly name: string
  /** 卡上 ⋯ 那一行只读的「来源」—— 按发起导出时的界面语言拼好。 */
  readonly sourceLabel: string
  readonly generation: {
    readonly id: string
    readonly url: string
    readonly thumbnailUrl?: string
  }
}

/** 落在来源卡里最右边那张的右侧；一张来源卡都不在了就落在全图最右边。 */
function landingPosition(
  state: NodeWorkflowStateV4,
  sourceNodeIds: readonly string[],
): { x: number; y: number } {
  const sources = state.nodes.filter((node) => sourceNodeIds.includes(node.id))
  const pool = sources.length > 0 ? sources : state.nodes
  if (pool.length === 0) return { x: 0, y: 0 }
  const rightmost = pool.reduce((best, node) =>
    node.position.x > best.position.x ? node : best,
  )
  return {
    x: rightmost.position.x + NODE_V4_CARD.shotCollapsedWidth + LAND_GAP_PX,
    y: rightmost.position.y,
  }
}

/** 落卡后的整份 state；来源卡与成片在一个批里（一次性、可一起撤销）。 */
export function buildRenderLanding(
  state: NodeWorkflowStateV4,
  input: Omit<RenderLandingInput, 'userId' | 'canvasProjectId'>,
  context: { readonly now: string },
): { readonly state: NodeWorkflowStateV4; readonly nodeId: string } | null {
  // ⚠ 去重：两段来自同一张卡时只连一条边（`reference` 是一条槽，连两次的第二条
  // 只会被判成重复）；已经不在画布上的卡跳过。
  const sources = [...new Set(input.sourceNodeIds)].filter((id) =>
    state.nodes.some((node) => node.id === id),
  )
  const ops: NodeAssistantOpV4[] = [
    {
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
      ref: CUT_REF,
      name: input.name,
      position: landingPosition(state, sources),
    },
    ...sources.map(
      (source): NodeAssistantOpV4 => ({
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source,
        target: CUT_REF,
        slot: NODE_SLOT_IDS.reference,
      }),
    ),
  ]
  const batch = applyCanvasBatchV4(state, ops, { mintId: mintCanvasId })
  const nodeId = batch.createdNodeIds[0]
  if (!nodeId) return null

  const withMedia: NodeWorkflowStateV4 = {
    ...batch.state,
    nodes: batch.state.nodes.map((node) =>
      node.id === nodeId && node.data.kind !== NODE_MEDIA_KIND_IDS.text
        ? {
            ...node,
            data: applyNodeMediaPatch(
              node.data,
              {
                url: input.generation.url,
                imageSource: 'generated',
                ...(input.generation.thumbnailUrl
                  ? { videoThumbnailUrl: input.generation.thumbnailUrl }
                  : {}),
                generationId: input.generation.id,
                // ⚠ 这一版**不是这张卡自己生成的**：没有提示词也没有模型，⋯ 菜单那一行
                // 只读的「来源」是唯一能回答「这是哪来的」的地方。
                source: {
                  kind: AUDIO_CLIP_SOURCE.render,
                  label: input.sourceLabel,
                },
              },
              { now: context.now, mintId: mintCanvasId },
            ),
          }
        : node,
    ),
  }
  return { state: reconcileStateSlots(withMedia), nodeId }
}

/**
 * 落卡。返回新卡的 id；项目不在 / 不是 v4 / 连撞三次版本号 = `null`（⚠ 成片本身
 * 已经进了素材库，落不下来只是少一张卡，由调用方记日志，⛔ 不让整个回调失败）。
 */
export async function landRenderOnCanvas(
  input: RenderLandingInput,
): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { clerkId: true },
  })
  if (!user) return null

  for (let attempt = 0; attempt < LAND_MAX_ATTEMPTS; attempt += 1) {
    // 按归属取（与画布保存同一个服务）：不是这个人的项目就当没有。
    const record = await getNodeWorkflowProject(
      user.clerkId,
      input.canvasProjectId,
    )
    if (!record) {
      logger.warn('render.land.project_missing', {
        projectId: input.canvasProjectId,
      })
      return null
    }
    const upgraded = await upgradeNodeWorkflowStateToV4({
      projectId: input.canvasProjectId,
      rawState: record.state,
      backup: async () => null,
    })
    if (
      upgraded.outcome !== NODE_V4_UPGRADE_OUTCOMES.alreadyV4 ||
      !upgraded.state
    ) {
      logger.warn('render.land.not_v4', { projectId: input.canvasProjectId })
      return null
    }

    const landed = buildRenderLanding(upgraded.state, input, {
      now: new Date().toISOString(),
    })
    if (!landed) {
      logger.warn('render.land.no_node', { projectId: input.canvasProjectId })
      return null
    }

    try {
      await updateNodeWorkflowProject(user.clerkId, input.canvasProjectId, {
        state: landed.state,
        baseUpdatedAt: record.updatedAt,
      })
      return landed.nodeId
    } catch (error) {
      if (error instanceof NodeWorkflowProjectConflictError) continue
      throw error
    }
  }

  logger.warn('render.land.conflict_exhausted', {
    projectId: input.canvasProjectId,
  })
  return null
}
