import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import zhMessages from '@/messages/zh.json'
import enMessages from '@/messages/en.json'
import jaMessages from '@/messages/ja.json'

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
  'validation.invalidInput': 'Please check the generation settings',
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

  it('uses a user-facing fallback for an unclassifiable provider log', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        { error: 'totally unexpected xyz' },
        'fallback',
      ),
    ).toBe('fallback')
  })

  it('localizes a validation error (by errorCode)', () => {
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
    ).toBe('Please check the generation settings')
  })

  it('localizes a validation error (by i18nKey only)', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        {
          i18nKey: 'errors.validation.invalidInput',
          error: 'Text is required',
        },
        'fallback',
      ),
    ).toBe('Please check the generation settings')
  })

  it('falls back to fallbackMessage for an empty payload', () => {
    expect(getGenerationErrorMessage(translator, {}, 'fallback')).toBe(
      'fallback',
    )
  })

  it('uses a user-facing fallback when the classification key is untranslated', () => {
    expect(
      getGenerationErrorMessage(
        translator,
        { errorCode: 'FREE_LIMIT_EXCEEDED', error: 'limit reached' },
        'fallback',
      ),
    ).toBe('fallback')
  })

  describe('provider diagnostics stay out of the user-facing message', () => {
    it('localizes a safety rejection without appending the provider log', () => {
      expect(
        getGenerationErrorMessage(
          translator,
          {
            error:
              'Your prompt was blocked by the safety system: minors in suggestive context',
          },
          'fallback',
        ),
      ).toBe('Content filtered')
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

    it('does not append timeout diagnostics', () => {
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

it('uses the localized unknown message when classification fails', () => {
  const t = makeTranslator({
    'generation.unknown': 'Generation failed. Try again later.',
  })
  expect(
    getGenerationErrorMessage(
      t,
      { error: 'TypeError: internal transport xyz' },
      'fallback',
    ),
  ).toBe('Generation failed. Try again later.')
})

it('preserves an already localized provider-specific reason in run items', () => {
  const message = 'Please convert the reference image to PNG or JPEG.'
  const t = Object.assign(
    makeTranslator({ provider: '', 'generation.unknown': 'Unknown error' }),
    {
      raw: () => ({ unsupportedReferenceImage: message }),
    },
  )
  expect(getGenerationErrorMessage(t, { error: message }, 'fallback')).toBe(
    message,
  )
})

describe('generation errors with real translations', () => {
  for (const [locale, messages] of Object.entries({
    zh: zhMessages,
    en: enMessages,
    ja: jaMessages,
  })) {
    it(`${locale}: localizes logs and preserves already translated reasons`, () => {
      const t = createTranslator({
        locale: locale as 'zh' | 'en' | 'ja',
        messages,
        namespace: 'Errors',
      }) as unknown as Translator
      expect(
        getGenerationErrorMessage(
          t,
          { error: 'ETIMEDOUT after 120000ms' },
          'fallback',
        ),
      ).toBe(messages.Errors.generation.provider_timeout)
      for (const error of [
        messages.Errors.provider.unsupportedGeminiReferenceImage,
        messages.Errors.generation.provider_timeout,
      ]) {
        expect(getGenerationErrorMessage(t, { error }, 'fallback')).toBe(error)
      }
      expect(
        getGenerationErrorMessage(
          t,
          { error: 'TypeError: transport xyz' },
          'fallback',
        ),
      ).toBe(messages.Errors.generation.unknown)
    })
  }
})

describe('generation errors · 失败原因要具体（owner 09-24）', () => {
  const t = Object.assign(
    (key: string, values?: Record<string, string>) =>
      values ? `${key}:${values.detail}` : key,
    { has: () => true },
  )

  it('认不出的服务商原话附在提示里', () => {
    expect(
      getGenerationErrorMessage(
        t,
        { error: 'upstream said: quota for project xyz is 0' },
        'fallback',
      ),
    ).toBe(
      'generation.unknownWithDetail:upstream said: quota for project xyz is 0',
    )
  })

  it('BytePlus 的 usage limit、火山的未开通都归到具体原因', () => {
    expect(
      getGenerationErrorMessage(
        t,
        {
          error:
            'Your account [3003891542] has reached the set usage limit for the [dreamina-seedance-2-0] model, and the model service has been paused.',
          errorCode: 'SetLimitExceeded',
        },
        'fallback',
      ),
    ).toBe('generation.provider_account_limit_reached')
    expect(
      getGenerationErrorMessage(
        t,
        {
          error:
            'Your account 2124984845 has not activated the model doubao-seedance-2-0-260128. Please activate the model service in the Ark Console.',
          errorCode: 'unknown',
        },
        'fallback',
      ),
    ).toBe('generation.provider_model_not_activated')
  })
})
