import { describe, it, expect } from 'vitest'

import {
  compilePrompt,
  compileNegativePrompt,
} from '@/services/prompt-compiler.service'
import type { ImageIntent } from '@/types'

const MINIMAL_INTENT: ImageIntent = { subject: 'a cat' }

const FULL_INTENT: ImageIntent = {
  subject: 'a young woman',
  subjectDetails: 'long dark hair, red coat',
  actionOrPose: 'standing in rain',
  scene: 'Tokyo street at night',
  composition: 'close-up portrait',
  camera: '85mm f/1.8 lens',
  lighting: 'neon reflections',
  colorPalette: 'cyan and magenta',
  style: 'photorealism',
  mood: 'melancholic',
  mustInclude: ['umbrella'],
  mustAvoid: ['logo', 'text'],
}

// ── Tag-based strategy (NovelAI V4) ─────────────────────────────

describe('compilePrompt — tag-based (nai-diffusion-4-full)', () => {
  const MODEL = 'nai-diffusion-4-full'

  it('starts with quality tags', () => {
    const result = compilePrompt(MINIMAL_INTENT, MODEL)
    expect(result).toMatch(/^masterpiece/)
  })

  it('converts subject to underscore_format tag', () => {
    const result = compilePrompt(MINIMAL_INTENT, MODEL)
    expect(result).toContain('a_cat')
  })

  it('converts multi-word fields to underscore tags', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('a_young_woman')
    expect(result).toContain('standing_in_rain')
  })

  it('includes mustInclude items', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('umbrella')
  })

  it('does NOT include mustAvoid items in the prompt', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).not.toContain('logo')
  })
})

// ── Photorealistic strategy (FLUX Pro) ───────────────────────────

describe('compilePrompt — photorealistic (flux-2-pro)', () => {
  const MODEL = 'flux-2-pro'

  it('includes subject in natural language (no underscore conversion)', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('a young woman')
  })

  it('includes camera and lighting details verbatim', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('85mm f/1.8 lens')
    expect(result).toContain('neon reflections')
  })

  it('appends "color grading" to colorPalette', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('cyan and magenta color grading')
  })

  it('handles minimal intent without crashing', () => {
    const result = compilePrompt(MINIMAL_INTENT, MODEL)
    expect(result).toContain('a cat')
    expect(typeof result).toBe('string')
  })
})

// ── Natural-language fallback (Gemini / unknown model) ──────────

describe('compilePrompt — natural language (gemini-3.1-flash-image-preview)', () => {
  it('includes subject in prose', () => {
    const result = compilePrompt(FULL_INTENT, 'gemini-3.1-flash-image-preview')
    expect(result).toContain('a young woman')
  })

  it('includes style field', () => {
    const result = compilePrompt(FULL_INTENT, 'gemini-3.1-flash-image-preview')
    expect(result).toContain('photorealism')
  })

  it('falls back gracefully for an unknown modelId', () => {
    const result = compilePrompt(MINIMAL_INTENT, 'totally-unknown-model-xyz')
    expect(result).toContain('a cat')
    expect(typeof result).toBe('string')
  })
})

// ── compileNegativePrompt ────────────────────────────────────────

describe('compileNegativePrompt', () => {
  it('returns undefined when mustAvoid is absent and model is not tag-based', () => {
    const result = compileNegativePrompt(
      MINIMAL_INTENT,
      'gemini-3.1-flash-image-preview',
    )
    expect(result).toBeUndefined()
  })

  it('returns quality downgrade tags for tag-based model even with no mustAvoid', () => {
    const result = compileNegativePrompt(MINIMAL_INTENT, 'nai-diffusion-4-full')
    expect(result).toBeDefined()
    expect(result).toContain('worst quality')
  })

  it('includes mustAvoid items for natural-language model', () => {
    const result = compileNegativePrompt(
      FULL_INTENT,
      'gemini-3.1-flash-image-preview',
    )
    expect(result).toContain('logo')
    expect(result).toContain('text')
  })

  it('includes both quality tags and mustAvoid items for tag-based model', () => {
    const result = compileNegativePrompt(FULL_INTENT, 'nai-diffusion-4-full')
    expect(result).toContain('worst quality')
    expect(result).toContain('logo')
  })
})
