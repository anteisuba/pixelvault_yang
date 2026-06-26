import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockLlmTextCompletion = vi.fn()
const mockResolveLlmTextRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: (task: () => Promise<unknown>) => task(),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { createNodeScriptDoc } from '@/services/node/node-script-doc.service'
import type { ScriptDoc } from '@/types/script-doc'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_user_1' }

const FAKE_ROUTE = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: {
    label: 'Personal Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  apiKey: 'gemini-key',
}

const VALID_SCRIPT_DOC: ScriptDoc = {
  title: 'Night Garden Signal',
  logline: 'A botanist chases a radio signal through a night garden.',
  styleNote: 'Intimate botanical mystery, warm practical light.',
  roles: [
    {
      id: 'role-1',
      name: 'Mira',
      description: 'botanist in a linen coat with a headlamp',
    },
  ],
  shots: [
    {
      id: 'shot-1',
      summary: 'Mira kneels by a glowing flower bed, listening.',
      camera: 'slow push-in',
      roleIds: ['role-1'],
      dialogue: [
        {
          id: 'line-1',
          speakerRoleId: 'role-1',
          line: 'It is coming from here.',
        },
      ],
    },
  ],
}

const CONVERSATION = [
  { role: 'user' as const, content: 'A botanist finds a signal in a garden.' },
]

describe('createNodeScriptDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmTextRoute.mockResolvedValue(FAKE_ROUTE)
  })

  it('returns a validated ScriptDoc from buffered json_object output', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    const result = await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      locale: 'en',
    })

    expect(result.kind).toBe('scriptDoc')
    if (result.kind !== 'scriptDoc') throw new Error('expected a scriptDoc')
    expect(result.scriptDoc.title).toBe(VALID_SCRIPT_DOC.title)
    expect(result.scriptDoc.shots[0]?.dialogue[0]?.speakerRoleId).toBe('role-1')
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: FAKE_ROUTE.apiKey,
        responseFormat: 'json_object',
      }),
    )
  })

  it('defaults to the OUTLINE stage (story + emotion grammar, no camera mechanics)', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      locale: 'en',
    })

    const callArg = mockLlmTextCompletion.mock.calls[0]?.[0] as {
      systemPrompt: string
    }
    expect(callArg.systemPrompt).toContain('OUTLINE stage')
    expect(callArg.systemPrompt).toContain('EMOTIONAL ARCHITECTURE')
    expect(callArg.systemPrompt).not.toContain('Z-AXIS DEPTH')
  })

  it('uses the SHOT-BREAKDOWN stage prompt (shot grammar, never asks questions)', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      scriptDoc: VALID_SCRIPT_DOC,
      stage: 'shots',
      locale: 'en',
    })

    const callArg = mockLlmTextCompletion.mock.calls[0]?.[0] as {
      systemPrompt: string
      userPrompt: string
    }
    expect(callArg.systemPrompt).toContain('SHOT-BREAKDOWN stage')
    expect(callArg.systemPrompt).toContain('Z-AXIS DEPTH')
    expect(callArg.userPrompt).toContain('Do not return clarifying questions')
  })

  it('defaults to the standard depth directive', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      locale: 'en',
    })

    const callArg = mockLlmTextCompletion.mock.calls[0]?.[0] as {
      userPrompt: string
    }
    expect(callArg.userPrompt).toContain('DEPTH = standard')
  })

  it('keeps a simple skit light (no world-building / emotion fields)', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      depth: 'simple',
      locale: 'en',
    })

    const callArg = mockLlmTextCompletion.mock.calls[0]?.[0] as {
      userPrompt: string
    }
    expect(callArg.userPrompt).toContain('DEPTH = simple skit')
    expect(callArg.userPrompt).toContain('EMPTY')
  })

  it('opens every field on cinematic depth', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      depth: 'cinematic',
      locale: 'en',
    })

    const callArg = mockLlmTextCompletion.mock.calls[0]?.[0] as {
      userPrompt: string
    }
    expect(callArg.userPrompt).toContain('DEPTH = cinematic')
  })

  it('injects a FOCUS directive scoped to a single shot', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    await createNodeScriptDoc('clerk_user_1', {
      messages: [{ role: 'user', content: 'make shot 1 more tense' }],
      scriptDoc: VALID_SCRIPT_DOC,
      focus: { kind: 'shot', id: 'shot-1' },
      locale: 'en',
    })

    const callArg = mockLlmTextCompletion.mock.calls[0]?.[0] as {
      userPrompt: string
    }
    expect(callArg.userPrompt).toContain('FOCUS EDIT')
    expect(callArg.userPrompt).toContain('shot with id "shot-1"')
    expect(callArg.userPrompt).toContain('Do not return clarifying questions')
  })

  it('injects a FOCUS directive scoped to the cast for a roles edit', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    await createNodeScriptDoc('clerk_user_1', {
      messages: [{ role: 'user', content: 'I want three characters' }],
      scriptDoc: VALID_SCRIPT_DOC,
      focus: { kind: 'roles' },
      locale: 'en',
    })

    const callArg = mockLlmTextCompletion.mock.calls[0]?.[0] as {
      userPrompt: string
    }
    expect(callArg.userPrompt).toContain('ONLY to the roles/cast')
  })

  it('returns clarifying questions when the model asks for direction', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      JSON.stringify({
        kind: 'questions',
        questions: [
          {
            id: 'q-1',
            question: 'How long should it be?',
            options: [
              { id: 'o-1', label: '15s' },
              { id: 'o-2', label: '30s' },
            ],
          },
        ],
      }),
    )

    const result = await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      locale: 'en',
    })

    expect(result.kind).toBe('questions')
    if (result.kind !== 'questions') throw new Error('expected questions')
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]?.options).toHaveLength(2)
    expect(result.questions[0]?.allowCustom).toBe(true)
  })

  it('feeds the existing ScriptDoc into the prompt so ids are preserved on update', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      scriptDoc: VALID_SCRIPT_DOC,
      locale: 'en',
    })

    const callArg = mockLlmTextCompletion.mock.calls[0]?.[0] as {
      userPrompt: string
    }
    expect(callArg.userPrompt).toContain('EXISTING SCRIPTDOC')
    expect(callArg.userPrompt).toContain('role-1')
    expect(callArg.userPrompt).toContain('shot-1')
  })

  it('wraps invalid structured output in a provider output error', async () => {
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify({ title: '' }))

    await expect(
      createNodeScriptDoc('clerk_user_1', {
        messages: CONVERSATION,
        locale: 'en',
      }),
    ).rejects.toMatchObject({
      errorCode: 'SCRIPT_DOC_INVALID_OUTPUT',
      httpStatus: 502,
      i18nKey: 'errors.provider.invalidStructuredOutput',
    })
  })

  it('wraps malformed JSON in a provider output error', async () => {
    mockLlmTextCompletion.mockResolvedValue('{"title":"Broken","roles":[')

    await expect(
      createNodeScriptDoc('clerk_user_1', {
        messages: CONVERSATION,
        locale: 'zh',
      }),
    ).rejects.toMatchObject({ errorCode: 'SCRIPT_DOC_INVALID_OUTPUT' })
  })

  it('surfaces provider errors from the LLM adapter', async () => {
    mockLlmTextCompletion.mockRejectedValue(new Error('provider down'))

    await expect(
      createNodeScriptDoc('clerk_user_1', {
        messages: CONVERSATION,
        locale: 'ja',
      }),
    ).rejects.toThrow('provider down')
  })
})
