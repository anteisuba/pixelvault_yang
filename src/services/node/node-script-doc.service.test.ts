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
import {
  SCRIPT_DOC_LIMITS,
  SCRIPT_DOC_PROMPT_BUDGET,
} from '@/constants/script-doc'
import {
  MAX_PROMPT_LENGTH,
  validatePrompt,
} from '@/services/kernel/prompt-guard'
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

// ─── Prompt budget (P0-1: the 4000-character cliff) ──────────────────────
//
// The envelope `buildUserPrompt` assembles is platform-authored, not typed by
// the user, so it was being measured against the wrong ruler:
// `MAX_PROMPT_LENGTH` (4000). Any request carrying an existing ScriptDoc blew
// past it once the story got even slightly rich — ~4018 characters — and the
// rejection was swallowed into a generic 500.

function padded(prefix: string, length: number): string {
  return `${prefix} ${'detail '.repeat(length).slice(0, Math.max(0, length))}`.slice(
    0,
    length,
  )
}

/**
 * Grow a doc to (very close to) `targetChars` of JSON, staying inside
 * `maxShots` so the fixture remains a doc the schema would accept.
 *
 * Sizing has to be tight, not approximate: the trimmable fields are worth at
 * most ~1040 characters together, so a fixture that overshoots by one whole
 * shot lands past the point where withholding them can rescue the request.
 * Whole shots get it close; the trailing shot's optional text closes the gap.
 */
function makeDocOfSize(
  targetChars: number,
  extras: Partial<ScriptDoc> = {},
): ScriptDoc {
  const doc: ScriptDoc = {
    title: 'Long Night Signal',
    logline: padded('A botanist chases a signal', 300),
    roles: [
      {
        id: 'role-1',
        name: 'Mira',
        description: padded('botanist in a linen coat', 600),
      },
    ],
    shots: [],
    ...extras,
  }

  const pushShot = () => {
    const index = doc.shots.length + 1
    if (index > SCRIPT_DOC_LIMITS.maxShots) {
      throw new Error(
        `cannot reach ${targetChars} chars within ${SCRIPT_DOC_LIMITS.maxShots} shots`,
      )
    }
    doc.shots.push({
      id: `shot-${index}`,
      summary: padded(`beat ${index}`, 100),
      roleIds: ['role-1'],
      dialogue: [
        {
          id: `line-${index}a`,
          speakerRoleId: 'role-1',
          line: padded('it is coming from here', 600),
        },
        {
          id: `line-${index}b`,
          speakerRoleId: 'role-1',
          line: padded('closer than last night', 600),
        },
      ],
    })
  }

  pushShot()
  while (JSON.stringify(doc).length + 2_000 < targetChars) {
    pushShot()
  }

  const tail = doc.shots[doc.shots.length - 1]
  const gap = () => targetChars - JSON.stringify(doc).length
  if (tail) {
    if (gap() > 0) tail.camera = 'x'.repeat(Math.min(gap(), 700))
    if (gap() > 0) tail.sceneLabel = 'x'.repeat(Math.min(gap(), 700))
    if (gap() > 0) {
      tail.summary += 'x'.repeat(Math.min(gap(), 700 - tail.summary.length))
    }
  }

  return doc
}

const BACKGROUND_MARKER = 'BACKGROUND_NEEDLE_ONLY_HERE'
const LONG_TURN = padded('the creator explains the world at length', 3_500)

describe('createNodeScriptDoc prompt budget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmTextRoute.mockResolvedValue(FAKE_ROUTE)
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))
  })

  function lastCall(): { userPrompt: string; promptGuardMaxLength?: number } {
    return mockLlmTextCompletion.mock.calls[0]?.[0] as {
      userPrompt: string
      promptGuardMaxLength?: number
    }
  }

  it('measures the envelope against its own budget, not the raw-input ceiling', async () => {
    await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      scriptDoc: VALID_SCRIPT_DOC,
      locale: 'en',
    })

    expect(lastCall().promptGuardMaxLength).toBe(
      SCRIPT_DOC_PROMPT_BUDGET.totalChars,
    )
  })

  // The exact shape that used to 500: a real doc plus the conversation that
  // produced it. It only ever missed by ~18 characters, which is why it read
  // as model flakiness rather than a hard limit.
  it('accepts a doc + conversation that overflows the raw-input ceiling', async () => {
    const doc = makeDocOfSize(3_000)

    const result = await createNodeScriptDoc('clerk_user_1', {
      messages: [
        { role: 'user', content: padded('here is the story so far', 700) },
        { role: 'assistant', content: padded('understood, drafting', 700) },
        { role: 'user', content: 'now break it into shots' },
      ],
      scriptDoc: doc,
      stage: 'shots',
      locale: 'zh',
    })

    const { userPrompt } = lastCall()
    expect(userPrompt.length).toBeGreaterThan(MAX_PROMPT_LENGTH)
    expect(
      validatePrompt(userPrompt, SCRIPT_DOC_PROMPT_BUDGET.totalChars),
    ).toMatchObject({ valid: true })
    expect(result.kind).toBe('scriptDoc')
  })

  it('never emits an envelope larger than the budget', async () => {
    await createNodeScriptDoc('clerk_user_1', {
      messages: Array.from({ length: 8 }, () => ({
        role: 'user' as const,
        content: LONG_TURN,
      })),
      scriptDoc: makeDocOfSize(12_000),
      locale: 'en',
    })

    expect(lastCall().userPrompt.length).toBeLessThanOrEqual(
      SCRIPT_DOC_PROMPT_BUDGET.totalChars,
    )
  })

  it('drops the oldest turns first and reports what was dropped', async () => {
    const result = await createNodeScriptDoc('clerk_user_1', {
      messages: [
        ...Array.from({ length: 7 }, (_, index) => ({
          role: 'user' as const,
          content: `${padded('old turn', 3_400)} #${index}`,
        })),
        { role: 'user' as const, content: 'KEEP_THIS_LATEST_INSTRUCTION' },
      ],
      scriptDoc: makeDocOfSize(6_000),
      locale: 'en',
    })

    const { userPrompt } = lastCall()
    expect(userPrompt).toContain('KEEP_THIS_LATEST_INSTRUCTION')
    expect(result.trim?.droppedMessages).toBeGreaterThan(0)
    expect(result.trim?.keptMessages).toBeGreaterThan(0)
  })

  it('leaves a normal request untrimmed and untagged', async () => {
    const result = await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      scriptDoc: VALID_SCRIPT_DOC,
      locale: 'en',
    })

    expect(result.trim).toBeUndefined()
  })

  // The dangerous half of trimming: a withheld field the model never saw must
  // come back intact, or "the script got long" would quietly delete the
  // creator's world-building.
  it('withholds optional doc fields under pressure and restores their values', async () => {
    // Sized just past the point where the doc crowds out the conversation
    // (measured scaffold ≈ 2045 chars, so ≈ 21_955 are left for content), yet
    // close enough that dropping `background` alone brings it back under.
    const doc = makeDocOfSize(22_100, {
      background: padded(BACKGROUND_MARKER, 600),
      styleNote: padded('rain-soaked neon', 400),
      targetDuration: '12-15s',
    })

    // The model answers without the withheld fields — it never saw them.
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify(VALID_SCRIPT_DOC))

    const result = await createNodeScriptDoc('clerk_user_1', {
      messages: CONVERSATION,
      scriptDoc: doc,
      locale: 'en',
    })

    const { userPrompt } = lastCall()
    expect(userPrompt).not.toContain(BACKGROUND_MARKER)
    if (result.kind !== 'scriptDoc') throw new Error('expected a scriptDoc')

    // `background` alone was enough to fit, so it is the only field restored…
    expect(result.trim?.heldBackFields).toBe(1)
    expect(result.scriptDoc.background).toBe(doc.background)
    // …and a field the model DID see keeps the model's value. Restoring is
    // scoped to what was withheld, not a blanket overwrite of the answer.
    expect(result.scriptDoc.styleNote).toBe(VALID_SCRIPT_DOC.styleNote)
  })

  it('fails fast with an actionable error when even a trimmed doc will not fit', async () => {
    await expect(
      createNodeScriptDoc('clerk_user_1', {
        messages: CONVERSATION,
        scriptDoc: makeDocOfSize(30_000),
        locale: 'en',
      }),
    ).rejects.toMatchObject({
      errorCode: 'SCRIPT_DOC_PROMPT_TOO_LONG',
      httpStatus: 400,
      i18nKey: 'errors.scriptDoc.promptTooLong',
    })

    // Fail before spending a call — the old path burned one and returned 500.
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
  })
})
