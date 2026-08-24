import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('./fal.adapter', () => ({ falAdapter: { adapterType: 'fal' } }))
vi.mock('./fish-audio.adapter', () => ({
  fishAudioAdapter: { adapterType: 'fish_audio' },
}))
vi.mock('./gemini.adapter', () => ({
  geminiAdapter: { adapterType: 'gemini' },
}))
vi.mock('./huggingface.adapter', () => ({
  huggingFaceAdapter: { adapterType: 'huggingface' },
}))
vi.mock('./novelai.adapter', () => ({
  novelAiAdapter: { adapterType: 'novelai' },
}))
vi.mock('./openai.adapter', () => ({
  openAiAdapter: { adapterType: 'openai' },
}))
vi.mock('./replicate.adapter', () => ({
  replicateAdapter: { adapterType: 'replicate' },
}))
vi.mock('./volcengine.adapter', () => ({
  volcengineAdapter: { adapterType: 'volcengine' },
  byteplusAdapter: { adapterType: 'byteplus' },
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getProviderAdapter } from './registry'

describe('getProviderAdapter', () => {
  it('returns the FAL adapter for FAL type', () => {
    const adapter = getProviderAdapter(AI_ADAPTER_TYPES.FAL)

    expect(adapter.adapterType).toBe('fal')
  })

  it('returns the HuggingFace adapter for HUGGINGFACE type', () => {
    const adapter = getProviderAdapter(AI_ADAPTER_TYPES.HUGGINGFACE)

    expect(adapter.adapterType).toBe('huggingface')
  })

  it('returns the Gemini adapter for GEMINI type', () => {
    const adapter = getProviderAdapter(AI_ADAPTER_TYPES.GEMINI)

    expect(adapter.adapterType).toBe('gemini')
  })

  it('returns the BytePlus adapter for the international Ark station', () => {
    const adapter = getProviderAdapter(AI_ADAPTER_TYPES.BYTEPLUS)

    expect(adapter.adapterType).toBe('byteplus')
  })

  it('throws for text-only providers without media adapters', () => {
    expect(() => getProviderAdapter(AI_ADAPTER_TYPES.DEEPSEEK)).toThrow(
      'Provider adapter not available',
    )
  })

  // Runway (gen4.5) was deleted from the registry — the enum member stays
  // (retired ≠ deleted, see CLAUDE.md Engineering Principles), but any code
  // path that still resolves a route to it must fail cleanly rather than
  // silently succeed or crash unhandled. api-route-factory's catch-all turns
  // this Error into a clean 4xx/5xx JSON response (see handleRouteError).
  it('throws for the retired Runway adapter', () => {
    expect(() => getProviderAdapter(AI_ADAPTER_TYPES.RUNWAY)).toThrow(
      'Provider adapter not available',
    )
  })
})
