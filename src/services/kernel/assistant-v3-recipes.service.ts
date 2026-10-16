import 'server-only'

import { inflateSync } from 'node:zlib'

import { ASSISTANT_V3_RECIPE_LIMITS } from '@/constants/assistant-v3'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import { buildAssetRecipeText } from '@/lib/asset-recipe-text'
import { db } from '@/lib/db'
import { embeddedRecipeText } from '@/lib/embedded-recipe'
import { logger } from '@/lib/logger'
import { readPngTextChunks } from '@/lib/png-text-chunks'
import type { V3Picture } from '@/services/kernel/assistant-v3-look.service'

/**
 * **图自带的配方**（「反推读原配方」小期，owner 2026-10-15 定、2026-10-16 选瘦身版）。
 *
 * ⭐ 反推先读原配方再看图：出图参数是写在文件里的字，模型看图只看得到像素；自家作品的配方在
 *   库里，模型也不知道。这两样代码递给它，怎么用（照实给、改成别家写法、配方没写的再看图补）
 *   由它判断 —— 规矩只有系统提示 LOOKING 里那一句。
 * - **文件里的**：PNG 文本块（A1111 `parameters`、ComfyUI `prompt`、NovelAI `Comment` …）原样
 *   取出、压小（`embeddedRecipeText`）。⚠ 只认 PNG：JPEG / WEBP 的 EXIF 还没读。
 * - **在这里做的**：创作者自己的作品，与素材查看器「复制配方」同一段字（`buildAssetRecipeText`）。
 *   ⚠ 上传 / 网上导入的不算（`USER_UPLOAD_PROVIDER`）—— 那是别人的图，配方只看文件里的。
 * ⚠ 两样都有就都给（自家的短，文件里的全）；都没有就不提，模型照常看图。
 * ⚠ 读不到只是少一段字：查库失败记一行日志，⛔ 不让这一轮失败。
 */

export interface V3RecipeSource {
  readonly url: string
  readonly label: string
  /** 这一轮下好的图（下不来是 `null`，那就只查库）。 */
  readonly picture: V3Picture | null
}

export interface V3PictureRecipe {
  readonly label: string
  /** 创作者在这里做的那一张的配方。 */
  readonly madeHere: string | null
  /** 文件里出图工具写下的字。 */
  readonly savedInFile: string | null
}

function inflate(data: Uint8Array): Uint8Array {
  return new Uint8Array(
    inflateSync(data, {
      maxOutputLength: ASSISTANT_V3_RECIPE_LIMITS.maxInflatedBytes,
    }),
  )
}

/** 一张图文件里写下的配方；不是 PNG、没写是 `null`。 */
export function fileRecipeOf(picture: V3Picture): string | null {
  if (picture.mediaType !== 'image/png') return null
  const bytes = new Uint8Array(
    picture.data.buffer,
    picture.data.byteOffset,
    picture.data.byteLength,
  )
  return embeddedRecipeText(readPngTextChunks(bytes, inflate), {
    maxChars: ASSISTANT_V3_RECIPE_LIMITS.maxPictureChars,
    maxValueChars: ASSISTANT_V3_RECIPE_LIMITS.maxValueChars,
  })
}

interface OwnRecipeRow {
  url: string
  thumbnailUrl: string | null
  prompt: string
  negativePrompt: string | null
  model: string
  width: number
  height: number
  seed: string | null
  advancedParams: unknown
}

/**
 * 这几个地址里哪几张是创作者自己在这里做的 → 地址 → 配方。原图地址、缩略图地址都认。
 * ⚠ 一条裸 SQL 只取 `snapshot->'advancedParams'` 那一格：整份快照能到 7 MB
 *   （同 `readGenerationReviewStates`）。⚠ 按 `userId` 收敛：别人的库读不到。
 */
export async function readOwnRecipes(
  userId: string,
  urls: readonly string[],
): Promise<Map<string, string>> {
  const recipes = new Map<string, string>()
  const list = [...new Set(urls)]
  if (!list.length) return recipes
  try {
    const rows = await db.$queryRaw<OwnRecipeRow[]>`
      SELECT "url", "thumbnailUrl", "prompt", "negativePrompt", "model", "width", "height",
             "seed"::text AS "seed", "snapshot"->'advancedParams' AS "advancedParams"
        FROM "Generation"
       WHERE "userId" = ${userId}
         AND "provider" <> ${USER_UPLOAD_PROVIDER}
         AND ("url" = ANY(${list}) OR "thumbnailUrl" = ANY(${list}))
       LIMIT ${list.length * 2}`
    for (const row of rows) {
      const text = buildAssetRecipeText({
        ...row,
        snapshot: { advancedParams: row.advancedParams ?? undefined },
      })
      if (!text) continue
      for (const url of [row.url, row.thumbnailUrl])
        if (url && list.includes(url) && !recipes.has(url))
          recipes.set(url, text)
    }
  } catch (error) {
    logger.warn('assistant v3 own recipes not read', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return recipes
}

/** 这几张图各自带的配方，按给的顺序；两样都没有的不在结果里。 */
export async function readPictureRecipes(
  userId: string,
  sources: readonly V3RecipeSource[],
): Promise<V3PictureRecipe[]> {
  if (!sources.length) return []
  const own = await readOwnRecipes(
    userId,
    sources.map((source) => source.url),
  )
  return sources.flatMap((source) => {
    const madeHere = own.get(source.url) ?? null
    const savedInFile = source.picture ? fileRecipeOf(source.picture) : null
    return madeHere || savedInFile
      ? [{ label: source.label, madeHere, savedInFile }]
      : []
  })
}

const CUT = '…[cut]'

/**
 * 配方 → 给模型的一段字（`heading` 是第一行）；没有配方是 `''`。
 * ⚠ 整段截在 `maxTurnChars`：板子每一跳都发，几张大工作流不能把它撑满。
 */
export function renderPictureRecipes(
  heading: string,
  recipes: readonly V3PictureRecipe[],
): string {
  if (!recipes.length) return ''
  const blocks = recipes.map((recipe) => {
    const lines: string[] = []
    if (recipe.madeHere)
      lines.push(
        `「${recipe.label}」 — made here, the creator's own work:\n${recipe.madeHere}`,
      )
    if (recipe.savedInFile)
      lines.push(
        `「${recipe.label}」 — saved inside the file by the tool that made it:\n${recipe.savedInFile}`,
      )
    return lines.join('\n')
  })
  const text = `${heading}\n${blocks.join('\n')}`
  const max = ASSISTANT_V3_RECIPE_LIMITS.maxTurnChars
  return text.length > max ? `${text.slice(0, max)}${CUT}` : text
}
