import 'server-only'

import { SEMANTIC_SEARCH } from '@/constants/semantic-search'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { searchByMeaning } from '@/services/semantic-search.service'

/**
 * Danbooru 标签的中日文名（`DanbooruTagName`，第 9f 步 9f-2c）：标签库按中日文名搜、卡片与
 * 详情带上中日文名。
 *
 * ⚠ 词库只是锦上添花：表还没建（Preview 不跑迁移）/ 还没导入 / 库出错时一律当没有，
 *   ⛔ 让标签库跟着失败 —— 英文名与 Danbooru Wiki 的别名照常工作。
 */

export interface DanbooruTagNameHit {
  name: string
  category: number
  post_count: number
}

export interface DanbooruTagLocalNames {
  zh: string | null
  zhNote: string | null
  ja: string | null
}

/** 中日文名（或中文那份的别名）里含这个词的 tag，按作品数从多到少。 */
export async function findTagsByLocalName(
  text: string,
  categories: readonly number[],
  limit: number,
): Promise<DanbooruTagNameHit[]> {
  const needle = text.trim().toLowerCase()
  if (!needle) return []
  try {
    const rows = await db.danbooruTagName.findMany({
      where: {
        searchText: { contains: needle },
        category: { in: [...categories] },
      },
      orderBy: { count: 'desc' },
      take: limit,
      select: { tag: true, category: true, count: true },
    })
    return rows.map((row) => ({
      name: row.tag,
      category: row.category,
      post_count: row.count,
    }))
  } catch (error) {
    logger.warn('danbooru tag names unavailable', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

/**
 * 意思对得上的 tag（「猫耳の女の子」→ cat_ears，「悲伤的表情」→ sad），从近到远。
 * 向量由 `scripts/index-danbooru-tag-meanings.ts` 从这张表算进 `workers/semantic-index`；
 * 那边没配 / 出错时回空，同上「锦上添花」。
 */
export async function findTagsByMeaning(
  text: string,
  categories: readonly number[],
  limit: number,
): Promise<DanbooruTagNameHit[]> {
  const matches = await searchByMeaning({
    kind: SEMANTIC_SEARCH.KINDS.DANBOORU_TAG,
    text,
    categories,
    topK: limit,
  })
  return matches.map((match) => ({
    name: match.key,
    category: Number(match.meta.category),
    post_count: Number(match.meta.count),
  }))
}

/** 这几个 tag 的中日文名；词库里没有的不在结果里。 */
export async function localNamesOf(
  tags: readonly string[],
): Promise<Map<string, DanbooruTagLocalNames>> {
  const names = new Map<string, DanbooruTagLocalNames>()
  if (!tags.length) return names
  try {
    const rows = await db.danbooruTagName.findMany({
      where: { tag: { in: [...new Set(tags)] } },
      select: { tag: true, zh: true, zhNote: true, ja: true },
    })
    for (const { tag, ...local } of rows) names.set(tag, local)
  } catch (error) {
    logger.warn('danbooru tag names unavailable', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return names
}
