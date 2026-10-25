// 只声明本 worker 真的用到的那一小片，⛔ 不抄整份 workerd 类型。

// ─── Workers AI ─────────────────────────────────────────────────────────────

interface Ai {
  run(
    model: string,
    input: { queries?: string[]; documents?: string[] },
  ): Promise<{ data: number[][]; shape?: number[] }>
}

// ─── Vectorize ──────────────────────────────────────────────────────────────

type VectorizeMetadataValue = string | number | boolean

interface VectorizeVector {
  id: string
  values: number[]
  namespace?: string
  metadata?: Record<string, VectorizeMetadataValue>
}

interface VectorizeMatch {
  id: string
  score: number
  namespace?: string
  metadata?: Record<string, VectorizeMetadataValue>
}

interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<unknown>
  deleteByIds(ids: string[]): Promise<unknown>
  query(
    vector: number[],
    options: {
      topK: number
      namespace?: string
      filter?: Record<string, unknown>
      returnMetadata?: 'none' | 'indexed' | 'all'
      returnValues?: boolean
    },
  ): Promise<{ matches: VectorizeMatch[]; count: number }>
}

// ─── Workers runtime ────────────────────────────────────────────────────────

declare module 'cloudflare:workers' {
  export abstract class WorkerEntrypoint<TEnv = unknown> {
    protected env: TEnv
  }
}
