import { describe, it, expect } from 'vitest'

import { ReferenceAssetSchema, ImageIntentSchema } from '@/types'

describe('ReferenceAssetSchema', () => {
  it('accepts a minimal valid asset (url + role only)', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'https://example.com/img.png',
      role: 'identity',
    })
    expect(result.success).toBe(true)
  })

  it('accepts all optional fields', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'https://example.com/img.png',
      role: 'pose',
      weight: 0.8,
      notes: 'use for body pose only',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid role', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'https://example.com/img.png',
      role: 'magic',
    })
    expect(result.success).toBe(false)
  })

  it('rejects weight out of range (1.5 > 1.0)', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'https://example.com/img.png',
      role: 'style',
      weight: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-URL string', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'not-a-url',
      role: 'identity',
    })
    expect(result.success).toBe(false)
  })
})

describe('ImageIntentSchema', () => {
  const minimal = {
    subject: 'a young woman',
  }

  it('accepts minimal intent (subject only)', () => {
    const result = ImageIntentSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('accepts fully specified intent', () => {
    const full = {
      subject: 'a young woman',
      subjectDetails: 'long dark hair, wearing a red coat',
      actionOrPose: 'standing in rain',
      scene: 'Tokyo street at night',
      composition: 'close-up portrait',
      camera: '85mm f/1.8 lens',
      lighting: 'neon reflections, wet pavement',
      colorPalette: 'cyan and magenta tones',
      style: 'cinematic photorealism',
      mood: 'melancholic',
      mustInclude: ['red coat', 'umbrella'],
      mustAvoid: ['logo', 'text'],
      referenceAssets: [
        { url: 'https://example.com/ref.jpg', role: 'identity' },
      ],
    }
    const result = ImageIntentSchema.safeParse(full)
    expect(result.success).toBe(true)
  })

  it('rejects empty subject', () => {
    const result = ImageIntentSchema.safeParse({ subject: '' })
    expect(result.success).toBe(false)
  })

  it('rejects subject exceeding max length', () => {
    const result = ImageIntentSchema.safeParse({ subject: 'a'.repeat(501) })
    expect(result.success).toBe(false)
  })

  it('rejects invalid referenceAsset within array', () => {
    const result = ImageIntentSchema.safeParse({
      subject: 'test',
      referenceAssets: [{ url: 'not-a-url', role: 'identity' }],
    })
    expect(result.success).toBe(false)
  })
})
