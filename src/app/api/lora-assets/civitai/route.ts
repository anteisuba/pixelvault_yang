import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  CIVITAI_LORA_BASE_MODEL_VALUES,
  CIVITAI_LORA_PAGE_SIZE,
  CIVITAI_LORA_SORT_VALUES,
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  LORA_CONTENT_TYPE_VALUES,
  isLoraNsfwFilter,
} from '@/constants/lora'
import { logger } from '@/lib/logger'
import { listCivitaiLoras } from '@/services/civitai-lora-library.service'
import type { CivitaiLoraLibraryResult } from '@/types'

// 索引每天只同步一次，结果在小时尺度上都不变：边缘缓存 1 小时 + 一天的
// stale-while-revalidate。
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400'

const ListCivitaiLoraQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(40)
    .default(CIVITAI_LORA_PAGE_SIZE),
  search: z.string().trim().optional(),
  baseModel: z.enum(CIVITAI_LORA_BASE_MODEL_VALUES).default('all'),
  sort: z.enum(CIVITAI_LORA_SORT_VALUES).default('Highest Rated'),
  // S2 内容类型筛选（lora-workbench.md §3）。URL `type=`（§2.5）直通到这
  // 里——客户端（ContentTypeChipRow/URL 同步 effect）总是先经
  // isLoraContentType 校验过才发请求，这里的 enum+default 与 baseModel/
  // sort 同一套防线（外部畸形请求会 400，符合现状约定）。
  type: z.enum(LORA_CONTENT_TYPE_VALUES).default(DEFAULT_LORA_CONTENT_TYPE),
  // P1-6 三态（unrestricted/nsfwOnly/safe）——未知/缺失值静默落回默认，
  // 不透传给 civitai。
  nsfwFilter: z
    .string()
    .optional()
    .transform((value) =>
      value !== undefined && isLoraNsfwFilter(value)
        ? value
        : DEFAULT_LORA_NSFW_FILTER,
    ),
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
      search: searchParams.get('search') ?? undefined,
      baseModel: searchParams.get('baseModel') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
      nsfwFilter: searchParams.get('nsfw') ?? undefined,
      type: searchParams.get('type') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    const startedAt = Date.now()
    const data = await listCivitaiLoras({
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      search: parsed.data.search,
      baseModel: parsed.data.baseModel,
      sort: parsed.data.sort,
      nsfwFilter: parsed.data.nsfwFilter,
      contentType: parsed.data.type,
    })
    const response = NextResponse.json<SuccessBody>({ success: true, data })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    response.headers.set('Server-Timing', `total;dur=${Date.now() - startedAt}`)
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
