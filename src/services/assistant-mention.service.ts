import 'server-only'

import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { ASSISTANT_MENTION_LIMITS } from '@/constants/assistant-mention'
import { resolveGenerationDisplayName } from '@/lib/generation-name'
import { splitMentionQuery } from '@/lib/assistant-mention'
import { folderScopeWhere } from '@/services/asset-folder.service'
import { ensureUser } from '@/services/user.service'
import type {
  AssistantMentionKind,
  AssistantMentionLibraryFolder,
  AssistantMentionLibraryItem,
  AssistantMentionLibraryResult,
} from '@/types/assistant-mention'

/**
 * 助手输入框 `@` 的**素材库**那一组（设计方案 §10b「服务端多字段检索，可按文件夹
 * 下钻」）。
 *
 * ── 搜什么 ───────────────────────────────────────────────────────
 * 多词 = 每个词都要命中（AND），一个词命中下面任意一格就算（OR）：
 *   序号（`#12` / `12` / `图_012`）· 提示词 · 存下的产物名 · 所在文件夹名 ·
 *   角色卡名 · 模型名 · 类型词（图 / 视频 / 音频）。
 * 库里没有标签列 —— 「标签」由文件夹、角色、模型这几格兜。
 * ⚠ 排序只按时间（新的在前）；按名字的精细排序在客户端（`searchMentionCandidates`），
 *   ⛔ 不在这里再写一份打分。
 *
 * ── 只读 ─────────────────────────────────────────────────────────
 * ⛔ 这里没有任何写路：它只给菜单列候选。选中之后真正「看」那张图仍要过助手那条
 * `mentionedAssets` 准入名单。
 */

const OUTPUT_KIND: Record<string, AssistantMentionKind> = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  MODEL_3D: 'model3d',
}

/** 打这些词 = 只要这一类（中 / 英 / 日）。 */
const TYPE_WORDS: Record<string, 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MODEL_3D'> = {
  图: 'IMAGE',
  图片: 'IMAGE',
  image: 'IMAGE',
  画像: 'IMAGE',
  视频: 'VIDEO',
  video: 'VIDEO',
  動画: 'VIDEO',
  音频: 'AUDIO',
  audio: 'AUDIO',
  音声: 'AUDIO',
  模型: 'MODEL_3D',
  '3d': 'MODEL_3D',
}

/** 提示词留多少字给菜单（悬停预览 + 客户端排序）。 */
const PROMPT_PREVIEW_CHARS = 240
/** 名字命中的文件夹最多列几个。 */
const FOLDER_RESULTS = 6

function readIndex(term: string): number | null {
  const match = term.match(/^#?(\d{1,7})$/) ?? term.match(/_(\d{1,7})$/)
  return match ? Number(match[1]) : null
}

function termWhere(term: string): Prisma.GenerationWhereInput {
  const contains = { contains: term, mode: 'insensitive' as const }
  const index = readIndex(term)
  const type = TYPE_WORDS[term]
  return {
    OR: [
      ...(index === null ? [] : [{ seq: index }]),
      ...(type ? [{ outputType: type }] : []),
      ...(term.startsWith('#')
        ? []
        : [
            { prompt: contains },
            { model: contains },
            { snapshot: { path: ['displayName'], string_contains: term } },
            {
              folders: {
                some: { project: { isDeleted: false, name: contains } },
              },
            },
            {
              characterCards: {
                some: { characterCard: { isDeleted: false, name: contains } },
              },
            },
          ]),
    ],
  }
}

export async function searchMentionLibrary(
  userId: string,
  input: { q: string; folderId?: string; limit: number },
): Promise<AssistantMentionLibraryResult> {
  const terms = splitMentionQuery(input.q)
  const limit = Math.min(input.limit, ASSISTANT_MENTION_LIMITS.libraryPageSize)
  const scope = input.folderId
    ? await folderScopeWhere(userId, input.folderId)
    : {}
  const where: Prisma.GenerationWhereInput = {
    userId,
    status: 'COMPLETED',
    ...scope,
    ...(terms.length ? { AND: terms.map(termWhere) } : {}),
  }
  const [rows, folders] = await Promise.all([
    db.generation.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        url: true,
        thumbnailUrl: true,
        outputType: true,
        seq: true,
        prompt: true,
        model: true,
        createdAt: true,
        snapshot: true,
        folders: {
          where: { project: { isDeleted: false } },
          select: { project: { select: { name: true } } },
          take: 3,
        },
      },
    }),
    listMentionFolders(userId, terms, input.folderId),
  ])
  const items: AssistantMentionLibraryItem[] = rows.map((row) => {
    const kind = OUTPUT_KIND[row.outputType] ?? 'image'
    const thumb = row.thumbnailUrl ?? (kind === 'image' ? row.url : undefined)
    return {
      id: row.id,
      kind,
      label: resolveGenerationDisplayName(row),
      url: row.url,
      ...(thumb ? { thumb } : {}),
      ...(typeof row.seq === 'number' ? { seq: row.seq } : {}),
      folders: row.folders.map((item) => item.project.name),
      prompt: row.prompt.slice(0, PROMPT_PREVIEW_CHARS),
      model: row.model,
      createdAt: row.createdAt.toISOString(),
    }
  })
  return { items, folders }
}

/**
 * 菜单里的文件夹行：有查询时 = 名字命中所有词的夹；没查询时 = 当前这一层的子夹
 * （下钻用）。
 */
async function listMentionFolders(
  userId: string,
  terms: readonly string[],
  folderId: string | undefined,
): Promise<AssistantMentionLibraryFolder[]> {
  const nameTerms = terms.filter((term) => !term.startsWith('#'))
  if (terms.length && !nameTerms.length) return []
  const rows = await db.project.findMany({
    where: {
      userId,
      isDeleted: false,
      ...(nameTerms.length
        ? {
            AND: nameTerms.map((term) => ({
              name: { contains: term, mode: 'insensitive' as const },
            })),
          }
        : { parentId: folderId ?? null }),
    },
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    take: FOLDER_RESULTS,
    select: { id: true, name: true, parentId: true },
  })
  return rows
}

/**
 * 按地址查这几张在库里叫什么（参考位带真名，⛔ 不再是「图1」）。只认这个人自己的；
 * 查不到的不回（上传前的本地预览、外链）。
 */
export async function lookupMentionAssets(
  userId: string,
  urls: readonly string[],
  seqs: readonly number[] = [],
): Promise<AssistantMentionLibraryItem[]> {
  if (!urls.length && !seqs.length) return []
  const rows = await db.generation.findMany({
    where: {
      userId,
      OR: [
        ...(urls.length
          ? [{ url: { in: [...urls] } }, { thumbnailUrl: { in: [...urls] } }]
          : []),
        ...(seqs.length ? [{ seq: { in: [...seqs] } }] : []),
      ],
    },
    select: {
      id: true,
      url: true,
      thumbnailUrl: true,
      outputType: true,
      seq: true,
      prompt: true,
      model: true,
      createdAt: true,
      snapshot: true,
    },
    take: urls.length * 2 + seqs.length,
  })
  return rows.map((row) => {
    const kind = OUTPUT_KIND[row.outputType] ?? 'image'
    const thumb = row.thumbnailUrl ?? (kind === 'image' ? row.url : undefined)
    return {
      id: row.id,
      kind,
      label: resolveGenerationDisplayName(row),
      url: row.url,
      ...(thumb ? { thumb } : {}),
      ...(typeof row.seq === 'number' ? { seq: row.seq } : {}),
      folders: [],
      prompt: row.prompt.slice(0, PROMPT_PREVIEW_CHARS),
      model: row.model,
      createdAt: row.createdAt.toISOString(),
    }
  })
}

/** 路由那一层只有 Clerk id —— 在这里换成库里的用户。 */
export async function searchMentionLibraryForClerkId(
  clerkId: string,
  input: { q: string; folderId?: string; limit: number },
): Promise<AssistantMentionLibraryResult> {
  const user = await ensureUser(clerkId)
  return searchMentionLibrary(user.id, input)
}

export async function lookupMentionAssetsForClerkId(
  clerkId: string,
  input: { urls?: readonly string[]; seqs?: readonly number[] },
): Promise<AssistantMentionLibraryItem[]> {
  const user = await ensureUser(clerkId)
  return lookupMentionAssets(user.id, input.urls ?? [], input.seqs ?? [])
}
