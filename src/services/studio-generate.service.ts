import 'server-only'

import type { GenerationRecord, StudioGenerateRequest } from '@/types'
import { compileRecipe } from '@/services/recipe-compiler.service'
import { generateImageForUser } from '@/services/generate-image.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'

/**
 * One-shot Studio V2 generation:
 * compileRecipe → generateImageForUser
 */
export async function compileAndGenerate(
  clerkId: string,
  input: StudioGenerateRequest,
): Promise<GenerationRecord> {
  const dbUser = await ensureUser(clerkId)

  logger.info('[StudioGenerate] Compiling recipe', {
    userId: dbUser.id,
    styleCardId: input.styleCardId,
    characterCardId: input.characterCardId,
    backgroundCardId: input.backgroundCardId,
  })

  const compiled = await compileRecipe({
    userId: dbUser.id,
    characterCardId: input.characterCardId,
    backgroundCardId: input.backgroundCardId,
    styleCardId: input.styleCardId,
    freePrompt: input.freePrompt,
  })

  logger.info('[StudioGenerate] Recipe compiled, starting generation', {
    userId: dbUser.id,
    modelId: compiled.modelId,
    adapterType: compiled.adapterType,
  })

  // Merge card-based reference images with user-uploaded ones from toolbar
  const allReferenceImages = [
    ...compiled.referenceImages,
    ...(input.referenceImages ?? []),
  ]

  // Merge advanced params: compiled (from StyleCard) is base, input override takes precedence
  const mergedAdvancedParams =
    input.advancedParams || compiled.advancedParams
      ? { ...(compiled.advancedParams ?? {}), ...(input.advancedParams ?? {}) }
      : undefined

  const generation = await generateImageForUser(clerkId, {
    prompt: compiled.compiledPrompt,
    modelId: compiled.modelId,
    aspectRatio: input.aspectRatio ?? '1:1',
    referenceImages:
      allReferenceImages.length > 0 ? allReferenceImages : undefined,
    advancedParams: mergedAdvancedParams,
    projectId: input.projectId,
  })

  return generation
}
