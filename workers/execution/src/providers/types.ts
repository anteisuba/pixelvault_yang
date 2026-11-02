import type { WorkflowStepConfig } from 'cloudflare:workers'

import type { ExecutionProgressStage } from '../../../../src/constants/generation-progress'
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

/** 驱动在步骤里能拿到的东西。key 是懒取的：Runner 这类不用 key 的就不解密。 */
export interface ImageDriverRuntime {
  env: ExecutionEnv
  context: WorkerImageRunContext
  readApiKey(): Promise<string>
}

/** 已落 R2 的图（上传步骤的返回值）。 */
export interface UploadedImage {
  artifactUrl: string
  imageR2Key: string
  mimeType: string
}

/** 一轮轮询读出来的结论：还在跑（可指定下一轮等多久 / 已离开排队），或者跑完了。失败直接抛。 */
export type MultiStepPollOutcome<TDone> =
  | { state: 'pending'; nextDelayMs?: number; running?: boolean }
  | { state: 'done'; value: TDone }

/**
 * 先提交、再轮询的出图驱动（fal / Ideogram / Replicate / Runner）。
 *
 * 通用流程（`runMultiStepImageDriver`）按 `stepKey` 拼出和上线时一字不差的步骤名：
 * `submit-<key>-image` → 每轮 `wait-<key>-image-<n>` + `poll-<key>-image-<n>`
 * →（可选）`mark-<key>-image-running` →（超时可选）`cancel-<key>-image-timeout`
 * →（可选）`upload-<key>-image`。⚠ 这些名字是在飞实例 replay 的身份，⛔ 不能改。
 *
 * `submit` / `poll` / `upload` 跑在步骤里，返回值会进 Workflow 状态（要可序列化、
 * 别塞整张图）；`readPoll` / `toResult` 在步骤外，只做判断和拼装，可以抛错。
 */
export interface MultiStepImageDriver<TJob, TPoll, TDone> {
  stepKey: string
  submitStep: WorkflowStepConfig
  pollStep: WorkflowStepConfig
  submit(runtime: ImageDriverRuntime): Promise<TJob>
  /** 提交就已经出完（Replicate 有时同步返回 succeeded），直接跳过轮询。 */
  doneOnSubmit?(job: TJob): TDone | undefined
  poll(runtime: ImageDriverRuntime, job: TJob): Promise<TPoll>
  readPoll(
    poll: TPoll,
    job: TJob,
    context: WorkerImageRunContext,
  ): MultiStepPollOutcome<TDone>
  /** 第一次离开排队时回报一次进度阶段（Runner 冷启动）。 */
  runningStage?: ExecutionProgressStage
  /** 轮询次数用完时先取消服务商那边的任务（Runner，免得空烧 GPU）。 */
  cancelOnTimeout?(env: ExecutionEnv, job: TJob): Promise<void>
  timeoutError(job: TJob, context: WorkerImageRunContext): Error
  upload?: {
    step: WorkflowStepConfig
    run(
      runtime: ImageDriverRuntime,
      job: TJob,
      done: TDone,
    ): Promise<UploadedImage>
  }
  toResult(
    job: TJob,
    done: TDone,
    uploaded: UploadedImage | undefined,
    context: WorkerImageRunContext,
  ): WorkerImageGenerationResult
}
