import 'server-only'

import { db } from '@/lib/db'
import {
  currentUrlOf,
  projectDurationSec,
  RenderPlanError,
  toRenderPlan,
  type RenderPlanRange,
} from '@/lib/edit-project'
import { ApiRequestError } from '@/lib/errors'
import {
  buildTimelineSnapshot,
  findTimelineClip,
  timelineToSourceSec,
  type TimelineSnapshot,
} from '@/lib/edit-timeline-snapshot'
import {
  NODE_V4_UPGRADE_OUTCOMES,
  upgradeNodeWorkflowStateToV4,
} from '@/lib/node-workflow-v4-upgrade'
import { applyCanvasBatchV4, mintCanvasId } from '@/lib/node-canvas-batch-v4'
import { readOutputVersions } from '@/lib/node-output-versions'
import { buildCanvasOperatorSnapshot } from '@/lib/studio-operator-canvas-snapshot'
import { getImagePreviewUrl, getVideoFrameUrl } from '@/lib/video-poster'
import {
  getNodeWorkflowProject,
  NodeWorkflowProjectConflictError,
  NodeWorkflowStateCorruptError,
  updateNodeWorkflowProject,
} from '@/services/node/node-workflow.service'
import type { McpTokenOwner } from '@/services/mcp/mcp-token.service'
import {
  getRenderJob,
  RenderSubmitSchema,
  submitRenderJob,
  toDraftRenderPlan,
} from '@/services/video/render-video.service'
import {
  EDIT_EXPORT_RANGE_IDS,
  EDIT_TRACK_IDS,
  type EditResolution,
} from '@/constants/edit-desk'
import {
  MCP_LIST_PROJECTS_LIMIT,
  MCP_LOOK_AT_FETCH_TIMEOUT_MS,
  MCP_LOOK_AT_FRAME_WIDTH,
  type McpRenderKind,
} from '@/constants/mcp'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  RENDER_JOB_STATUS_IDS,
  type RenderJobStatusId,
  type RenderStepId,
} from '@/constants/render-video'
import type { AssistantOperatorCanvasSnapshot } from '@/types/assistant-operator'
import type {
  McpApplyOpsInput,
  McpGetRenderInput,
  McpLookAtInput,
  McpReadProjectInput,
  McpRenderInput,
} from '@/types/mcp'
import {
  EditProjectSchema,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

/**
 * MCP 的工具（`docs/references/mcp.md` §4）：S2 三个只读 + S3 `apply_ops` + S4 渲染。
 *
 * ⚠ 每个工具都从令牌主人的 Clerk id 出发、走现成的按归属取项目的服务 ——
 * ⛔ 不在这里另写一条「按 id 取项目」的查询，归属校验只有一份。
 */

/** 给 Claude 看的错误：一句能照着做的话。 */
export class McpToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpToolError'
  }
}

/* ─── list_projects ───────────────────────────────────────────────────── */

export interface McpProjectSummary {
  readonly projectId: string
  readonly name: string
  readonly updatedAt: string
  readonly nodeCount: number
  /** 时间线段数与时长；没进过剪辑台 = 缺席。 */
  readonly timeline?: {
    readonly clipCount: number
    readonly durationSec: number
  }
  /** 还不是 v4 —— 读 / 看都会被拒，得先在浏览器打开一次。 */
  readonly needsUpgrade?: true
}

/**
 * ⚠ 一个项目坏了不连累整张列表：这里只数、不严格解析（严格解析在 `read_project`）。
 */
export async function listProjectsForMcp(
  owner: McpTokenOwner,
): Promise<McpProjectSummary[]> {
  const rows = await db.nodeWorkflowProject.findMany({
    where: { userId: owner.userId, isDeleted: false },
    orderBy: { lastActiveAt: 'desc' },
    take: MCP_LIST_PROJECTS_LIMIT,
    select: { id: true, name: true, state: true, updatedAt: true },
  })

  return rows.map((row) => {
    const state = (row.state ?? {}) as {
      version?: unknown
      nodes?: unknown
      edit?: unknown
    }
    const edit = EditProjectSchema.safeParse(state.edit)
    const clipCount = edit.success
      ? edit.data.tracks.video.length +
        edit.data.tracks.audio.length +
        edit.data.tracks.music.length
      : 0
    return {
      projectId: row.id,
      name: row.name,
      updatedAt: row.updatedAt.toISOString(),
      nodeCount: Array.isArray(state.nodes) ? state.nodes.length : 0,
      ...(edit.success && clipCount > 0
        ? {
            timeline: {
              clipCount,
              durationSec: Math.round(projectDurationSec(edit.data) * 10) / 10,
            },
          }
        : {}),
      ...(state.version === 4 ? {} : { needsUpgrade: true as const }),
    }
  })
}

/* ─── 取项目（read_project / look_at 共用）────────────────────────────── */

interface LoadedProject {
  readonly name: string
  readonly version: string
  readonly state: NodeWorkflowStateV4
}

async function loadProject(
  owner: McpTokenOwner,
  projectId: string,
): Promise<LoadedProject> {
  let record
  try {
    record = await getNodeWorkflowProject(owner.clerkId, projectId)
  } catch (error) {
    if (error instanceof NodeWorkflowStateCorruptError) {
      throw new McpToolError(
        'This project could not be read. Ask the user to open it in the browser.',
      )
    }
    throw error
  }
  if (!record) {
    throw new McpToolError(
      `No project ${projectId}. Use list_projects to find project ids.`,
    )
  }

  // v4 的读路径与浏览器载入同一条：解析 + 槽位规整。⛔ 服务端不做 v3 升级 ——
  // 那要先备份，是浏览器那一侧的事（services/CLAUDE.md）。
  const upgraded = await upgradeNodeWorkflowStateToV4({
    projectId,
    rawState: record.state,
    backup: async () => null,
  })
  if (
    upgraded.outcome !== NODE_V4_UPGRADE_OUTCOMES.alreadyV4 ||
    !upgraded.state
  ) {
    throw new McpToolError(
      'This project has not been upgraded yet. Ask the user to open it once in the browser, then try again.',
    )
  }

  return { name: record.name, version: record.updatedAt, state: upgraded.state }
}

/* ─── read_project ────────────────────────────────────────────────────── */

export interface McpProjectView {
  readonly projectId: string
  readonly name: string
  /** 写入时原样带回（S3 `apply_ops` 的 `baseVersion`）。 */
  readonly version: string
  readonly canvas: AssistantOperatorCanvasSnapshot
  readonly timeline: TimelineSnapshot | null
  /**
   * 每张媒体卡当前那一版的地址。`set_review_state` 要它指明打回的是**哪一版**
   * （防止把后来新出的一版一起打回）；画布快照只说「有没有产出」，所以单独给。
   */
  readonly takes: readonly { readonly nodeId: string; readonly url: string }[]
}

export async function readProjectForMcp(
  owner: McpTokenOwner,
  input: McpReadProjectInput,
): Promise<McpProjectView> {
  const project = await loadProject(owner, input.projectId)
  return {
    projectId: input.projectId,
    name: project.name,
    version: project.version,
    // ⚠ 与站内助手同一个分层快照（§4.1），⛔ 不另写一份给 MCP。
    canvas: buildCanvasOperatorSnapshot({
      nodes: project.state.nodes,
      edges: project.state.edges,
      currentShotNo: input.focusShot ?? null,
    }),
    timeline: buildTimelineSnapshot(project.state.edit, project.state.nodes),
    takes: project.state.nodes.flatMap((node) => {
      const url = currentUrlOf(node)
      return url ? [{ nodeId: node.id, url }] : []
    }),
  }
}

/* ─── look_at ─────────────────────────────────────────────────────────── */

export type McpFrame =
  | {
      readonly label: string
      readonly ok: true
      readonly mimeType: string
      readonly base64: string
    }
  | { readonly label: string; readonly ok: false; readonly reason: string }

interface FramePlan {
  readonly label: string
  readonly url: string | null
  /** 截不了的原因（时间落在段外等），有它就不去取。 */
  readonly reason?: string
}

function formatSec(seconds: number): string {
  return `${Math.round(seconds * 1000) / 1000}s`
}

const NOT_ON_CDN =
  'this media is not a PixelVault-hosted MP4/image, so no frame can be taken'

function planFrames(
  state: NodeWorkflowStateV4,
  input: McpLookAtInput,
): FramePlan[] {
  if (input.clipId) {
    const hit = findTimelineClip(state.edit, input.clipId)
    if (!hit) {
      throw new McpToolError(
        `No timeline clip ${input.clipId}. Read the project to see clip ids.`,
      )
    }
    if (hit.track !== EDIT_TRACK_IDS.video) {
      throw new McpToolError(
        'Only video clips have pictures; this clip is on an audio track.',
      )
    }
    const node = state.nodes.find((n) => n.id === hit.clip.sourceNodeId)
    const url = currentUrlOf(node)
    if (!url) {
      throw new McpToolError(
        'The card this clip came from is gone or has no video.',
      )
    }
    if (!input.times) {
      throw new McpToolError('Pass times (timeline seconds) to look at a clip.')
    }
    return input.times.map((time) => {
      const sourceSec = timelineToSourceSec(hit, time)
      const label = `${formatSec(time)} on the timeline`
      if (sourceSec === null) {
        return {
          label,
          url: null,
          reason: `outside this clip (${formatSec(hit.startSec)}–${formatSec(hit.startSec + hit.durationSec)})`,
        }
      }
      const frameUrl = getVideoFrameUrl(url, sourceSec, MCP_LOOK_AT_FRAME_WIDTH)
      return frameUrl
        ? { label, url: frameUrl }
        : { label, url: null, reason: NOT_ON_CDN }
    })
  }

  const node = state.nodes.find((n) => n.id === input.nodeId)
  if (!node) {
    throw new McpToolError(
      `No node ${input.nodeId}. Read the project to see node ids.`,
    )
  }
  const url = currentUrlOf(node)
  if (node.data.kind === NODE_MEDIA_KIND_IDS.image) {
    if (!url) throw new McpToolError('This image card has no image yet.')
    const previewUrl = getImagePreviewUrl(url, MCP_LOOK_AT_FRAME_WIDTH)
    return [
      previewUrl
        ? { label: 'image', url: previewUrl }
        : { label: 'image', url: null, reason: NOT_ON_CDN },
    ]
  }
  if (node.data.kind !== NODE_MEDIA_KIND_IDS.video) {
    throw new McpToolError('Only video and image cards can be looked at.')
  }
  if (!url) throw new McpToolError('This video card has no video yet.')
  if (!input.times) {
    throw new McpToolError(
      'Pass times (seconds into the take) to look at a video.',
    )
  }
  return input.times.map((time) => {
    const label = `${formatSec(time)} into the take`
    const frameUrl = getVideoFrameUrl(url, time, MCP_LOOK_AT_FRAME_WIDTH)
    return frameUrl
      ? { label, url: frameUrl }
      : { label, url: null, reason: NOT_ON_CDN }
  })
}

async function fetchFrame(plan: FramePlan): Promise<McpFrame> {
  if (!plan.url) {
    return { label: plan.label, ok: false, reason: plan.reason ?? NOT_ON_CDN }
  }
  try {
    const response = await fetch(plan.url, {
      signal: AbortSignal.timeout(MCP_LOOK_AT_FETCH_TIMEOUT_MS),
    })
    const mimeType = response.headers.get('content-type') ?? ''
    if (!response.ok || !mimeType.startsWith('image/')) {
      // 边缘截帧的失败多半是源不合格（>100MB / >10 分钟 / 时间点超出片长）。
      return {
        label: plan.label,
        ok: false,
        reason: `the CDN could not extract this frame (HTTP ${response.status}); the time may be past the end of the video`,
      }
    }
    const base64 = Buffer.from(await response.arrayBuffer()).toString('base64')
    return { label: plan.label, ok: true, mimeType, base64 }
  } catch {
    return {
      label: plan.label,
      ok: false,
      reason: 'timed out fetching this frame',
    }
  }
}

/** 渲染出来的片子：小样 / 成片都在自家 CDN 上，截帧与看镜头同一条路。 */
async function planRenderFrames(
  owner: McpTokenOwner,
  jobId: string,
  times: readonly number[] | undefined,
): Promise<FramePlan[]> {
  const job = await getRenderJob(owner.clerkId, jobId)
  if (!job) {
    throw new McpToolError(`No render ${jobId}. Use the jobId render returned.`)
  }
  const url = job.url
  if (job.status !== RENDER_JOB_STATUS_IDS.completed || !url) {
    throw new McpToolError(
      `This render is ${job.status}, not finished. Poll get_render until it completes.`,
    )
  }
  if (!times) {
    throw new McpToolError(
      'Pass times (seconds into the render) to look at it.',
    )
  }
  return times.map((time) => {
    const label = `${formatSec(time)} into the render`
    const frameUrl = getVideoFrameUrl(url, time, MCP_LOOK_AT_FRAME_WIDTH)
    return frameUrl
      ? { label, url: frameUrl }
      : { label, url: null, reason: NOT_ON_CDN }
  })
}

/** 每一帧各自成败，⛔ 一帧失败不连累同批其它帧。 */
export async function lookAtForMcp(
  owner: McpTokenOwner,
  input: McpLookAtInput,
): Promise<McpFrame[]> {
  if (input.renderJobId) {
    const plans = await planRenderFrames(owner, input.renderJobId, input.times)
    return Promise.all(plans.map(fetchFrame))
  }
  const project = await loadProject(owner, input.projectId)
  return Promise.all(planFrames(project.state, input).map(fetchFrame))
}

/* ─── apply_ops（S3）──────────────────────────────────────────────────── */

export interface McpApplyResult {
  /** 下一次写入带这个。一条都没落时不变。 */
  readonly version: string
  readonly applied: number
  readonly skipped: readonly {
    readonly index: number
    readonly op: string
    readonly reason: string
  }[]
  readonly changedNodeIds: readonly string[]
  readonly createdNodeIds: readonly string[]
}

const STALE_VERSION =
  'The project changed since you read it (the user or another tab edited it). Nothing was written. Read it again and redo your change on the new version.'

/**
 * ⚠ 服务端**不给** `resolveModel`：「型号 → 完整选择（渠道 / key）」要用户的 key
 * 与渠道健康状态，那是浏览器里 `useWorkflowModelOptions` 的活。执行器的规矩是
 * 不给就**失败可见**、不静默半写 —— 这里把那条失败翻成一句 Claude 能照着说的话。
 */
function explainSkip(op: string, reason: string): string {
  return op === NODE_ASSISTANT_OP_V4_IDS.setModel
    ? 'Changing a card’s model is not available here; ask the user to pick it in the browser.'
    : reason
}

/**
 * 一批改动落库（docs/references/mcp.md §5）：与图引擎同一个批量纯函数 → 按版本号
 * 条件写。⛔ 冲突时不在服务端自动重放 —— 用户刚改过的内容会被 Claude 的旧意图盖掉。
 */
export async function applyOpsForMcp(
  owner: McpTokenOwner,
  input: McpApplyOpsInput,
): Promise<McpApplyResult> {
  const project = await loadProject(owner, input.projectId)
  if (input.baseVersion !== project.version)
    throw new McpToolError(STALE_VERSION)

  const batch = applyCanvasBatchV4(project.state, input.ops, {
    mintId: mintCanvasId,
  })
  const skipped = batch.failures.map((failure) => {
    const op = input.ops[failure.index]?.op ?? 'unknown'
    return {
      index: failure.index,
      op,
      reason: explainSkip(op, failure.reason),
    }
  })
  if (!batch.inverse) {
    return {
      version: project.version,
      applied: 0,
      skipped,
      changedNodeIds: [],
      createdNodeIds: [],
    }
  }

  // 空覆盖闸在服务层是「静默跳过 state」（它防的是客户端的陈旧空快照），对 Claude
  // 那等于说「写了」其实没写 —— 这里先挡住并直说。
  if (batch.state.nodes.length === 0 && project.state.nodes.length > 0) {
    throw new McpToolError(
      'This batch would leave the canvas empty; that is not allowed from here. Nothing was written.',
    )
  }

  let record
  try {
    record = await updateNodeWorkflowProject(owner.clerkId, input.projectId, {
      state: batch.state,
      baseUpdatedAt: project.version,
    })
  } catch (error) {
    if (error instanceof NodeWorkflowProjectConflictError) {
      throw new McpToolError(STALE_VERSION)
    }
    throw error
  }

  return {
    version: record.updatedAt,
    applied: batch.applied,
    skipped,
    changedNodeIds: batch.changedNodeIds,
    createdNodeIds: batch.createdNodeIds,
  }
}

/* ─── render / get_render（S4）────────────────────────────────────────── */

/** 小样先按这一档算计划、再整份缩到 480p（字幕字号跟着缩）。 */
const DRAFT_BASE_RESOLUTION: EditResolution = '720p'

export interface McpRenderStarted {
  readonly jobId: string
  readonly kind: McpRenderKind
  readonly status: RenderJobStatusId
  /** 这一刀出来多长（秒）。 */
  readonly durationSec: number
}

/**
 * 范围 → 时间线窗口。⚠ 单段也折成「区间」：与剪辑台的「单段」同一个窗口，但不必
 * 区分它在哪条轨上。
 */
function renderRangeOf(
  state: NodeWorkflowStateV4,
  input: McpRenderInput,
): RenderPlanRange {
  if (input.clipId) {
    const hit = findTimelineClip(state.edit, input.clipId)
    if (!hit) {
      throw new McpToolError(
        `No timeline clip ${input.clipId}. Read the project to see clip ids.`,
      )
    }
    return {
      range: EDIT_EXPORT_RANGE_IDS.inOut,
      inPointSec: hit.startSec,
      outPointSec: hit.startSec + hit.durationSec,
    }
  }
  if (input.fromSec !== undefined || input.toSec !== undefined) {
    return {
      range: EDIT_EXPORT_RANGE_IDS.inOut,
      inPointSec: input.fromSec ?? null,
      outPointSec: input.toSec ?? null,
    }
  }
  return { range: EDIT_EXPORT_RANGE_IDS.all }
}

/**
 * 出片（§7）：计划由服务端用剪辑台同一个纯函数 `toRenderPlan` 算，走同一个渲染任务
 * 与在飞上限。⚠ 渲染不扣积分 —— 「MCP 不能花钱」这条不受影响。
 */
export async function renderForMcp(
  owner: McpTokenOwner,
  input: McpRenderInput,
): Promise<McpRenderStarted> {
  const project = await loadProject(owner, input.projectId)
  const edit = project.state.edit
  if (!edit) {
    throw new McpToolError(
      'This project has no edit timeline yet. Put clips on it with apply_ops first.',
    )
  }
  const draft = input.kind === 'draft'

  let plan
  try {
    plan = toRenderPlan(
      edit,
      project.state.nodes,
      renderRangeOf(project.state, input),
      {
        projectId: input.projectId,
        ...(draft
          ? { resolution: DRAFT_BASE_RESOLUTION }
          : input.resolution
            ? { resolution: input.resolution }
            : {}),
      },
    )
  } catch (error) {
    if (error instanceof RenderPlanError) throw new McpToolError(error.message)
    throw error
  }

  // ⚠ 过一遍与剪辑台导出同一份入参校验（地址只收 http(s) 等），⛔ 服务端算的也不免检。
  const parsed = RenderSubmitSchema.safeParse({
    plan,
    toCanvas: !draft,
    ...(input.locale ? { locale: input.locale } : {}),
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new McpToolError(
      `This cut cannot be rendered (${issue?.path.join('.') ?? 'plan'}: ${issue?.message ?? 'invalid'}). Read the project and fix that clip.`,
    )
  }
  const submitInput = draft
    ? { ...parsed.data, plan: toDraftRenderPlan(parsed.data.plan) }
    : parsed.data

  try {
    const view = await submitRenderJob(owner.clerkId, submitInput, { draft })
    return {
      jobId: view.jobId,
      kind: input.kind,
      status: view.status,
      durationSec: Math.round(plan.totalDurationSec * 1000) / 1000,
    }
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw new McpToolError(`Could not start the render: ${error.message}`)
    }
    throw error
  }
}

export interface McpRenderView {
  readonly jobId: string
  readonly kind: McpRenderKind
  readonly status: RenderJobStatusId
  readonly name: string
  readonly step?: RenderStepId
  readonly progress?: number
  readonly url?: string
  readonly thumbnailUrl?: string
  readonly durationSec?: number
  readonly error?: string
  /** 成片落回画布的那张卡。 */
  readonly landedNodeId?: string
}

export async function getRenderForMcp(
  owner: McpTokenOwner,
  input: McpGetRenderInput,
): Promise<McpRenderView> {
  const job = await getRenderJob(owner.clerkId, input.jobId)
  if (!job) {
    throw new McpToolError(
      `No render ${input.jobId}. Use the jobId render returned.`,
    )
  }

  // 落回画布的卡：成片那一版带着这次的 generationId（服务端落卡时写的）。
  let landedNodeId: string | undefined
  const generationId = job.generationId
  if (!job.draft && generationId) {
    const project = await loadProject(owner, input.projectId).catch(
      (error: unknown) => {
        if (error instanceof McpToolError) return null
        throw error
      },
    )
    landedNodeId = project?.state.nodes.find((node) =>
      readOutputVersions(node.data).some(
        (version) => version.generationId === generationId,
      ),
    )?.id
  }

  return {
    jobId: job.jobId,
    kind: job.draft ? 'draft' : 'final',
    status: job.status,
    name: job.name,
    ...(job.step ? { step: job.step } : {}),
    ...(job.progress !== undefined ? { progress: job.progress } : {}),
    ...(job.url ? { url: job.url } : {}),
    ...(job.thumbnailUrl ? { thumbnailUrl: job.thumbnailUrl } : {}),
    ...(job.durationSec ? { durationSec: job.durationSec } : {}),
    ...(job.error ? { error: job.error } : {}),
    ...(landedNodeId ? { landedNodeId } : {}),
  }
}
