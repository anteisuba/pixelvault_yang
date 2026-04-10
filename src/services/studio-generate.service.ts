import 'server-only'

import type { GenerationRecord, StudioGenerateRequest } from '@/types'
import { db } from '@/lib/db'
import { compileRecipe } from '@/services/recipe-compiler.service'
import { generateImageForUser } from '@/services/generate-image.service'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'

/**
 * Studio generation — two paths:
 *
 * Quick mode (modelId present):
 *   Skip recipe compilation → direct generateImageForUser
 *
 * Card mode (styleCardId present):
 *   compileRecipe → generateImageForUser (original V2 flow)
 */
export async function compileAndGenerate(
  clerkId: string,
  input: StudioGenerateRequest,
): Promise<GenerationRecord> {
  const dbUser = await ensureUser(clerkId)

  // ── Quick mode: modelId direct path ─────────────────────────
  if (input.modelId) {
    logger.info('[StudioGenerate] Quick mode — direct generation', {
      userId: dbUser.id,
      modelId: input.modelId,
      hasApiKeyId: !!input.apiKeyId,
    })

    // B5: Inject seed override into advancedParams
    const mergedQuickAdvanced = {
      ...(input.advancedParams
        ? (input.advancedParams as Record<string, unknown>)
        : {}),
      ...(input.seed != null ? { seed: input.seed } : {}),
    }

    const generation = await generateImageForUser(clerkId, {
      prompt: input.freePrompt ?? '',
      modelId: input.modelId,
      apiKeyId: input.apiKeyId,
      aspectRatio: input.aspectRatio ?? '1:1',
      referenceImages:
        input.referenceImages && input.referenceImages.length > 0
          ? input.referenceImages
          : undefined,
      advancedParams:
        Object.keys(mergedQuickAdvanced).length > 0
          ? mergedQuickAdvanced
          : undefined,
      projectId: input.projectId,
    })

    // B5: Update batch metadata if part of a run group
    if (input.runGroupId) {
      await db.generation.update({
        where: { id: generation.id },
        data: {
          runGroupId: input.runGroupId,
          runGroupType: input.runGroupType ?? 'single',
          runGroupIndex: input.runGroupIndex ?? 0,
          seed: input.seed != null ? BigInt(input.seed) : generation.seed,
        },
      })
    }

    return generation
  }

  // ── Card mode: recipe compilation path ──────────────────────
  logger.info('[StudioGenerate] Card mode — compiling recipe', {
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
    input.advancedParams || compiled.advancedParams || input.seed != null
      ? {
          ...(compiled.advancedParams ?? {}),
          ...(input.advancedParams ?? {}),
          ...(input.seed != null ? { seed: input.seed } : {}),
        }
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

  // B0: Enrich snapshot with card-mode-specific fields
  // (generateImageForUser already saved the base snapshot)
  // B5: Also update batch metadata if part of a run group
  await db.generation.update({
    where: { id: generation.id },
    data: {
      snapshot: {
        ...((generation.snapshot as Record<string, unknown>) ?? {}),
        freePrompt: input.freePrompt,
        characterCardId: input.characterCardId,
        backgroundCardId: input.backgroundCardId,
        styleCardId: input.styleCardId,
      },
      ...(input.runGroupId
        ? {
            runGroupId: input.runGroupId,
            runGroupType: input.runGroupType ?? 'single',
            runGroupIndex: input.runGroupIndex ?? 0,
            seed: input.seed != null ? BigInt(input.seed) : generation.seed,
          }
        : {}),
    },
  })

  return generation
}
