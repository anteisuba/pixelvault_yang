import 'server-only'

import { ApiRequestError } from '@/lib/errors'
import { NodeWorkflowStateCorruptError } from '@/services/node/node-workflow.service'

/**
 * 读端坏数据 → 422 带 code。⛔ 不再兜成空图（node-canvas-v2 §14.2）：
 * 客户端拿到显式错误才知道「这份图读不出来、别写回去」，兜空则是静默清空。
 * 非本类错误原样抛出，交给路由工厂按原状态码处理。
 */
export function rethrowNodeWorkflowStateError(error: unknown): never {
  if (error instanceof NodeWorkflowStateCorruptError) {
    throw new ApiRequestError(
      'NODE_WORKFLOW_STATE_CORRUPT',
      422,
      'errors.nodeWorkflow.stateCorrupt',
      'Stored Node Studio state could not be read',
    )
  }
  throw error
}
