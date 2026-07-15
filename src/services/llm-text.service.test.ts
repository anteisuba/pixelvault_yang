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
  resolveLlmTextRoute,
  llmTextCompletion,
} from '@/services/llm-text.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  LLM_TEXT_DEFAULT_MAX_TOKENS,
  LLM_TEXT_MODEL_IDS,
} from '@/constants/config'
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

describe('llmTextCompletion - Gemini', () => {
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
})

describe('llmTextCompletion - OpenAI', () => {
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
      modelId: 'gpt-5.5',
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
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_5,
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

  it('rejects image input because DeepSeek text routes are text-only', async () => {
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
