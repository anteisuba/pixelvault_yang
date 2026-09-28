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

export function applyNodeMediaPatch<T extends NodeV4MediaData>(
  data: T,
  patch: NodeV4MediaPatch,
  context: {
    readonly now: string
    readonly mintId: (prefix: string) => string
  },
): T {
  return applyMediaPatchOutputs(
    {
      ...data,
      ...(patch.mediaJobId || patch.url
        ? { generationFailure: undefined }
        : {}),
      ...(patch.generationFailure ? { status: 'failed' as const } : {}),
      ...(patch.mediaJobId ? { status: 'running' as const } : {}),
      ...(patch.url ? { status: 'done' as const } : {}),
      ...('generationFailure' in patch &&
      !patch.generationFailure &&
      !patch.mediaJobId &&
      !patch.url &&
      data.status !== 'done'
        ? { status: 'idle' as const }
        : {}),
    },
    patch,
    {
      now: context.now,
      mintId: () => context.mintId(NODE_V4_OUTPUT_VERSION.idPrefix),
    },
  )
}
