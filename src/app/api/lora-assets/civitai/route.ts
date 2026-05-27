import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  CIVITAI_LORA_BASE_MODEL_VALUES,
  CIVITAI_LORA_PAGE_SIZE,
  CIVITAI_LORA_SORT_VALUES,
} from '@/constants/lora'
import { logger } from '@/lib/logger'
import { listCivitaiLoras } from '@/services/civitai-lora.service'
import type { CivitaiLoraLibraryResult } from '@/types'

// LoRA 排行榜与搜索结果在分钟尺度上稳定，把 CDN edge cache 拉长到 15min
// 命中 + 1h stale-while-revalidate。配合 prewarm cron (6h) 让默认列表几乎
// 始终命中边缘，搜索结果在第一次冷启动 (~600 ms) 后也能复用 15min。
const CACHE_CONTROL = 'public, s-maxage=900, stale-while-revalidate=3600'

const ListCivitaiLoraQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(40)
    .default(CIVITAI_LORA_PAGE_SIZE),
  cursor: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  baseModel: z.enum(CIVITAI_LORA_BASE_MODEL_VALUES).default('all'),
  sort: z.enum(CIVITAI_LORA_SORT_VALUES).default('Highest Rated'),
})

interface SuccessBody {
  success: true
  data: CivitaiLoraLibraryResult
}

interface ErrorBody {
  success: false
  error: string
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = ListCivitaiLoraQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      baseModel: searchParams.get('baseModel') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    const data = await listCivitaiLoras(parsed.data)
    const response = NextResponse.json<SuccessBody>({ success: true, data })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    logger.error('GET /api/lora-assets/civitai failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to load Civitai LoRA library' },
      { status: 502 },
    )
  }
}
