import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { AI_MODELS, MODEL_MESSAGE_KEYS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

const LOCALES = ['en', 'ja', 'zh'] as const
const MESSAGES_DIR = join(process.cwd(), 'src', 'messages')

function loadMessages(locale: string): Record<string, unknown> {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf-8')
  return JSON.parse(raw)
}

/**
 * Recursively collect all leaf-level key paths from a nested object.
 * e.g. { a: { b: "x", c: "y" } } => ["a.b", "a.c"]
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

describe('i18n completeness', () => {
  const messagesByLocale = Object.fromEntries(
    LOCALES.map((locale) => [locale, loadMessages(locale)]),
  )

  it('all locales have the same top-level key set', () => {
    const enKeys = collectKeys(messagesByLocale.en).sort()
    for (const locale of ['ja', 'zh'] as const) {
      const localeKeys = collectKeys(messagesByLocale[locale]).sort()
      const missingInLocale = enKeys.filter((k) => !localeKeys.includes(k))
      const extraInLocale = localeKeys.filter((k) => !enKeys.includes(k))

      expect(
        missingInLocale,
        `Keys in en.json missing from ${locale}.json`,
      ).toEqual([])
      expect(
        extraInLocale,
        `Keys in ${locale}.json not found in en.json`,
      ).toEqual([])
    }
  })

  it('every AI_MODELS entry has a Models.<messageKey>.label translation', () => {
    const models = Object.values(AI_MODELS)
    for (const modelId of models) {
      const messageKey = MODEL_MESSAGE_KEYS[modelId]
      expect(
        messageKey,
        `MODEL_MESSAGE_KEYS is missing entry for ${modelId}`,
      ).toBeDefined()

      for (const locale of LOCALES) {
        const modelsSection = messagesByLocale[locale] as Record<
          string,
          Record<string, Record<string, string>>
        >
        const modelEntry = modelsSection.Models?.[messageKey]
        expect(
          modelEntry?.label,
          `Models.${messageKey}.label missing in ${locale}.json`,
        ).toBeDefined()
        expect(
          modelEntry?.description,
          `Models.${messageKey}.description missing in ${locale}.json`,
        ).toBeDefined()
      }
    }
  })

  it('every AI_ADAPTER_TYPES entry has StudioApiKeys.providers.<type> translations', () => {
    const adapterTypes = Object.values(AI_ADAPTER_TYPES)
    for (const adapterType of adapterTypes) {
      for (const locale of LOCALES) {
        const messages = messagesByLocale[locale] as Record<
          string,
          Record<string, Record<string, Record<string, string>>>
        >
        const providerEntry = messages.StudioApiKeys?.providers?.[adapterType]
        expect(
          providerEntry?.label,
          `StudioApiKeys.providers.${adapterType}.label missing in ${locale}.json`,
        ).toBeDefined()
        expect(
          providerEntry?.description,
          `StudioApiKeys.providers.${adapterType}.description missing in ${locale}.json`,
        ).toBeDefined()
      }
    }
  })

  it('every locale has a non-empty Onboarding.steps.prompt.title', () => {
    for (const locale of LOCALES) {
      const onboarding = messagesByLocale[locale].Onboarding
      expect(isRecord(onboarding)).toBe(true)
      if (!isRecord(onboarding)) {
        throw new Error(`Onboarding namespace missing in ${locale}.json`)
      }

      const steps = onboarding.steps
      expect(isRecord(steps)).toBe(true)
      if (!isRecord(steps)) {
        throw new Error(`Onboarding.steps missing in ${locale}.json`)
      }

      const prompt = steps.prompt
      expect(isRecord(prompt)).toBe(true)
      if (!isRecord(prompt)) {
        throw new Error(
          `Onboarding.steps.prompt missing in ${locale}.json`,
        )
      }

      const title = prompt.title
      expect(typeof title).toBe('string')
      if (typeof title !== 'string') {
        throw new Error(
          `Onboarding.steps.prompt.title missing in ${locale}.json`,
        )
      }
      expect(title.trim().length).toBeGreaterThan(0)
    }
  })
})
