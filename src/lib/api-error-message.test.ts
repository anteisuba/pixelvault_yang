import { describe, it, expect } from 'vitest'

import {
  getApiErrorMessage,
  getGenerationErrorMessage,
} from './api-error-message'

type Translator = ((key: string) => string) & { has: (key: string) => boolean }

function makeTranslator(known: Record<string, string>): Translator {
  const t = ((key: string) => known[key] ?? key) as Translator
  t.has = (key: string) => key in known
  return t
}

const translator = makeTranslator({
  'provider.timeout': 'Provider timed out (i18n)',
  'generation.provider_timeout': 'AI provider took too long',
  'generation.provider_overloaded': 'Model at capacity',
  'generation.content_filtered': 'Content filtered',
  'generation.model_unavailable': 'Model unavailable',
})

describe('getApiErrorMessage', () => {
  it('prefers backend i18nKey when present and translatable', () => {
    expect(
      getApiErrorMessage(
        translator,
        { i18nKey: 'errors.provider.timeout', error: 'raw' },
        'fallback',
      ),
    ).toBe('Provider timed out (i18n)')
  })

  it('returns the raw error and does NOT classify by message', () => {
    // A download "502" must stay verbatim, not become "Model unavailable".
    expect(
      getApiErrorMessage(
        translator,
        { error: 'Upstream returned 502' },
        'fallback',
      ),
    ).toBe('Upstream returned 502')
  })

  it('falls back to fallbackMessage for an empty payload', () => {
    expect(getApiErrorMessage(translator, {}, 'fallback')).toBe('fallback')
  })
})

describe('getGenerationErrorMessage', () => {
  it('prefers backend i18nKey when present and translatable', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        {
          i18nKey: 'errors.provider.timeout',
          errorCode: 'PROVIDER_TIMEOUT',
          error: 'raw provider text',
        },
        'fallback',
      ),
    ).toBe('Provider timed out (i18n)')
  })

  it('classifies by structured errorCode (SCREAMING_SNAKE)', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        { errorCode: 'PROVIDER_TIMEOUT', error: 'raw' },
        'fallback',
      ),
    ).toBe('AI provider took too long')
  })

  it('refines a generic errorCode via message parsing', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        {
          errorCode: 'PROVIDER_ERROR',
          error: 'Gemini is experiencing high demand',
        },
        'fallback',
      ),
    ).toBe('Model at capacity')
  })

  it('parses the message when no errorCode is present', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        { error: 'The request timed out' },
        'fallback',
      ),
    ).toBe('AI provider took too long')
  })

  it('falls back to the raw error for an unclassifiable message', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        { error: 'totally unexpected xyz' },
        'fallback',
      ),
    ).toBe('totally unexpected xyz')
  })

  it('surfaces the specific reason for a validation error (by errorCode)', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        {
          errorCode: 'VALIDATION_ERROR',
          i18nKey: 'errors.validation.invalidInput',
          error:
            'referenceAudioUrl and referenceText must both be provided or both omitted',
        },
        'fallback',
      ),
    ).toBe(
      'referenceAudioUrl and referenceText must both be provided or both omitted',
    )
  })

  it('surfaces the specific reason for a validation error (by i18nKey only)', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        {
          i18nKey: 'errors.validation.invalidInput',
          error: 'Text is required',
        },
        'fallback',
      ),
    ).toBe('Text is required')
  })

  it('falls back to fallbackMessage for an empty payload', () => {
    expect(getGenerationErrorMessage(translator, {}, 'fallback')).toBe(
      'fallback',
    )
  })

  it('falls back to the raw error when the classification key is untranslated', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        { errorCode: 'FREE_LIMIT_EXCEEDED', error: 'limit reached' },
        'fallback',
      ),
    ).toBe('limit reached')
  })

  /**
   * 台账 H（owner 2026-08-29 真机）：同一批角色设定图，「16岁女生」通过、
   * 「男子高中生，17岁」被 Seedream 拒 —— 而 UI 只说「内容被服务商安全系统过滤」，
   * 是哪个词触发的一个字都没有。上游原话是唯一能指向真因的信息。
   */
  describe('内容过滤：保留 provider 原话', () => {
    it('把上游的拒绝理由接在本地化文案后面', () => {
      expect(
        getGenerationErrorMessage(
          translator,
          {
            error:
              'Your prompt was blocked by the safety system: minors in suggestive context',
          },
          'fallback',
        ),
      ).toBe(
        'Content filtered — Your prompt was blocked by the safety system: minors in suggestive context',
      )
    })

    it('原话与本地化文案相同时不重复拼', () => {
      expect(
        getGenerationErrorMessage(
          translator,
          { errorCode: 'CONTENT_FILTERED', error: 'Content filtered' },
          'fallback',
        ),
      ).toBe('Content filtered')
    })

    it('⚠ 只对内容过滤这么做 —— 别的错误码不附英文技术噪音', () => {
      expect(
        getGenerationErrorMessage(
          translator,
          { errorCode: 'PROVIDER_TIMEOUT', error: 'ETIMEDOUT after 120000ms' },
          'fallback',
        ),
      ).toBe('AI provider took too long')
    })
  })
})
