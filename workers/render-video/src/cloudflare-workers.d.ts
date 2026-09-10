// ─── Cloudflare R2 ──────────────────────────────────────────────────────────

interface R2PutOptions {
  httpMetadata?: { contentType?: string; cacheControl?: string }
  customMetadata?: Record<string, string>
}

interface R2Object {
  key: string
  size: number
  etag: string
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string | null,
    options?: R2PutOptions,
  ): Promise<R2Object>
  delete(key: string): Promise<void>
}

// ─── Cloudflare Workers ─────────────────────────────────────────────────────

declare module 'cloudflare:workers' {
  export interface WorkflowStepConfig {
    retries?: {
      limit: number
      delay: string | number
      backoff?: 'constant' | 'linear' | 'exponential'
    }
    timeout?: string | number
  }

  /**
   * 每次 step 尝试传给回调的上下文。`attempt` 从 1 开始计数，`config` 是引擎把
   * 调用方传的配置与默认值（`retries: { limit: 5, delay: 10s, backoff:
   * 'exponential' }`、`timeout: '10 minutes'`）merge 之后的结果 —— 也就是说
   * `config.retries.limit` 总是有值，不用自己补默认。
   *
   * 见 https://developers.cloudflare.com/workflows/build/workers-api/
   */
  export interface WorkflowStepContext {
    step: { name: string; count: number }
    attempt: number
    config: WorkflowStepConfig
  }

  export type WorkflowStepCallback<T> = (
    ctx: WorkflowStepContext,
  ) => Promise<T> | T

  export interface WorkflowStep {
    do<T>(name: string, callback: WorkflowStepCallback<T>): Promise<T>
    do<T>(
      name: string,
      config: WorkflowStepConfig,
      callback: WorkflowStepCallback<T>,
    ): Promise<T>
    sleep(name: string, duration: string | number): Promise<void>
  }

  export interface WorkflowEvent<TParams = unknown> {
    payload: Readonly<TParams>
    timestamp: Date
    instanceId: string
  }

  /**
   * A running (or finished) workflow instance handle. `terminate()` stops a
   * still-running instance immediately; it rejects for an instance that's
   * already completed/errored/terminated — callers doing a best-effort
   * cancel must treat that rejection as "nothing to do", not a hard error.
   * See https://developers.cloudflare.com/workflows/build/workers-api/#instance.
   */
  export interface WorkflowInstance {
    id: string
    terminate(): Promise<void>
    /** 实例现在跑到哪 —— `/status` 路由读它。 */
    status(): Promise<{ status: string; output?: unknown; error?: unknown }>
  }

  export interface Workflow<TParams = unknown> {
    create(options: { id?: string; params: TParams }): Promise<WorkflowInstance>
    get(id: string): Promise<WorkflowInstance>
  }

  export abstract class WorkflowEntrypoint<TEnv = unknown, TParams = unknown> {
    protected env: TEnv
    abstract run(
      event: WorkflowEvent<TParams>,
      step: WorkflowStep,
    ): Promise<unknown>
  }

  /**
   * Durable Object 基类 —— 容器门房继承它（`ctx.container` 是容器的启停与端口）。
   * ⚠ 只声明本 worker 真的用到的那一小片，⛔ 不抄整份 workerd 类型。
   */
  export interface DurableObjectContainer {
    running: boolean
    start(options?: { enableInternet?: boolean }): void
    getTcpPort(port: number): { fetch(request: Request): Promise<Response> }
  }

  export interface DurableObjectState {
    container?: DurableObjectContainer
  }

  export class DurableObject<TEnv = unknown> {
    constructor(ctx: DurableObjectState, env: TEnv)
    readonly ctx: DurableObjectState
    readonly env: TEnv
  }
}
