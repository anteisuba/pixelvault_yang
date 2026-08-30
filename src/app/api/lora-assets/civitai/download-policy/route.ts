import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { fetchCivitaiLoraDownloadPolicy } from '@/services/civitai-lora.service'

// Creator Controls 对所有人相同、几乎不变，且这是公开的 Civitai 元数据
// （与同目录的 `source` 路由同性质）——长 CDN 缓存，无用户相关数据。
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800'

const CivitaiDownloadPolicyQuerySchema = z.object({
  modelVersionId: z.coerce.number().int().positive(),
})

interface SuccessBody {
  success: true
  data: {
    modelVersionId: number
    /** `null` = 判不了（上游没给判据），调用方必须放行，别当成"不可下载"。 */
    downloadDisabled: boolean | null
    usageControl: string | null
    name: string | null
  }
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
    const parsed = CivitaiDownloadPolicyQuerySchema.safeParse({
      modelVersionId: searchParams.get('modelVersionId') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    const policy = await fetchCivitaiLoraDownloadPolicy(
      parsed.data.modelVersionId,
    )
    const response = NextResponse.json<SuccessBody>({
      success: true,
      data: policy,
    })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    logger.error('GET /api/lora-assets/civitai/download-policy failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json<ErrorBody>(
      { success: false, error: 'Failed to resolve Civitai download policy' },
      { status: 502 },
    )
  }
}
