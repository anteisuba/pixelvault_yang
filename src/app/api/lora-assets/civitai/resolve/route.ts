import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { resolveCivitaiLoraByReference } from '@/services/civitai-lora.service'
import { findLoraAssetByExtraReference } from '@/services/lora-asset.service'
import type { LoraAssetRecord } from '@/types'

// Civitai 解析结果对所有人相同 — 长 CDN 缓存。本地库命中是用户相关
// 数据，绝不能进共享缓存（见下 private 分支）。
const CIVITAI_CACHE_CONTROL =
  'public, s-maxage=86400, stale-while-revalidate=604800'
const LOCAL_CACHE_CONTROL = 'private, no-store'

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
  data: LoraAssetRecord
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
    // 第 0 层：本地库（收藏/自训练/精选/公开）— 毫秒级、覆盖 Civitai 上
    // 不存在的自训练 LoRA。登录是可选的：未登录只匹配公开行。
    const { userId: clerkId } = await auth()
    const local = await findLoraAssetByExtraReference(clerkId, parsed.data)
    if (local) {
      const response = NextResponse.json<SuccessBody>({
        success: true,
        data: local,
      })
      response.headers.set('Cache-Control', LOCAL_CACHE_CONTROL)
      return response
    }

    const data = await resolveCivitaiLoraByReference(parsed.data)
    if (!data) {
      return NextResponse.json<ErrorBody>(
        { success: false, error: 'LoRA not found locally or on Civitai' },
        { status: 404 },
      )
    }
    const response = NextResponse.json<SuccessBody>({ success: true, data })
    response.headers.set('Cache-Control', CIVITAI_CACHE_CONTROL)
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
