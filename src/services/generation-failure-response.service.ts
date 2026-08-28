import 'server-only'

import {
  GENERATION_ERROR_CODES,
  getGenerationErrorI18nKeyForCode,
  normalizeErrorCode,
  parseGenerationErrorCode,
  type GenerationErrorCode,
} from '@/constants/generation-errors'

export interface GenerationFailureSource {
  errorMessage?: string | null
  errorCode?: string | null
  /**
   * Whether the job that failed actually submitted a reference image.
   * Passing this (derived from the job's stored queue metadata) keeps a
   * generic provider complaint about the output image, a size/resolution
   * param, or anything unrelated from being mislabeled as "your reference
   * image is broken" for a request that never had one — see
   * `ParseGenerationErrorCodeOptions`. Omit when unknown.
   */
  hasReferenceImage?: boolean
}

export interface GenerationFailureResponseFields {
  error?: string
  errorCode?: GenerationErrorCode
  i18nKey?: string
  /**
   * Echoed back from `source.hasReferenceImage` so a client that has to
   * re-derive a code from the raw `error` text (e.g. because `errorCode`
   * came back UNKNOWN) can still gate the reference-image-specific patterns
   * correctly instead of guessing blind.
   */
  hasReferenceImage?: boolean
}

export function buildGenerationFailureResponseFields(
  source: GenerationFailureSource,
): GenerationFailureResponseFields {
  const error = source.errorMessage ?? undefined
  const normalizedErrorCode =
    normalizeErrorCode(source.errorCode) ??
    (error
      ? parseGenerationErrorCode(error, {
          hasReferenceImage: source.hasReferenceImage,
        })
      : null)
  const errorCode =
    normalizedErrorCode === GENERATION_ERROR_CODES.UNKNOWN
      ? null
      : normalizedErrorCode
  const i18nKey =
    error && normalizedErrorCode
      ? getGenerationErrorI18nKeyForCode(normalizedErrorCode, error)
      : null

  return {
    ...(error ? { error } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(i18nKey ? { i18nKey } : {}),
    ...(source.hasReferenceImage !== undefined
      ? { hasReferenceImage: source.hasReferenceImage }
      : {}),
  }
}
