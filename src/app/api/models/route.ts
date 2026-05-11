import { NextResponse } from 'next/server'

import { CACHE_TAGS, cacheableFn } from '@/lib/cache-tags'
import { getResolvedModelOptions } from '@/services/model-config.service'

export const revalidate = 60

const getCachedAvailableModels = cacheableFn(
  async () => {
    const models = await getResolvedModelOptions()
    return models.filter((m) => m.available)
  },
  ['models:available:v1'],
  { tags: [CACHE_TAGS.modelsAvailable], revalidate: 60 },
)

export async function GET() {
  try {
    const available = await getCachedAvailableModels()
    return NextResponse.json(
      { success: true, data: available },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=60, stale-while-revalidate=300, max-age=0',
        },
      },
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch models'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
