import { AI_MODELS } from './models/enum'

export const NOVELAI_V5_MAX_CHARACTERS = 22

export function supportsNovelAiCharacters(modelId?: string): boolean {
  return (
    modelId === AI_MODELS.NOVELAI_V5_FULL ||
    modelId === AI_MODELS.NOVELAI_V5_CURATED
  )
}
