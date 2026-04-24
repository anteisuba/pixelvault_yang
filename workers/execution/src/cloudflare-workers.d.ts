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
