import { describe, expect, it } from 'vitest'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { GenerationRecord } from '@/types'

import {
  buildRecentStudioConfigurations,
  buildStudioCardUsageMap,
} from '@/lib/studio-history'

function makeGeneration(
  id: string,
  overrides?: Partial<GenerationRecord>,
): GenerationRecord {
  return {
    id,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    outputType: 'IMAGE',
    status: 'COMPLETED',
    url: `https://example.com/${id}.png`,
    storageKey: `${id}.png`,
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    prompt: 'compiled provider prompt',
    model: 'gemini-3.1-flash-image-preview',
    provider: 'Google',
    requestCount: 2,
    isPublic: false,
    isPromptPublic: false,
    ...overrides,
  }
}

const modelOptions: StudioModelOption[] = [
  {
    optionId: 'key:key_1',
    modelId: 'gemini-3.1-flash-image-preview',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: 'https://example.com' },
    requestCount: 2,
    isBuiltIn: true,
    sourceType: 'saved',
    keyId: 'key_1',
  },
  {
    optionId: 'workspace:gemini-3.1-flash-image-preview',
    modelId: 'gemini-3.1-flash-image-preview',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: 'https://example.com' },
    requestCount: 2,
    isBuiltIn: true,
    sourceType: 'workspace',
  },
]

describe('studio-history helpers', () => {
  it('tracks the most recent usage timestamp for each card type', () => {
    const usage = buildStudioCardUsageMap([
      makeGeneration('gen_old', {
        createdAt: new Date('2026-03-30T10:00:00.000Z'),
        snapshot: {
          freePrompt: 'older prompt',
          compiledPrompt: 'older prompt',
          modelId: 'gemini-3.1-flash-image-preview',
          aspectRatio: '1:1',
          characterCardId: 'char_1',
          backgroundCardId: 'bg_1',
        },
      }),
      makeGeneration('gen_new', {
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
        snapshot: {
          freePrompt: 'newer prompt',
          compiledPrompt: 'newer prompt',
          modelId: 'gemini-3.1-flash-image-preview',
          aspectRatio: '16:9',
          characterCardId: 'char_1',
          styleCardId: 'style_1',
        },
      }),
    ])

    expect(usage.character.char_1).toBe(Date.parse('2026-04-01T12:00:00.000Z'))
    expect(usage.background.bg_1).toBe(Date.parse('2026-03-30T10:00:00.000Z'))
    expect(usage.style.style_1).toBe(Date.parse('2026-04-01T12:00:00.000Z'))
  })

  it('builds unique recent configurations from history snapshots', () => {
    const recentConfigurations = buildRecentStudioConfigurations(
      [
        makeGeneration('gen_card_latest', {
          createdAt: new Date('2026-04-01T12:00:00.000Z'),
          snapshot: {
            freePrompt: 'hero shot',
            compiledPrompt: 'hero shot',
            modelId: 'gemini-3.1-flash-image-preview',
            aspectRatio: '16:9',
            characterCardId: 'char_1',
            backgroundCardId: 'bg_1',
            styleCardId: 'style_1',
          },
        }),
        makeGeneration('gen_card_duplicate', {
          createdAt: new Date('2026-04-01T11:30:00.000Z'),
          snapshot: {
            freePrompt: 'hero shot duplicate',
            compiledPrompt: 'hero shot duplicate',
            modelId: 'gemini-3.1-flash-image-preview',
            aspectRatio: '16:9',
            characterCardId: 'char_1',
            backgroundCardId: 'bg_1',
            styleCardId: 'style_1',
          },
        }),
        makeGeneration('gen_quick', {
          createdAt: new Date('2026-04-01T11:00:00.000Z'),
          snapshot: {
            freePrompt: 'poster concept',
            compiledPrompt: 'poster concept',
            modelId: 'gemini-3.1-flash-image-preview',
            aspectRatio: '1:1',
            apiKeyId: 'key_1',
          },
        }),
      ],
      modelOptions,
    )

    expect(recentConfigurations).toHaveLength(2)
    expect(recentConfigurations[0]).toMatchObject({
      generationId: 'gen_card_latest',
      workflowMode: 'card',
      characterCardId: 'char_1',
      backgroundCardId: 'bg_1',
      styleCardId: 'style_1',
      prompt: 'hero shot',
    })
    expect(recentConfigurations[1]).toMatchObject({
      generationId: 'gen_quick',
      workflowMode: 'quick',
      optionId: 'key:key_1',
      prompt: 'poster concept',
    })
  })
})
