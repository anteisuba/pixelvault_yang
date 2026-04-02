import { describe, expect, it } from 'vitest'

import type { GenerationRecord } from '@/types'

import { buildStudioCardUsageMap } from '@/lib/studio-history'

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
})
