import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { z } from 'zod'

import {
  validateLlmPromptOutput,
  validateLlmStructuredOutput,
  validateRecipeFusion,
} from '@/lib/llm-output-validator'

describe('validateLlmPromptOutput', () => {
  it('returns usable=true for a normal prompt', () => {
    const result = validateLlmPromptOutput(
      'a beautiful sunset over mountains with warm golden light',
      'sunset mountains',
    )
    expect(result.usable).toBe(true)
    expect(result.output).toContain('sunset')
    expect(result.warnings).toHaveLength(0)
  })

  it('returns usable=false and reason for empty output', () => {
    const result = validateLlmPromptOutput('', 'original')
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/empty/i)
  })

  it('returns usable=false for system prompt leakage', () => {
    const result = validateLlmPromptOutput(
      'You are an expert prompt engineer. Return only the enhanced prompt.',
      'original',
    )
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/system prompt/i)
  })

  it('truncates long output and adds warning', () => {
    const longOutput = 'a detailed scene '.repeat(500)
    const result = validateLlmPromptOutput(longOutput, 'a')
    expect(result.warnings.some((w) => w.includes('truncated'))).toBe(true)
    expect(result.usable).toBe(true)
  })

  it('cleans markdown fences from prompt output', () => {
    const result = validateLlmPromptOutput(
      '```prompt\n\"cinematic portrait, rim light\"\n```',
      'portrait',
    )

    expect(result.usable).toBe(true)
    expect(result.output).not.toContain('```')
    expect(result.output).toContain('cinematic portrait, rim light')
  })

  it('cleans surrounding quotes from plain prompt output', () => {
    const result = validateLlmPromptOutput(
      '"cinematic portrait, rim light"',
      'portrait',
    )

    expect(result.usable).toBe(true)
    expect(result.output).toBe('cinematic portrait, rim light')
  })

  it('strips extractable meta-commentary and keeps the prompt', () => {
    const result = validateLlmPromptOutput(
      "Here's the enhanced prompt:\n\ncinematic castle at sunrise, detailed stonework",
      'castle',
    )

    expect(result.usable).toBe(true)
    expect(result.output).toBe(
      'cinematic castle at sunrise, detailed stonework',
    )
    expect(result.warnings).toContain(
      'Stripped meta-commentary from LLM output',
    )
  })

  it('rejects meta-commentary when no prompt can be extracted', () => {
    const result = validateLlmPromptOutput('Sure, I can help with that.', 'cat')

    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/meta-commentary/i)
  })

  it('adds warning when enhanced is significantly shorter than original', () => {
    const result = validateLlmPromptOutput(
      'cat',
      'a very detailed description of a maine coon cat sitting by a fireplace in winter',
    )
    expect(result.warnings.some((w) => w.includes('shorter'))).toBe(true)
  })
})

describe('validateRecipeFusion', () => {
  it('returns usable=true when character keywords are retained', () => {
    const result = validateRecipeFusion(
      'blue-haired anime girl wearing a school uniform stands in a garden, watercolor style',
      {
        characterPrompt: 'blue hair anime girl school uniform',
        stylePrompt: 'watercolor',
      },
    )
    expect(result.usable).toBe(true)
    expect(result.output).toContain('blue')
  })

  it('returns usable=false for empty fusion output', () => {
    const result = validateRecipeFusion('', {
      characterPrompt: 'blue hair girl',
    })
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/empty/i)
  })

  it('returns usable=false when character identity is lost', () => {
    const result = validateRecipeFusion(
      'a completely unrelated mountain landscape at dusk',
      {
        characterPrompt:
          'blonde twin-tailed magical girl pink ribbon star wand sparkles',
      },
    )
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/character identity/i)
  })

  it('warns but accepts low character keyword retention above the hard floor', () => {
    const result = validateRecipeFusion('blue hero in a neon alley', {
      characterPrompt: 'blue hero silver armor lunar crest',
    })

    expect(result.usable).toBe(true)
    expect(result.warnings).toEqual(['Low character keyword retention: 33%'])
  })

  it('truncates overly long fusion output and adds warning', () => {
    const result = validateRecipeFusion('painted scene '.repeat(1000), {
      stylePrompt: 'oil painting',
    })

    expect(result.usable).toBe(true)
    expect(result.warnings).toContain('Fused prompt truncated to max length')
  })

  it('returns usable=false for system prompt leakage in fusion', () => {
    const result = validateRecipeFusion(
      "You are an expert. I'm an AI language model.",
      { stylePrompt: 'short prompt' },
    )
    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/system prompt/i)
  })
})

describe('validateLlmStructuredOutput', () => {
  const Schema = z.object({
    subject: z.string().min(1),
  })

  it('returns typed data for schema-valid structured output', () => {
    const result = validateLlmStructuredOutput({ subject: 'cat' }, Schema)

    expect(result.usable).toBe(true)
    expect(result.data?.subject).toBe('cat')
  })

  it('returns unusable result for schema-invalid structured output', () => {
    const result = validateLlmStructuredOutput({ subject: '' }, Schema)

    expect(result.usable).toBe(false)
    expect(result.reason).toMatch(/subject/)
  })
})
