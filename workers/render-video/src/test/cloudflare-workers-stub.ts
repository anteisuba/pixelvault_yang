/**
 * Minimal stand-in for the `cloudflare:workers` runtime module so plain
 * Node/vitest can resolve `index.ts`'s `WorkflowEntrypoint` import without a
 * miniflare/workerd runtime. Workflow tests supply in-memory env and step doubles; this stub only
 * supplies the base class, not durable execution semantics.
 */
export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
  env!: Env
  ctx!: unknown
  declare _paramsType?: Params
}

/**
 * `DurableObject` 的测试桩（容器门房继承它）。⚠ 真实运行时由 workerd 提供，
 * 这里只要「能被 extends」这一件事。
 */
export class DurableObject<Env = unknown> {
  readonly ctx: unknown
  readonly env: Env
  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx
    this.env = env
  }
}
