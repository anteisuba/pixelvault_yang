import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
const mockResolveRoute = vi.fn()
const mockLlmCompletion = vi.fn()
const mockFindFirstGeneration = vi.fn()
const mockUpdateGeneration = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/services/llm-text.service', () => ({
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveRoute(...args),
  llmTextCompletion: (...args: unknown[]) => mockLlmCompletion(...args),
}))

vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findFirst: (...args: unknown[]) => mockFindFirstGeneration(...args),
      update: (...args: unknown[]) => mockUpdateGeneration(...args),
    },
  },
}))

import { evaluateGeneration } from '@/services/generation-evaluator.service'

const FAKE_USER = { id: 'db_user_123', clerkId: 'clerk_test_user' }

const FAKE_ROUTE = {
  adapterType: 'gemini',
  providerConfig: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  apiKey: 'test-api-key',
}

const FAKE_GENERATION = {
  id: 'gen_abc',
  url: 'data:image/png;base64,iVBORw0KGgo=',
  prompt: 'a woman in red coat standing in rain',
  evaluation: null,
}

const VALID_LLM_RESPONSE = JSON.stringify({
  subjectMatch: 0.9,
  styleMatch: 0.8,
  compositionMatch: 0.75,
  artifactScore: 1.0,
  promptAdherence: 0.85,
  overall: 0.86,
  detectedIssues: [],
  suggestedFixes: [],
})

describe('evaluateGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveRoute.mockResolvedValue(FAKE_ROUTE)
    mockFindFirstGeneration.mockResolvedValue(FAKE_GENERATION)
    mockUpdateGeneration.mockResolvedValue({ ...FAKE_GENERATION })
    mockLlmCompletion.mockResolvedValue(VALID_LLM_RESPONSE)
  })

  it('returns a valid evaluation on happy path', async () => {
    const result = await evaluateGeneration('clerk_test_user', 'gen_abc')

    expect(result.overall).toBeGreaterThanOrEqual(0)
    expect(result.overall).toBeLessThanOrEqual(1)
    expect(result.detectedIssues).toBeInstanceOf(Array)
    expect(result.suggestedFixes).toBeInstanceOf(Array)
  })

  it('writes the evaluation to the database', async () => {
    await evaluateGeneration('clerk_test_user', 'gen_abc')

    expect(mockUpdateGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'gen_abc' },
        data: expect.objectContaining({ evaluation: expect.any(Object) }),
      }),
    )
  })

  it('returns existing evaluation without calling LLM (idempotent)', async () => {
    const existingEval = {
      subjectMatch: 0.7,
      styleMatch: 0.6,
      compositionMatch: 0.5,
      artifactScore: 0.9,
      promptAdherence: 0.65,
      overall: 0.67,
      detectedIssues: ['subject too dark'],
      suggestedFixes: ['increase brightness'],
    }
    mockFindFirstGeneration.mockResolvedValue({
      ...FAKE_GENERATION,
      evaluation: existingEval,
    })

    const result = await evaluateGeneration('clerk_test_user', 'gen_abc')

    expect(mockLlmCompletion).not.toHaveBeenCalled()
    expect(result.overall).toBe(0.67)
  })

  it('throws when generation is not found', async () => {
    mockFindFirstGeneration.mockResolvedValue(null)

    await expect(
      evaluateGeneration('clerk_test_user', 'gen_missing'),
    ).rejects.toThrow('Generation not found')
  })

  it('returns fallback evaluation when LLM output is not valid JSON', async () => {
    mockLlmCompletion.mockResolvedValue('Sorry, I cannot evaluate this image.')

    const result = await evaluateGeneration('clerk_test_user', 'gen_abc')

    expect(result.overall).toBe(0.5)
    expect(mockUpdateGeneration).not.toHaveBeenCalled()
  })
})
