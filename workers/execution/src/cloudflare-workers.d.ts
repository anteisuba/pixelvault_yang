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

  export interface Workflow<TParams = unknown> {
    create(options: { id?: string; params: TParams }): Promise<{ id: string }>
    get(id: string): Promise<{ id: string }>
  }

  export abstract class WorkflowEntrypoint<TEnv = unknown, TParams = unknown> {
    protected env: TEnv
    abstract run(
      event: WorkflowEvent<TParams>,
      step: WorkflowStep,
    ): Promise<unknown>
  }
}
