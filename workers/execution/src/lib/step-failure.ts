import type {
  WorkflowStep,
  WorkflowStepCallback,
  WorkflowStepConfig,
  WorkflowStepContext,
} from 'cloudflare:workers'

import {
  toWorkerStepFailurePayload,
  WORKER_GENERATION_ERROR_CODES,
  WorkerProviderError,
  WorkerStepFailure,
  type WorkerStepFailurePayload,
} from './provider-error'

/**
 * ─── 为什么要这个文件 ────────────────────────────────────────────────────────
 *
 * Cloudflare Workflows 把用户的 `run()` 当成独立 worker 通过 RPC 调用（引擎里是
 * `this.env.USER_WORKFLOW.run(event, stubStep)`，`stubStep` 是个 RpcTarget）。
 * 从 `step.do()` 的回调里抛出去的错误要跨这道边界，引擎在持久化 / 重抛的那一段
 * 会把它拍平成一个普通 `Error`，message 变成原错误的 `toString()`。于是：
 *
 *   - `error instanceof WorkerProviderError` 在顶层 catch 里**永远是 false**；
 *   - message 多出一截类名前缀（生产实测：
 *     `"WorkerProviderError: bad request: body: exceeded max body size of 10MiB"`）；
 *   - `errorCode` / `providerMetadata` 拿不到，回调只能上报一个 null code，
 *     前端只好去猜（2026-08-24 就猜成了「今日免费生成次数已用完」）。
 *
 * Cloudflare 自己也知道这件事 —— 引擎源码里两处兜底判断写的是
 * `err.message.startsWith("NonRetryableError")`，还有个 `PreservedNonRetryableError`
 * 专门去掉这个前缀。官方**没有**给 step 失败挂结构化元数据的机制（文档里唯一保证的
 * 失败形状是 `InstanceStatus.error` 的 `{name, message}`），也没有任何 compatibility
 * flag 能救：`enhanced_error_serialization` 只管 `structuredClone()` / V8 序列化，
 * `workflows_preserve_non_retryable_error_message` 只管 NonRetryableError 的 message。
 *
 * **唯一有保证的跨边界通道是 step 的返回值**（文档：非流式 step 返回值可持久化到
 * 1 MiB）。所以这里的做法是：让 provider 失败**根本不跨边界抛** —— 在 step 内部
 * 转成纯数据返回，门面在边界外侧拆包，再在 `run()` 里抛一个 `WorkerStepFailure`。
 * 那一抛不跨任何边界，顶层 catch 拿到的就是同一个对象。
 *
 * ⚠ 别用「从 message 里嗅探类名前缀还原类型」那条路 —— 前缀格式是引擎的实现细节，
 * 没有任何文档担保。
 *
 * ⚠ 本地 `wrangler dev` 的 Workflows 模拟**不会**复现这个 bug（纯 RPC 边界实测会
 * 保留 `name` / `message` / 自有属性）。也就是说端到端跑本地 workflow 会以「错误的
 * 理由」变绿 —— 这条契约只能靠本目录的单元测试锁住。
 */

/**
 * step 回调在失败时返回的信封。**只有失败才套信封，成功路径原样返回** ——
 * 这样持久化进 workflow state 的成功结果形状一个字节都不变，部署时正在飞的实例
 * replay 到旧结果也不会读到看不懂的结构。
 */
const STEP_FAILURE_MARKER = '__pixelvaultStepFailure'

interface StepFailureEnvelope {
  [STEP_FAILURE_MARKER]: true
  failure: WorkerStepFailurePayload
}

/**
 * 重试再多次也不会变的 provider 失败。命中这些就不等重试跑完，当场转成失败上报。
 *
 * ⚠ 判断不能只看 errorCode：`classifyProviderFailure` 对 413 这类没有专门分支的
 * 状态码会落到 UNKNOWN（2026-08-24 那条 `exceeded max body size of 10MiB` 就是），
 * 所以 4xx 走状态码这条独立判据。
 */
const NON_RETRYABLE_ERROR_CODES = new Set<string>([
  WORKER_GENERATION_ERROR_CODES.INVALID_API_KEY,
  WORKER_GENERATION_ERROR_CODES.CONTENT_FILTERED,
  WORKER_GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE,
  WORKER_GENERATION_ERROR_CODES.MODEL_UNAVAILABLE,
  // 端点僵死：重试只会再排一次队，得先有人去看端点。
  WORKER_GENERATION_ERROR_CODES.RUNNER_QUEUE_STUCK,
])

/** 4xx 里仍然值得重试的两个：请求超时、被限流。 */
const RETRYABLE_CLIENT_ERROR_STATUSES = new Set([408, 429])

export function isNonRetryableProviderFailure(
  error: WorkerProviderError,
): boolean {
  const httpStatus = error.providerMetadata.httpStatus
  if (
    typeof httpStatus === 'number' &&
    httpStatus >= 400 &&
    httpStatus < 500 &&
    !RETRYABLE_CLIENT_ERROR_STATUSES.has(httpStatus)
  ) {
    // 4xx = 请求本身不合法，原样重放不可能成功。
    return true
  }

  return (
    error.errorCode !== undefined &&
    NON_RETRYABLE_ERROR_CODES.has(error.errorCode)
  )
}

/** Cloudflare 未指定 `retries` 时的官方默认重试次数。 */
const DEFAULT_STEP_RETRY_LIMIT = 5

/**
 * 这是不是最后一次尝试。引擎传进来的 `ctx.config` 已经和默认值 merge 过，
 * `retries.limit` 总有值；`??` 只是防御。
 */
function isFinalAttempt(ctx: WorkflowStepContext): boolean {
  return ctx.attempt > (ctx.config.retries?.limit ?? DEFAULT_STEP_RETRY_LIMIT)
}

function isStepFailureEnvelope(value: unknown): value is StepFailureEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[STEP_FAILURE_MARKER] === true
  )
}

class GuardedWorkflowStep implements WorkflowStep {
  constructor(private readonly step: WorkflowStep) {}

  do<T>(name: string, callback: WorkflowStepCallback<T>): Promise<T>
  do<T>(
    name: string,
    config: WorkflowStepConfig,
    callback: WorkflowStepCallback<T>,
  ): Promise<T>
  async do<T>(
    name: string,
    configOrCallback: WorkflowStepConfig | WorkflowStepCallback<T>,
    maybeCallback?: WorkflowStepCallback<T>,
  ): Promise<T> {
    const callback =
      typeof configOrCallback === 'function' ? configOrCallback : maybeCallback
    if (!callback) {
      throw new Error(`Step "${name}" was called without a callback.`)
    }
    const config =
      typeof configOrCallback === 'function' ? undefined : configOrCallback

    const guarded = async (
      ctx: WorkflowStepContext,
    ): Promise<T | StepFailureEnvelope> => {
      try {
        return await callback(ctx)
      } catch (error) {
        if (!(error instanceof WorkerProviderError)) throw error
        // 还有重试机会、而且这个错误值得重试 —— 原样抛回引擎，重试语义一字不改。
        if (!isFinalAttempt(ctx) && !isNonRetryableProviderFailure(error)) {
          throw error
        }
        return {
          [STEP_FAILURE_MARKER]: true,
          failure: toWorkerStepFailurePayload(error),
        }
      }
    }

    const result =
      config === undefined
        ? await this.step.do<T | StepFailureEnvelope>(name, guarded)
        : await this.step.do<T | StepFailureEnvelope>(name, config, guarded)

    // 拆包发生在边界外侧：这一抛留在 run() 的调用栈里，不跨任何边界。
    if (isStepFailureEnvelope(result))
      throw new WorkerStepFailure(result.failure)
    return result
  }

  sleep(name: string, duration: string | number): Promise<void> {
    return this.step.sleep(name, duration)
  }
}

/**
 * 把引擎给的 `step` 包一层，让 provider 失败带着 errorCode / providerMetadata
 * 活着走到顶层 catch。在每个 workflow 的 `run()` 开头调一次即可，`step.do(...)`
 * 的调用点全部不用动 —— 成功路径的返回值原样透传。
 */
export function guardWorkflowStep(step: WorkflowStep): WorkflowStep {
  return new GuardedWorkflowStep(step)
}
