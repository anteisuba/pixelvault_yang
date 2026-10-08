import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockResolveVisionRoute = vi.fn()
vi.mock('@/services/vision/vision-route.service', () => ({
  resolveVisionRoute: (...args: unknown[]) => mockResolveVisionRoute(...args),
}))

const mockCompleteVisionStructured = vi.fn()
vi.mock('@/services/vision/vision-structured-output', () => ({
  completeVisionStructured: (...args: unknown[]) =>
    mockCompleteVisionStructured(...args),
  VISION_JSON_CONTRACT: 'json',
  VISION_SAFETY_PREAMBLE: 'data',
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import type { AssistantOperatorCanvasSnapshot } from '@/types/assistant-operator'

import {
  lookAtEditFrames,
  planEditDeskFrames,
} from './assistant-edit-look.service'

const CDN = 'https://cdn.test'

type EditDesk = NonNullable<AssistantOperatorCanvasSnapshot['editDesk']>

const CLIP = {
  track: 'video' as const,
  sourceNodeId: 'v1',
  sourceName: '镜头 1',
  inSec: 2,
  outSec: 6,
  speed: 1,
}

const EDIT_DESK: EditDesk = {
  timeline: {
    name: '短片',
    durationSec: 6,
    aspect: '16:9',
    resolution: '1080p',
    clips: [
      // c1 在时间线 0–4 秒，素材入点 2 秒。
      { ...CLIP, clipId: 'c1', index: 0, startSec: 0, endSec: 4 },
      // c2 两倍速：时间线 4–6 秒 = 素材 0–4 秒。
      {
        ...CLIP,
        clipId: 'c2',
        index: 1,
        startSec: 4,
        endSec: 6,
        inSec: 0,
        outSec: 4,
        speed: 2,
      },
      {
        ...CLIP,
        clipId: 'a1',
        track: 'audio',
        index: 0,
        sourceNodeId: 'voice',
        startSec: 0,
        endSec: 2,
      },
    ],
    texts: [],
  },
  assets: [
    {
      nodeId: 'v1',
      name: '镜头 1',
      kind: 'video',
      track: 'video',
      durationSec: 8,
    },
    { nodeId: 'voice', name: '台词', kind: 'audio', track: 'audio' },
  ],
  videoUrls: [{ nodeId: 'v1', url: `${CDN}/shots/v1.mp4` }],
}

const frameUrl = (time: string) =>
  `${CDN}/cdn-cgi/media/mode=frame,time=${time},fit=scale-down,width=512,format=jpg/${CDN}/shots/v1.mp4`

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockImplementation(
    async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      }),
  )
  mockResolveVisionRoute.mockResolvedValue({
    route: { adapterType: 'gemini' },
    borrowed: false,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('planEditDeskFrames（看片 2b）', () => {
  it('时间线秒按裁剪与倍速换成素材秒；落在段外是一句原因，不去截', () => {
    const c1 = planEditDeskFrames(EDIT_DESK, { clipId: 'c1', times: [1.5, 4] })
    expect(c1).toMatchObject({
      ok: true,
      plans: [
        { label: '1.5s on the timeline', url: frameUrl('3500ms') },
        { label: '4s on the timeline', url: null },
      ],
    })

    const c2 = planEditDeskFrames(EDIT_DESK, { clipId: 'c2', times: [5] })
    expect(c2).toMatchObject({ ok: true, plans: [{ url: frameUrl('2000ms') }] })
  })

  it('段在用旧版时截它自己那一版（4a）', () => {
    const plan = planEditDeskFrames(
      {
        ...EDIT_DESK,
        videoUrls: [
          { nodeId: 'v1', url: `${CDN}/shots/v1.mp4` },
          { nodeId: 'v1', clipId: 'c2', url: `${CDN}/shots/old.mp4` },
        ],
      },
      { clipId: 'c2', times: [5] },
    )
    expect(plan.ok && plan.plans[0]?.url).toBe(
      frameUrl('2000ms').replace('/shots/v1.mp4', '/shots/old.mp4'),
    )
    // c1 没另列：照样截卡的当前版
    const c1 = planEditDeskFrames(
      {
        ...EDIT_DESK,
        videoUrls: [
          { nodeId: 'v1', url: `${CDN}/shots/v1.mp4` },
          { nodeId: 'v1', clipId: 'c2', url: `${CDN}/shots/old.mp4` },
        ],
      },
      { clipId: 'c1', times: [1.5] },
    )
    expect(c1.ok && c1.plans[0]?.url).toBe(frameUrl('3500ms'))
  })

  it('不给 times 就看头、中、尾', () => {
    const plan = planEditDeskFrames(EDIT_DESK, { clipId: 'c1' })
    expect(plan.ok && plan.plans.map((entry) => entry.label)).toEqual([
      '0.4s on the timeline',
      '2s on the timeline',
      '3.6s on the timeline',
    ])
  })

  it('视频卡按素材秒看；过了片尾不去截', () => {
    const plan = planEditDeskFrames(EDIT_DESK, { nodeId: 'v1', times: [1, 9] })
    expect(plan).toMatchObject({
      ok: true,
      plans: [
        { label: '1s into the take', url: frameUrl('1000ms') },
        { label: '9s into the take', url: null },
      ],
    })
  })

  it('错了退回一句能照着改的话', () => {
    const reasonOf = (args: Parameters<typeof planEditDeskFrames>[1]) => {
      const plan = planEditDeskFrames(EDIT_DESK, args)
      return plan.ok ? null : plan.reason
    }
    expect(reasonOf({ clipId: 'c1', nodeId: 'v1' })).toContain('exactly one')
    expect(reasonOf({ clipId: 'nope' })).toContain('editDesk.timeline.clips')
    expect(reasonOf({ clipId: 'a1' })).toContain('audio track')
    expect(reasonOf({ nodeId: 'voice' })).toContain('not a video card')
    expect(planEditDeskFrames(undefined, { clipId: 'c1' }).ok).toBe(false)
    // 快照里没带地址（不在自家 CDN 上）= 截不了。
    expect(
      planEditDeskFrames(
        { ...EDIT_DESK, videoUrls: [] },
        { clipId: 'c1', times: [1] },
      ),
    ).toMatchObject({ ok: false, reason: expect.stringContaining('CDN') })
  })
})

describe('lookAtEditFrames（看片 2b）', () => {
  it('截成的帧交给看图模型，没截成的照实带原因', async () => {
    mockCompleteVisionStructured.mockResolvedValue({
      frames: [{ frame: 1, seen: '中景，少女回头，右手六根手指' }],
      answer: '手坏了',
    })
    const result = await lookAtEditFrames({
      userId: 'user-1',
      plans: [
        { label: '1.5s on the timeline', url: frameUrl('3500ms') },
        { label: '4s on the timeline', url: null, reason: 'outside this clip' },
      ],
      question: '手有没有坏',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockCompleteVisionStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        imageData: ['data:image/jpeg;base64,AQID'],
        userPrompt: expect.stringContaining('手有没有坏'),
      }),
    )
    expect(result).toEqual({
      frames: [
        { label: '1.5s on the timeline', seen: '中景，少女回头，右手六根手指' },
        { label: '4s on the timeline', missed: 'outside this clip' },
      ],
      answer: '手坏了',
      viewed: 1,
    })
  })

  it('一帧都没截成就不调看图模型；看不成返回 null，不抛', async () => {
    await expect(
      lookAtEditFrames({
        userId: 'u',
        plans: [
          { label: '9s into the take', url: null, reason: 'past the end' },
        ],
      }),
    ).resolves.toEqual({
      frames: [{ label: '9s into the take', missed: 'past the end' }],
      answer: null,
      viewed: 0,
    })
    expect(mockCompleteVisionStructured).not.toHaveBeenCalled()

    mockCompleteVisionStructured.mockRejectedValue(new Error('timeout'))
    await expect(
      lookAtEditFrames({
        userId: 'u',
        plans: [{ label: '1s into the take', url: frameUrl('1000ms') }],
      }),
    ).resolves.toBeNull()
  })
})
