// 只声明本 worker 真的用到的那一小片，⛔ 不抄整份 workerd 类型。

// ─── Cloudflare D1 ──────────────────────────────────────────────────────────

interface D1Meta {
  changes: number
  rows_read?: number
  rows_written?: number
  duration?: number
}

interface D1Result<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: D1Meta
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
}

// ─── Workers runtime ────────────────────────────────────────────────────────

interface ScheduledController {
  scheduledTime: number
  cron: string
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

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
  }

  export interface WorkflowEvent<TParams = unknown> {
    payload: Readonly<TParams>
    timestamp: Date
    instanceId: string
  }

  export interface WorkflowInstance {
    id: string
  }

  export interface Workflow<TParams = unknown> {
    create(options: { id?: string; params: TParams }): Promise<WorkflowInstance>
  }

  export abstract class WorkflowEntrypoint<TEnv = unknown, TParams = unknown> {
    protected env: TEnv
    abstract run(
      event: WorkflowEvent<TParams>,
      step: WorkflowStep,
    ): Promise<unknown>
  }
}
