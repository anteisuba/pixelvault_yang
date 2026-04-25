import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

// Import after vi.mock if needed — these are pure fetch wrappers
import {
  fetchGenerationPlanAPI,
  evaluateGenerationAPI,
} from '@/lib/api-client/generation'

describe('fetchGenerationPlanAPI', () => {
  it('returns plan data on 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              intent: { subject: 'cat' },
              recommendedModels: [
                {
                  modelId: 'flux-2-pro',
                  score: 0.9,
                  reason: 'Best for portraits',
                  matchedBestFor: ['portrait'],
                },
              ],
              promptDraft: 'a cute cat sitting on a wooden floor',
              negativePromptDraft: 'blurry, low quality',
              variationCount: 4,
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await fetchGenerationPlanAPI({
      naturalLanguage: 'a cute cat',
    })

    expect(result.success).toBe(true)
    expect(result.data?.promptDraft).toBe(
      'a cute cat sitting on a wooden floor',
    )
    expect(result.data?.recommendedModels).toHaveLength(1)
  })

  it('returns error on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { status: 401 },
          ),
        ),
    )

    const result = await fetchGenerationPlanAPI({ naturalLanguage: 'cat' })

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('evaluateGenerationAPI', () => {
  it('returns evaluation data on 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              subjectMatch: 0.9,
              styleMatch: 0.8,
              compositionMatch: 0.85,
              artifactScore: 0.95,
              promptAdherence: 0.88,
              overall: 0.88,
              detectedIssues: [],
              suggestedFixes: [],
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await evaluateGenerationAPI('gen_123')

    expect(result.success).toBe(true)
    expect(result.data?.overall).toBe(0.88)
  })

  it('returns error when generation not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: false, error: 'Generation not found' }),
            { status: 404 },
          ),
        ),
    )

    const result = await evaluateGenerationAPI('missing_gen')

    expect(result.success).toBe(false)
  })
})
