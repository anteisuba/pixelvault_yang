import type {
  ExecutionEnv,
  WorkerImageGenerationResult,
  WorkerImageRunContext,
} from '../index'

/**
 * 一次请求就拿回图的出图驱动（共享契约里标 `single-step` 的那些）。
 *
 * Workflow 用同一个通用分支跑它们：一个 `step.do(stepName)`，重试 1 次、超时取
 * min(任务超时, 10 分钟)，进步骤再解密 key。驱动只管「拿 key 出一张图、落 R2」。
 *
 * ⚠ `stepName` 是 Workflow replay 的身份：已经上线的名字 ⛔ 不能改
 * （火山和 BytePlus 共用 `generate-volcengine-image` 也是历史名，照旧）。
 */
export interface SingleStepImageDriver {
  stepName: string
  generate(
    env: ExecutionEnv,
    context: WorkerImageRunContext,
    apiKey: string,
  ): Promise<WorkerImageGenerationResult>
}
