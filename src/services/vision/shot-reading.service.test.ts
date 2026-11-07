import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  SHOT_READ,
  SHOT_READ_ERROR_CODES,
  SHOT_READ_FIELD_IDS,
} from '@/constants/shot-reading'
import { SHOT_SPEC_LIMITS } from '@/constants/shot-spec'
import { VISION_LIMITS } from '@/constants/vision'
import type { ShotReadShot } from '@/types/shot-reading'

/**
 * 读镜 service（H4b）。只假边界（docs/references/testing.md「测试标准」）：
 * - `llm-text.service`：key → 线路（读库 + 解密）与模型那一次调用；
 * - 全局 `fetch`：量片子的 HEAD 与 CDN 截帧。
 * 线路判定、视频档位、截帧地址、结构化输出的打回重试全走真的。
 */

const mockResolveRoute = vi.fn()
const mockCompletion = vi.fn()

vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  resolveLlmTextRoute: (userId: string, apiKeyId: string) =>
    mockResolveRoute(userId, apiKeyId),
  llmTextCompletion: (input: unknown) => mockCompletion(input),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const CDN = 'https://cdn.test'
const VIDEO_URL = `${CDN}/ref/film.mp4`

const SHOTS: ShotReadShot[] = [
  { number: 3, startSec: 4.06, endSec: 6.5 },
  { number: 4, startSec: 6.5, endSec: 6.6 },
  { number: 5, startSec: 6.6, endSec: 9.94 },
]

interface CompletionInput {
  systemPrompt: string
  userPrompt: string
  imageData: string[]
  videoData?: string[]
  videoAnalysis?: { fps?: number; startOffset?: number; endOffset?: number }
  maxTokens: number
  adapterType: string
  apiKey: string
}

const fetchCalls: { url: string; method: string }[] = []
let headBytes: number | 'offline' = 12 * 1024 * 1024
/** 截帧失败的那一刻（毫秒，`time=…ms`）。 */
let brokenFrameMs: number | null = null

function stubFetch() {
  vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    fetchCalls.push({ url, method })
    if (method === 'HEAD') {
      if (headBytes === 'offline') throw new Error('offline')
      return new Response(null, {
        headers: { 'content-length': String(headBytes) },
      })
    }
    if (brokenFrameMs !== null && url.includes(`time=${brokenFrameMs}ms`)) {
      return new Response(null, { status: 500 })
    }
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      headers: { 'content-type': 'image/jpeg' },
    })
  })
}

function route(adapterType: AI_ADAPTER_TYPES) {
  mockResolveRoute.mockResolvedValue({
    adapterType,
    providerConfig: getDefaultProviderConfig(adapterType),
    apiKey: 'sk-test',
  })
}

function replies(...bodies: unknown[]) {
  for (const body of bodies) {
    mockCompletion.mockResolvedValueOnce(JSON.stringify(body))
  }
}

function everyShot() {
  return { shots: SHOTS.map((shot) => ({ shot: shot.number })) }
}

function lastCompletion(): CompletionInput {
  const input = mockCompletion.mock.calls.at(-1)?.[0]
  if (!input) throw new Error('the model was not called')
  return input as CompletionInput
}

function frameCalls() {
  return fetchCalls.filter((call) => call.method === 'GET')
}

const { readShots } = await import('@/services/vision/shot-reading.service')

function read(overrides: Partial<Parameters<typeof readShots>[0]> = {}) {
  return readShots({
    userId: 'u1',
    apiKeyId: 'k1',
    locale: 'zh',
    videoUrl: VIDEO_URL,
    fields: [SHOT_READ_FIELD_IDS.description],
    shots: SHOTS,
    ...overrides,
  })
}

beforeEach(() => {
  mockResolveRoute.mockReset()
  mockCompletion.mockReset()
  fetchCalls.length = 0
  headBytes = 12 * 1024 * 1024
  brokenFrameMs = null
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
  stubFetch()
  route(AI_ADAPTER_TYPES.GEMINI)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('readShots', () => {
  it('refuses a key that cannot watch video, before measuring or spending anything', async () => {
    route(AI_ADAPTER_TYPES.OPENAI)

    await expect(read()).rejects.toMatchObject({
      errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED',
    })
    expect(fetchCalls).toEqual([])
    expect(mockCompletion).not.toHaveBeenCalled()
  })

  it('says the reference is too large before taking stills or spending anything', async () => {
    headBytes = ASSISTANT_MEDIA_LIMITS.maxVideoBytes + 1

    await expect(read()).rejects.toMatchObject({
      errorCode: SHOT_READ_ERROR_CODES.videoTooLarge,
    })
    expect(fetchCalls).toEqual([{ url: VIDEO_URL, method: 'HEAD' }])
    expect(mockCompletion).not.toHaveBeenCalled()
  })

  it('goes ahead when the size cannot be measured', async () => {
    headBytes = 'offline'
    replies(everyShot())

    await expect(read()).resolves.toEqual({
      rows: SHOTS.map((shot) => ({ number: shot.number })),
    })
  })

  it('uses only the named key, clips the video to the batch and sends one still per shot', async () => {
    replies(everyShot())

    await read({
      locale: 'ja',
      fields: [SHOT_READ_FIELD_IDS.sizeMove, SHOT_READ_FIELD_IDS.description],
    })

    expect(mockResolveRoute).toHaveBeenCalledWith('u1', 'k1')
    const call = lastCompletion()
    expect(call.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(call.apiKey).toBe('sk-test')
    expect(call.videoData).toEqual([VIDEO_URL])
    // 窗口往外取整到 0.1 秒：4.06 → 4.0，9.94 → 10.0。
    expect(call.videoAnalysis).toEqual({
      fps: SHOT_READ.videoFps,
      startOffset: 4,
      endOffset: 10,
    })
    expect(call.imageData).toHaveLength(SHOTS.length)
    expect(call.imageData[0]).toMatch(/^data:image\/jpeg;base64,/)
    expect(call.userPrompt).toContain('image 1 = shot 3')
    expect(call.userPrompt).toContain('image 3 = shot 5')
    expect(call.userPrompt).toContain(
      'Fill these fields: size, move, description.',
    )
    expect(call.systemPrompt).toContain('Japanese')
    expect(call.maxTokens).toBe(SHOT_READ.maxTokens)
  })

  it('takes each still just inside its shot, or mid-shot when the shot is very short', async () => {
    replies(everyShot())

    await read({ locale: 'en', fields: [SHOT_READ_FIELD_IDS.look] })

    const urls = frameCalls().map((call) => call.url)
    expect(urls).toHaveLength(SHOTS.length)
    expect(urls[0]).toContain('time=4310ms')
    // 6.5–6.6 只有 0.1 秒：取中点。
    expect(urls[1]).toContain('time=6550ms')
    expect(urls[0]).toContain(`width=${SHOT_READ.keyframeWidthPx}`)
    expect(urls[0]).toContain(VIDEO_URL)
  })

  it('keeps going when a still cannot be taken, and renumbers the image map', async () => {
    brokenFrameMs = 4310
    replies(everyShot())

    await read()

    const call = lastCompletion()
    expect(call.imageData).toHaveLength(2)
    expect(call.userPrompt).toContain('image 1 = shot 4')
    expect(call.userPrompt).not.toContain('= shot 3')
  })

  it('bounces a reply that skips a shot and asks once more', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    replies(
      { shots: [{ shot: 3, size: 'wide' }, { shot: 5 }] },
      {
        shots: [
          { shot: 3, size: 'wide' },
          { shot: 4, size: 'close' },
          { shot: 5 },
        ],
      },
    )

    const pending = read({ fields: [SHOT_READ_FIELD_IDS.sizeMove] })
    await vi.advanceTimersByTimeAsync(VISION_LIMITS.retryBaseDelayMs * 2)

    await expect(pending).resolves.toEqual({
      rows: [
        { number: 3, size: 'wide' },
        { number: 4, size: 'close' },
        { number: 5 },
      ],
    })
    expect(mockCompletion).toHaveBeenCalledTimes(2)
  })

  it('returns only the ticked cells, drops off-list sizes, trims and caps text, ignores stray shots', async () => {
    replies({
      shots: [
        {
          shot: 3,
          size: 'Medium Close',
          move: '  缓慢推近  ',
          description: 'x'.repeat(SHOT_READ.descriptionMaxLength + 40),
          look: '冷色调',
        },
        { shot: 4, size: 'over-the-shoulder', move: '', description: null },
        { shot: 5, size: 'wide', move: null, description: '一辆车驶过' },
        { shot: 5, size: 'close', description: 'duplicate' },
        { shot: 99, size: 'wide' },
      ],
    })

    const result = await read({
      fields: [SHOT_READ_FIELD_IDS.sizeMove, SHOT_READ_FIELD_IDS.description],
    })

    expect(result.rows).toEqual([
      {
        number: 3,
        size: 'medium_close',
        move: '缓慢推近',
        description: 'x'.repeat(SHOT_READ.descriptionMaxLength),
      },
      { number: 4 },
      { number: 5, size: 'wide', description: '一辆车驶过' },
    ])
    // 单镜风格没勾：模型回了也不收。
    expect(result.rows[0]).not.toHaveProperty('look')
  })

  it('caps the move and look cells at the shot-card limits', async () => {
    replies({
      shots: [
        {
          shot: 3,
          move: 'm'.repeat(SHOT_SPEC_LIMITS.moveMaxLength + 5),
          look: 'l'.repeat(SHOT_SPEC_LIMITS.lookMaxLength + 5),
        },
        { shot: 4 },
        { shot: 5 },
      ],
    })

    const result = await read({
      locale: 'en',
      fields: [SHOT_READ_FIELD_IDS.sizeMove, SHOT_READ_FIELD_IDS.look],
    })

    expect(result.rows[0]?.move).toHaveLength(SHOT_SPEC_LIMITS.moveMaxLength)
    expect(result.rows[0]?.look).toHaveLength(SHOT_SPEC_LIMITS.lookMaxLength)
  })
})
