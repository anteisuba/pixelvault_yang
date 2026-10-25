/**
 * Minimal stand-in for the `cloudflare:workers` runtime module so plain
 * Node/vitest can resolve `index.ts`'s `WorkerEntrypoint` import. Tests build
 * the entrypoint themselves and assign `env`.
 */
export class WorkerEntrypoint<Env = unknown> {
  env!: Env
}
