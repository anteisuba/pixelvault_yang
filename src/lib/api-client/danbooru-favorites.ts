import { z } from 'zod'

import { API_ENDPOINTS } from '@/constants/config'
import {
  DanbooruFavoriteSchema,
  type CreateDanbooruFavorite,
} from '@/types/danbooru-catalog'

/** 查资料收藏的客户端出口；失败一律抛，调用方负责把乐观更新退回去。 */

async function readData(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`FAVORITES_${response.status}`)
  const body = await response.json()
  if (!body.success) throw new Error('FAVORITES_FAILED')
  return body.data
}

export async function listDanbooruFavoritesAPI() {
  return z
    .array(DanbooruFavoriteSchema)
    .parse(await readData(await fetch(API_ENDPOINTS.DANBOORU_FAVORITES)))
}

export async function addDanbooruFavoriteAPI(input: CreateDanbooruFavorite) {
  return DanbooruFavoriteSchema.parse(
    await readData(
      await fetch(API_ENDPOINTS.DANBOORU_FAVORITES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    ),
  )
}

export async function removeDanbooruFavoriteAPI(id: string) {
  await readData(
    await fetch(
      `${API_ENDPOINTS.DANBOORU_FAVORITES}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
  )
}
