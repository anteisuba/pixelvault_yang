import { describe, it, expect } from 'vitest'

import { CreateRecipeRequestSchema, ListRecipesQuerySchema } from '@/types'

describe('CreateRecipeRequestSchema', () => {
  const MINIMAL = {
    compiledPrompt: 'a beautiful sunset',
    modelId: 'flux-2-pro',
    provider: 'fal',
  }

  it('accepts minimal valid input', () => {
    expect(CreateRecipeRequestSchema.safeParse(MINIMAL).success).toBe(true)
  })

  it('defaults name to empty string', () => {
    const result = CreateRecipeRequestSchema.safeParse(MINIMAL)
    expect(result.success && result.data.name).toBe('')
  })

  it('defaults outputType to IMAGE', () => {
    const result = CreateRecipeRequestSchema.safeParse(MINIMAL)
    expect(result.success && result.data.outputType).toBe('IMAGE')
  })

  it('rejects when compiledPrompt is missing', () => {
    const { compiledPrompt: _omit, ...rest } = MINIMAL
    expect(CreateRecipeRequestSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects when compiledPrompt is empty', () => {
    expect(
      CreateRecipeRequestSchema.safeParse({ ...MINIMAL, compiledPrompt: '' })
        .success,
    ).toBe(false)
  })

  it('rejects an invalid outputType', () => {
    expect(
      CreateRecipeRequestSchema.safeParse({ ...MINIMAL, outputType: 'TEXT' })
        .success,
    ).toBe(false)
  })

  it('accepts VIDEO outputType', () => {
    expect(
      CreateRecipeRequestSchema.safeParse({ ...MINIMAL, outputType: 'VIDEO' })
        .success,
    ).toBe(true)
  })
})

describe('ListRecipesQuerySchema', () => {
  it('defaults page to 1 and limit to 20', () => {
    const result = ListRecipesQuerySchema.safeParse({})
    expect(result.success && result.data.page).toBe(1)
    expect(result.success && result.data.limit).toBe(20)
  })

  it('coerces string numbers from query params', () => {
    const result = ListRecipesQuerySchema.safeParse({ page: '2', limit: '10' })
    expect(result.success && result.data.page).toBe(2)
    expect(result.success && result.data.limit).toBe(10)
  })

  it('rejects limit above 50', () => {
    expect(ListRecipesQuerySchema.safeParse({ limit: '100' }).success).toBe(
      false,
    )
  })
})
