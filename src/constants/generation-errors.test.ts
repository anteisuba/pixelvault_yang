import { describe, it, expect } from 'vitest'

import {
  GENERATION_ERROR_CODES,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from './generation-errors'

describe('normalizeErrorCode', () => {
  it('maps backend SCREAMING_SNAKE codes to client codes', () => {
    expect(normalizeErrorCode('PROVIDER_TIMEOUT')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
    )
    expect(normalizeErrorCode('RATE_LIMIT_EXCEEDED')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
    )
    expect(normalizeErrorCode('SAFETY_FILTER_BLOCKED')).toBe(
      GENERATION_ERROR_CODES.CONTENT_FILTERED,
    )
    expect(normalizeErrorCode('FREE_LIMIT_EXCEEDED')).toBe(
      GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
    )
    expect(normalizeErrorCode('INVALID_API_KEY')).toBe(
      GENERATION_ERROR_CODES.INVALID_API_KEY,
    )
    expect(normalizeErrorCode('MISSING_API_KEY')).toBe(
      GENERATION_ERROR_CODES.INVALID_API_KEY,
    )
    expect(normalizeErrorCode('UNSUPPORTED_MODEL')).toBe(
      GENERATION_ERROR_CODES.MODEL_UNAVAILABLE,
    )
  })

  it('passes through codes that are already client codes', () => {
    expect(normalizeErrorCode('provider_timeout')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
    )
    expect(normalizeErrorCode('content_filtered')).toBe(
      GENERATION_ERROR_CODES.CONTENT_FILTERED,
    )
  })

  it('returns null for generic/unmapped codes so message parsing can refine', () => {
    expect(normalizeErrorCode('PROVIDER_ERROR')).toBeNull()
    expect(normalizeErrorCode('VALIDATION_ERROR')).toBeNull()
    expect(normalizeErrorCode('SOMETHING_ELSE')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(normalizeErrorCode()).toBeNull()
    expect(normalizeErrorCode(undefined)).toBeNull()
    expect(normalizeErrorCode(null)).toBeNull()
    expect(normalizeErrorCode('')).toBeNull()
  })
})

describe('parseGenerationErrorCode', () => {
  it('classifies provider messages by content', () => {
    expect(parseGenerationErrorCode('AI provider timed out')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
    )
    expect(parseGenerationErrorCode('Model is experiencing high demand')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_OVERLOADED,
    )
    expect(parseGenerationErrorCode('rate limit exceeded')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
    )
    expect(
      parseGenerationErrorCode('content blocked by the safety system'),
    ).toBe(GENERATION_ERROR_CODES.CONTENT_FILTERED)
  })

  it('returns UNKNOWN for unrecognized text', () => {
    expect(parseGenerationErrorCode('生成失败')).toBe(
      GENERATION_ERROR_CODES.UNKNOWN,
    )
    expect(parseGenerationErrorCode('')).toBe(GENERATION_ERROR_CODES.UNKNOWN)
  })

  it('never reports a size/memory failure as exhausted credits', () => {
    // 2026-08-24 回归：这两条真实的 Runner 失败曾被兜底正则里的「exceeded」判成
    // INSUFFICIENT_CREDITS →「今日免费生成次数已用完」，而当天免费额度一次都没用过。
    for (const message of [
      'WorkerProviderError: bad request: body: exceeded max body size of 10MiB',
      'Worker exceeded memory limit.',
    ]) {
      expect(parseGenerationErrorCode(message)).not.toBe(
        GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
      )
    }
  })

  it('still classifies a real free-tier exhaustion by its backend code', () => {
    // 消息文本不再参与判定，但真正的额度耗尽走 code 映射，必须仍然准确。
    expect(normalizeErrorCode('FREE_LIMIT_EXCEEDED')).toBe(
      GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
    )
    expect(normalizeErrorCode('RUNNER_MONTHLY_LIMIT_EXCEEDED')).toBe(
      GENERATION_ERROR_CODES.RUNNER_MONTHLY_LIMIT_EXCEEDED,
    )
  })

  describe('VolcEngine account inference limit (429 SetLimitExceeded)', () => {
    // 逐字取自库里的真实失败任务（2026-08-27，refs 为 null）。它同时含
    // "image"（我们自己的前缀）和 "Exceeded"，正好被 TOO_LARGE 吃掉，于是
    // 显示成「参考图文件过大」——而这次生成一张参考图都没放。
    const REAL_MESSAGE =
      'VolcEngine image generation failed (429): {"error":{"code":"SetLimitExceeded","message":"Your account [2124984845] has reached the set inference limit for the [doubao-seedream-5-0-pro] model, and the model service has been paused. To continue'

    it('classifies it as an account limit, not a reference-image problem', () => {
      expect(parseGenerationErrorCode(REAL_MESSAGE)).toBe(
        GENERATION_ERROR_CODES.PROVIDER_ACCOUNT_LIMIT_REACHED,
      )
    })

    it('wins over the generic 429 rate-limit rule', () => {
      // 二者对用户的指示相反：限流该等，这个等多久都没用。
      expect(parseGenerationErrorCode(REAL_MESSAGE)).not.toBe(
        GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
      )
    })

    it('still classifies a plain 429 as a rate limit', () => {
      expect(
        parseGenerationErrorCode('Provider returned 429 too many requests'),
      ).toBe(GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT)
    })

    it('does not fire on unrelated messages containing "exceeded"', () => {
      // 守住 2026-08-24 删掉的那条兜底不要以新形式回来。
      for (const message of [
        'WorkerProviderError: bad request: body: exceeded max body size of 10MiB',
        'Worker exceeded memory limit.',
        'rate limit exceeded',
      ]) {
        expect(parseGenerationErrorCode(message)).not.toBe(
          GENERATION_ERROR_CODES.PROVIDER_ACCOUNT_LIMIT_REACHED,
        )
      }
    })
  })

  describe('hasReferenceImage gating', () => {
    // 回归：Volcengine/Seedream 的请求里压根没带参考图，但 provider 报的是输出
    // 图 size/分辨率不合法，文案里照样含 "image"/"exceeds"/"resolution" 这类
    // 参考图规则也认的词，于是被错判成「参考图不合规」。这五条规则只有在调用方
    // 明确说「这次真的带了参考图」(hasReferenceImage !== false) 时才应该生效。
    const AMBIGUOUS_MESSAGES: Array<
      [string, ReturnType<typeof parseGenerationErrorCode>]
    > = [
      [
        'requested image size exceeds the maximum allowed dimensions',
        GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
      ],
      [
        'the output resolution does not match a supported aspect ratio',
        GENERATION_ERROR_CODES.INVALID_REFERENCE_IMAGE_DIMENSIONS,
      ],
      [
        'unsupported image format for this request',
        GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT,
      ],
    ]

    it('still applies reference-image patterns when hasReferenceImage is true or omitted', () => {
      for (const [message, expectedCode] of AMBIGUOUS_MESSAGES) {
        expect(parseGenerationErrorCode(message)).toBe(expectedCode)
        expect(
          parseGenerationErrorCode(message, { hasReferenceImage: true }),
        ).toBe(expectedCode)
      }
    })

    it('skips reference-image patterns when the request had no reference image', () => {
      for (const [message] of AMBIGUOUS_MESSAGES) {
        expect(
          parseGenerationErrorCode(message, { hasReferenceImage: false }),
        ).not.toBe(AMBIGUOUS_MESSAGES.find(([m]) => m === message)?.[1])
      }
    })

    it('leaves non-reference-image classification untouched by the flag', () => {
      expect(
        parseGenerationErrorCode('rate limit exceeded', {
          hasReferenceImage: false,
        }),
      ).toBe(GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT)
    })
  })
})
