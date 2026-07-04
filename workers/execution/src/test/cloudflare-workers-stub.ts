/**
 * Minimal stand-in for the `cloudflare:workers` runtime module so plain
 * Node/vitest can resolve `index.ts`'s `WorkflowEntrypoint` import without a
 * miniflare/workerd runtime. Only the pure helper functions in index.ts are
 * under test here — the workflow classes that actually extend this are not
 * exercised, so the stub only needs to be a valid base class.
 */
export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
  env!: Env
  ctx!: unknown
  declare _paramsType?: Params
}
