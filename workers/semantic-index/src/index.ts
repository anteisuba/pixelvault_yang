import { WorkerEntrypoint } from 'cloudflare:workers'
import type { z } from 'zod'

import {
  DeleteInputSchema,
  QueryInputSchema,
  UpsertInputSchema,
  deleteItems,
  queryItems,
  upsertItems,
  type QueryTimings,
  type SemanticMatch,
} from './semantic'

export interface Env {
  AI: Ai
  VECTORS: VectorizeIndex
  /** wrangler secret；与 Vercel 的 SEMANTIC_INDEX_TOKEN 同值 */
  INDEX_TOKEN: string
}

function json(body: unknown, status = 200, serverTiming?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(serverTiming === undefined ? {} : { 'Server-Timing': serverTiming }),
    },
  })
}

function isAuthorized(request: Request, env: Env): boolean {
  const header = request.headers.get('Authorization') ?? ''
  const expected = `Bearer ${env.INDEX_TOKEN}`
  if (!env.INDEX_TOKEN || header.length !== expected.length) return false
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) {
    diff |= header.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return diff === 0
}

async function parse<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  return parsed.success ? parsed.data : null
}

const semanticIndexWorker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isAuthorized(request, env)) {
      return json({ error: 'Unauthorized' }, 401)
    }
    if (request.method !== 'POST') return json({ error: 'Not found' }, 404)
    const { pathname } = new URL(request.url)

    if (pathname === '/query') {
      const input = await parse(request, QueryInputSchema)
      if (!input) return json({ error: 'Invalid query input' }, 400)
      const timings: QueryTimings = { embedMs: 0, vectorMs: 0 }
      const matches = await queryItems(env.AI, env.VECTORS, input, timings)
      return json(
        { matches },
        200,
        `embed;dur=${timings.embedMs}, vector;dur=${timings.vectorMs}`,
      )
    }

    if (pathname === '/upsert') {
      const input = await parse(request, UpsertInputSchema)
      if (!input) return json({ error: 'Invalid upsert input' }, 400)
      return json({ upserted: await upsertItems(env.AI, env.VECTORS, input) })
    }

    if (pathname === '/delete') {
      const input = await parse(request, DeleteInputSchema)
      if (!input) return json({ error: 'Invalid delete input' }, 400)
      return json({ deleted: await deleteItems(env.VECTORS, input) })
    }

    return json({ error: 'Not found' }, 404)
  },
}

export default semanticIndexWorker

/**
 * 给别的 Worker 走 service binding 直接调（civitai-index 的 LoRA 大库），不经公网、不用 token。
 * 入参照样过 schema：调用方是自己人，也不信它传的形状。
 */
export class SemanticIndex extends WorkerEntrypoint<Env> {
  async query(input: unknown): Promise<SemanticMatch[]> {
    return queryItems(
      this.env.AI,
      this.env.VECTORS,
      QueryInputSchema.parse(input),
    )
  }

  async upsert(input: unknown): Promise<number> {
    return upsertItems(
      this.env.AI,
      this.env.VECTORS,
      UpsertInputSchema.parse(input),
    )
  }

  async remove(input: unknown): Promise<number> {
    return deleteItems(this.env.VECTORS, DeleteInputSchema.parse(input))
  }
}
