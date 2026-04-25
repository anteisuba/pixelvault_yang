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
})
