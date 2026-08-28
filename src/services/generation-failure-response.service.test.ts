import { describe, expect, it } from 'vitest'

import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'

import { buildGenerationFailureResponseFields } from './generation-failure-response.service'

describe('buildGenerationFailureResponseFields', () => {
  // 回归：Volcengine「输出图 size 不合法」这类错误里天然带着 "image"/
  // "exceeds"/"resolution" 这些参考图规则也认的词。请求里没有参考图时，必须
  // 不把这类消息说成「参考图不合规」——否则用户会去换一张根本不存在的参考图。
  const AMBIGUOUS_MESSAGE =
    'VolcEngine image generation failed (400): requested image size exceeds the maximum allowed dimensions'

  it('classifies an ambiguous size/dimension message as a reference-image error when one was sent', () => {
    const fields = buildGenerationFailureResponseFields({
      errorMessage: AMBIGUOUS_MESSAGE,
      hasReferenceImage: true,
    })

    expect(fields.errorCode).toBe(
      GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
    )
    expect(fields.i18nKey).toBe('errors.provider.referenceImageTooLarge')
    expect(fields.hasReferenceImage).toBe(true)
  })

  it('does not blame a reference image that was never part of the request', () => {
    const fields = buildGenerationFailureResponseFields({
      errorMessage: AMBIGUOUS_MESSAGE,
      hasReferenceImage: false,
    })

    expect(fields.errorCode).not.toBe(
      GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
    )
    expect(fields.i18nKey).not.toBe('errors.provider.referenceImageTooLarge')
    expect(fields.hasReferenceImage).toBe(false)
  })

  it('keeps prior behavior (patterns apply) when hasReferenceImage is omitted', () => {
    const fields = buildGenerationFailureResponseFields({
      errorMessage: AMBIGUOUS_MESSAGE,
    })

    expect(fields.errorCode).toBe(
      GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
    )
    expect(fields.hasReferenceImage).toBeUndefined()
  })

  it('an explicit backend errorCode still wins over text classification', () => {
    const fields = buildGenerationFailureResponseFields({
      errorMessage: AMBIGUOUS_MESSAGE,
      errorCode: 'PROVIDER_TIMEOUT',
      hasReferenceImage: false,
    })

    expect(fields.errorCode).toBe(GENERATION_ERROR_CODES.PROVIDER_TIMEOUT)
  })

  it('returns no i18nKey/errorCode for unclassifiable text', () => {
    const fields = buildGenerationFailureResponseFields({
      errorMessage: '生成失败',
    })

    expect(fields.errorCode).toBeUndefined()
    expect(fields.i18nKey).toBeUndefined()
    expect(fields.error).toBe('生成失败')
  })
})
