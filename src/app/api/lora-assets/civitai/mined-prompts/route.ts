import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { mineCivitaiUserPrompts } from '@/services/civitai-lora.service'
import type { CivitaiMinedPromptsResult } from '@/types'

// Mined activation prompts are stable on the timescale of an hour (new
// user generations trickle in slowly). 1h CDN hit + 24h SWR keeps the
// inspector snappy even on cold paths.
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400'

// modelVersionId is required — it's the only reliable way to locate a
// version's source-image recipes (fetchModelVersionSourceRecipes). fileHash
// is the Civitai AutoV3 hash, 12-char hex (lowercased server-side before
// matching) — OPTIONAL: search-hit LoRAs (meilisearch path) never carry a
// file hash (Civitai's search index doesn't expose files[].hashes), but the
// recipe miner only needs modelId+modelVersionId to find source images; the
// hash (when present) just attributes a matched image's real per-LoRA
// weight. See Issue A, docs/plans/lora-search-image-audit-2026-07.md. We
// accept any non-empty hex-ish string so a future change in Civitai's hash
// length doesn't break us.
const QuerySchema = z.object({
  modelId: z.coerce.number().int().positive(),
  modelVersionId: z.coerce.number().int().positive(),
  fileHash: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]+$/)
    .min(8)
    .max(64)
    .optional(),
})

interface SuccessBody {
  success: true
  data: CivitaiMinedPromptsResult
}
interface ErrorBody {
  success: false
  error: string
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    modelId: searchParams.get('modelId') ?? undefined,
    modelVersionId: searchParams.get('modelVersionId') ?? undefined,
    fileHash: searchParams.get('fileHash') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Invalid query parameters' },
      { status: 400 },
    )
  }

  try {
    const data = await mineCivitaiUserPrompts({
      modelId: parsed.data.modelId,
      modelVersionId: parsed.data.modelVersionId,
      fileHashAutoV3: parsed.data.fileHash,
    })
    const response = NextResponse.json<SuccessBody>({ success: true, data })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    logger.warn('GET /api/lora-assets/civitai/mined-prompts failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      modelId: parsed.data.modelId,
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to mine Civitai user prompts' },
      { status: 502 },
    )
  }
}
