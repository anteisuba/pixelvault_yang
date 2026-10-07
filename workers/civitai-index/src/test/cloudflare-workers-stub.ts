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
