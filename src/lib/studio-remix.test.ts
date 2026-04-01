import { describe, expect, it } from 'vitest'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { GenerationRecord } from '@/types'

import {
  buildStudioRemixPreset,
  getGenerationPromptPreview,
  parseGenerationSnapshot,
} from '@/lib/studio-remix'

function makeGeneration(
  overrides?: Partial<GenerationRecord>,
): GenerationRecord {
  return {
    id: 'gen_1',
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    outputType: 'IMAGE',
    status: 'COMPLETED',
    url: 'https://example.com/image.png',
    storageKey: 'image.png',
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    prompt: 'final compiled prompt',
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

describe('studio-remix helpers', () => {
  it('parses a valid generation snapshot', () => {
    const snapshot = parseGenerationSnapshot({
      freePrompt: 'a sailor on the pier',
      compiledPrompt: 'masterpiece, a sailor on the pier',
      modelId: 'gemini-3.1-flash-image-preview',
      aspectRatio: '16:9',
    })

    expect(snapshot?.freePrompt).toBe('a sailor on the pier')
    expect(snapshot?.aspectRatio).toBe('16:9')
  })

  it('returns null for an invalid snapshot', () => {
    expect(parseGenerationSnapshot({ foo: 'bar' })).toBeNull()
  })

  it('prefers snapshot prompt, aspect ratio, and saved route when remixing', () => {
    const preset = buildStudioRemixPreset(
      makeGeneration({
        prompt: 'compiled provider prompt',
        snapshot: {
          freePrompt: 'cinematic portrait',
          compiledPrompt: 'cinematic portrait, bokeh lighting',
          modelId: 'gemini-3.1-flash-image-preview',
          aspectRatio: '16:9',
          apiKeyId: 'key_1',
        },
      }),
      modelOptions,
    )

    expect(preset.prompt).toBe('cinematic portrait')
    expect(preset.aspectRatio).toBe('16:9')
    expect(preset.optionId).toBe('key:key_1')
  })

  it('falls back to generation fields and nearest supported aspect ratio', () => {
    const preset = buildStudioRemixPreset(
      makeGeneration({
        width: 720,
        height: 1280,
        model: 'gemini-3.1-flash-image-preview',
        snapshot: null,
      }),
      modelOptions,
    )

    expect(preset.prompt).toBe('final compiled prompt')
    expect(preset.aspectRatio).toBe('9:16')
    expect(preset.optionId).toBe('key:key_1')
  })

  it('uses the preview prompt derived from snapshot freePrompt when available', () => {
    const prompt = getGenerationPromptPreview(
      makeGeneration({
        prompt: 'compiled provider prompt',
        snapshot: {
          freePrompt: 'original short prompt',
          compiledPrompt: 'compiled provider prompt',
          modelId: 'gemini-3.1-flash-image-preview',
          aspectRatio: '1:1',
        },
      }),
    )

    expect(prompt).toBe('original short prompt')
  })
})
