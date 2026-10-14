/**
 * 一次媒体回填（上传 / 生成回来 / 导出成片落卡）落到**一张卡的 data** 上 —— 纯函数。
 *
 * 图引擎的 `setMedia` 与服务端的导出落卡（`docs/references/mcp.md` §7）调的是这同
 * 一个函数：⛔ 不在服务端另写一份「有地址就标完成」这类规矩，两份迟早说出两种状态。
 *
 * ⚠ 补丁**不直接摊进 data**：产出版本表在这里长出来（S3b §1.8），顶层 `url` / 尺寸
 * / 封面是 `outputs.versions[cur]` 的派生镜像，由 `applyMediaPatchOutputs` 一处写。
 */

import { NODE_V4_OUTPUT_VERSION } from '@/constants/node-studio'
import {
  applyMediaPatchOutputs,
  type NodeV4MediaData,
} from '@/lib/node-output-versions'

import type { NodeV4MediaPatch } from '@/components/business/node/nodes/v4/NodeV4Context'

/** 一次发送里的哪一枪（`generateNode` 交给 `onJobCreated` / `onEach`）。 */
export interface NodeGenerationShot {
  /** 0-based。 */
  readonly index: number
  /** 这一次一共几枪：> 1 = 并行的一批，job 记进 `mediaBatchJobIds`。 */
  readonly total: number
  /** 这一枪的 job id（`onJobCreated` 回来之后才有）。 */
  readonly jobId?: string
}

/** 这张卡上**所有**在飞的 job：单枪那一单 + 一批里还没落地的几单。 */
export function pendingMediaJobIds(data: {
  readonly mediaJobId?: string | undefined
  readonly mediaBatchJobIds?: readonly string[] | undefined
}): readonly string[] {
  const single = data.mediaJobId?.trim()
  return [...(single ? [single] : []), ...(data.mediaBatchJobIds ?? [])]
}

export function hasPendingMediaJob(
  data: Parameters<typeof pendingMediaJobIds>[0],
): boolean {
  return pendingMediaJobIds(data).length > 0
}

/** 这一枪开始在飞：单枪写 `mediaJobId`，一批里的记进列表。 */
export function pendingJobPatch(
  shot: NodeGenerationShot,
  jobId: string,
): NodeV4MediaPatch {
  return shot.total > 1 ? { addBatchJob: jobId } : { mediaJobId: jobId }
}

/** 这一枪落地了（成功 / 失败 / 取消）：把它的在飞标记摘掉。 */
export function settledJobPatch(shot: NodeGenerationShot): NodeV4MediaPatch {
  if (shot.total <= 1) return { mediaJobId: undefined }
  return shot.jobId ? { settleBatchJob: shot.jobId } : {}
}

/** 在最新的 data 上增删一批里的在飞单（⛔ 让调用方拿旧值算好整列再写）。 */
function nextBatchJobIds(
  current: readonly string[] | undefined,
  patch: NodeV4MediaPatch,
): readonly string[] | undefined {
  let next = current ?? []
  if (patch.addBatchJob && !next.includes(patch.addBatchJob)) {
    next = [...next, patch.addBatchJob]
  }
  if (patch.settleBatchJob) {
    next = next.filter((jobId) => jobId !== patch.settleBatchJob)
  }
  return next.length > 0 ? next : undefined
}

export function applyNodeMediaPatch<T extends NodeV4MediaData>(
  data: T,
  patch: NodeV4MediaPatch,
  context: {
    readonly now: string
    readonly mintId: (prefix: string) => string
  },
): T {
  // 两个增删键**不摊进 data**（下面的合并会把补丁剩下的字段原样摊进去）。
  const { addBatchJob, settleBatchJob, ...rest } = patch
  const batchTouched = addBatchJob !== undefined || settleBatchJob !== undefined
  const mediaBatchJobIds = batchTouched
    ? nextBatchJobIds(data.mediaBatchJobIds, patch)
    : data.mediaBatchJobIds
  return applyMediaPatchOutputs(
    {
      ...data,
      ...(batchTouched ? { mediaBatchJobIds } : {}),
      ...(addBatchJob ? { status: 'running' as const } : {}),
      ...(patch.mediaJobId || addBatchJob || patch.url
        ? { generationFailure: undefined }
        : {}),
      ...(patch.generationFailure ? { status: 'failed' as const } : {}),
      ...(patch.mediaJobId ? { status: 'running' as const } : {}),
      ...(patch.url ? { status: 'done' as const } : {}),
      // 一批最后一单是被取消的（没带图也没带失败）：有图就算完成，没图回到空闲。
      ...(settleBatchJob &&
      !mediaBatchJobIds?.length &&
      !patch.url &&
      !patch.generationFailure &&
      data.status === 'running'
        ? { status: data.url ? ('done' as const) : ('idle' as const) }
        : {}),
      // 一批里还有单在飞：落了一张 / 败了一张都还算「在跑」。
      ...(mediaBatchJobIds?.length && (patch.url || patch.generationFailure)
        ? { status: 'running' as const }
        : {}),
      ...('generationFailure' in patch &&
      !patch.generationFailure &&
      !patch.mediaJobId &&
      !patch.url &&
      !mediaBatchJobIds?.length &&
      data.status !== 'done'
        ? { status: 'idle' as const }
        : {}),
    },
    rest,
    {
      now: context.now,
      mintId: () => context.mintId(NODE_V4_OUTPUT_VERSION.idPrefix),
    },
  )
}
