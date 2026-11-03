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
export interface DriverRuntime<TContext> {
  env: ExecutionEnv
  context: TContext
  readApiKey(): Promise<string>
}

export type ImageDriverRuntime = DriverRuntime<WorkerImageRunContext>

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
 * 通用流程每一步的名字。⚠ 这些名字是在飞实例 replay 的身份，⛔ 不能改：
 * 出图用 `imageStepNames(key)`（`submit-<key>-image` …），视频音频沿用
 * `submit-provider` / `poll-provider-<n>` / `download-and-upload-<video|audio>`。
 */
export interface MultiStepNames {
  submit: string
  wait(attempt: number): string
  poll(attempt: number): string
  markRunning: string
  cancelTimeout: string
  upload: string
}

export function imageStepNames(key: string): MultiStepNames {
  return {
    submit: `submit-${key}-image`,
    wait: (attempt) => `wait-${key}-image-${attempt}`,
    poll: (attempt) => `poll-${key}-image-${attempt}`,
    markRunning: `mark-${key}-image-running`,
    cancelTimeout: `cancel-${key}-image-timeout`,
    upload: `upload-${key}-image`,
  }
}

/** 通用流程只读这两项：轮询间隔和最多轮几次。 */
export interface PollingContext {
  pollIntervalMs: number
  maxAttempts: number
}

/**
 * 先提交、再轮询的驱动（出图的 fal / Ideogram / Replicate / Runner，视频和 fal 音频）。
 *
 * 通用流程（`runMultiStepDriver`）：`submit` → 每轮 `wait` + `poll`
 * →（可选）`markRunning` →（超时可选）`cancelTimeout` →（可选）`upload`。
 *
 * `submit` / `poll` / `upload` 跑在步骤里，返回值会进 Workflow 状态（要可序列化、
 * 别塞整个文件）；`readPoll` / `toResult` 在步骤外，只做判断和拼装，可以抛错。
 */
export interface MultiStepDriver<
  TContext extends PollingContext,
  TJob,
  TPoll,
  TDone,
  TUploaded,
  TResult,
> {
  stepNames: MultiStepNames
  submitStep: WorkflowStepConfig
  pollStep: WorkflowStepConfig
  submit(runtime: DriverRuntime<TContext>): Promise<TJob>
  /** 提交就已经出完（Replicate 有时同步返回 succeeded），直接跳过轮询。 */
  doneOnSubmit?(job: TJob): TDone | undefined
  poll(runtime: DriverRuntime<TContext>, job: TJob): Promise<TPoll>
  readPoll(
    poll: TPoll,
    job: TJob,
    context: TContext,
  ): MultiStepPollOutcome<TDone>
  /** 第一次离开排队时回报一次进度阶段（Runner 冷启动）。 */
  runningStage?: ExecutionProgressStage
  /** 轮询次数用完时先取消服务商那边的任务（Runner，免得空烧 GPU）。 */
  cancelOnTimeout?(env: ExecutionEnv, job: TJob): Promise<void>
  timeoutError(job: TJob, context: TContext): Error
  upload?: {
    step: WorkflowStepConfig
    run(
      runtime: DriverRuntime<TContext>,
      job: TJob,
      done: TDone,
    ): Promise<TUploaded>
  }
  toResult(
    job: TJob,
    done: TDone,
    uploaded: TUploaded | undefined,
    context: TContext,
  ): TResult
}

export type MultiStepImageDriver<TJob, TPoll, TDone> = MultiStepDriver<
  WorkerImageRunContext,
  TJob,
  TPoll,
  TDone,
  UploadedImage,
  WorkerImageGenerationResult
>
