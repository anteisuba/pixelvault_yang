import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { resolveCivitaiLoraByReference } from '@/services/civitai-lora.service'
import type { CivitaiLoraLibraryItem } from '@/types'

// 模型文件与其元数据在 Civitai 上基本不变 — 长缓存。与 mined-prompts
// 同模式：只读公共数据代理，无需 auth。
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800'

const QuerySchema = z
  .object({
    hash: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]+$/)
      .min(8)
      .max(64)
      .optional(),
    modelVersionId: z.coerce.number().int().positive().optional(),
    // meta 里的 LoRA 名 — hash 对不上索引时的搜索兜底（词干精确匹配）。
    name: z.string().trim().min(1).max(200).optional(),
  })
  .refine(
    (value) =>
      value.hash !== undefined ||
      value.modelVersionId !== undefined ||
      value.name !== undefined,
    {
      message: 'hash, modelVersionId or name is required',
    },
  )

interface SuccessBody {
  success: true
  data: CivitaiLoraLibraryItem
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
    hash: searchParams.get('hash') ?? undefined,
    modelVersionId: searchParams.get('modelVersionId') ?? undefined,
    name: searchParams.get('name') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Invalid query parameters' },
      { status: 400 },
    )
  }

  try {
    const data = await resolveCivitaiLoraByReference(parsed.data)
    if (!data) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'LoRA not found on Civitai' },
        { status: 404 },
      )
    }
    const response = NextResponse.json<SuccessBody>({ success: true, data })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    logger.warn('GET /api/lora-assets/civitai/resolve failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to resolve Civitai LoRA' },
      { status: 502 },
    )
  }
}
