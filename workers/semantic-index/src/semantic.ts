import { z } from 'zod'

/**
 * 语义检索的两件事：文字转向量（Workers AI · Qwen3-Embedding-0.6B）、向量存取（Vectorize）。
 *
 * ⭐ 一个向量库装所有来源：`kind` 分来源（Danbooru 标签 / LoRA / …），namespace 分归属
 *   （公共库 `public`，以后每个用户各自一个），两个用户互相查不到。
 * ⭐ 模型原生 1024 维，截成前 512 维再归一化（模型按 MRL 训练，截短仍可用）：
 *   2026-10-25 拿 5000 个标签 × 30 句中日英实测，512 维与 1024 维同为 30/30 命中，存储费减半。
 * ⭐ 存的一侧按「文档」算、查的一侧按「查询」算（模型是不对称的：查询带一句任务说明）——
 *   同一实测里查询也按文档算会从 30/30 掉到 28/30。
 */

export const EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b'
export const DIMENSIONS = 512
/** 模型一次最多收 32 段（schema 的 maxItems）。 */
const EMBED_BATCH = 32
/** 同时在飞的模型调用数：一次存 1000 条 = 32 次调用，不一口气全发。 */
const EMBED_CONCURRENCY = 6
/** Vectorize 在 Worker 里一次最多写 1000 条。 */
export const MAX_ITEMS_PER_REQUEST = 1000
/** 带元数据返回时 topK 的上限。 */
export const MAX_TOP_K = 50

const NamespaceSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9:_-]+$/)
const KindSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9-]+$/)
const MetaValueSchema = z.union([z.string().max(512), z.number(), z.boolean()])

const ItemSchema = z.object({
  kind: KindSchema,
  /** 来源里那一行的主键（标签名、LoRA 版本号……），查到时原样带回。 */
  key: z.string().min(1).max(512),
  text: z.string().min(1).max(4000),
  /** 查询时要筛的只能是建了元数据索引的那几样（kind / category），其余只是带回来。 */
  meta: z.record(z.string().min(1).max(32), MetaValueSchema).default({}),
})

export const UpsertInputSchema = z.object({
  namespace: NamespaceSchema,
  items: z.array(ItemSchema).min(1).max(MAX_ITEMS_PER_REQUEST),
})

export const DeleteInputSchema = z.object({
  namespace: NamespaceSchema,
  items: z
    .array(z.object({ kind: KindSchema, key: z.string().min(1).max(512) }))
    .min(1)
    .max(MAX_ITEMS_PER_REQUEST),
})

export const QueryInputSchema = z.object({
  namespace: NamespaceSchema,
  text: z.string().trim().min(1).max(1000),
  kind: KindSchema,
  /** Danbooru 类别号（0 通用 · 1 画师 · 3 作品 · 4 角色 · 5 meta）；不给 = 不筛。 */
  categories: z.array(z.number().int()).min(1).max(10).optional(),
  topK: z.number().int().min(1).max(MAX_TOP_K).default(20),
})

export type UpsertInput = z.infer<typeof UpsertInputSchema>
export type DeleteInput = z.infer<typeof DeleteInputSchema>
export type QueryInput = z.infer<typeof QueryInputSchema>

export interface SemanticMatch {
  key: string
  score: number
  meta: Record<string, VectorizeMetadataValue>
}

/**
 * 向量 id 最长 64 字节：namespace + kind + key 取 SHA-256（十六进制正好 64 个字符）。
 * ⚠ id 在整个库里唯一、不分 namespace —— 不带 namespace 的话，两个用户存同一个标签会互相覆盖。
 */
export async function vectorId(
  namespace: string,
  kind: string,
  key: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${namespace}\n${kind}\n${key}`),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** 截到 DIMENSIONS 维后重新归一化（cosine 本身不在乎长度，但分数要和实测时同一把尺）。 */
export function truncate(vector: readonly number[]): number[] {
  if (vector.length < DIMENSIONS) {
    throw new Error(
      `Embedding has ${vector.length} dimensions, expected at least ${DIMENSIONS}`,
    )
  }
  const head = vector.slice(0, DIMENSIONS)
  const norm = Math.hypot(...head)
  return norm === 0 ? head : head.map((value) => value / norm)
}

export async function embed(
  ai: Ai,
  texts: readonly string[],
  side: 'queries' | 'documents',
): Promise<number[][]> {
  const batches: string[][] = []
  for (let index = 0; index < texts.length; index += EMBED_BATCH) {
    batches.push(texts.slice(index, index + EMBED_BATCH))
  }
  const results: number[][][] = new Array(batches.length)
  let next = 0
  async function lane(): Promise<void> {
    while (next < batches.length) {
      const index = next
      next += 1
      const { data } = await ai.run(EMBEDDING_MODEL, {
        [side]: batches[index],
      })
      if (data.length !== batches[index].length) {
        throw new Error(
          `Embedding returned ${data.length} vectors for ${batches[index].length} texts`,
        )
      }
      results[index] = data.map(truncate)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(EMBED_CONCURRENCY, batches.length) }, lane),
  )
  return results.flat()
}

export async function upsertItems(
  ai: Ai,
  index: VectorizeIndex,
  input: UpsertInput,
): Promise<number> {
  const vectors = await embed(
    ai,
    input.items.map((item) => item.text),
    'documents',
  )
  await index.upsert(
    await Promise.all(
      input.items.map(async (item, position) => ({
        id: await vectorId(input.namespace, item.kind, item.key),
        values: vectors[position],
        namespace: input.namespace,
        metadata: { ...item.meta, kind: item.kind, key: item.key },
      })),
    ),
  )
  return input.items.length
}

export async function deleteItems(
  index: VectorizeIndex,
  input: DeleteInput,
): Promise<number> {
  const ids = await Promise.all(
    input.items.map((item) => vectorId(input.namespace, item.kind, item.key)),
  )
  await index.deleteByIds(ids)
  return ids.length
}

export async function queryItems(
  ai: Ai,
  index: VectorizeIndex,
  input: QueryInput,
): Promise<SemanticMatch[]> {
  const [vector] = await embed(ai, [input.text], 'queries')
  const filter: Record<string, unknown> = { kind: input.kind }
  if (input.categories) filter.category = { $in: input.categories }
  const { matches } = await index.query(vector, {
    topK: input.topK,
    namespace: input.namespace,
    filter,
    returnMetadata: 'all',
  })
  return matches.flatMap((match) => {
    const { key, ...meta } = match.metadata ?? {}
    delete meta.kind
    return typeof key === 'string' ? [{ key, score: match.score, meta }] : []
  })
}
