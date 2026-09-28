import 'server-only'

import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { ensureUser } from '@/services/user.service'
import { DANBOORU_REQUEST } from '@/constants/research'
import {
  DanbooruCatalogKindSchema,
  type CreateDanbooruFavorite,
  type DanbooruFavorite,
} from '@/types/danbooru-catalog'

/**
 * 标签台查资料的收藏（owner 2026-09-28：条目 · 每页置顶 · 存账号里）。
 * 收藏的是那一刻左栏那一行（张数、作品、缩略图）的快照，列表直接画。
 */

/** 这一页收满了 —— 路由工厂按 409 回。 */
export class DanbooruFavoriteLimitError extends ApiRequestError {
  constructor() {
    super(
      'DANBOORU_FAVORITE_LIMIT',
      409,
      'errors.danbooru.favoriteLimit',
      `At most ${DANBOORU_REQUEST.favoriteLimitPerKind} favorites per lookup page`,
    )
    this.name = 'DanbooruFavoriteLimitError'
  }
}

function toFavorite(row: {
  id: string
  kind: string
  name: string
  count: number
  work: string | null
  previews: unknown
  createdAt: Date
}): DanbooruFavorite | null {
  const kind = DanbooruCatalogKindSchema.safeParse(row.kind)
  if (!kind.success) return null
  return {
    id: row.id,
    kind: kind.data,
    name: row.name,
    count: row.count,
    work: row.work,
    previews: Array.isArray(row.previews)
      ? row.previews.filter((url): url is string => typeof url === 'string')
      : [],
    createdAt: row.createdAt.toISOString(),
  }
}

/** 新收藏的在前。 */
export async function listDanbooruFavorites(
  clerkId: string,
): Promise<DanbooruFavorite[]> {
  const user = await ensureUser(clerkId)
  const rows = await db.danbooruFavorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return rows.flatMap((row) => toFavorite(row) ?? [])
}

/** 已经收过就原样回那一条（点两下不报错、不重复）。 */
export async function addDanbooruFavorite(
  clerkId: string,
  input: CreateDanbooruFavorite,
): Promise<DanbooruFavorite> {
  const user = await ensureUser(clerkId)
  const key = { userId: user.id, kind: input.kind, name: input.name }
  const existing = await db.danbooruFavorite.findUnique({
    where: { userId_kind_name: key },
  })
  if (!existing) {
    const count = await db.danbooruFavorite.count({
      where: { userId: user.id, kind: input.kind },
    })
    if (count >= DANBOORU_REQUEST.favoriteLimitPerKind)
      throw new DanbooruFavoriteLimitError()
  }
  const row =
    existing ??
    (await db.danbooruFavorite.create({
      data: {
        ...key,
        count: input.count,
        work: input.work,
        previews: input.previews,
      },
    }))
  const favorite = toFavorite(row)
  if (!favorite) throw new Error('Unexpected favorite kind')
  return favorite
}

/** 不是自己的 / 已经删了 = false（路由按 404 回）。 */
export async function removeDanbooruFavorite(
  clerkId: string,
  id: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  const { count } = await db.danbooruFavorite.deleteMany({
    where: { id, userId: user.id },
  })
  return count > 0
}
