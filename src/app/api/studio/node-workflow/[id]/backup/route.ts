import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { backupNodeWorkflowV3State } from '@/services/node/node-workflow-v3-backup.service'
import {
  NodeWorkflowV3BackupRequestSchema,
  type NodeWorkflowV3BackupResult,
} from '@/types/node-workflow'

/**
 * 逐项目惰性升级的第一步（node-canvas-v2 §14.2 · 「画-3」）：把 v3 `state` 原样存
 * 一份到 R2。**这一步成功了，画布才被允许写 v4**。
 */
export const POST = createApiPostByIdRoute<
  typeof NodeWorkflowV3BackupRequestSchema,
  NodeWorkflowV3BackupResult
>({
  schema: NodeWorkflowV3BackupRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.nodeWorkflowV3Backup,
  routeName: 'POST /api/studio/node-workflow/[id]/backup',
  notFoundMessage: 'Node workflow project not found',
  handler: async (clerkId, id) => backupNodeWorkflowV3State(clerkId, id),
})
