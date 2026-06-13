import 'server-only'

import {
  GENERATION_ERROR_CODES,
  getGenerationErrorI18nKey,
  normalizeErrorCode,
  parseGenerationErrorCode,
  type GenerationErrorCode,
} from '@/constants/generation-errors'

export interface GenerationFailureSource {
  errorMessage?: string | null
  errorCode?: string | null
}

export interface GenerationFailureResponseFields {
  error?: string
  errorCode?: GenerationErrorCode
  i18nKey?: string
}

export function buildGenerationFailureResponseFields(
  source: GenerationFailureSource,
): GenerationFailureResponseFields {
  const error = source.errorMessage ?? undefined
  const normalizedErrorCode =
    normalizeErrorCode(source.errorCode) ??
    (error ? parseGenerationErrorCode(error) : null)
  const errorCode =
    normalizedErrorCode === GENERATION_ERROR_CODES.UNKNOWN
      ? null
      : normalizedErrorCode
  const i18nKey = error ? getGenerationErrorI18nKey(error) : null

  return {
    ...(error ? { error } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(i18nKey ? { i18nKey } : {}),
  }
}
