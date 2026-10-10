import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/crypto', () => ({
  decryptApiKey: vi.fn().mockReturnValue('decrypted-key'),
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
  llmNativeWebSearch,
  supportsNativeWebSearch,
  LLM_TEXT_ADAPTERS,
  LLM_TEXT_STREAMS,
  type LlmTextInput,
} from '@/services/llm-text.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import {
  ASSISTANT_IMAGE_LIMITS,
  ASSISTANT_MEDIA_LIMITS,
} from '@/constants/assistant'
import * as storage from '@/services/storage/r2'
import {
  AI_PROVIDER_ENDPOINTS,
  ANTHROPIC_API,
  LLM_TEXT_DEFAULT_MAX_TOKENS,
  LLM_TEXT_MODEL_IDS,
  LLM_TEXT_TIMEOUTS_MS,
} from '@/constants/config'
import {
  VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS,
  VIDEO_ANALYSIS_UNREACHABLE_ERROR,
} from '@/constants/video-analysis'

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

describe('structured output requests', () => {
  const schema = {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  }

  it.each([
    {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
    },
    {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
    },
  ])(
    'uses the supplied schema on a supported $adapterType model',
    async ({ adapterType, modelId }) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(
            adapterType === AI_ADAPTER_TYPES.GEMINI
              ? {
                  candidates: [
                    { content: { parts: [{ text: '{"answer":"ok"}' }] } },
                  ],
                }
              : { choices: [{ message: { content: '{"answer":"ok"}' } }] },
          ),
          { status: 200 },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)
      await llmTextCompletion({
        adapterType,
        modelId,
        apiKey: 'test-key',
        providerConfig: { label: 'test', baseUrl: 'https://provider.test/v1' },
        systemPrompt: 'Return JSON.',
        userPrompt: 'Answer.',
        responseFormat: 'json_object',
        jsonSchema: schema,
      })
      const body = readFetchJson(fetchMock)
      if (adapterType === AI_ADAPTER_TYPES.GEMINI) {
        expect(body.generationConfig).toMatchObject({
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
        })
      } else {
        expect(body.response_format).toEqual({
          type: 'json_schema',
          json_schema: { name: 'assistant_output', strict: true, schema },
        })
      }
    },
  )

  it.each([
    AI_ADAPTER_TYPES.OPENAI,
    AI_ADAPTER_TYPES.GEMINI,
    AI_ADAPTER_TYPES.ANTHROPIC,
  ])('keeps JSON mode for an unverified model on %s', async (adapterType) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          adapterType === AI_ADAPTER_TYPES.GEMINI
            ? {
                candidates: [
                  { content: { parts: [{ text: '{"answer":"ok"}' }] } },
                ],
              }
            : adapterType === AI_ADAPTER_TYPES.ANTHROPIC
              ? { content: [{ type: 'text', text: '{"answer":"ok"}' }] }
              : { choices: [{ message: { content: '{"answer":"ok"}' } }] },
        ),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    await llmTextCompletion({
      adapterType,
      modelId: 'custom-unverified-model',
      apiKey: 'test-key',
      providerConfig: { label: 'test', baseUrl: 'https://provider.test/v1' },
      systemPrompt: 'Return JSON.',
      userPrompt: 'Answer.',
      responseFormat: 'json_object',
      jsonSchema: schema,
    })
    const body = readFetchJson(fetchMock)
    expect(body.output_config).toBeUndefined()
    if (adapterType === AI_ADAPTER_TYPES.GEMINI) {
      expect(body.generationConfig).toMatchObject({
        responseMimeType: 'application/json',
      })
      expect(body.generationConfig).not.toHaveProperty('responseJsonSchema')
    } else if (adapterType === AI_ADAPTER_TYPES.OPENAI) {
      expect(body.response_format).toEqual({ type: 'json_object' })
    } else {
      expect(body.system).toEqual([
        expect.objectContaining({
          text: expect.stringContaining('single valid JSON object'),
        }),
      ])
    }
  })
})

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

  it('throws a missing-key error when the user owns no LLM key — no platform fallback', async () => {
    mockFindFirst.mockResolvedValue(null)

    await expect(resolveLlmTextRoute('db_user_1')).rejects.toMatchObject({
      errorCode: 'MISSING_API_KEY',
      message: expect.stringContaining(
        'Please add a Gemini, DeepSeek, OpenAI, Claude, or Grok API key',
      ),
    })
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

  // owner 2026-09-27：守卫缺省不再卡 4000（此前润色 / 卡片融合超过 4000 就被拒）。
  it('has no default length cap — only a caller-supplied bound rejects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'long context ok' }] } }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const input = {
      systemPrompt: 'You are helpful.',
      userPrompt: 'a'.repeat(5000),
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    }

    await expect(llmTextCompletion(input)).resolves.toBe('long context ok')
    await expect(
      llmTextCompletion({ ...input, promptGuardMaxLength: 4000 }),
    ).rejects.toThrow(/Prompt rejected by guard/)
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

  it('puts each image label right before its Gemini inline image', async () => {
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
      systemPrompt: 'You judge images.',
      userPrompt: 'Judge the result.',
      imageData: ['data:image/png;base64,abc', 'data:image/png;base64,def'],
      imageLabels: ['RESULT', 'REFERENCE 1'],
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })

    const body = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    const parts = (
      JSON.parse(body) as { contents: Array<{ parts: unknown[] }> }
    ).contents[0]!.parts
    expect(parts.slice(0, 4)).toEqual([
      { text: 'RESULT' },
      { inlineData: { mimeType: 'image/png', data: 'abc' } },
      { text: 'REFERENCE 1' },
      { inlineData: { mimeType: 'image/png', data: 'def' } },
    ])
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

  it.each([
    { stream: false, source: 'remote' },
    { stream: true, source: 'remote' },
    { stream: false, source: 'inline' },
    { stream: true, source: 'inline' },
  ])(
    'preserves the 12,718,465-byte incident image (stream=$stream, source=$source)',
    async ({ stream, source }) => {
      const bytes = Buffer.alloc(12_718_465, 127)
      const url = 'https://cdn.example.com/incident.png'
      const reply = {
        candidates: [
          { content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' },
        ],
      }
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(async (target) =>
          target === url
            ? new Response(bytes, {
                headers: {
                  'content-type': 'image/png',
                  'content-length': String(bytes.byteLength),
                },
              })
            : new Response(
                stream
                  ? `data: ${JSON.stringify(reply)}\n\n`
                  : JSON.stringify(reply),
              ),
        )
      vi.stubGlobal('fetch', fetchMock)
      const input: LlmTextInput = {
        systemPrompt: 'sys',
        userPrompt: 'Describe this image.',
        imageData:
          source === 'remote'
            ? url
            : `data:image/png;base64,${bytes.toString('base64')}`,
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        providerConfig: { label: 'Gemini', baseUrl: '' },
        apiKey: 'test-key',
      }
      let result = ''
      if (stream) {
        for await (const text of llmTextStream(input)) result += text
      } else {
        result = await llmTextCompletion(input)
      }

      expect(result).toBe('ok')
      const payload = readFetchJson(fetchMock, source === 'remote' ? 1 : 0) as {
        contents: Array<{ parts: Array<{ inlineData: { data: string } }> }>
      }
      expect(
        Buffer.from(
          payload.contents[0].parts[0].inlineData.data,
          'base64',
        ).equals(bytes),
      ).toBe(true)
    },
  )

  it('sends MP3 content as native audio to Gemini', async () => {
    const bytes = new Uint8Array([73, 68, 51])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(bytes, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg', 'content-length': '3' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'audio analyzed' }] } }],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    await llmTextCompletion({
      systemPrompt: 'Analyze audio.',
      userPrompt: 'Describe the sound.',
      audioData: ['https://cdn.example.com/source.mp3'],
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
    })
    const payload = readFetchJson(fetchMock, 1) as {
      contents: Array<{ parts: unknown[] }>
    }
    expect(payload.contents[0].parts).toContainEqual({
      inlineData: {
        mimeType: 'audio/mpeg',
        data: Buffer.from(bytes).toString('base64'),
      },
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

describe('OpenAI reference image transport', () => {
  const input: LlmTextInput = {
    systemPrompt: 'sys',
    userPrompt: 'Describe the same character.',
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    apiKey: 'test-key',
    responseFormat: 'json_object',
  }

  async function complete(stream: boolean, imageData?: string | string[]) {
    const request = { ...input, imageData }
    if (!stream) return llmTextCompletion(request)
    let text = ''
    for await (const chunk of llmTextStream(request)) text += chunk
    return text
  }

  function providerResponse(stream: boolean) {
    return new Response(
      stream
        ? 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'
        : JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      { status: 200 },
    )
  }

  it.each([false, true])(
    'inlines remote images in order without forwarding CDN URLs (stream=%s)',
    async (stream) => {
      const firstUrl = 'https://cdn.example.com/first.png'
      const lastUrl = 'https://cdn.example.com/last.webp'
      const inline = `data:image/jpeg;base64,${Buffer.from('inline').toString('base64')}`
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(async (url) => {
          if (url === firstUrl)
            return new Response('first', {
              headers: { 'content-type': 'image/png' },
            })
          if (url === lastUrl)
            return new Response('last', {
              headers: { 'content-type': 'image/webp' },
            })
          return providerResponse(stream)
        })
      vi.stubGlobal('fetch', fetchMock)

      await expect(complete(stream, [firstUrl, inline, lastUrl])).resolves.toBe(
        'ok',
      )

      expect(fetchMock).toHaveBeenCalledTimes(3)
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith('/chat/completions'),
      )
      const body = call?.[1]?.body
      if (typeof body !== 'string') throw new Error('Expected OpenAI JSON body')
      const payload = JSON.parse(body) as {
        messages: Array<{ content: unknown }>
        stream?: boolean
        response_format: { type: string }
      }
      expect(payload.messages[1]?.content).toEqual([
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${Buffer.from('first').toString('base64')}`,
          },
        },
        { type: 'image_url', image_url: { url: inline } },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/webp;base64,${Buffer.from('last').toString('base64')}`,
          },
        },
        { type: 'text', text: input.userPrompt },
      ])
      expect(body).not.toContain('cdn.example.com')
      expect(payload.stream).toBe(stream ? true : undefined)
      expect(payload.response_format).toEqual({ type: 'json_object' })
    },
  )

  // 看图那一跳要 high：默认清晰度下九宫格每格的脸只有几个像素（回放 T20）。
  it('passes imageDetail through as the OpenAI detail of every image part', async () => {
    const inline = `data:image/png;base64,${Buffer.from('grid').toString('base64')}`
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(providerResponse(false))
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      ...input,
      imageData: [inline, inline],
      imageDetail: 'high',
    })

    const body = fetchMock.mock.calls[0]?.[1]?.body
    if (typeof body !== 'string') throw new Error('Expected OpenAI JSON body')
    const payload = JSON.parse(body) as {
      messages: Array<{ content: Array<{ image_url?: { detail?: string } }> }>
    }
    const details = payload.messages[1]?.content
      .filter((part) => part.image_url)
      .map((part) => part.image_url?.detail)
    expect(details).toEqual(['high', 'high'])
  })

  it.each([false, true])(
    'preserves a 21 MiB original image within the OpenAI request budget (stream=%s)',
    async (stream) => {
      const bytes = Buffer.alloc(21 * 1024 * 1024, 127)
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(bytes, {
            headers: {
              'content-type': 'image/png',
              'content-length': String(bytes.byteLength),
            },
          }),
        )
        .mockResolvedValueOnce(providerResponse(stream))
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        complete(stream, 'https://cdn.example.com/original.png'),
      ).resolves.toBe('ok')

      const body = fetchMock.mock.calls[1]?.[1]?.body
      if (typeof body !== 'string') throw new Error('Expected OpenAI JSON body')
      const payload = JSON.parse(body) as {
        messages: Array<{ content: Array<{ image_url?: { url: string } }> }>
      }
      const sentImage = payload.messages[1]?.content[0]?.image_url?.url
      expect(sentImage?.startsWith('data:image/png;base64,')).toBe(true)
      expect(
        Buffer.from(sentImage!.split(',')[1], 'base64').equals(bytes),
      ).toBe(true)
    },
  )

  it.each([false, true])(
    'rejects a private image URL before any network request (stream=%s)',
    async (stream) => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => providerResponse(stream))
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        complete(stream, 'http://127.0.0.1/private.png'),
      ).rejects.toMatchObject({
        errorCode: GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE,
        i18nKey: 'errors.generation.reference_image_unreachable',
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([false, true])(
    'reports image download failure without calling the provider (stream=%s)',
    async (stream) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('forbidden', { status: 403 }))
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        complete(stream, 'https://cdn.example.com/private.png'),
      ).rejects.toMatchObject({
        errorCode: GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE,
        i18nKey: 'errors.generation.reference_image_unreachable',
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://cdn.example.com/private.png',
      )
    },
  )

  it('rejects a remote image whose Base64 alone exceeds the request budget', async () => {
    const maxBytes =
      Math.floor(ASSISTANT_IMAGE_LIMITS.openai.maxRequestBytes / 4) * 3
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('image', {
        headers: { 'content-length': String(maxBytes + 1) },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      complete(false, 'https://cdn.example.com/large.png'),
    ).rejects.toMatchObject({
      errorCode: 'PROVIDER_REQUEST_TOO_LARGE',
      i18nKey: 'errors.provider.requestTooLarge',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([401, 403])(
    'preserves explicit provider authentication status %s',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: { message: 'Unable to download the reference image' },
            }),
            { status },
          ),
        ),
      )

      await expect(complete(false)).rejects.toMatchObject({
        errorCode: 'PROVIDER_AUTH_FAILED',
        httpStatus: status,
        i18nKey: 'errors.provider.invalidApiKey',
      })
    },
  )

  it.each([
    [
      'invalid_image_url: Unable to download content from provided URL before timeout',
      GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE,
    ],
    [
      'unsupported image format',
      GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT,
    ],
    ['image too large', GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE],
    ['too many images', GENERATION_ERROR_CODES.REFERENCE_IMAGE_LIMIT_EXCEEDED],
    [
      'invalid image dimensions',
      GENERATION_ERROR_CODES.INVALID_REFERENCE_IMAGE_DIMENSIONS,
    ],
  ])(
    'preserves the provider reference error: %s',
    async (message, errorCode) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: { message } }), {
            status: 400,
          }),
        ),
      )

      await expect(complete(false)).rejects.toMatchObject({
        errorCode,
        i18nKey: `errors.generation.${errorCode}`,
      })
    },
  )
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
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
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
    const payload = JSON.parse(body) as Record<string, unknown>

    expect(result).toBe('openai reply')
    expect(payload.model).toBe(LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL)
    expect(payload.max_tokens).toBeUndefined()
    expect(payload.reasoning_effort).toBeUndefined()
    expect(payload.tools).toBeUndefined()
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

  it.each([
    LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
    LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_LUNA,
    LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_ASTRA,
  ])('floors low maxTokens for %s reasoning models', async (modelId) => {
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
      modelId,
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
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
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
  it('reports the usage block of a buffered response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 7700, completion_tokens: 6000 },
          }),
          { status: 200 },
        ),
      ),
    )
    const onUsage = vi.fn()

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
      apiKey: 'sk-deepseek',
      onUsage,
    })

    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 7700,
      outputTokens: 6000,
    })
  })

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

  it.each([undefined, LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO])(
    'calls the DeepSeek chat API with JSON response format (%s)',
    async (modelId) => {
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
        modelId,
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        providerConfig: {
          label: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
        },
        apiKey: 'sk-deepseek',
        maxTokens: 2800,
        responseFormat: 'json_object',
      })

      const requestInit = fetchMock.mock.calls[0]?.[1] as
        | RequestInit
        | undefined
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
      expect(payload.model).toBe(modelId ?? LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH)
      expect(payload.max_tokens).toBe(2800)
      expect(payload.response_format?.type).toBe('json_object')
    },
  )

  it('keeps an explicit DeepSeek V4 Pro choice text-only', async () => {
    await expect(
      llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        imageData: 'data:image/png;base64,abc',
        modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        providerConfig: {
          label: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
        },
        apiKey: 'sk-deepseek',
      }),
    ).rejects.toThrow('does not support image input')
  })

  it('uses the vision tier when no DeepSeek model is chosen and images are attached', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'seen' } }] }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      imageData: 'data:image/png;base64,abc',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
      apiKey: 'sk-deepseek',
    })

    expect(readFetchJson(fetchMock).model).toBe(
      LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
    )
  })

  it('forwards image input for DeepSeek V4.1 Flash', async () => {
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
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
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
    expect(payload.model).toBe('deepseek-flash')
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

  it('puts each image label right before its image', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'You judge images.',
      userPrompt: 'Judge the result.',
      imageData: [
        'https://cdn.example.com/result.png',
        'https://cdn.example.com/ref.png',
      ],
      imageLabels: ['RESULT', 'REFERENCE 1'],
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
      apiKey: 'sk-deepseek',
    })

    const payload = readFetchJson(fetchMock) as {
      messages: Array<{ content: unknown }>
    }
    expect(payload.messages[1]!.content).toEqual([
      { type: 'text', text: 'RESULT' },
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/result.png' },
      },
      { type: 'text', text: 'REFERENCE 1' },
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example.com/ref.png' },
      },
      { type: 'text', text: 'Judge the result.' },
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
      modelId: LLM_TEXT_MODEL_IDS.XAI_GROK_4_7,
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
    expect(payload.model).toBe('grok-4.7')
    // grok-4.7 defaults to high reasoning and cannot disable it. Assistant
    // turns are agentic JSON / tool loops — official "low" is that tier.
    expect(payload.reasoning_effort).toBe('low')
    // Official visible-output field. Deprecated `max_tokens` must stay off:
    // if still honored as a total cap it would eat the budget on thinking.
    expect(payload.max_completion_tokens).toBe(LLM_TEXT_DEFAULT_MAX_TOKENS.XAI)
    expect(payload.max_tokens).toBeUndefined()
  })

  it('omits the visible-output cap when the provider manages the budget, still sends low reasoning', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      providerManagedOutput: true,
      adapterType: AI_ADAPTER_TYPES.XAI,
      providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
      apiKey: 'xai-test',
      modelId: LLM_TEXT_MODEL_IDS.XAI_GROK_4_7,
    })

    const payload = readFetchJson(fetchMock)
    expect(payload.reasoning_effort).toBe('low')
    expect(payload.max_completion_tokens).toBeUndefined()
    expect(payload.max_tokens).toBeUndefined()
  })

  it('raises an explicit maxTokens below the Grok floor, keeps one above it', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
            { status: 200 },
          ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const base = {
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.XAI,
      providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
      apiKey: 'xai-test',
      modelId: LLM_TEXT_MODEL_IDS.XAI_GROK_4_7,
    } as const
    await llmTextCompletion({ ...base, maxTokens: 512 })
    await llmTextCompletion({
      ...base,
      maxTokens: LLM_TEXT_DEFAULT_MAX_TOKENS.XAI + 1,
    })

    const first = readFetchJson(fetchMock, 0)
    const second = readFetchJson(fetchMock, 1)
    expect(first.max_completion_tokens).toBe(LLM_TEXT_DEFAULT_MAX_TOKENS.XAI)
    expect(second.max_completion_tokens).toBe(
      LLM_TEXT_DEFAULT_MAX_TOKENS.XAI + 1,
    )
    expect(first.max_tokens).toBeUndefined()
    expect(second.max_tokens).toBeUndefined()
  })

  it('forwards image input as OpenAI-style image_url content (grok-4.7 vision)', async () => {
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
    // OpenAI/DeepSeek, providerManagedOutput can't mean "omit the field."
    expect(readFetchJson(fetchMock).max_tokens).toBe(
      LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC,
    )
  })

  it('raises an explicit max_tokens below the Anthropic floor, keeps one above it', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
            { status: 200 },
          ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const base = {
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      providerConfig: ANTHROPIC_PROVIDER_CONFIG,
      apiKey: 'sk-ant-test',
    }
    await llmTextCompletion({ ...base, maxTokens: 512 })
    await llmTextCompletion({
      ...base,
      maxTokens: LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC + 1,
    })

    // Fable 5.1 always thinks and `max_tokens` caps thinking + answer
    // together, so a budget sized for a non-thinking adapter is raised to
    // the floor. Larger explicit budgets pass through untouched.
    const first = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    const second = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)
    expect(first.max_tokens).toBe(LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC)
    expect(second.max_tokens).toBe(LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC + 1)
  })

  it.each([undefined, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5])(
    'calls the Messages API with the system prompt as a top-level field (%s)',
    async (modelId) => {
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
        modelId,
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
        system?: unknown
        messages: Array<{ role: string; content: unknown }>
      }

      expect(result).toBe('hello from claude')
      expect(payload.model).toBe(modelId ?? LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5)
      // 512 is below the Anthropic floor (thinking + answer share max_tokens).
      expect(payload.max_tokens).toBe(LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC)
      // System prompt goes on the top-level `system` field — Anthropic has no
      // role:'system' message — as one cached text block.
      expect(payload.system).toEqual([
        {
          type: 'text',
          text: 'You are helpful.',
          cache_control: { type: 'ephemeral' },
        },
      ])
      expect(payload.messages).toEqual([
        { role: 'user', content: 'Say hello.' },
      ])
    },
  )

  it.each([undefined, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5])(
    'asks for JSON in the system prompt and never sends an assistant prefill (%s)',
    async (modelId) => {
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
        modelId,
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: ANTHROPIC_PROVIDER_CONFIG,
        apiKey: 'sk-ant-test',
        maxTokens: 2000,
        responseFormat: 'json_object',
      })

      const payload = readFetchJson(fetchMock) as {
        system: Array<{ text: string }>
        messages: Array<{ role: string; content: unknown }>
        output_config?: unknown
      }

      // ⚠ Regression guard: an assistant-turn prefill **400s on Fable 5.1**, so
      // JSON mode must never add one. The instruction rides the system prompt.
      expect(payload.messages).toEqual([
        { role: 'user', content: 'Write a script outline.' },
      ])
      expect(payload.messages.some((m) => m.role === 'assistant')).toBe(false)
      expect(payload.system[0]?.text).toContain('Return json.')
      expect(payload.system[0]?.text).toContain('single valid JSON object')
      expect(payload.output_config).toBeUndefined()
      // Passed through untouched — nothing to stitch back on any more.
      expect(result).toBe('{"scenes":[]}')
      expect(() => JSON.parse(result)).not.toThrow()
    },
  )

  it.each([undefined, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5])(
    'sends a caller schema as output_config.format instead of the JSON instruction (%s)',
    async (modelId) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: '{"conclusion":"ok"}' }],
          }),
          { status: 200 },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)
      const schema = {
        type: 'object',
        properties: { conclusion: { type: 'string' } },
        required: ['conclusion'],
        additionalProperties: false,
      }

      await llmTextCompletion({
        systemPrompt: 'Return json.',
        userPrompt: 'Conclude.',
        modelId,
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: ANTHROPIC_PROVIDER_CONFIG,
        apiKey: 'sk-ant-test',
        responseFormat: 'json_object',
        jsonSchema: schema,
      })

      const payload = readFetchJson(fetchMock) as {
        system: Array<{ text: string }>
        output_config?: unknown
      }
      expect(payload.output_config).toEqual({
        format: { type: 'json_schema', schema },
      })
      expect(payload.system[0]?.text).toBe('Return json.')
    },
  )

  it.each([
    LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5,
    LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    LLM_TEXT_MODEL_IDS.CLAUDE_FABLE_5_1,
  ])(
    'sends supported thinking and fallback parameters for %s',
    async (modelId) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [
              { type: 'thinking', thinking: '', signature: 'sig-test' },
              { type: 'text', text: 'ok' },
            ],
          }),
          {
            status: 200,
          },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const result = await llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'hi',
        modelId,
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: ANTHROPIC_PROVIDER_CONFIG,
        apiKey: 'sk-ant-test',
        maxTokens: 2000,
      })

      // ⚠ Regression guard: Fable 5.1 rejects `thinking: {type:'disabled'}` and
      // `budget_tokens` with a 400 — the field must be absent. The refusal
      // fallback is the `'default'` scalar, which needs exactly the
      // `-2026-07-01` beta header (the array form uses a different one).
      const payload = readFetchJson(fetchMock)
      expect(result).toBe('ok')
      expect(payload.model).toBe(modelId)
      expect(payload.temperature).toBeUndefined()
      expect(payload.top_p).toBeUndefined()
      expect(payload.top_k).toBeUndefined()
      expect(payload.tool_choice).toBeUndefined()
      expect(payload.max_tokens).toBe(LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC)
      expect(payload.thinking).toBeUndefined()
      expect(payload.fallbacks).toBe('default')
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'anthropic-beta': ANTHROPIC_API.SERVER_SIDE_FALLBACK_BETA,
          }),
        }),
      )
    },
  )

  it.each([undefined, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5])(
    'throws PROVIDER_REFUSED when the classifiers decline (HTTP 200, stop_reason refusal) (%s)',
    async (modelId) => {
      // A refusal is a *successful* response with empty (pre-output) content —
      // reading content[0] unconditionally would surface "No text response".
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              content: [],
              stop_reason: 'refusal',
              stop_details: { type: 'refusal', category: 'cyber' },
            }),
            { status: 200 },
          ),
        ),
      )

      await expect(
        llmTextCompletion({
          systemPrompt: 'sys',
          userPrompt: 'hi',
          modelId,
          adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
          providerConfig: ANTHROPIC_PROVIDER_CONFIG,
          apiKey: 'sk-ant-test',
        }),
      ).rejects.toMatchObject({
        errorCode: 'PROVIDER_REFUSED',
        i18nKey: 'errors.provider.refused',
      })
    },
  )

  it('puts each image label right before its image block', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: 'seen' }] }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'Judge the result.',
      imageData: ['data:image/png;base64,abc', 'https://cdn.example.com/b.jpg'],
      imageLabels: ['RESULT', 'REFERENCE 1'],
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      providerConfig: ANTHROPIC_PROVIDER_CONFIG,
      apiKey: 'sk-ant-test',
    })

    const payload = readFetchJson(fetchMock) as {
      messages: Array<{ content: unknown }>
    }
    expect(payload.messages[0]!.content).toEqual([
      { type: 'text', text: 'RESULT' },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'abc' },
      },
      { type: 'text', text: 'REFERENCE 1' },
      {
        type: 'image',
        source: { type: 'url', url: 'https://cdn.example.com/b.jpg' },
      },
      { type: 'text', text: 'Judge the result.' },
    ])
  })

  it.each([undefined, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5])(
    'sends images as base64 / url blocks ahead of the text (%s)',
    async (modelId) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ content: [{ type: 'text', text: 'seen' }] }),
            { status: 200 },
          ),
        )
      vi.stubGlobal('fetch', fetchMock)

      const result = await llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'Compare them.',
        imageData: [
          'data:image/png;base64,abc',
          'https://cdn.example.com/b.jpg',
        ],
        modelId,
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: ANTHROPIC_PROVIDER_CONFIG,
        apiKey: 'sk-ant-test',
      })

      expect(result).toBe('seen')
      expect(readFetchJson(fetchMock).messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'abc' },
            },
            {
              type: 'image',
              source: { type: 'url', url: 'https://cdn.example.com/b.jpg' },
            },
            { type: 'text', text: 'Compare them.' },
          ],
        },
      ])
    },
  )

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

  const GEMINI_STOP_FRAME = 'data: {"candidates":[{"finishReason":"STOP"}]}\n\n'

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
          sseResponse([
            geminiEvent('你好'),
            geminiEvent('，世界'),
            GEMINI_STOP_FRAME,
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

    expect(chunks).toEqual(['你好', '，世界'])
  })

  it('Gemini：走的是 streamGenerateContent 且带 alt=sse', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([geminiEvent('ok'), GEMINI_STOP_FRAME]))
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

  it('Gemini：流式请求带思考摘要保活，摘要不进正文', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'Weighing the refs', thought: true }],
              },
            },
          ],
        })}\n\n`,
        geminiEvent('{"ok":true}'),
        GEMINI_STOP_FRAME,
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const chunks = await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        ...GEMINI_ROUTE,
      }),
    )

    expect(chunks).toEqual(['{"ok":true}'])
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
    })
  })

  it('chunk 边界切在一行中间也要能拼回来', async () => {
    const whole = geminiEvent('半截字')
    const cut = Math.floor(whole.length / 2)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            whole.slice(0, cut),
            whole.slice(cut),
            GEMINI_STOP_FRAME,
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

    expect(chunks.join('')).toBe('半截字')
  })

  it('损坏的 SSE 事件不能被跳过并伪装成完整回复', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            geminiEvent('前'),
            'data: {不是 JSON}\n\n',
            geminiEvent('后'),
            GEMINI_STOP_FRAME,
          ]),
        ),
    )
    await expect(
      collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          ...GEMINI_ROUTE,
        }),
      ),
    ).rejects.toMatchObject({ errorCode: 'ASSISTANT_OUTPUT_TRUNCATED' })
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
      .mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      )
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
    expect(body.model).toBe(LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL)
  })

  it.each([undefined, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5])(
    'Claude：只取 text_delta —— thinking_delta 绝不当正文念出去 (%s)',
    async (modelId) => {
      // ⚠ Anthropic 是自己的事件格式，不与那四家共用解析。同一个
      //   `content_block_delta` 还会驮思考与工具调用的增量；把它们 yield 出去就是
      //   把模型的思考过程念给用户听。Fable 5.1 的 thinking 恒开（关不掉），默认
      //   `display: "omitted"` 时 thinking_delta 为空串，但这道判据不能靠那个默认兜着。
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
          modelId,
          adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
          providerConfig: {
            label: 'Claude',
            baseUrl: 'https://api.anthropic.com/v1',
          },
          apiKey: 'test-key',
        }),
      )

      expect(chunks).toEqual(['前半', '后半'])
    },
  )

  it.each([undefined, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5])(
    'Claude：请求体带 stream:true (%s)',
    async (modelId) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n',
            CLAUDE_MESSAGE_STOP_FRAME,
          ]),
        )
      vi.stubGlobal('fetch', fetchMock)

      await collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          modelId,
          adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
          providerConfig: {
            label: 'Claude',
            baseUrl: 'https://api.anthropic.com/v1',
          },
          apiKey: 'test-key',
        }),
      )

      const payload = readFetchJson(fetchMock)
      expect(payload.stream).toBe(true)
      expect(payload.model).toBe(modelId ?? LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5)
      expect(payload.thinking).toBeUndefined()
      expect(payload.max_tokens).toBe(LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC)
    },
  )

  it('Claude：provider 管上限的流式请求给宽上限，思考长了也不截断正文', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n',
          CLAUDE_MESSAGE_STOP_FRAME,
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        providerManagedOutput: true,
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: {
          label: 'Claude',
          baseUrl: 'https://api.anthropic.com/v1',
        },
        apiKey: 'test-key',
      }),
    )

    expect(readFetchJson(fetchMock).max_tokens).toBe(
      LLM_TEXT_DEFAULT_MAX_TOKENS.ANTHROPIC_STREAM,
    )
  })

  it.each([undefined, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5])(
    'Claude：流中途 stop_reason=refusal 抛 PROVIDER_REFUSED，不把半截当完整回复 (%s)',
    async (modelId) => {
      // 分类器可以在已经吐了一部分正文之后才拒绝：`message_delta` 带
      // `stop_reason: 'refusal'`。这时要抛错让上层丢掉半截，而不是静默收尾。
      const refusalFrame =
        'event: message_delta\ndata: ' +
        JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'refusal', stop_sequence: null },
          usage: { output_tokens: 3 },
        }) +
        '\n\n'
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          sseResponse([
            'event: content_block_delta\ndata: ' +
              JSON.stringify({
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: '半截' },
              }) +
              '\n\n',
            refusalFrame,
            CLAUDE_MESSAGE_STOP_FRAME,
          ]),
        ),
      )

      await expect(
        collect(
          llmTextStream({
            systemPrompt: 'sys',
            userPrompt: 'user',
            modelId,
            adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
            providerConfig: {
              label: 'Claude',
              baseUrl: 'https://api.anthropic.com/v1',
            },
            apiKey: 'test-key',
          }),
        ),
      ).rejects.toMatchObject({ errorCode: 'PROVIDER_REFUSED' })
    },
  )

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

  it('流式完成后撤掉计时器，不再触发迟到的超时', async () => {
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
      expect(capturedSignal).not.toBeNull()
      const completedReason = (capturedSignal as unknown as AbortSignal).reason
      expect(vi.getTimerCount()).toBe(0)
      vi.advanceTimersByTime(LLM_TEXT_TIMEOUTS_MS.STREAM_HEADERS * 4)
      expect((capturedSignal as unknown as AbortSignal).reason).toBe(
        completedReason,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('流式首包窗口一律 90s：30s 时还在等，到点才掐（Grok 与 OpenAI 同一档）', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      let capturedSignal: AbortSignal | null = null
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, init: RequestInit) => {
          capturedSignal = init.signal ?? null
          return new Promise((_resolve, reject) => {
            const signal = init.signal
            if (!signal) return
            const onAbort = () => {
              const aborted = new Error('The operation was aborted')
              aborted.name = 'AbortError'
              reject(aborted)
            }
            if (signal.aborted) onAbort()
            else signal.addEventListener('abort', onAbort, { once: true })
          })
        }),
      )

      const pending = collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          adapterType: AI_ADAPTER_TYPES.XAI,
          providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
          apiKey: 'test-key',
        }),
      )
      const expected = expect(pending).rejects.toMatchObject({
        errorCode: 'PROVIDER_TIMEOUT',
        httpStatus: 504,
      })
      // fetchLlmTextStreaming arms the timer then awaits fetch — flush that.
      await Promise.resolve()
      await Promise.resolve()

      // ⭐ 30s 时还在等（推理模型开口前可能一个字节都不回），90s 才掐。
      await vi.advanceTimersByTimeAsync(30_000)
      expect(capturedSignal).not.toBeNull()
      expect((capturedSignal as unknown as AbortSignal).aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(
        LLM_TEXT_TIMEOUTS_MS.STREAM_HEADERS - 30_000,
      )
      expect((capturedSignal as unknown as AbortSignal).aborted).toBe(true)
      await expected
    } finally {
      vi.useRealTimers()
    }
  })

  it('Grok 流式请求同样带 reasoning_effort: low，不发已弃用的 max_tokens', async () => {
    const event = (content: string) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([event('ok'), 'data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      llmTextStream({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.XAI,
        providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
        apiKey: 'test-key',
      }),
    )

    const payload = readFetchJson(fetchMock)
    expect(payload.stream).toBe(true)
    expect(payload.reasoning_effort).toBe('low')
    expect(payload.max_completion_tokens).toBe(LLM_TEXT_DEFAULT_MAX_TOKENS.XAI)
    expect(payload.max_tokens).toBeUndefined()
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

  describe('provider 自报的 usage 进 onUsage（只记录）', () => {
    const openAiEvent = (payload: Record<string, unknown>) =>
      `data: ${JSON.stringify(payload)}\n\n`

    it('Grok：每帧带累计 usage，以最后一帧为准', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          sseResponse([
            openAiEvent({
              choices: [{ delta: { content: '{"a"' } }],
              usage: { prompt_tokens: 9000, completion_tokens: 1 },
            }),
            openAiEvent({
              choices: [{ delta: { content: ':1}' }, finish_reason: 'stop' }],
              usage: {
                prompt_tokens: 9000,
                completion_tokens: 40,
                prompt_tokens_details: { cached_tokens: 8000 },
                completion_tokens_details: { reasoning_tokens: 900 },
              },
            }),
            'data: [DONE]\n\n',
          ]),
        ),
      )
      const onUsage = vi.fn()

      const chunks = await collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          adapterType: AI_ADAPTER_TYPES.XAI,
          providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
          apiKey: 'test-key',
          onUsage,
        }),
      )

      expect(chunks.join('')).toBe('{"a":1}')
      expect(onUsage).toHaveBeenLastCalledWith({
        inputTokens: 9000,
        outputTokens: 40,
        reasoningTokens: 900,
        cachedInputTokens: 8000,
      })
    })

    it('DeepSeek：最后一帧 choices 为空、只带 usage，正文不受影响', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          sseResponse([
            openAiEvent({
              choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
            }),
            openAiEvent({
              choices: [],
              usage: {
                prompt_tokens: 26000,
                completion_tokens: 12000,
                prompt_cache_hit_tokens: 20000,
                completion_tokens_details: { reasoning_tokens: 11500 },
              },
            }),
            'data: [DONE]\n\n',
          ]),
        ),
      )
      const onUsage = vi.fn()

      const chunks = await collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
          providerConfig: {
            label: 'DeepSeek',
            baseUrl: 'https://api.deepseek.com',
          },
          apiKey: 'test-key',
          onUsage,
        }),
      )

      expect(chunks).toEqual(['ok'])
      expect(onUsage).toHaveBeenCalledOnce()
      expect(onUsage).toHaveBeenCalledWith({
        inputTokens: 26000,
        outputTokens: 12000,
        reasoningTokens: 11500,
        cachedInputTokens: 20000,
      })
    })

    it.each([
      { baseUrl: '', sent: true },
      { baseUrl: 'https://proxy.example.test/v1', sent: false },
    ])(
      'OpenAI：给了 cacheKey 时官方端点带 prompt_cache_key，自填代理不加（baseUrl=$baseUrl）',
      async ({ baseUrl, sent }) => {
        const fetchMock = vi.fn().mockResolvedValue(
          sseResponse([
            openAiEvent({
              choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
            }),
            'data: [DONE]\n\n',
          ]),
        )
        vi.stubGlobal('fetch', fetchMock)

        await collect(
          llmTextStream({
            systemPrompt: 'sys',
            userPrompt: 'user',
            adapterType: AI_ADAPTER_TYPES.OPENAI,
            providerConfig: { label: 'OpenAI', baseUrl },
            apiKey: 'test-key',
            cacheKey: 'operator-abc',
          }),
        )

        const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
        expect(body.prompt_cache_key).toBe(sent ? 'operator-abc' : undefined)
      },
    )

    it.each([
      { baseUrl: '', asked: true },
      { baseUrl: 'https://proxy.example.test/v1', asked: false },
    ])(
      'OpenAI 流式：官方端点要 usage，自填代理不加字段（baseUrl=$baseUrl）',
      async ({ baseUrl, asked }) => {
        const fetchMock = vi.fn().mockResolvedValue(
          sseResponse([
            openAiEvent({
              choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
            }),
            openAiEvent({
              choices: [],
              usage: { prompt_tokens: 30000, completion_tokens: 200 },
            }),
            'data: [DONE]\n\n',
          ]),
        )
        vi.stubGlobal('fetch', fetchMock)
        const onUsage = vi.fn()

        const chunks = await collect(
          llmTextStream({
            systemPrompt: 'sys',
            userPrompt: 'user',
            adapterType: AI_ADAPTER_TYPES.OPENAI,
            providerConfig: { label: 'OpenAI', baseUrl },
            apiKey: 'test-key',
            onUsage,
          }),
        )

        expect(chunks).toEqual(['ok'])
        const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
        expect(body.stream_options).toEqual(
          asked ? { include_usage: true } : undefined,
        )
        expect(onUsage).toHaveBeenCalledWith({
          inputTokens: 30000,
          outputTokens: 200,
        })
      },
    )

    it('Gemini：usageMetadata 的思考数单独记，不并进输出', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          sseResponse([
            geminiEvent('ok'),
            `data: ${JSON.stringify({
              candidates: [{ finishReason: 'STOP' }],
              usageMetadata: {
                promptTokenCount: 10000,
                candidatesTokenCount: 300,
                thoughtsTokenCount: 5000,
              },
            })}\n\n`,
          ]),
        ),
      )
      const onUsage = vi.fn()

      await collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          ...GEMINI_ROUTE,
          onUsage,
        }),
      )

      expect(onUsage).toHaveBeenLastCalledWith({
        inputTokens: 10000,
        outputTokens: 300,
        reasoningTokens: 5000,
      })
    })

    it('Claude：message_start 的输入（含缓存）与 message_delta 的累计输出合在一起', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          sseResponse([
            `event: message_start\ndata: ${JSON.stringify({
              type: 'message_start',
              message: {
                usage: {
                  input_tokens: 200,
                  cache_read_input_tokens: 9800,
                  cache_creation_input_tokens: 0,
                  output_tokens: 1,
                },
              },
            })}\n\n`,
            `event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'ok' },
            })}\n\n`,
            `event: message_delta\ndata: ${JSON.stringify({
              type: 'message_delta',
              delta: { stop_reason: 'end_turn' },
              usage: { output_tokens: 700 },
            })}\n\n`,
            CLAUDE_MESSAGE_STOP_FRAME,
          ]),
        ),
      )
      const onUsage = vi.fn()

      const chunks = await collect(
        llmTextStream({
          systemPrompt: 'sys',
          userPrompt: 'user',
          adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
          providerConfig: {
            label: 'Claude',
            baseUrl: 'https://api.anthropic.com',
          },
          apiKey: 'test-key',
          onUsage,
        }),
      )

      expect(chunks).toEqual(['ok'])
      expect(onUsage).toHaveBeenLastCalledWith({
        inputTokens: 10000,
        outputTokens: 700,
        cachedInputTokens: 9800,
      })
    })

    it('没报 usage、或 usage 形状对不上：不回调，正文照常', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          sseResponse([
            openAiEvent({
              choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 'many' },
            }),
            'data: [DONE]\n\n',
          ]),
        ),
      )
      const onUsage = vi.fn()

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
          onUsage,
        }),
      )

      expect(chunks).toEqual(['ok'])
      expect(onUsage).not.toHaveBeenCalled()
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

describe('LLM cancellation and body deadlines', () => {
  const input: LlmTextInput = {
    systemPrompt: 'sys',
    userPrompt: 'user',
    adapterType: AI_ADAPTER_TYPES.XAI,
    providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
    apiKey: 'test-key',
  }
  const event = (content: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
  const collect = async (request: LlmTextInput) => {
    const chunks: string[] = []
    for await (const chunk of llmTextStream(request)) chunks.push(chunk)
    return chunks
  }
  const flush = async () => {
    for (let index = 0; index < 8; index++) await Promise.resolve()
  }
  const run = (stream: boolean, request: LlmTextInput) =>
    stream ? collect(request) : llmTextCompletion(request)

  afterEach(() => vi.useRealTimers())

  it.each([false, true])(
    'skips a pre-aborted request (stream=%s)',
    async (stream) => {
      const controller = new AbortController()
      controller.abort()
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      await expect(
        run(stream, { ...input, signal: controller.signal }),
      ).rejects.toMatchObject({
        name: 'AbortError',
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each(LLM_TEXT_ADAPTERS)(
    'cancels %s while waiting for headers',
    async (adapterType) => {
      for (const stream of [false, true]) {
        const controller = new AbortController()
        let providerSignal!: AbortSignal
        const fetchMock = vi
          .fn()
          .mockImplementation((_url: string, init: RequestInit) => {
            providerSignal = init.signal as AbortSignal
            return new Promise((_resolve, reject) => {
              providerSignal.addEventListener(
                'abort',
                () => reject(providerSignal.reason),
                { once: true },
              )
            })
          })
        vi.stubGlobal('fetch', fetchMock)
        const pending = run(stream, {
          ...input,
          adapterType,
          signal: controller.signal,
        })
        const expected = expect(pending).rejects.toMatchObject({
          name: 'AbortError',
        })
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        controller.abort()
        await expected
        expect(providerSignal.aborted).toBe(true)
      }
    },
  )

  it.each([false, true])(
    'cancels a blocked body reader (stream=%s)',
    async (stream) => {
      const controller = new AbortController()
      const cancel = vi.fn()
      let providerSignal!: AbortSignal
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
          providerSignal = init.signal as AbortSignal
          return new Response(new ReadableStream<Uint8Array>({ cancel }))
        }),
      )
      const pending = run(stream, { ...input, signal: controller.signal })
      const expected = expect(pending).rejects.toMatchObject({
        name: 'AbortError',
      })
      await flush()
      controller.abort()
      await expected
      expect(providerSignal.aborted).toBe(true)
      expect(cancel).toHaveBeenCalledTimes(1)
    },
  )

  it.each([false, true])(
    'reports a stalled body as a provider timeout (stream=%s)',
    async (stream) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const cancel = vi.fn()
      let providerSignal!: AbortSignal
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
          providerSignal = init.signal as AbortSignal
          return new Response(new ReadableStream<Uint8Array>({ cancel }))
        }),
      )
      const pending = run(stream, input)
      const expected = expect(pending).rejects.toMatchObject({
        errorCode: 'PROVIDER_TIMEOUT',
        httpStatus: 504,
        i18nKey: 'errors.provider.timeout',
      })
      await flush()
      await vi.advanceTimersByTimeAsync(
        stream
          ? LLM_TEXT_TIMEOUTS_MS.STREAM_HEADERS
          : LLM_TEXT_TIMEOUTS_MS.COMPLETION,
      )
      await expected
      expect(providerSignal.aborted).toBe(true)
      expect(cancel).toHaveBeenCalledTimes(1)
    },
  )

  it.each([false, true])(
    'preserves a timeout while reading a non-success body (stream=%s)',
    async (stream) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const cancel = vi.fn()
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            status: 502,
          }),
        ),
      )
      const pending = run(stream, input)
      const expected = expect(pending).rejects.toMatchObject({
        errorCode: 'PROVIDER_TIMEOUT',
        httpStatus: 504,
      })
      await flush()
      await vi.advanceTimersByTimeAsync(
        stream
          ? LLM_TEXT_TIMEOUTS_MS.STREAM_HEADERS
          : LLM_TEXT_TIMEOUTS_MS.COMPLETION,
      )
      await expected
      expect(cancel).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps an active stream alive beyond the header window and cancels an early consumer exit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let source!: ReadableStreamDefaultController<Uint8Array>
    let providerSignal!: AbortSignal
    const cancel = vi.fn()
    const encoder = new TextEncoder()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        providerSignal = init.signal as AbortSignal
        return new Response(
          new ReadableStream<Uint8Array>({
            start: (controller) => {
              source = controller
            },
            cancel,
          }),
        )
      }),
    )
    const iterator = llmTextStream(input)[Symbol.asyncIterator]()
    for (let index = 0; index < 4; index++) {
      const pending = iterator.next()
      await flush()
      await vi.advanceTimersByTimeAsync(LLM_TEXT_TIMEOUTS_MS.STREAM_HEADERS - 1)
      expect(providerSignal.aborted).toBe(false)
      source.enqueue(encoder.encode(event(String(index))))
      await expect(pending).resolves.toEqual({
        value: String(index),
        done: false,
      })
    }
    await iterator.return?.()
    expect(providerSignal.aborted).toBe(true)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      media: { imageData: 'https://1.1.1.1/image.png' },
    },
    {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      media: { videoData: ['https://1.1.1.1/video.mp4'] },
    },
    {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      media: { audioData: ['https://1.1.1.1/audio.wav'] },
    },
  ])(
    'cancels media preparation for $adapterType',
    async ({ adapterType, media }) => {
      const controller = new AbortController()
      let downloadSignal!: AbortSignal
      const fetchMock = vi
        .fn()
        .mockImplementation((_url: string, init: RequestInit) => {
          downloadSignal = init.signal as AbortSignal
          return new Promise((_resolve, reject) => {
            downloadSignal?.addEventListener(
              'abort',
              () => reject(downloadSignal.reason),
              { once: true },
            )
          })
        })
      vi.stubGlobal('fetch', fetchMock)
      const pending = llmTextCompletion({
        ...input,
        ...media,
        adapterType,
        signal: controller.signal,
      })
      const expected = expect(pending).rejects.toMatchObject({
        name: 'AbortError',
      })
      await flush()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      controller.abort()
      await expected
      expect(downloadSignal.aborted).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )
})

describe('Gemini temporary media lifecycle', () => {
  const video = Buffer.alloc(ASSISTANT_MEDIA_LIMITS.geminiInlineMaxBytes)
  const input: LlmTextInput = {
    systemPrompt: 'system',
    userPrompt: 'Describe the video.',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: '' },
    apiKey: 'test-key',
    videoData: 'https://1.1.1.1/video.mp4',
  }
  const file = (name: string, state = 'ACTIVE') => ({
    file: {
      name: `files/${name}`,
      uri: `https://provider.test/files/${name}`,
      mimeType: 'video/mp4',
      state,
    },
  })
  const json = (payload: unknown) => new Response(JSON.stringify(payload))
  const flush = async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve()
  }
  const deleted = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit)?.method === 'DELETE')
      .map(([url]) => String(url))

  beforeEach(() => {
    vi.spyOn(storage, 'fetchAsBuffer').mockResolvedValue({
      buffer: video,
      mimeType: 'video/mp4',
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('cleans a finalized file when processing is cancelled, using an independent deletion signal', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const controller = new AbortController()
    const reason = new DOMException('stopped', 'AbortError')
    let finalized!: () => void
    const finalizedBody = new Promise<void>((resolve) => {
      finalized = resolve
    })
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        if (init.method === 'DELETE') {
          expect(init.signal?.aborted).toBe(false)
          expect(init.signal).not.toBe(controller.signal)
          return new Response(null, { status: 204 })
        }
        if (url === AI_PROVIDER_ENDPOINTS.GEMINI_FILES_UPLOAD)
          return new Response(null, {
            headers: { 'x-goog-upload-url': 'https://upload.test/video' },
          })
        if (url === 'https://upload.test/video')
          return {
            ok: true,
            json: async () => {
              finalized()
              return file('processing', 'PROCESSING')
            },
          }
        throw new Error(`Unexpected request: ${url}`)
      })
    vi.stubGlobal('fetch', fetchMock)
    const expected = expect(
      llmTextCompletion({ ...input, signal: controller.signal }),
    ).rejects.toBe(reason)
    await finalizedBody
    await flush()
    controller.abort(reason)
    await expected
    expect(deleted(fetchMock)).toEqual([
      `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/processing`,
    ])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans a real returned file name even if the remaining upload metadata is invalid', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { 'x-goog-upload-url': 'https://upload.test/video' },
        }),
      )
      .mockResolvedValueOnce(
        json({ file: { name: 'files/invalid-metadata', uri: 123 } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(llmTextCompletion(input)).rejects.toBeInstanceOf(Error)
    expect(deleted(fetchMock)).toEqual([
      `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/invalid-metadata`,
    ])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('waits for a late parallel upload before cleaning every finalized sibling after a failure', async () => {
    const failure = new Error('processing failed')
    let ready!: () => void
    const uploadsStarted = new Promise<void>((resolve) => {
      ready = resolve
    })
    let resolveLate!: (value: Response) => void
    const late = new Promise<Response>((resolve) => {
      resolveLate = resolve
    })
    let uploadIndex = 0
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        if (init.method === 'DELETE') return new Response(null, { status: 204 })
        if (url === AI_PROVIDER_ENDPOINTS.GEMINI_FILES_UPLOAD)
          return new Response(null, {
            headers: {
              'x-goog-upload-url': `https://upload.test/${uploadIndex++}`,
            },
          })
        if (url === 'https://upload.test/0')
          return json(file('first', 'FAILED'))
        if (url === 'https://upload.test/1') {
          ready()
          return late
        }
        throw failure
      })
    vi.stubGlobal('fetch', fetchMock)
    let settled = false
    const outcome = llmTextCompletion({
      ...input,
      videoData: ['https://1.1.1.1/first.mp4', 'https://1.1.1.1/late.mp4'],
    }).then(
      () => {
        settled = true
        return undefined
      },
      (error: unknown) => {
        settled = true
        return error
      },
    )
    await uploadsStarted
    await flush()
    const settledBeforeLateUpload = settled
    const deletedBeforeLateUpload = deleted(fetchMock)
    resolveLate(json(file('late')))
    const result = await outcome
    await flush()
    expect(settledBeforeLateUpload).toBe(false)
    expect(deletedBeforeLateUpload).toEqual([])
    expect(result).toBeInstanceOf(Error)
    expect(deleted(fetchMock).sort()).toEqual([
      `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/first`,
      `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/late`,
    ])
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it.each([false, true])(
    'cleans prepared video when audio preparation fails (cancel=%s)',
    async (cancel) => {
      const controller = new AbortController()
      const reason = cancel
        ? new DOMException('stopped', 'AbortError')
        : new Error('audio download failed')
      vi.mocked(storage.fetchAsBuffer).mockImplementation(async (url) => {
        if (url.endsWith('audio.wav')) {
          if (cancel) controller.abort(reason)
          throw reason
        }
        return { buffer: video, mimeType: 'video/mp4' }
      })
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            headers: { 'x-goog-upload-url': 'https://upload.test/video' },
          }),
        )
        .mockResolvedValueOnce(json(file('before-audio')))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)
      await expect(
        llmTextCompletion({
          ...input,
          signal: controller.signal,
          audioData: ['https://1.1.1.1/audio.wav'],
        }),
      ).rejects.toBe(reason)
      expect(deleted(fetchMock)).toEqual([
        `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/before-audio`,
      ])
      expect(fetchMock).toHaveBeenCalledTimes(3)
    },
  )

  it.each([false, true])(
    'keeps media until the buffered body finishes and cleans it after JSON consumption (invalid=%s)',
    async (invalid) => {
      let source!: ReadableStreamDefaultController<Uint8Array>
      let headers!: () => void
      const headersReady = new Promise<void>((resolve) => {
        headers = resolve
      })
      const fetchMock = vi
        .fn()
        .mockImplementation(async (url: string, init: RequestInit) => {
          if (init.method === 'DELETE')
            return new Response(null, { status: 204 })
          if (url === AI_PROVIDER_ENDPOINTS.GEMINI_FILES_UPLOAD)
            return new Response(null, {
              headers: { 'x-goog-upload-url': 'https://upload.test/video' },
            })
          if (url === 'https://upload.test/video') return json(file('buffered'))
          headers()
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                source = controller
              },
            }),
          )
        })
      vi.stubGlobal('fetch', fetchMock)
      const outcome = llmTextCompletion(input).then(
        (answer) => answer,
        (error: unknown) => error,
      )
      await headersReady
      await flush()
      const deletedBeforeBodyEnd = deleted(fetchMock)
      source.enqueue(
        new TextEncoder().encode(
          invalid
            ? '{invalid json'
            : JSON.stringify({
                candidates: [
                  {
                    content: { parts: [{ text: 'answer' }] },
                    finishReason: 'STOP',
                  },
                ],
              }),
        ),
      )
      source.close()
      const result = await outcome
      expect(deletedBeforeBodyEnd).toEqual([])
      if (invalid) expect(result).toBeInstanceOf(SyntaxError)
      else expect(result).toBe('answer')
      expect(deleted(fetchMock)).toEqual([
        `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/buffered`,
      ])
      expect(fetchMock).toHaveBeenCalledTimes(4)
    },
  )
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

  it.each([
    ['SAFETY', 'ASSISTANT_CONTENT_BLOCKED'],
    ['MAX_TOKENS', 'ASSISTANT_OUTPUT_TRUNCATED'],
    ['RECITATION', 'ASSISTANT_NO_TEXT_RESPONSE'],
    [undefined, 'ASSISTANT_NO_TEXT_RESPONSE'],
  ])(
    'preserves the failure reason when parts is omitted (%s)',
    async (finishReason, errorCode) => {
      respond({ candidates: [{ content: { role: 'model' }, finishReason }] })
      await expect(ask()).rejects.toMatchObject({ errorCode })
    },
  )

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

describe('LLM provider response regressions', () => {
  const adapters = [
    AI_ADAPTER_TYPES.OPENAI,
    AI_ADAPTER_TYPES.DEEPSEEK,
    AI_ADAPTER_TYPES.XAI,
    AI_ADAPTER_TYPES.GEMINI,
    AI_ADAPTER_TYPES.ANTHROPIC,
  ]
  const answer = '{"finished":true,"message":"ok"}'
  function input(adapterType: AI_ADAPTER_TYPES): LlmTextInput {
    return {
      adapterType,
      providerConfig: { label: 'regression', baseUrl: '' },
      apiKey: 'test-only',
      systemPrompt: 'Return JSON only.',
      userPrompt: 'Return JSON with a message.',
      responseFormat: 'json_object',
      providerManagedOutput: true,
    }
  }
  function respond(payload: unknown, stream = false) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async () =>
          new Response(stream ? (payload as string) : JSON.stringify(payload), {
            status: 200,
            headers: {
              'content-type': stream ? 'text/event-stream' : 'application/json',
            },
          }),
      ),
    )
  }
  function sse(...frames: unknown[]) {
    return frames
      .map((frame) => 'data: ' + JSON.stringify(frame) + '\n\n')
      .join('')
  }
  async function consume(adapter: AI_ADAPTER_TYPES) {
    let text = ''
    for await (const part of llmTextStream(input(adapter))) text += part
    return text
  }
  afterEach(() => vi.unstubAllGlobals())
  describe('compatibility audit: protocol success', () => {
    it.each(adapters)('%s buffered JSON', async (adapter) => {
      respond(
        adapter === AI_ADAPTER_TYPES.GEMINI
          ? {
              candidates: [
                {
                  content: { parts: [{ text: answer }] },
                  finishReason: 'STOP',
                },
              ],
            }
          : adapter === AI_ADAPTER_TYPES.ANTHROPIC
            ? {
                content: [{ type: 'text', text: answer }],
                stop_reason: 'end_turn',
              }
            : {
                choices: [
                  { message: { content: answer }, finish_reason: 'stop' },
                ],
              },
      )
      await expect(llmTextCompletion(input(adapter))).resolves.toBe(answer)
    })
    it.each(adapters)('%s streamed JSON', async (adapter) => {
      respond(
        adapter === AI_ADAPTER_TYPES.GEMINI
          ? sse({
              candidates: [
                {
                  content: { parts: [{ text: answer }] },
                  finishReason: 'STOP',
                },
              ],
            })
          : adapter === AI_ADAPTER_TYPES.ANTHROPIC
            ? sse(
                {
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text: answer },
                },
                { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
                { type: 'message_stop' },
              )
            : sse(
                {
                  choices: [
                    { delta: { content: answer }, finish_reason: null },
                  ],
                },
                { choices: [{ delta: {}, finish_reason: 'stop' }] },
              ) + 'data: [DONE]\n\n',
        true,
      )
      await expect(consume(adapter)).resolves.toBe(answer)
    })
  })
  describe('compatibility audit: required failure handling', () => {
    it.each([
      AI_ADAPTER_TYPES.OPENAI,
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.XAI,
    ])('%s must report stream output limit', async (adapter) => {
      respond(
        sse({ choices: [{ delta: {}, finish_reason: 'length' }] }) +
          'data: [DONE]\n\n',
        true,
      )
      await expect(consume(adapter)).rejects.toMatchObject({
        errorCode: 'ASSISTANT_OUTPUT_TRUNCATED',
      })
    })
    it('OpenAI must report streamed refusal', async () => {
      respond(
        sse({
          choices: [
            {
              delta: { refusal: 'Request declined' },
              finish_reason: 'content_filter',
            },
          ],
        }) + 'data: [DONE]\n\n',
        true,
      )
      await expect(consume(AI_ADAPTER_TYPES.OPENAI)).rejects.toMatchObject({
        errorCode: 'PROVIDER_REFUSED',
      })
    })
    it('Gemini must report streamed MAX_TOKENS without parts', async () => {
      respond(
        sse({
          candidates: [
            { content: { role: 'model' }, finishReason: 'MAX_TOKENS' },
          ],
        }),
        true,
      )
      await expect(consume(AI_ADAPTER_TYPES.GEMINI)).rejects.toMatchObject({
        errorCode: 'ASSISTANT_OUTPUT_TRUNCATED',
      })
    })
    it('Claude must report SSE overloaded_error', async () => {
      respond(
        sse({
          type: 'error',
          error: { type: 'overloaded_error', message: 'Overloaded' },
        }),
        true,
      )
      await expect(consume(AI_ADAPTER_TYPES.ANTHROPIC)).rejects.toMatchObject({
        errorCode: 'PROVIDER_TRANSIENT',
      })
    })
    it.each([AI_ADAPTER_TYPES.DEEPSEEK, AI_ADAPTER_TYPES.XAI])(
      '%s empty completion must preserve a structured error',
      async (adapter) => {
        respond({
          choices: [{ message: { content: null }, finish_reason: 'length' }],
        })
        const error = await llmTextCompletion(input(adapter)).catch((e) => e)
        expect(error).toMatchObject({ errorCode: 'ASSISTANT_OUTPUT_TRUNCATED' })
      },
    )
    it('OpenAI nullable content must not throw schema error', async () => {
      respond({
        choices: [{ message: { content: null }, finish_reason: 'length' }],
        usage: { completion_tokens_details: { reasoning_tokens: 100 } },
      })
      await expect(
        llmTextCompletion(input(AI_ADAPTER_TYPES.OPENAI)),
      ).rejects.toMatchObject({ errorCode: 'PROVIDER_OUTPUT_BUDGET_EXHAUSTED' })
    })
  })

  function textFrame(adapter: AI_ADAPTER_TYPES, text: string) {
    return adapter === AI_ADAPTER_TYPES.GEMINI
      ? { candidates: [{ content: { parts: [{ text }] } }] }
      : adapter === AI_ADAPTER_TYPES.ANTHROPIC
        ? { type: 'content_block_delta', delta: { type: 'text_delta', text } }
        : { choices: [{ delta: { content: text } }] }
  }
  function stopFrame(adapter: AI_ADAPTER_TYPES) {
    return adapter === AI_ADAPTER_TYPES.GEMINI
      ? sse({ candidates: [{ finishReason: 'STOP' }] })
      : adapter === AI_ADAPTER_TYPES.ANTHROPIC
        ? sse({ type: 'message_stop' })
        : 'data: [DONE]\n\n'
  }
  it.each(adapters)('%s empty stream is classified', async (adapter) => {
    respond(stopFrame(adapter), true)
    await expect(consume(adapter)).rejects.toMatchObject({
      errorCode: 'ASSISTANT_NO_TEXT_RESPONSE',
    })
  })
  it.each(adapters)('%s whitespace is not a response', async (adapter) => {
    respond(sse(textFrame(adapter, '  \n')) + stopFrame(adapter), true)
    await expect(consume(adapter)).rejects.toMatchObject({
      errorCode: 'ASSISTANT_NO_TEXT_RESPONSE',
    })
  })
  it.each(adapters)(
    '%s EOF without terminal event rejects even valid JSON',
    async (adapter) => {
      respond(sse(textFrame(adapter, answer)), true)
      await expect(consume(adapter)).rejects.toMatchObject({
        errorCode: 'ASSISTANT_OUTPUT_TRUNCATED',
      })
    },
  )
  it.each(adapters)(
    '%s partial text followed by output limit rejects',
    async (adapter) => {
      const terminal =
        adapter === AI_ADAPTER_TYPES.GEMINI
          ? { candidates: [{ finishReason: 'MAX_TOKENS' }] }
          : adapter === AI_ADAPTER_TYPES.ANTHROPIC
            ? { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }
            : { choices: [{ delta: {}, finish_reason: 'length' }] }
      respond(
        sse(textFrame(adapter, answer), terminal) + stopFrame(adapter),
        true,
      )
      await expect(consume(adapter)).rejects.toMatchObject({
        errorCode: 'ASSISTANT_OUTPUT_TRUNCATED',
      })
    },
  )
  it.each(adapters)(
    '%s SSE error after partial text rejects',
    async (adapter) => {
      respond(
        sse(textFrame(adapter, answer), {
          error: { code: 503, message: 'Service unavailable' },
        }),
        true,
      )
      await expect(consume(adapter)).rejects.toMatchObject({
        errorCode: 'PROVIDER_TRANSIENT',
      })
    },
  )
  it.each(adapters)(
    '%s malformed event cannot turn into successful JSON',
    async (adapter) => {
      respond(
        sse(textFrame(adapter, answer)) + 'data: null\n\n' + stopFrame(adapter),
        true,
      )
      await expect(consume(adapter)).rejects.toMatchObject({
        errorCode: 'ASSISTANT_OUTPUT_TRUNCATED',
      })
    },
  )
  it('DeepSeek resource exhaustion is transient', async () => {
    respond(
      sse({
        choices: [{ delta: {}, finish_reason: 'insufficient_system_resource' }],
      }),
      true,
    )
    await expect(consume(AI_ADAPTER_TYPES.DEEPSEEK)).rejects.toMatchObject({
      errorCode: 'PROVIDER_TRANSIENT',
    })
  })
  it('Gemini prompt block is preserved in streams', async () => {
    respond(sse({ promptFeedback: { blockReason: 'SAFETY' } }), true)
    await expect(consume(AI_ADAPTER_TYPES.GEMINI)).rejects.toMatchObject({
      errorCode: 'ASSISTANT_CONTENT_BLOCKED',
    })
  })
  it.each(adapters)(
    '%s buffered partial output is not accepted as complete',
    async (adapter) => {
      respond(
        adapter === AI_ADAPTER_TYPES.GEMINI
          ? {
              candidates: [
                {
                  content: { parts: [{ text: answer }] },
                  finishReason: 'MAX_TOKENS',
                },
              ],
            }
          : adapter === AI_ADAPTER_TYPES.ANTHROPIC
            ? {
                content: [{ type: 'text', text: answer }],
                stop_reason: 'max_tokens',
              }
            : {
                choices: [
                  { message: { content: answer }, finish_reason: 'length' },
                ],
              },
      )
      await expect(llmTextCompletion(input(adapter))).rejects.toMatchObject({
        errorCode: 'ASSISTANT_OUTPUT_TRUNCATED',
      })
    },
  )
  it.each(adapters)(
    '%s transport failure retains a classified stream error',
    async (adapter) => {
      let sent = false
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(
          async () =>
            new Response(
              new ReadableStream({
                pull(controller) {
                  if (!sent) {
                    sent = true
                    controller.enqueue(
                      new TextEncoder().encode(sse(textFrame(adapter, answer))),
                    )
                  } else controller.error(new TypeError('terminated'))
                },
              }),
            ),
        ),
      )
      await expect(consume(adapter)).rejects.toMatchObject({
        errorCode: 'ASSISTANT_OUTPUT_TRUNCATED',
      })
    },
  )
  it.each([
    AI_ADAPTER_TYPES.OPENAI,
    AI_ADAPTER_TYPES.DEEPSEEK,
    AI_ADAPTER_TYPES.XAI,
  ])('%s refusal after partial JSON is preserved', async (adapter) => {
    respond(
      sse(textFrame(adapter, answer), {
        choices: [
          { delta: { refusal: 'Declined' }, finish_reason: 'content_filter' },
        ],
      }) + stopFrame(adapter),
      true,
    )
    await expect(consume(adapter)).rejects.toMatchObject({
      errorCode: 'PROVIDER_REFUSED',
    })
  })
  it.each(adapters)('%s buffered empty text is classified', async (adapter) => {
    respond(
      adapter === AI_ADAPTER_TYPES.GEMINI
        ? { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }
        : adapter === AI_ADAPTER_TYPES.ANTHROPIC
          ? { content: [], stop_reason: 'end_turn' }
          : {
              choices: [{ message: { content: null }, finish_reason: 'stop' }],
            },
    )
    await expect(llmTextCompletion(input(adapter))).rejects.toMatchObject({
      errorCode: 'ASSISTANT_NO_TEXT_RESPONSE',
    })
  })
  it('nullable SSE error code preserves the provider failure', async () => {
    respond(
      sse({
        error: {
          type: 'server_error',
          code: null,
          message: 'Internal server error',
        },
      }),
      true,
    )
    await expect(consume(AI_ADAPTER_TYPES.OPENAI)).rejects.toMatchObject({
      errorCode: 'PROVIDER_ERROR',
    })
  })
})

describe('llmNativeWebSearch（owner 2026-09-30：各家用自带联网）', () => {
  const base = {
    systemPrompt: 'sys',
    query: '卡提希娅 官方立绘',
    apiKey: 'test-key',
  }

  it('Gemini / OpenAI / Claude / Grok 有自带联网，DeepSeek 没有', () => {
    expect(supportsNativeWebSearch(AI_ADAPTER_TYPES.GEMINI)).toBe(true)
    expect(supportsNativeWebSearch(AI_ADAPTER_TYPES.OPENAI)).toBe(true)
    expect(supportsNativeWebSearch(AI_ADAPTER_TYPES.ANTHROPIC)).toBe(true)
    expect(supportsNativeWebSearch(AI_ADAPTER_TYPES.XAI)).toBe(true)
    expect(supportsNativeWebSearch(AI_ADAPTER_TYPES.DEEPSEEK)).toBe(false)
  })

  it('Grok：web_search + x_search；X 搜索的 custom_tool_call 计入调用与查询词', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            { type: 'reasoning', status: 'completed' },
            {
              type: 'web_search_call',
              status: 'completed',
              action: {
                type: 'search',
                query: 'Seedance 2.0',
                sources: [{ type: 'url', url: 'https://wiki.test/seedance' }],
              },
            },
            {
              type: 'custom_tool_call',
              name: 'x_keyword_search',
              input: '{"query":"Seedance 2.0","limit":"10","mode":"Latest"}',
              status: 'completed',
            },
            {
              type: 'custom_tool_call',
              name: 'x_thread_fetch',
              input: '{"post_id":"1"}',
              status: 'completed',
            },
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: '口碑偏正面。',
                  annotations: [
                    {
                      type: 'url_citation',
                      url: 'https://x.com/i/status/1',
                      title: 'https://x.com/i/status/1',
                      start_index: 0,
                      end_index: 0,
                    },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.XAI,
      maxUses: 6,
      providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1/' },
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.x.ai/v1/responses')
    expect(readFetchJson(fetchMock)).toMatchObject({
      model: 'grok-4.7',
      tools: [{ type: 'web_search' }, { type: 'x_search' }],
      max_turns: 6,
      reasoning: { effort: 'low' },
    })
    expect(found).toEqual({
      status: 'searched',
      answer: '口碑偏正面。',
      queries: ['Seedance 2.0'],
      sources: [
        {
          url: 'https://x.com/i/status/1',
          title: '',
          excerpt: '',
          excerptKind: 'none',
        },
        {
          url: 'https://wiki.test/seedance',
          title: '',
          excerpt: '',
          excerptKind: 'none',
        },
      ],
    })
  })

  it('Gemini：google_search 工具；引用那几段并成来源摘录', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: '她是鸣潮 2.3 的角色。' }] },
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: 'https://r.test/1', title: 'bilibili.com' } },
                  {
                    web: { uri: 'https://r.test/2', title: 'baike.baidu.com' },
                  },
                ],
                groundingSupports: [
                  {
                    segment: { text: '她是鸣潮 2.3 的角色。' },
                    groundingChunkIndices: [0, 1],
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
    })

    const payload = readFetchJson(fetchMock) as { tools?: unknown[] }
    expect(payload.tools).toEqual([{ google_search: {} }])
    expect(found.answer).toBe('她是鸣潮 2.3 的角色。')
    expect(found.sources).toEqual([
      {
        url: 'https://r.test/1',
        title: 'bilibili.com',
        excerpt: '她是鸣潮 2.3 的角色。',
        excerptKind: 'answer_fragment',
      },
      {
        url: 'https://r.test/2',
        title: 'baike.baidu.com',
        excerpt: '她是鸣潮 2.3 的角色。',
        excerptKind: 'answer_fragment',
      },
    ])
  })

  it('Gemini：Google 跳转链接换成真地址；解不开就留原链接', async () => {
    const redirect =
      'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc'
    const broken =
      'https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz'
    const fetchMock = vi.fn(async (url: string) => {
      if (url === redirect)
        return new Response(null, {
          status: 302,
          headers: { location: 'https://wiki.test/char' },
        })
      if (url === broken) throw new Error('network')
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: '答案' }] },
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: redirect, title: 'wiki.test' } },
                  { web: { uri: broken, title: 'other.test' } },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
    })
    expect(found.sources.map((source) => source.url)).toEqual([
      'https://wiki.test/char',
      broken,
    ])
  })

  it('OpenAI：Responses API 的 web_search，用所选模型；标注前那一句当摘录', async () => {
    const text = '官方立绘偏冷色调。配色以青绿为主。'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: 'web_search_call',
              status: 'completed',
              action: { type: 'search', queries: ['卡提希娅 官方立绘'] },
            },
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text,
                  annotations: [
                    {
                      type: 'url_citation',
                      url: 'https://a.test',
                      title: 'A',
                      start_index: text.length,
                      end_index: text.length,
                    },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: 'gpt-6-luna',
      providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.openai.com/v1/responses',
    )
    const payload = readFetchJson(fetchMock) as {
      model?: string
      tools?: unknown[]
    }
    expect(payload.model).toBe('gpt-6-luna')
    expect(payload.tools).toEqual([{ type: 'web_search' }])
    expect(found.answer).toBe(text)
    expect(found.status).toBe('searched')
    expect(found.queries).toEqual(['卡提希娅 官方立绘'])
    expect(found.sources).toEqual([
      {
        url: 'https://a.test',
        title: 'A',
        excerpt: '配色以青绿为主。',
        excerptKind: 'answer_fragment',
      },
    ])
  })

  it.each([undefined, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5])(
    'Claude：服务端 web_search；被引用的排前，搜到没用的垫后，出错块不当结果 (%s)',
    async (modelId) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [
              { type: 'server_tool_use', id: 'x', name: 'web_search' },
              { type: 'server_tool_use', id: 'y', name: 'web_search' },
              {
                type: 'web_search_tool_result',
                tool_use_id: 'x',
                content: [
                  {
                    type: 'web_search_result',
                    url: 'https://b.test',
                    title: 'B',
                  },
                  {
                    type: 'web_search_result',
                    url: 'https://c.test',
                    title: 'C',
                  },
                ],
              },
              {
                type: 'web_search_tool_result',
                tool_use_id: 'y',
                content: {
                  type: 'web_search_tool_result_error',
                  error_code: 'x',
                },
              },
              {
                type: 'text',
                text: '配色偏青绿。',
                citations: [
                  {
                    type: 'web_search_result_location',
                    url: 'https://c.test',
                    title: 'C',
                    cited_text: '青绿配色',
                  },
                ],
              },
            ],
            stop_reason: 'end_turn',
          }),
          { status: 200 },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const found = await llmNativeWebSearch({
        ...base,
        modelId,
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: { label: 'Anthropic', baseUrl: '' },
      })

      const payload = readFetchJson(fetchMock) as {
        model: string
        tools?: { type: string; name: string }[]
        tool_choice?: unknown
        thinking?: unknown
        temperature?: number
      }
      expect(payload.model).toBe(modelId ?? LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5)
      expect(payload.tools?.[0]).toMatchObject({
        name: 'web_search',
        type: ANTHROPIC_API.WEB_SEARCH_TOOL_TYPE,
      })
      expect(payload.tool_choice).toBeUndefined()
      expect(payload.thinking).toBeUndefined()
      expect(payload.temperature).toBeUndefined()
      expect(found.answer).toBe('配色偏青绿。')
      expect(found.status).toBe('partial')
      expect(found.error).toBe('x')
      expect(found.sources.map((source) => source.url)).toEqual([
        'https://c.test',
        'https://b.test',
      ])
      expect(found.sources[0]?.excerpt).toBe('青绿配色')
      expect(found.sources[0]?.excerptKind).toBe('source_excerpt')
    },
  )
})

describe('native web search receipts', () => {
  const base = {
    systemPrompt: 'sys',
    query: '配色',
    apiKey: 'test-key',
    modelId: 'selected-model',
    providerConfig: { label: 'test', baseUrl: 'https://provider.test' },
  }
  function respond(body: unknown) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const citationMessage = {
    type: 'message',
    content: [
      {
        type: 'output_text',
        text: '来自普通回答。',
        annotations: [
          {
            type: 'url_citation',
            url: 'https://a.test',
            title: 'A',
            start_index: 8,
            end_index: 8,
          },
        ],
      },
    ],
  }
  const completedCall = {
    type: 'web_search_call',
    status: 'completed',
    action: {
      type: 'search',
      queries: ['真正查询'],
      sources: [{ type: 'url', url: 'https://a.test' }],
    },
  }
  const claudeCall = {
    type: 'server_tool_use',
    id: 'search-1',
    name: 'web_search',
    input: { query: '真正查询' },
  }
  const claudeResult = {
    type: 'web_search_tool_result',
    tool_use_id: 'search-1',
    content: [{ type: 'web_search_result', url: 'https://a.test', title: 'A' }],
  }

  it.each([
    [
      '未调用，引用标注不构成调用证据',
      { output: [citationMessage] },
      'not_invoked',
      0,
    ],
    [
      '调用完成但没有来源',
      {
        output: [
          {
            ...completedCall,
            action: { type: 'search', queries: ['真正查询'] },
          },
        ],
      },
      'empty',
      0,
    ],
    [
      'HTTP200内的provider错误',
      { error: { code: 'server_error', message: 'upstream failed' } },
      'failed',
      0,
    ],
    [
      '搜索失败',
      { output: [{ type: 'web_search_call', status: 'failed' }] },
      'failed',
      0,
    ],
    [
      '搜索未完成',
      { output: [{ type: 'web_search_call', status: 'searching' }] },
      'failed',
      0,
    ],
    [
      '完成一枪另一次失败',
      {
        output: [completedCall, { type: 'web_search_call', status: 'failed' }],
      },
      'partial',
      1,
    ],
    [
      '响应因输出限额中断',
      {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [completedCall],
      },
      'partial',
      1,
    ],
  ] as const)('OpenAI %s', async (_label, response, status, count) => {
    respond(response)
    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
    })
    expect(found.status).toBe(status)
    expect(found.sources).toHaveLength(count)
    if (status === 'failed' || status === 'partial')
      expect(found.error).toBeTruthy()
  })

  it('OpenAI成功调用的未引用来源保留为空摘录，仍能核实已调用', async () => {
    const fetchMock = respond({ status: 'completed', output: [completedCall] })
    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
    })
    expect(found).toMatchObject({
      status: 'searched',
      queries: ['真正查询'],
      sources: [{ url: 'https://a.test', excerpt: '', excerptKind: 'none' }],
    })
    expect(readFetchJson(fetchMock)).toMatchObject({
      model: 'selected-model',
      include: ['web_search_call.action.sources'],
    })
  })

  it.each([
    [
      '普通回答',
      {
        candidates: [
          { content: { parts: [{ text: '普通回答' }] }, finishReason: 'STOP' },
        ],
      },
      'not_invoked',
      0,
    ],
    [
      '空groundingMetadata不是查询',
      { candidates: [{ groundingMetadata: {} }] },
      'not_invoked',
      0,
    ],
    [
      '查询确实执行但没有来源',
      {
        candidates: [{ groundingMetadata: { webSearchQueries: ['真正查询'] } }],
      },
      'empty',
      0,
    ],
    [
      'HTTP200内的provider错误',
      { error: { status: 'UNAVAILABLE', message: 'upstream failed' } },
      'failed',
      0,
    ],
    ['安全拦截', { promptFeedback: { blockReason: 'SAFETY' } }, 'failed', 0],
    [
      '搜索结果后输出截断',
      {
        candidates: [
          {
            finishReason: 'MAX_TOKENS',
            groundingMetadata: {
              webSearchQueries: ['真正查询'],
              groundingChunks: [{ web: { uri: 'https://a.test', title: 'A' } }],
            },
          },
        ],
      },
      'partial',
      1,
    ],
  ] as const)('Gemini %s', async (_label, response, status, count) => {
    respond(response)
    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
    })
    expect(found.status).toBe(status)
    expect(found.sources).toHaveLength(count)
    if (status === 'failed' || status === 'partial')
      expect(found.error).toBeTruthy()
  })

  it('Gemini的grounding片段标为模型回答片段并保留真查询', async () => {
    respond({
      candidates: [
        {
          finishReason: 'STOP',
          groundingMetadata: {
            webSearchQueries: ['真正查询'],
            groundingChunks: [{ web: { uri: 'https://a.test', title: 'A' } }],
            groundingSupports: [
              { segment: { text: '模型回答句子' }, groundingChunkIndices: [0] },
            ],
          },
        },
      ],
    })
    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
    })
    expect(found).toMatchObject({
      status: 'searched',
      queries: ['真正查询'],
      sources: [{ excerpt: '模型回答句子', excerptKind: 'answer_fragment' }],
    })
  })

  it.each([
    [
      '普通回答没有服务端搜索',
      {
        content: [
          {
            type: 'text',
            text: '普通回答',
            citations: [
              {
                type: 'web_search_result_location',
                url: 'https://a.test',
                cited_text: '非搜索回执',
              },
            ],
          },
        ],
        stop_reason: 'end_turn',
      },
      'not_invoked',
      0,
    ],
    [
      '配对调用明确返回空列表',
      {
        content: [claudeCall, { ...claudeResult, content: [] }],
        stop_reason: 'end_turn',
      },
      'empty',
      0,
    ],
    [
      'HTTP200工具内错',
      {
        content: [
          claudeCall,
          {
            ...claudeResult,
            content: {
              type: 'web_search_tool_result_error',
              error_code: 'max_uses_exceeded',
            },
          },
        ],
        stop_reason: 'end_turn',
      },
      'failed',
      0,
    ],
    [
      'HTTP200provider错误',
      { error: { type: 'api_error', message: 'upstream failed' } },
      'failed',
      0,
    ],
    [
      '暂停前已返回部分证据',
      { content: [claudeCall, claudeResult], stop_reason: 'pause_turn' },
      'paused',
      1,
    ],
    [
      '暂停尚未返回结果',
      { content: [claudeCall], stop_reason: 'pause_turn' },
      'paused',
      0,
    ],
    [
      '调用缺结果不能当空',
      { content: [claudeCall], stop_reason: 'end_turn' },
      'failed',
      0,
    ],
    [
      '结果缺匹配调用不能归因',
      {
        content: [{ ...claudeResult, tool_use_id: 'other' }],
        stop_reason: 'end_turn',
      },
      'failed',
      0,
    ],
    [
      '非法结果不能当空',
      {
        content: [
          claudeCall,
          { ...claudeResult, content: { unexpected: true } },
        ],
        stop_reason: 'end_turn',
      },
      'failed',
      0,
    ],
    [
      '输出截断保留证据但未完成',
      { content: [claudeCall, claudeResult], stop_reason: 'max_tokens' },
      'partial',
      1,
    ],
  ] as const)('Claude %s', async (_label, response, status, count) => {
    const fetchMock = respond(response)
    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    })
    expect(found.status).toBe(status)
    expect(found.sources).toHaveLength(count)
    if (status === 'failed' || status === 'partial' || status === 'paused')
      expect(found.error).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readFetchJson(fetchMock)).not.toHaveProperty('fallbacks')
  })

  it('Claude只完成一枪另一枪内错时保留部分证据与错误码', async () => {
    respond({
      content: [
        claudeCall,
        claudeResult,
        { ...claudeCall, id: 'search-2' },
        {
          ...claudeResult,
          tool_use_id: 'search-2',
          content: {
            type: 'web_search_tool_result_error',
            error_code: 'unavailable',
          },
        },
      ],
      stop_reason: 'end_turn',
    })
    const found = await llmNativeWebSearch({
      ...base,
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    })
    expect(found).toMatchObject({
      status: 'partial',
      queries: ['真正查询'],
      error: 'unavailable',
      sources: [{ url: 'https://a.test', excerptKind: 'none' }],
    })
  })

  it.each([
    AI_ADAPTER_TYPES.GEMINI,
    AI_ADAPTER_TYPES.OPENAI,
    AI_ADAPTER_TYPES.ANTHROPIC,
    AI_ADAPTER_TYPES.XAI,
  ])('%s native取消不发请求', async (adapterType) => {
    const fetchMock = respond({})
    const controller = new AbortController()
    controller.abort(new Error('cancelled native search'))
    await expect(
      llmNativeWebSearch({ ...base, adapterType, signal: controller.signal }),
    ).rejects.toThrow('cancelled native search')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('assistant image size contracts', () => {
  function reply(adapterType: AI_ADAPTER_TYPES, stream: boolean): Response {
    if (adapterType === AI_ADAPTER_TYPES.GEMINI) {
      const payload = {
        candidates: [
          { content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' },
        ],
      }
      return new Response(
        stream
          ? 'data: ' + JSON.stringify(payload) + '\n\n'
          : JSON.stringify(payload),
      )
    }
    if (adapterType === AI_ADAPTER_TYPES.ANTHROPIC) {
      return new Response(
        stream
          ? [
              {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'ok' },
              },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
              { type: 'message_stop' },
            ]
              .map(
                (event) =>
                  'event: ' +
                  event.type +
                  '\ndata: ' +
                  JSON.stringify(event) +
                  '\n\n',
              )
              .join('')
          : JSON.stringify({
              content: [{ type: 'text', text: 'ok' }],
              stop_reason: 'end_turn',
            }),
      )
    }
    return new Response(
      stream
        ? 'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
        : JSON.stringify({
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          }),
    )
  }

  async function complete(
    adapterType: AI_ADAPTER_TYPES,
    imageData: string | string[],
    stream = false,
    userPrompt = 'Describe the images.',
  ) {
    const input: LlmTextInput = {
      systemPrompt: 'sys',
      userPrompt,
      imageData,
      adapterType,
      providerConfig: { label: adapterType, baseUrl: '' },
      apiKey: 'test-key',
    }
    if (!stream) return llmTextCompletion(input)
    let text = ''
    for await (const chunk of llmTextStream(input)) text += chunk
    return text
  }

  const requestTooLarge = {
    errorCode: 'PROVIDER_REQUEST_TOO_LARGE',
    httpStatus: 413,
    i18nKey: 'errors.provider.requestTooLarge',
  }
  const imageTooLarge = {
    errorCode: GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
    i18nKey: 'errors.generation.reference_image_too_large',
  }

  it.each([false, true])(
    'checks Claude at the encoded 10 MB boundary (stream=%s)',
    async (stream) => {
      const limit = ASSISTANT_IMAGE_LIMITS.anthropic.maxBase64ImageBytes
      const fetchMock = vi.fn(() =>
        Promise.resolve(reply(AI_ADAPTER_TYPES.ANTHROPIC, stream)),
      )
      vi.stubGlobal('fetch', fetchMock)
      const image = 'data:image/png;base64,' + 'A'.repeat(limit)

      await expect(
        complete(AI_ADAPTER_TYPES.ANTHROPIC, image, stream),
      ).resolves.toBe('ok')
      fetchMock.mockClear()
      await expect(
        complete(AI_ADAPTER_TYPES.ANTHROPIC, image + 'AAAA', stream),
      ).rejects.toMatchObject(imageTooLarge)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    { adapterType: AI_ADAPTER_TYPES.XAI, stream: false },
    { adapterType: AI_ADAPTER_TYPES.XAI, stream: true },
    { adapterType: AI_ADAPTER_TYPES.DEEPSEEK, stream: false },
    { adapterType: AI_ADAPTER_TYPES.DEEPSEEK, stream: true },
  ] as const)(
    'checks decoded bytes at the $adapterType single-image boundary (stream=$stream)',
    async ({ adapterType, stream }) => {
      const limit = ASSISTANT_IMAGE_LIMITS[adapterType].maxImageBytes
      const fetchMock = vi.fn(() => Promise.resolve(reply(adapterType, stream)))
      vi.stubGlobal('fetch', fetchMock)
      const image =
        'data:image/png;base64,' + Buffer.alloc(limit).toString('base64')

      await expect(complete(adapterType, image, stream)).resolves.toBe('ok')
      fetchMock.mockClear()
      const oversized =
        'data:image/png;base64,' + Buffer.alloc(limit + 1).toString('base64')
      await expect(
        complete(adapterType, oversized, stream),
      ).rejects.toMatchObject(imageTooLarge)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([false, true])(
    'enforces the Gemini inline budget without a URL-only bypass (stream=%s)',
    async (stream) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const image =
        'data:image/png;base64,' +
        'A'.repeat(ASSISTANT_IMAGE_LIMITS.gemini.maxRequestBytes + 4)

      await expect(
        complete(AI_ADAPTER_TYPES.GEMINI, image, stream),
      ).rejects.toMatchObject(requestTooLarge)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    { adapterType: AI_ADAPTER_TYPES.GEMINI, base64Bytes: 36_000_000, count: 3 },
    {
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      base64Bytes: 9_000_000,
      count: 4,
    },
    {
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      base64Bytes: 20_000_000,
      count: 3,
    },
  ])(
    'counts all inline images toward the $adapterType request budget',
    async ({ adapterType, base64Bytes, count }) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const image = 'data:image/png;base64,' + 'A'.repeat(base64Bytes)

      await expect(
        complete(adapterType, Array<string>(count).fill(image)),
      ).rejects.toMatchObject(requestTooLarge)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('includes UTF-8 text and JSON overhead in the Gemini request limit', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const limit = ASSISTANT_IMAGE_LIMITS.gemini.maxRequestBytes
    const image = 'data:image/png;base64,' + 'A'.repeat((limit - 1024) / 2)

    await expect(
      complete(
        AI_ADAPTER_TYPES.GEMINI,
        [image, image],
        false,
        '猫'.repeat(350),
      ),
    ).rejects.toMatchObject(requestTooLarge)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('includes Claude system instructions in the whole request budget', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      llmTextCompletion({
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        providerConfig: { label: 'Claude', baseUrl: '' },
        apiKey: 'test-key',
        systemPrompt: 'A'.repeat(
          ASSISTANT_IMAGE_LIMITS.anthropic.maxRequestBytes,
        ),
        userPrompt: 'Describe the image.',
        imageData: 'data:image/png;base64,aGVsbG8=',
      }),
    ).rejects.toMatchObject(requestTooLarge)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('bounds the next Gemini download by the remaining encoded budget', async () => {
    const limit = ASSISTANT_IMAGE_LIMITS.gemini.maxRequestBytes
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('abc', {
          headers: { 'content-type': 'image/png', 'content-length': '3' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('unread', {
          headers: {
            'content-type': 'image/png',
            'content-length': String((limit / 4) * 3),
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      complete(AI_ADAPTER_TYPES.GEMINI, [
        'https://cdn.example.com/first.png',
        'https://cdn.example.com/second.png',
        'https://cdn.example.com/third.png',
      ]),
    ).rejects.toMatchObject(requestTooLarge)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('cleans up uploaded Gemini video when the combined image request is too large', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(Buffer.alloc(20 * 1024 * 1024), {
          headers: { 'content-type': 'video/mp4' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { 'x-goog-upload-url': 'https://upload.example.com/video' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            file: {
              name: 'files/reference-video',
              uri: 'https://generativelanguage.googleapis.com/v1beta/files/reference-video',
              mimeType: 'video/mp4',
              state: 'ACTIVE',
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      llmTextCompletion({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        providerConfig: { label: 'Gemini', baseUrl: '' },
        apiKey: 'test-key',
        systemPrompt: 'A'.repeat(ASSISTANT_IMAGE_LIMITS.gemini.maxRequestBytes),
        userPrompt: 'Describe these references.',
        imageData: 'data:image/png;base64,aGVsbG8=',
        videoData: 'https://cdn.example.com/reference.mp4',
      }),
    ).rejects.toMatchObject(requestTooLarge)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/reference-video`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it.each([
    AI_ADAPTER_TYPES.ANTHROPIC,
    AI_ADAPTER_TYPES.XAI,
    AI_ADAPTER_TYPES.DEEPSEEK,
  ])(
    'leaves remote image sizing to %s without downloading or imposing a local cap',
    async (adapterType) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => reply(adapterType, false))
      vi.stubGlobal('fetch', fetchMock)
      const imageUrl = 'https://cdn.example.com/original.png'

      await expect(complete(adapterType, imageUrl)).resolves.toBe('ok')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).not.toBe(imageUrl)
    },
  )

  it.each(LLM_TEXT_ADAPTERS)(
    'reports %s upstream payload errors separately from single-image errors',
    async (adapterType) => {
      for (const stream of [false, true]) {
        for (const status of [400, 413]) {
          const fetchMock = vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                error: { message: 'Request body exceeds the maximum size.' },
              }),
              { status },
            ),
          )
          vi.stubGlobal('fetch', fetchMock)
          await expect(
            complete(adapterType, 'data:image/png;base64,aGVsbG8=', stream),
          ).rejects.toMatchObject(requestTooLarge)
        }

        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                error: {
                  type: 'invalid_request_error',
                  message: 'Image exceeds the maximum size.',
                },
              }),
              { status: 400 },
            ),
          ),
        )
        await expect(
          complete(adapterType, 'data:image/png;base64,aGVsbG8=', stream),
        ).rejects.toMatchObject(imageTooLarge)

        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                error: {
                  type: 'invalid_request_error',
                  message: 'Request exceeds the maximum context length.',
                },
              }),
              { status: 400 },
            ),
          ),
        )
        await expect(
          complete(adapterType, 'data:image/png;base64,aGVsbG8=', stream),
        ).rejects.toMatchObject({
          errorCode: 'PROVIDER_CONTEXT_LIMIT_EXCEEDED',
          i18nKey: 'errors.provider.contextLimitExceeded',
        })

        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                error: { message: 'Request exceeds the rate limit.' },
              }),
              { status: 429 },
            ),
          ),
        )
        await expect(
          complete(adapterType, 'data:image/png;base64,aGVsbG8=', stream),
        ).rejects.toMatchObject({
          errorCode: 'PROVIDER_RATE_LIMITED',
          i18nKey: 'errors.provider.rateLimited',
        })
      }
    },
  )
})

/** 思考档位 chip（2026-10-10）：旧内核也照档位发，没传就照旧。 */
describe('reasoningEffort', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubFetch(body: unknown) {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify(body), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const OPENAI_REPLY = { choices: [{ message: { content: 'ok' } }] }

  it('OpenAI 官方端点发 reasoning_effort', async () => {
    const fetchMock = stubFetch(OPENAI_REPLY)
    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
      apiKey: 'sk-test',
      reasoningEffort: 'high',
    })
    expect(readFetchJson(fetchMock).reasoning_effort).toBe('high')
  })

  it('Grok 照档位发，替掉默认的 low', async () => {
    const fetchMock = stubFetch(OPENAI_REPLY)
    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.XAI,
      providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
      apiKey: 'xai-test',
      modelId: LLM_TEXT_MODEL_IDS.XAI_GROK_4_7,
      reasoningEffort: 'medium',
    })
    expect(readFetchJson(fetchMock).reasoning_effort).toBe('medium')
  })

  it('DeepSeek 只有 low / high / max：Medium → high，High → max', async () => {
    const fetchMock = stubFetch(OPENAI_REPLY)
    for (const reasoningEffort of ['low', 'medium', 'high'] as const) {
      await llmTextCompletion({
        systemPrompt: 'sys',
        userPrompt: 'user',
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        providerConfig: {
          label: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
        },
        apiKey: 'sk-deepseek',
        reasoningEffort,
      })
    }
    expect(
      [0, 1, 2].map((i) => readFetchJson(fetchMock, i).reasoning_effort),
    ).toEqual(['low', 'high', 'max'])
  })

  it('Claude 走 output_config.effort，与结构化输出并存', async () => {
    const fetchMock = stubFetch({ content: [{ type: 'text', text: '{}' }] })
    const schema = {
      type: 'object',
      properties: {},
      additionalProperties: false,
    }
    await llmTextCompletion({
      systemPrompt: 'Return json.',
      userPrompt: 'user',
      modelId: LLM_TEXT_MODEL_IDS.CLAUDE_HAIKU_5_5,
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      providerConfig: {
        label: 'Anthropic',
        baseUrl: 'https://api.anthropic.com',
      },
      apiKey: 'sk-ant-test',
      responseFormat: 'json_object',
      jsonSchema: schema,
      reasoningEffort: 'low',
    })
    expect(readFetchJson(fetchMock).output_config).toEqual({
      format: { type: 'json_schema', schema },
      effort: 'low',
    })
  })

  it('Gemini 写进 thinkingConfig.thinkingLevel', async () => {
    const fetchMock = stubFetch({
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    })
    await llmTextCompletion({
      systemPrompt: 'sys',
      userPrompt: 'user',
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: {
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      apiKey: 'test-key',
      reasoningEffort: 'high',
    })
    const body = readFetchJson(fetchMock) as {
      generationConfig: { thinkingConfig?: unknown }
    }
    expect(body.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'high',
    })
  })
})
