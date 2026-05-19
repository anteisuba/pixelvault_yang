import { describe, expect, it } from 'vitest'

import { GenerateAudioRequestSchema } from '@/types'

const BASE = {
  prompt: 'Hello world',
  modelId: 'fish-audio-s2-pro',
}

describe('GenerateAudioRequestSchema reference-pair refinement', () => {
  it('accepts a request with no reference fields', () => {
    const result = GenerateAudioRequestSchema.safeParse(BASE)
    expect(result.success).toBe(true)
  })

  it('accepts a request with both referenceAudioUrl and referenceText', () => {
    const result = GenerateAudioRequestSchema.safeParse({
      ...BASE,
      referenceAudioUrl: 'https://cdn.example.com/r.mp3',
      referenceText: 'Hello world',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a request with referenceAudioUrl but no transcript', () => {
    const result = GenerateAudioRequestSchema.safeParse({
      ...BASE,
      referenceAudioUrl: 'https://cdn.example.com/r.mp3',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => issue.message)
        .join(' ')
      expect(message).toContain('referenceAudioUrl and referenceText')
    }
  })

  it('rejects a request with referenceText but no audio URL', () => {
    const result = GenerateAudioRequestSchema.safeParse({
      ...BASE,
      referenceText: 'Hello world',
    })
    expect(result.success).toBe(false)
  })

  it('rejects when transcript is whitespace-only after trim', () => {
    const result = GenerateAudioRequestSchema.safeParse({
      ...BASE,
      referenceAudioUrl: 'https://cdn.example.com/r.mp3',
      referenceText: '   ',
    })
    expect(result.success).toBe(false)
  })
})
