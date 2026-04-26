import { describe, it, expect } from 'vitest'

import {
  GenerationEvaluationSchema,
  GenerateEvaluationRequestSchema,
} from '@/types'

const VALID_EVAL = {
  subjectMatch: 0.9,
  styleMatch: 0.8,
  compositionMatch: 0.75,
  artifactScore: 1.0,
  promptAdherence: 0.85,
  overall: 0.86,
  detectedIssues: [],
  suggestedFixes: [],
}

describe('GenerationEvaluationSchema', () => {
  it('accepts a valid evaluation with all required fields', () => {
    expect(GenerationEvaluationSchema.safeParse(VALID_EVAL).success).toBe(true)
  })

  it('accepts optional referenceConsistency', () => {
    const result = GenerationEvaluationSchema.safeParse({
      ...VALID_EVAL,
      referenceConsistency: 0.75,
      detectedIssues: ['Subject hair color wrong'],
      suggestedFixes: ['Add "blonde hair" to prompt'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a score above 1.0', () => {
    expect(
      GenerationEvaluationSchema.safeParse({ ...VALID_EVAL, subjectMatch: 1.5 })
        .success,
    ).toBe(false)
  })

  it('rejects a score below 0', () => {
    expect(
      GenerationEvaluationSchema.safeParse({ ...VALID_EVAL, overall: -0.1 })
        .success,
    ).toBe(false)
  })

  it('rejects when a required field is missing', () => {
    const withoutOverall: Partial<typeof VALID_EVAL> = { ...VALID_EVAL }
    delete withoutOverall.overall

    expect(GenerationEvaluationSchema.safeParse(withoutOverall).success).toBe(
      false,
    )
  })
})

describe('GenerateEvaluationRequestSchema', () => {
  it('accepts a valid generationId', () => {
    expect(
      GenerateEvaluationRequestSchema.safeParse({ generationId: 'gen_abc123' })
        .success,
    ).toBe(true)
  })

  it('rejects an empty generationId', () => {
    expect(
      GenerateEvaluationRequestSchema.safeParse({ generationId: '' }).success,
    ).toBe(false)
  })

  it('rejects when generationId is missing', () => {
    expect(GenerateEvaluationRequestSchema.safeParse({}).success).toBe(false)
  })
})
