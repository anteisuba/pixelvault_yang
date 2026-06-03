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
})
