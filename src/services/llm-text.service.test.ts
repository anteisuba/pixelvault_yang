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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'openai reply' } }],
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

    expect(result).toBe('openai reply')
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
      maxTokens: 3500,
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
    expect(payload.max_completion_tokens).toBe(3500)
    expect(payload.response_format?.type).toBe('json_object')
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
