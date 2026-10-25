import 'server-only'

import { randomBytes } from 'node:crypto'

import { IMAGE_RECIPE } from '@/constants/image-recipe'
import { USER_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import type {
  ImageRecipeEmbedded,
  ImageRecipePrepare,
  ImageRecipePrepareRequest,
  ImageRecipeReading,
  ImageRecipeTags,
} from '@/types/image-recipe'
import type { ImageTaggerResult } from '@/types/image-tagger'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  readEmbeddedRecipe,
  type EmbeddedRecipe,
} from '@/services/image-embedded-recipe.service'
import { tagPicture } from '@/services/image-tagger.service'
import {
  createPresignedR2PutUrl,
  deleteFromR2,
  getR2ObjectBuffer,
  getR2PublicUrl,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'

/**
 * 台上「从图读串」（owner 2026-10-25）：读一张图自带的配方，读不到就认标签。
 *
 * ⭐ 图经浏览器直传到 R2 的临时键（`tmp/recipe-read/<用户>/…`），这里读完就删 ——
 *   ⛔ 不建 Generation 行、不进素材库。认标签要 https 地址，所以没配方时先认完再删。
 */

function keyPrefix(userId: string): string {
  return `${IMAGE_RECIPE.STORAGE_PREFIX}/${userId}/`
}

export async function prepareImageRecipeUpload(
  clerkId: string,
  input: ImageRecipePrepareRequest,
): Promise<ImageRecipePrepare> {
  const dbUser = await ensureUser(clerkId)
  const storageKey = `${keyPrefix(dbUser.id)}${randomBytes(12).toString('hex')}`
  const uploadUrl = await createPresignedR2PutUrl({
    key: storageKey,
    mimeType: input.mimeType,
    expiresInSeconds: IMAGE_RECIPE.UPLOAD_URL_EXPIRES_SECONDS,
  })
  return {
    uploadUrl,
    storageKey,
    headers: { 'Content-Type': input.mimeType, 'If-None-Match': '*' },
  }
}

function toEmbedded(recipe: EmbeddedRecipe): ImageRecipeEmbedded {
  return {
    source: recipe.source,
    model: recipe.model,
    prompt: recipe.prompt,
    negative: recipe.negative,
    characters: recipe.characters.map((character) => ({ ...character })),
    manualPositions: recipe.manualPositions,
    steps: recipe.steps,
    cfg: recipe.cfg,
    sampler: recipe.sampler,
    width: recipe.width,
    height: recipe.height,
    seed: recipe.seed === null ? null : recipe.seed.toString(),
  }
}

/** Tagger 的读数 → 三格：画师（够自信的前几个）· 角色（含作品）· 特征。 */
export function tagsFromTagger(result: ImageTaggerResult): ImageRecipeTags {
  return {
    artist: result.style
      .filter(([, score]) => score >= IMAGE_RECIPE.MIN_ARTIST_SCORE)
      .slice(0, IMAGE_RECIPE.MAX_ARTISTS)
      .map(([name]) => name),
    character: [
      ...result.character.slice(0, IMAGE_RECIPE.MAX_CHARACTERS),
      ...result.copyright.slice(0, IMAGE_RECIPE.MAX_CHARACTERS),
    ].map(([name]) => name),
    general: result.general.map(([name]) => name),
  }
}

export async function readImageRecipe(
  clerkId: string,
  storageKey: string,
): Promise<ImageRecipeReading> {
  const dbUser = await ensureUser(clerkId)
  if (!storageKey.startsWith(keyPrefix(dbUser.id)) || storageKey.includes('..'))
    throw new ApiRequestError(
      'IMAGE_RECIPE_KEY_INVALID',
      403,
      'errors.imageRecipe.readFailed',
      'Storage key is not valid for this user',
    )
  try {
    const { buffer } = await getR2ObjectBuffer({
      key: storageKey,
      maxBytes: USER_UPLOAD_MAX_BYTES,
    })
    const recipe = await readEmbeddedRecipe(buffer)
    if (recipe) return { recipe: toEmbedded(recipe), tags: null }
    const tagged = await tagPicture(dbUser.id, getR2PublicUrl(storageKey))
    return { recipe: null, tags: tagsFromTagger(tagged) }
  } catch (error) {
    logger.warn('image recipe read failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw new ApiRequestError(
      'IMAGE_RECIPE_READ_FAILED',
      502,
      'errors.imageRecipe.readFailed',
      'Could not read this picture',
    )
  } finally {
    await deleteFromR2(storageKey).catch(() => undefined)
  }
}
