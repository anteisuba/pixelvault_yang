import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/crypto', () => ({
  decryptApiKey: vi.fn().mockReturnValue('decrypted-key'),
}))

vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn().mockReturnValue(null),
}))

const mockFindFirst = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    userApiKey: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
    },
  },
}))

import {
  isLlmTextContextLimitError,
  resolveLlmTextRoute,
  llmTextCompletion,
  llmTextStream,
  LLM_TEXT_ADAPTERS,
  LLM_TEXT_STREAMS,
} from '@/services/llm-text.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  LLM_TEXT_DEFAULT_MAX_TOKENS,
  LLM_TEXT_MODEL_IDS,
  LLM_TEXT_TIMEOUTS_MS,
} from '@/constants/config'
import {
  VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS,
  VIDEO_ANALYSIS_UNREACHABLE_ERROR,
} from '@/constants/video-analysis'
import { MAX_COMPILED_PROMPT_LENGTH } from '@/services/kernel/prompt-guard'

afterEach(() => {
  vi.unstubAllGlobals()
})

const GEMINI_KEY = {
  id: 'key_1',
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  encryptedKey: 'enc',
  isActive: true,
}

function readFetchJson(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex = 0,
): Record<string, unknown> {
  const requestInit = fetchMock.mock.calls[callIndex]?.[1] as
    | RequestInit
    | undefined
  const body = requestInit?.body
  if (typeof body !== 'string') {
    throw new Error('Expected provider request body to be a JSON string')
  }
  return JSON.parse(body) as Record<string, unknown>
}

describe('resolveLlmTextRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns gemini route when user has an active gemini key', async () => {
    mockFindFirst.mockResolvedValue(GEMINI_KEY)

    const route = await resolveLlmTextRoute('db_user_1')

    expect(route.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(route.apiKey).toBe('decrypted-key')
  })

  it('throws when no user keys and no platform key available', async () => {
    mockFindFirst.mockResolvedValue(null)

    await expect(resolveLlmTextRoute('db_user_1')).rejects.toThrow(
      'No API key available',
    )
  })
})

describe('isLlmTextContextLimitError', () => {
  it('recognizes AI SDK errors that carry provider detail in responseBody', () => {
    const error = Object.assign(new Error('Bad Request'), {
      responseBody: JSON.stringify({
        error: { message: 'Maximum context length exceeded.' },
      }),
    })

    expect(isLlmTextContextLimitError(error)).toBe(true)
  })
})

describe('llmTextCompletion - Gemini', () => {
  it('omits the app output cap when the provider manages the budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'provider managed' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      providerManagedOutput: true,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    const payload = readFetchJson(fetchMock) as {
      generationConfig?: { maxOutputTokens?: number }
    }
    expect(payload.generationConfig?.maxOutputTokens).toBeUndefined()
  })

  it('accepts a composed prompt above the default guard when the caller supplies a bounded override', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'long context ok' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'a'.repeat(5000),
      promptGuardMaxLength: MAX_COMPILED_PROMPT_LENGTH,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    expect(result).toBe('long context ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns text content from a successful Gemini API response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'hello world' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'Say hello.',
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    expect(result).toBe('hello world')
  })

  it('fetches http image URLs before sending them to Gemini inlineData', async () => {
    const imageBytes = new Uint8Array([1, 2, 3])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(imageBytes, {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': String(imageBytes.byteLength),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'image analyzed' }] } }],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'Analyze this image.',
      imageData: 'http://example.com/ref.png',
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    const requestInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined
    const body = requestInit?.body
    if (typeof body !== 'string') {
      throw new Error('Expected Gemini request body to be a JSON string')
    }
    const payload = JSON.parse(body) as {
      contents: Array<{
        parts: Array<{
          inlineData?: { mimeType: string; data: string }
          text?: string
        }>
      }>
    }

    expect(result).toBe('image analyzed')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://example.com/ref.png',
      expect.objectContaining({ redirect: 'manual' }),
    )
    expect(payload.contents[0]?.parts[0]?.inlineData).toEqual({
      mimeType: 'image/png',
      data: Buffer.from(imageBytes).toString('base64'),
    })
    expect(payload.contents[0]?.parts[1]).toEqual({
      text: 'Analyze this image.',
    })
  })

  it('sends a stable video URL to Gemini as native inline video input', async () => {
    const videoBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(videoBytes, {
          status: 200,
          headers: {
            'content-type': 'video/mp4',
            'content-length': String(videoBytes.byteLength),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'video analyzed' }] } }],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'Analyze this video.',
      videoData: 'https://cdn.example.com/reference.mp4',
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    const payload = readFetchJson(fetchMock, 1) as {
      contents: Array<{
        parts: Array<{
          inlineData?: { mimeType: string; data: string }
          text?: string
        }>
      }>
    }
    expect(result).toBe('video analyzed')
    expect(payload.contents[0]?.parts[0]?.inlineData).toEqual({
      mimeType: 'video/mp4',
      data: Buffer.from(videoBytes).toString('base64'),
    })
    expect(payload.contents[0]?.parts[1]).toEqual({
      text: 'Analyze this video.',
    })
  })

  // ─── 视频链接路由（AI 导演内核切片 2 §4.2 / §4.3.2） ──────────────

  it('sends a YouTube link straight through as fileData.fileUri without fetching it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'shots described' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'What camera moves does this use?',
      videoData: 'https://youtu.be/dQw4w9WgXcQ?si=tracking',
      providerManagedOutput: true,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    expect(result).toBe('shots described')
    // ⚠ 这条断言就是那个实现陷阱本身：YouTube 页面是 text/html，一旦先 fetch
    //   再验 content-type 就会被 `video/` 校验拒掉。所以**只能有一次 fetch**，
    //   就是打给 Gemini 的那一次。
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      'generativelanguage.googleapis.com',
    )

    const payload = readFetchJson(fetchMock) as {
      contents: Array<{
        parts: Array<{
          fileData?: { fileUri?: string; mimeType?: string }
          videoMetadata?: Record<string, unknown>
          text?: string
        }>
      }>
    }
    expect(payload.contents[0]?.parts[0]).toEqual({
      fileData: { fileUri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    })
    expect(payload.contents[0]?.parts[1]).toEqual({
      text: 'What camera moves does this use?',
    })
  })

  it('passes the videoMetadata cost levers through when a caller asks for them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'first minute only' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'Summarize the opening.',
      videoData: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoAnalysis: { fps: 0.2, startOffset: 0, endOffset: 60 },
      providerManagedOutput: true,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    const payload = readFetchJson(fetchMock) as {
      contents: Array<{ parts: Array<{ videoMetadata?: unknown }> }>
    }
    expect(payload.contents[0]?.parts[0]?.videoMetadata).toEqual({
      fps: 0.2,
      startOffset: '0s',
      endOffset: '60s',
    })
  })

  it('omits videoMetadata by default — v1 is whole video at the default frame rate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'Describe it.',
      videoData: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      providerManagedOutput: true,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    const payload = readFetchJson(fetchMock) as {
      contents: Array<{ parts: Array<{ videoMetadata?: unknown }> }>
    }
    expect(payload.contents[0]?.parts[0]?.videoMetadata).toBeUndefined()
  })

  it('raises an explicit output budget to the video floor — thinking tokens eat it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'full answer' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'Describe it.',
      videoData: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      maxTokens: 800,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    const payload = readFetchJson(fetchMock) as {
      generationConfig?: { maxOutputTokens?: number }
    }
    // 800 实测得到 thoughtsTokenCount=765 / 正文 31 字 / MAX_TOKENS。
    expect(payload.generationConfig?.maxOutputTokens).toBe(
      VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS,
    )
  })

  it('leaves a text-only turn budget alone — the floor is video-only and never lowers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'Write a tagline.',
      maxTokens: 800,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    const payload = readFetchJson(fetchMock) as {
      generationConfig?: { maxOutputTokens?: number }
    }
    expect(payload.generationConfig?.maxOutputTokens).toBe(800)
  })

  it('translates a 403 on a linked video into "video unreachable", not "bad API key"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 403,
              message:
                'You do not have permission to access the video or it may not exist.',
              status: 'PERMISSION_DENIED',
            },
          }),
          { status: 403 },
        ),
      ),
    )

    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'Describe it.',
        videoData: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        providerManagedOutput: true,
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        providerConfig: {
          label: 'Gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
        },
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({
      errorCode: VIDEO_ANALYSIS_UNREACHABLE_ERROR.code,
      httpStatus: VIDEO_ANALYSIS_UNREACHABLE_ERROR.httpStatus,
      i18nKey: VIDEO_ANALYSIS_UNREACHABLE_ERROR.i18nKey,
    })
  })

  it('still reports a 403 without a linked video as an auth failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('permission denied', { status: 403 })),
    )

    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        providerManagedOutput: true,
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        providerConfig: {
          label: 'Gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
        },
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({ errorCode: 'PROVIDER_AUTH_FAILED' })
  })

  it('throws a structured transient provider error on 503 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('overloaded', { status: 503 })),
    )

    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        providerConfig: {
          label: 'Gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
        },
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({
      errorCode: 'PROVIDER_TRANSIENT',
      httpStatus: 503,
      i18nKey: 'errors.provider.temporarilyUnavailable',
      message:
        'The selected planner model is temporarily unavailable. Try again in a moment or choose another Agent Key.',
    })
  })

  it('classifies Gemini input-token failures as context-limit errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message:
                'The input token count exceeds the maximum context length for this model.',
            },
          }),
          { status: 400 },
        ),
      ),
    )

    let caught: unknown
    try {
      await llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        providerConfig: {
          label: 'Gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
        },
        apiKey: 'test-key',
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      errorCode: 'PROVIDER_CONTEXT_LIMIT_EXCEEDED',
      httpStatus: 400,
      i18nKey: 'errors.provider.contextLimitExceeded',
    })
    expect(isLlmTextContextLimitError(caught)).toBe(true)
  })
})

describe('llmTextCompletion - OpenAI', () => {
  it('omits the app output cap when the provider manages the budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'provider managed' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      providerManagedOutput: true,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
      apiKey: 'sk-test',
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_6_SOL,
    })

    const payload = readFetchJson(fetchMock)
    expect(payload.max_completion_tokens).toBeUndefined()
    expect(payload.max_tokens).toBeUndefined()
  })

  it('returns content from a successful OpenAI response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'openai reply' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
      apiKey: 'sk-test',
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = requestInit?.body
    if (typeof body !== 'string') {
      throw new Error('Expected OpenAI request body to be a JSON string')
    }
    const payload = JSON.parse(body) as {
      max_completion_tokens?: number
    }

    expect(result).toBe('openai reply')
    expect(payload.max_completion_tokens).toBe(
      LLM_TEXT_DEFAULT_MAX_TOKENS.OPENAI_REASONING,
    )
  })

  it('returns text from OpenAI content_parts when message content is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  content_parts: [
                    { type: 'text', text: 'openai content part reply' },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
      apiKey: 'sk-test',
    })

    expect(result).toBe('openai content part reply')
  })

  it('classifies length+reasoning empty OpenAI responses as output budget exhaustion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'length',
                message: { content: null },
              },
            ],
            usage: {
              completion_tokens_details: {
                reasoning_tokens: 1024,
              },
            },
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        providerConfig: {
          label: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
        },
        apiKey: 'sk-test',
      }),
    ).rejects.toMatchObject({
      errorCode: 'PROVIDER_OUTPUT_BUDGET_EXHAUSTED',
      httpStatus: 502,
      i18nKey: 'errors.provider.outputBudgetExhausted',
    })
  })

  it('does not classify output-budget exhaustion as an input context limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'length', message: { content: null } }],
            usage: { completion_tokens_details: { reasoning_tokens: 4096 } },
          }),
          { status: 200 },
        ),
      ),
    )

    let caught: unknown
    try {
      await llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        providerConfig: {
          label: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
        },
        apiKey: 'sk-test',
      })
    } catch (error) {
      caught = error
    }

    expect(isLlmTextContextLimitError(caught)).toBe(false)
  })

  it('floors low maxTokens for gpt-5 reasoning models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
      apiKey: 'sk-test',
      modelId: 'gpt-5.6-terra',
      maxTokens: 900,
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = requestInit?.body
    if (typeof body !== 'string') {
      throw new Error('Expected OpenAI request body to be a JSON string')
    }
    const payload = JSON.parse(body) as {
      max_completion_tokens?: number
    }

    expect(payload.max_completion_tokens).toBe(
      LLM_TEXT_DEFAULT_MAX_TOKENS.OPENAI_REASONING,
    )
  })

  it('uses the chat API root when given the shared OpenAI image base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: {
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1/images',
      },
      apiKey: 'sk-test',
      modelId: 'gpt-5.2',
      // Above OPENAI_REASONING floor — must pass through unchanged.
      maxTokens: 5000,
      responseFormat: 'json_object',
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = requestInit?.body
    if (typeof body !== 'string') {
      throw new Error('Expected OpenAI request body to be a JSON string')
    }
    const payload = JSON.parse(body) as {
      model: string
      max_completion_tokens?: number
      response_format?: { type: string }
    }

    expect(result).toBe('{"ok":true}')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.any(Object),
    )
    expect(payload.model).toBe('gpt-5.2')
    expect(payload.max_completion_tokens).toBe(5000)
    expect(payload.response_format?.type).toBe('json_object')
  })

  it('uses Chat Completions web search parameters for OpenAI grounding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'grounded openai reply' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'latest visual trend',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
      apiKey: 'sk-test',
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_6_SOL,
      useGrounding: true,
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = requestInit?.body
    if (typeof body !== 'string') {
      throw new Error('Expected OpenAI request body to be a JSON string')
    }
    const payload = JSON.parse(body) as {
      model: string
      tools?: unknown
      web_search_options?: Record<string, unknown>
    }

    expect(result).toBe('grounded openai reply')
    expect(payload.model).toBe(LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_SEARCH_API)
    expect(payload.web_search_options).toEqual({})
    expect(payload.tools).toBeUndefined()
  })
})

describe('llmTextCompletion - DeepSeek', () => {
  it('omits the app output cap when the provider manages the budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'provider managed' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      providerManagedOutput: true,
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
      apiKey: 'sk-deepseek',
    })

    expect(readFetchJson(fetchMock).max_tokens).toBeUndefined()
  })

  it('calls the DeepSeek chat API with JSON response format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"scenes":[]}' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'Return json.',
      userPrompt: 'Write a script outline.',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
      apiKey: 'sk-deepseek',
      maxTokens: 2800,
      responseFormat: 'json_object',
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = requestInit?.body
    if (typeof body !== 'string') {
      throw new Error('Expected DeepSeek request body to be a JSON string')
    }
    const payload = JSON.parse(body) as {
      model: string
      max_tokens: number
      response_format?: { type: string }
    }

    expect(result).toBe('{"scenes":[]}')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.any(Object),
    )
    expect(payload.model).toBe('deepseek-v4-pro')
    expect(payload.max_tokens).toBe(2800)
    expect(payload.response_format?.type).toBe('json_object')
  })

  it('keeps DeepSeek V4 Pro text-only', async () => {
    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        imageData: 'data:image/png;base64,abc',
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        providerConfig: {
          label: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
        },
        apiKey: 'sk-deepseek',
      }),
    ).rejects.toThrow('does not support image input')
  })

  it('forwards image input for DeepSeek V4 Flash Vision Exp', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'image described' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'You analyze images.',
      userPrompt: 'Compare them.',
      imageData: [
        'https://cdn.example.com/a.png',
        'data:image/webp;base64,abc',
      ],
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_FLASH_VISION_EXP,
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
      apiKey: 'sk-deepseek',
    })

    const payload = readFetchJson(fetchMock) as {
      model: string
      messages: Array<{
        role: string
        content:
          | string
          | Array<{ type: string; text?: string; image_url?: { url: string } }>
      }>
    }
    const userMessage = payload.messages[1]
    expect(result).toBe('image described')
    expect(payload.model).toBe('deepseek-v4-flash-vision-exp')
    expect(userMessage.role).toBe('user')
    expect(userMessage.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/a.png' },
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/webp;base64,abc' },
      },
      { type: 'text', text: 'Compare them.' },
    ])
  })

  it('throws a structured balance error when DeepSeek reports insufficient balance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Insufficient Balance',
              type: 'unknown_error',
              code: 'invalid_request_error',
            },
          }),
          { status: 402 },
        ),
      ),
    )

    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        providerConfig: {
          label: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
        },
        apiKey: 'sk-deepseek',
      }),
    ).rejects.toMatchObject({
      errorCode: 'PROVIDER_INSUFFICIENT_BALANCE',
      httpStatus: 402,
      i18nKey: 'errors.provider.insufficientBalance',
      message:
        'The selected Agent Key has insufficient provider balance. Recharge it or choose another Agent Key.',
    })
  })
})

describe('llmTextCompletion - DashScope (Qwen)', () => {
  it('omits the app output cap when the provider manages the budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'provider managed' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      providerManagedOutput: true,
      adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
      providerConfig: {
        label: 'Qwen',
        baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      },
      apiKey: 'sk-qwen',
    })

    expect(readFetchJson(fetchMock).max_tokens).toBeUndefined()
  })

  it('calls the Qwen chat API and injects json + enable_thinking for JSON mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"scenes":[]}' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'Plan a shot breakdown.',
      userPrompt: 'Write a script outline.',
      adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
      providerConfig: {
        label: 'Qwen',
        baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      },
      apiKey: 'sk-qwen',
      maxTokens: 2048,
      responseFormat: 'json_object',
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = requestInit?.body
    if (typeof body !== 'string') {
      throw new Error('Expected Qwen request body to be a JSON string')
    }
    const payload = JSON.parse(body) as {
      model: string
      max_tokens: number
      enable_thinking?: boolean
      response_format?: { type: string }
      messages: Array<{ role: string; content: unknown }>
    }

    expect(result).toBe('{"scenes":[]}')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-qwen',
        }),
      }),
    )
    expect(payload.model).toBe('qwen-plus')
    expect(payload.max_tokens).toBe(2048)
    expect(payload.enable_thinking).toBe(false)
    expect(payload.response_format?.type).toBe('json_object')
    // Neither prompt mentions "json", so the adapter must append the instruction.
    expect(JSON.stringify(payload.messages)).toMatch(/json/i)
  })

  it('forwards image input as OpenAI-style image_url content (VL models)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'image described' } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'You analyze images.',
      userPrompt: 'Describe this image.',
      imageData: 'https://example.com/ref.png',
      modelId: 'qwen3-vl-plus',
      adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
      providerConfig: {
        label: 'Qwen',
        baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      },
      apiKey: 'sk-qwen',
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = requestInit?.body
    if (typeof body !== 'string') {
      throw new Error('Expected Qwen request body to be a JSON string')
    }
    const payload = JSON.parse(body) as {
      model: string
      messages: Array<{
        role: string
        content: Array<{ type: string; image_url?: { url: string } }> | string
      }>
    }

    expect(result).toBe('image described')
    expect(payload.model).toBe('qwen3-vl-plus')
    const userMessage = payload.messages.find((m) => m.role === 'user')
    expect(Array.isArray(userMessage?.content)).toBe(true)
    const content = userMessage?.content as Array<{
      type: string
      image_url?: { url: string }
    }>
    expect(content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://example.com/ref.png' },
    })
    expect(content[1]).toEqual({ type: 'text', text: 'Describe this image.' })
  })
})

describe('llmTextCompletion — xAI (Grok)', () => {
  it('posts to the xAI chat endpoint with the route model and bearer key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'grok reply' } }] }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.XAI,
      providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
      apiKey: 'xai-test',
      modelId: LLM_TEXT_MODEL_IDS.XAI_GROK_4_6,
    })

    expect(result).toBe('grok reply')
    // ⚠ The host must stay api.x.ai. The regression this guards against is
    // routing Grok through buildOpenAiChatRequest, whose base-URL fallback is
    // OpenAI's own host — a silent cross-provider bill.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.x.ai/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer xai-test',
        }),
      }),
    )
    const payload = readFetchJson(fetchMock)
    expect(payload.model).toBe('grok-4.6')
  })

  it('forwards image input as OpenAI-style image_url content (grok-4.6 vision)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'described' } }] }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'You analyze images.',
      userPrompt: 'Describe this image.',
      imageData: 'https://example.com/ref.png',
      adapterType: AI_ADAPTER_TYPES.XAI,
      providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
      apiKey: 'xai-test',
    })

    const payload = readFetchJson(fetchMock) as unknown as {
      messages: Array<{
        role: string
        content: Array<{ type: string; image_url?: { url: string } }> | string
      }>
    }
    const userMessage = payload.messages.find((m) => m.role === 'user')
    const content = userMessage?.content as Array<{
      type: string
      image_url?: { url: string }
    }>
    expect(content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://example.com/ref.png' },
    })
    expect(content[1]).toEqual({ type: 'text', text: 'Describe this image.' })
  })

  it('rejects grounding loudly instead of silently dropping it', async () => {
    // xAI's Live Search is a separate API surface. Failing here is the point:
    // a silent no-op would return an ungrounded answer that reads grounded.
    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'latest news',
        adapterType: AI_ADAPTER_TYPES.XAI,
        providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
        apiKey: 'xai-test',
        useGrounding: true,
      }),
    ).rejects.toThrow(/grounding/i)
  })
})

describe('llmTextCompletion - Claude (Anthropic)', () => {
  const ANTHROPIC_PROVIDER_CONFIG = {
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    anthropicWorkspaceId: 'wrkspc_test',
  }

  it('sends the managed ceiling as max_tokens when the provider manages the budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'provider managed' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      providerManagedOutput: true,
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      providerConfig: ANTHROPIC_PROVIDER_CONFIG,
      apiKey: 'sk-ant-test',
    })

    // Anthropic's Messages API requires max_tokens on every request — unlike
    // OpenAI/DeepSeek/Qwen, providerManagedOutput can't mean "omit the field."
    expect(readFetchJson(fetchMock).max_tokens).toBe(
      LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC_MANAGED,
    )
  })

  it('calls the Messages API with the system prompt as a top-level field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'hello from claude' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'You are helpful.',
      userPrompt: 'Say hello.',
      maxTokens: 512,
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      providerConfig: ANTHROPIC_PROVIDER_CONFIG,
      apiKey: 'sk-ant-test',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test',
          'anthropic-version': '2023-06-01',
          'anthropic-workspace-id': 'wrkspc_test',
        }),
      }),
    )
    const payload = readFetchJson(fetchMock) as {
      model: string
      max_tokens: number
      system?: string
      messages: Array<{ role: string; content: unknown }>
    }

    expect(result).toBe('hello from claude')
    expect(payload.model).toBe(LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5)
    expect(payload.max_tokens).toBe(512)
    // System prompt goes on the top-level `system` field — Anthropic has no
    // role:'system' message.
    expect(payload.system).toBe('You are helpful.')
    expect(payload.messages).toEqual([{ role: 'user', content: 'Say hello.' }])
  })

  it('asks for JSON in the system prompt and never sends an assistant prefill', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '{"scenes":[]}' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await llmTextCompletion({
      systemPrompt: 'Return json.',
      userPrompt: 'Write a script outline.',
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      providerConfig: ANTHROPIC_PROVIDER_CONFIG,
      apiKey: 'sk-ant-test',
      maxTokens: 2000,
      responseFormat: 'json_object',
    })

    const payload = readFetchJson(fetchMock) as {
      system?: string
      messages: Array<{ role: string; content: unknown }>
    }

    // ⚠ Regression guard: an assistant-turn prefill **400s on Sonnet 5**, so
    // JSON mode must never add one. The instruction rides the system prompt.
    expect(payload.messages).toEqual([
      { role: 'user', content: 'Write a script outline.' },
    ])
    expect(payload.messages.some((m) => m.role === 'assistant')).toBe(false)
    expect(payload.system).toContain('Return json.')
    expect(payload.system).toContain('single valid JSON object')
    // Passed through untouched — nothing to stitch back on any more.
    expect(result).toBe('{"scenes":[]}')
    expect(() => JSON.parse(result)).not.toThrow()
  })

  it('disables thinking so max_tokens is not spent on it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
        {
          status: 200,
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'hi',
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      providerConfig: ANTHROPIC_PROVIDER_CONFIG,
      apiKey: 'sk-ant-test',
      maxTokens: 2000,
    })

    // Sonnet 5 thinks by default when `thinking` is omitted, and max_tokens
    // caps thinking + answer together — every caller's budget here was sized
    // against non-thinking adapters, so it must be explicitly off.
    const payload = readFetchJson(fetchMock) as {
      thinking?: { type: string }
    }
    expect(payload.thinking).toEqual({ type: 'disabled' })
  })

  it('rejects image input because the Claude route is text-only', async () => {
    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        imageData: 'data:image/png;base64,abc',
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: ANTHROPIC_PROVIDER_CONFIG,
        apiKey: 'sk-ant-test',
      }),
    ).rejects.toThrow('does not support image input')
  })

  it('rejects grounding requests', async () => {
    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        useGrounding: true,
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: ANTHROPIC_PROVIDER_CONFIG,
        apiKey: 'sk-ant-test',
      }),
    ).rejects.toThrow('does not support grounding')
  })

  it('throws a structured auth error on a 401 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'authentication_error',
              message: 'invalid x-api-key',
            },
          }),
          { status: 401 },
        ),
      ),
    )

    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: ANTHROPIC_PROVIDER_CONFIG,
        apiKey: 'sk-ant-bad',
      }),
    ).rejects.toMatchObject({
      errorCode: 'PROVIDER_AUTH_FAILED',
      httpStatus: 401,
      i18nKey: 'errors.provider.invalidApiKey',
    })
  })
})

describe('llmTextStream', () => {
  const GEMINI_ROUTE = {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: {
      label: 'Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
    },
    apiKey: 'test-key',
  } as const

  function sseResponse(lines: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        for (const line of lines) controller.enqueue(encoder.encode(line))
        controller.close()
      },
    })
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  function geminiEvent(text: string): string {
    return `data: ${JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    })}

`
  }

  /** Anthropic 的收尾帧 —— 没有 `[DONE]` 哨兵，用 `message_stop`。 */
  const CLAUDE_MESSAGE_STOP_FRAME =
    'event: message_stop\ndata: {"type":"message_stop"}\n\n'

  async function collect(stream: AsyncIterable<string>): Promise<string[]> {
    const chunks: string[] = []
    for await (const chunk of stream) chunks.push(chunk)
    return chunks
  }

  it('每一家 LLM 文本 adapter 都有 SSE 实现 —— 没有「不支持就缓冲」这条路', () => {
    // ⭐ 这条替代了原先的「能力矩阵」断言。那版断言的语义是「谁支持谁不支持」，
    //    也就是承认降级存在；降级正是 2026-08-24 生产 504 能活下来的原因
    //    （08-23 漏写 Grok 的 SSE，静默缓冲把它兜住了）。现在表是穷举 Record，
    //    漏写一家 tsc 直接报错，这条只是把同一件事在运行时也钉一遍。
    expect(Object.keys(LLM_TEXT_STREAMS).sort()).toEqual(
      [...LLM_TEXT_ADAPTERS].sort(),
    )
  })

  it('不是 LLM 文本 adapter 的家：大声失败，不静默降级成缓冲', async () => {
    await expect(
      collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          adapterType: AI_ADAPTER_TYPES.FAL,
          providerConfig: { label: 'fal', baseUrl: 'https://fal.run' },
          apiKey: 'test-key',
        }),
      ),
    ).rejects.toThrow(/not supported/i)
  })

  it('Gemini：逐个 SSE 事件产出增量文本', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([geminiEvent('你好'), geminiEvent('，世界')]),
        ),
    )

    const chunks = await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        ...GEMINI_ROUTE,
      }),
    )

    expect(chunks).toEqual(['你好', '，世界'])
  })

  it('Gemini：走的是 streamGenerateContent 且带 alt=sse', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([geminiEvent('ok')]))
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        ...GEMINI_ROUTE,
      }),
    )

    expect(fetchMock.mock.calls[0]?.[0]).toContain(':streamGenerateContent')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('alt=sse')
  })

  it('chunk 边界切在一行中间也要能拼回来', async () => {
    const whole = geminiEvent('半截字')
    const cut = Math.floor(whole.length / 2)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([whole.slice(0, cut), whole.slice(cut)]),
        ),
    )

    const chunks = await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        ...GEMINI_ROUTE,
      }),
    )

    expect(chunks.join('')).toBe('半截字')
  })

  it('单个事件 JSON 坏了只跳过它，不炸掉整条流', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            geminiEvent('前'),
            'data: {不是 JSON}\n\n',
            geminiEvent('后'),
          ]),
        ),
    )

    const chunks = await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        ...GEMINI_ROUTE,
      }),
    )

    expect(chunks.join('')).toBe('前后')
  })

  it('HTTP 失败按 provider 错误抛，不产出空流', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('bad key', { status: 401 })),
    )

    await expect(
      collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          ...GEMINI_ROUTE,
        }),
      ),
    ).rejects.toMatchObject({ httpStatus: 401 })
  })

  it('OpenAI：从 delta.content 逐段产出，[DONE] 不当 JSON 解析', async () => {
    const event = (content: string) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([event('前半'), event('后半'), 'data: [DONE]\n\n']),
        ),
    )

    const chunks = await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        providerConfig: {
          label: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
        },
        apiKey: 'test-key',
      }),
    )

    expect(chunks).toEqual(['前半', '后半'])
  })

  it('OpenAI：请求体带 stream:true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        providerConfig: {
          label: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
        },
        apiKey: 'test-key',
      }),
    )

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body.stream).toBe(true)
  })

  it('Claude：只取 text_delta —— thinking_delta 绝不当正文念出去', async () => {
    // ⚠ Anthropic 是自己的事件格式，不与那四家共用解析。同一个
    //   `content_block_delta` 还会驮思考与工具调用的增量；把它们 yield 出去就是
    //   把模型的思考过程念给用户听。本仓恒 `thinking:{type:'disabled'}`，但这道
    //   判据不能靠那个配置兜着——配置是能改的。
    const frame = (delta: Record<string, unknown>) =>
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta,
      })}\n\n`
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            frame({ type: 'thinking_delta', thinking: '我先想想' }),
            frame({ type: 'text_delta', text: '前半' }),
            frame({ type: 'text_delta', text: '后半' }),
            CLAUDE_MESSAGE_STOP_FRAME,
          ]),
        ),
    )

    const chunks = await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: {
          label: 'Claude',
          baseUrl: 'https://api.anthropic.com/v1',
        },
        apiKey: 'test-key',
      }),
    )

    expect(chunks).toEqual(['前半', '后半'])
  })

  it('Claude：请求体带 stream:true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([CLAUDE_MESSAGE_STOP_FRAME]))
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: {
          label: 'Claude',
          baseUrl: 'https://api.anthropic.com/v1',
        },
        apiKey: 'test-key',
      }),
    )

    expect(readFetchJson(fetchMock).stream).toBe(true)
  })

  // ─── OpenAI 兼容的另外三家（2026-08-24 补齐） ──────────────────
  //
  // ⚠ 这三条不是「顺手加的覆盖」。Grok 08-23 接入时只写了缓冲那一半，助手的
  //   流式路由于是一个字节都不产出、响应头从未 flush，第二天生产就回了 504。
  //   每一家都必须同时验「请求带 stream:true」和「真的逐段产出」——只验其一
  //   都会漏掉那个形态。

  const OPENAI_COMPATIBLE_STREAM_ROUTES = [
    {
      name: 'DeepSeek',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      baseUrl: 'https://api.deepseek.com',
      expectedHost: 'https://api.deepseek.com/chat/completions',
    },
    {
      name: 'Qwen',
      adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      expectedHost:
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    },
    {
      name: 'Grok',
      adapterType: AI_ADAPTER_TYPES.XAI,
      baseUrl: 'https://api.x.ai/v1',
      expectedHost: 'https://api.x.ai/v1/chat/completions',
    },
  ] as const

  it.each(OPENAI_COMPATIBLE_STREAM_ROUTES)(
    '$name：请求带 stream:true、打自己的 host、并逐段产出',
    async ({ adapterType, baseUrl, expectedHost, name }) => {
      const event = (content: string) =>
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          sseResponse([event('前半'), event('后半'), 'data: [DONE]\n\n']),
        )
      vi.stubGlobal('fetch', fetchMock)

      const chunks = await collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          adapterType,
          providerConfig: { label: name, baseUrl },
          apiKey: 'test-key',
        }),
      )

      expect(chunks).toEqual(['前半', '后半'])
      expect(fetchMock.mock.calls[0]?.[0]).toBe(expectedHost)
      expect(readFetchJson(fetchMock).stream).toBe(true)
    },
  )

  it('流式：响应头到手就撤掉计时器 —— 写得久的回答不会被自己的超时掐断', async () => {
    // ⛔ 只 fake setTimeout/clearTimeout：sinon 的默认集合里有 queueMicrotask，
    //    fake 掉它会把 ReadableStream 的读取卡死，测的就不是这件事了。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      let capturedSignal: AbortSignal | null = null
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
          capturedSignal = init.signal ?? null
          return sseResponse([
            `data: ${JSON.stringify({ choices: [{ delta: { content: '慢' } }] })}\n\n`,
            'data: [DONE]\n\n',
          ])
        }),
      )

      const chunks = await collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          adapterType: AI_ADAPTER_TYPES.XAI,
          providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
          apiKey: 'test-key',
        }),
      )

      expect(chunks).toEqual(['慢'])
      // 远远越过首字窗口之后 signal 仍未 abort —— 计时器确实撤掉了。
      vi.advanceTimersByTime(LLM_TEXT_TIMEOUTS_MS.STREAM_HEADERS * 4)
      expect(capturedSignal).not.toBeNull()
      expect((capturedSignal as unknown as AbortSignal).aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('流式：响应头等不到时报 PROVIDER_TIMEOUT，不是没头没尾的 502', async () => {
    const aborted = new Error('The operation was aborted')
    aborted.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted))

    await expect(
      collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          adapterType: AI_ADAPTER_TYPES.XAI,
          providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
          apiKey: 'test-key',
        }),
      ),
    ).rejects.toMatchObject({
      errorCode: 'PROVIDER_TIMEOUT',
      httpStatus: 504,
    })
  })
})

describe('LLM 文本请求的超时', () => {
  // 没有这道闸时，上游挂住只能等平台杀函数，客户端拿到的是一个不带任何信息的
  // 504（2026-08-24 生产实证）。这里验的是「我们先自己失败，并且说得清」。
  it('缓冲补全：超时抛 PROVIDER_TIMEOUT 且带 504', async () => {
    const timedOut = new Error('The operation timed out')
    timedOut.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timedOut))

    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.XAI,
        providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({
      errorCode: 'PROVIDER_TIMEOUT',
      httpStatus: 504,
      i18nKey: 'errors.provider.timeout',
    })
  })

  it('缓冲补全：signal 带的是整次请求的窗口，不是流式那个短的', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        {
          status: 200,
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.XAI,
      providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
      apiKey: 'test-key',
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal?.aborted).toBe(false)
  })

  it('两次串起来仍小于助手路由的 maxDuration —— 引用闸会重试一次', () => {
    const CITATION_GATE_MAX_ATTEMPTS = 2
    const ASSISTANT_ROUTE_MAX_DURATION_MS = 300_000
    expect(
      LLM_TEXT_TIMEOUTS_MS.COMPLETION * CITATION_GATE_MAX_ATTEMPTS,
    ).toBeLessThan(ASSISTANT_ROUTE_MAX_DURATION_MS)
  })

  it('非 abort 的错误照旧原样抛出，不被误报成超时', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.XAI,
        providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
        apiKey: 'test-key',
      }),
    ).rejects.toThrow('ECONNREFUSED')
  })
})

describe('Gemini 空回复的归因', () => {
  const ROUTE = {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: {
      label: 'Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
    },
    apiKey: 'test-key',
  } as const

  // ⚠ 每次造新的 Response：body 只能读一次，共用同一个对象时第二次调用会挂在
  // 「Body has already been read」上，跟被测逻辑毫无关系。
  function respond(payload: unknown): void {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          async () => new Response(JSON.stringify(payload), { status: 200 }),
        ),
    )
  }

  function ask() {
    return llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      ...ROUTE,
    })
  }

  // ⚠ 2026-08-19 生产事故：这里原本抛裸 Error('No text response from Gemini')，
  // 被工厂兜成 500「发生了意外错误」，真因（安全拦截 or 输出截断）全丢。
  // **大声报错 ≠ 可归因。**

  it('promptFeedback.blockReason → 内容被拦，可分类', async () => {
    respond({ promptFeedback: { blockReason: 'SAFETY' } })
    await expect(ask()).rejects.toMatchObject({
      errorCode: 'ASSISTANT_CONTENT_BLOCKED',
      httpStatus: 422,
    })
  })

  it('finishReason=SAFETY → 同样归到内容被拦', async () => {
    respond({
      candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
    })
    await expect(ask()).rejects.toMatchObject({
      errorCode: 'ASSISTANT_CONTENT_BLOCKED',
    })
  })

  it('finishReason=MAX_TOKENS → 输出被截断（thinking 也吃这份预算）', async () => {
    respond({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }],
    })
    await expect(ask()).rejects.toMatchObject({
      errorCode: 'ASSISTANT_OUTPUT_TRUNCATED',
    })
  })

  it('说不出原因时也要把 finishReason 带进消息里，别只说「没有回复」', async () => {
    respond({
      candidates: [{ finishReason: 'RECITATION', content: { parts: [] } }],
    })
    await expect(ask()).rejects.toMatchObject({
      errorCode: 'ASSISTANT_NO_TEXT_RESPONSE',
      // 认不出的 finishReason 也要原样带出来 —— 否则下次线上撞到又是一句
      // 「没有回复」，还是查不动。
      message: expect.stringContaining('RECITATION'),
    })
  })
})
