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

  export interface WorkflowStep {
    do<T>(name: string, callback: () => Promise<T> | T): Promise<T>
    do<T>(
      name: string,
      config: WorkflowStepConfig,
      callback: () => Promise<T> | T,
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
  }

  export abstract class WorkflowEntrypoint<TEnv = unknown, TParams = unknown> {
    protected env: TEnv
    abstract run(
      event: WorkflowEvent<TParams>,
      step: WorkflowStep,
    ): Promise<unknown>
  }
}
