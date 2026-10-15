import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  ASSISTANT_KERNEL_IDS,
  ASSISTANT_KERNEL_STORAGE_KEY,
} from '@/constants/assistant-v3'
import { VIDEO_FRAME_CAPTURE_REASONS } from '@/constants/video-analysis'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

/**
 * 看片的**帧生产者接线**。
 *
 * - v3（默认，看图期第二段 · owner 2026-10-15）：被指着的片子（@ / 📎 / 视频台挂着的，最多
 *   两段）按片长抽帧，随 `videoClips` 上去；片子⛔ 不再进 `mentionedAssets`。
 * - 旧内核（本地开关选 v2）的视频域：照旧抽 0/中/末三帧走看片评审（`videoFrames`）。
 *
 * ⭐ 单独一份文件：宿主的域要按用例换（`vi.mock` 是模块级的）。
 */

const streamAssistantOperatorAPI = vi.hoisted(() => vi.fn())
const captureVideoEndpointFrames = vi.hoisted(() => vi.fn())
const captureClipFrames = vi.hoisted(() => vi.fn())
const hostDomain = vi.hoisted(() => ({ current: 'video' as 'video' | 'image' }))
const hostSnapshot = vi.hoisted(() => ({
  current: { prompt: '', availableModels: [] } as Record<string, unknown>,
}))

vi.mock('@/lib/api-client/assistant-operator', () => ({
  streamAssistantOperatorAPI,
}))

vi.mock('@/lib/video-frame-capture', () => ({
  captureVideoEndpointFrames,
  captureClipFrames,
}))

vi.mock('next-intl', () => {
  const t = Object.assign((key: string) => `i18n:${key}`, { has: () => false })
  return { useLocale: () => 'zh', useTranslations: () => t }
})

vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => ({
    domain: hostDomain.current,
    workspace: hostDomain.current === 'image' ? 'image-natural' : 'video',
    buildSnapshot: () => hostSnapshot.current,
    results: [],
    referenceLimit: 4,
    open: true,
    setOpen: () => {},
    apply: {
      triggerGeneration: () => {},
      getState: () => ({ prompt: '', advancedParams: {} }),
      dispatch: () => {},
      resolveOptionId: () => null,
      addReference: () => {},
      removeReference: () => {},
      addAudioReference: () => {},
      removeAudioReference: () => {},
      setSound: () => {},
      mountUserUrl: () => {},
      unmountUserUrl: () => {},
      setPrimed: () => {},
    },
  }),
}))

const CLIP_URL = 'https://cdn.anteisuba.com/clips/shot.mp4'

const VIDEO_CHIP: StudioOperatorAttachment = {
  id: 'asset-clip',
  url: CLIP_URL,
  label: '雨夜奔跑',
  kind: 'video',
}

const IMAGE_CHIP: StudioOperatorAttachment = {
  id: 'asset-still',
  url: 'https://cdn.anteisuba.com/stills/one.png',
  label: '雨夜海报',
  kind: 'image',
}

function capturedOk(frameCount = 3) {
  return {
    ok: true as const,
    plan: { entries: [] },
    durationSeconds: 6,
    width: 768,
    height: 432,
    frames: Array.from({ length: frameCount }, (_, index) => ({
      index,
      timestampSeconds: index * 1.5 + 0.75,
      dataUrl: `data:image/webp;base64,AAA${String(index)}`,
    })),
  }
}

type Store = typeof import('@/hooks/use-studio-operator-store')
type Operator = typeof import('@/hooks/use-assistant-operator')

let store: Store
let operator: Operator
const requests: AssistantOperatorRequest[] = []

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  requests.length = 0
  hostDomain.current = 'video'
  hostSnapshot.current = { prompt: '', availableModels: [] }
  window.localStorage.clear()
  captureVideoEndpointFrames.mockResolvedValue(capturedOk())
  captureClipFrames.mockResolvedValue(capturedOk(4))
  streamAssistantOperatorAPI.mockImplementation(
    (request: AssistantOperatorRequest) => {
      requests.push(request)
      return Promise.resolve({
        success: true,
        events: {
          [Symbol.asyncIterator]: () => ({
            next: async () => ({ done: true, value: undefined }),
          }),
        },
      })
    },
  )
  store = await import('@/hooks/use-studio-operator-store')
  operator = await import('@/hooks/use-assistant-operator')
})

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

function render() {
  const scope = `user-a:${hostDomain.current === 'image' ? 'image-natural' : 'video'}`
  store.claimOperatorThreadScope(scope, hostDomain.current)
  return renderHook(() => operator.useAssistantOperator(scope))
}

function systemLines(code: string) {
  return store
    .getOperatorState()
    .entries.filter((entry) => entry.kind === 'system' && entry.code === code)
}

describe('v3 看片：被指着的片子按片长抽帧，随 videoClips 上去', () => {
  it('⭐ 📎 一段片子 → 按片长计划抽帧；片子⛔ 不进 mentionedAssets、不走三帧评审', async () => {
    const { result } = render()

    act(() => {
      result.current.send('看看这段哪里有问题', [VIDEO_CHIP])
    })
    await settle()

    expect(captureClipFrames).toHaveBeenCalledWith(CLIP_URL)
    expect(captureVideoEndpointFrames).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.videoClips).toEqual([
      {
        sourceUrl: CLIP_URL,
        label: VIDEO_CHIP.label,
        durationSeconds: 6,
        frames: capturedOk(4).frames,
      },
    ])
    expect(requests[0]?.videoFrames).toBeUndefined()
    expect(requests[0]?.mentionedAssets ?? []).toHaveLength(0)
  })

  it('@ 的视频卡带着卡 id 上去（服务端按它认「这张卡已经在眼前」）', async () => {
    const { result } = render()

    act(() => {
      result.current.send('冲出门这段动作连贯吗', [], {
        mentions: [
          {
            kind: 'video',
            id: 'node-1',
            nodeId: 'node-1',
            label: '冲出门',
            scope: 'canvas',
            url: CLIP_URL,
          },
        ],
      })
    })
    await settle()

    expect(requests[0]?.videoClips).toEqual([
      expect.objectContaining({
        sourceUrl: CLIP_URL,
        label: '冲出门',
        nodeId: 'node-1',
      }),
    ])
  })

  it('⭐ 视频台上挂着的参考视频照样抽帧随请求带着，但标 mounted（不在眼前，look 它才看）', async () => {
    hostSnapshot.current = {
      prompt: '',
      availableModels: [],
      videoReferences: {
        items: [{ url: 'https://cdn.anteisuba.com/refs/ref.mp4' }],
        limit: 3,
      },
    }
    const { result } = render()

    act(() => {
      result.current.send('参考视频里的人动作快吗', [])
    })
    await settle()

    expect(requests[0]?.videoClips).toEqual([
      expect.objectContaining({
        sourceUrl: 'https://cdn.anteisuba.com/refs/ref.mp4',
        label: 'video-1',
        mounted: true,
        frames: capturedOk(4).frames,
      }),
    ])
  })

  it('挂着的不占被指着的两段名额；它没抽成也⛔ 不留系统行（没人问它）', async () => {
    hostSnapshot.current = {
      prompt: '',
      availableModels: [],
      videoReferences: {
        items: [{ url: 'https://cdn.anteisuba.com/refs/ref.mp4' }],
        limit: 3,
      },
    }
    captureClipFrames.mockImplementation(async (url: string) =>
      url.includes('/refs/')
        ? {
            ok: false,
            reason: VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas,
            message: 'tainted',
          }
        : capturedOk(4),
    )
    const chips = [1, 2].map(
      (index): StudioOperatorAttachment => ({
        id: `clip-${index}`,
        url: `https://cdn.anteisuba.com/clips/${index}.mp4`,
        label: `片子${index}`,
        kind: 'video',
      }),
    )
    const { result } = render()

    act(() => {
      result.current.send('两段比一比', chips)
    })
    await settle()

    expect(captureClipFrames).toHaveBeenCalledTimes(3)
    expect(requests[0]?.videoClips?.map((clip) => clip.label)).toEqual([
      '片子1',
      '片子2',
    ])
    expect(systemLines('clipsOverCap')).toHaveLength(0)
    expect(systemLines('videoFramesFailed')).toHaveLength(0)
  })

  it('一轮最多两段：多出来的不抽，线程里留一行说只看前两段（⛔ 不静默）', async () => {
    const chips = [1, 2, 3].map(
      (index): StudioOperatorAttachment => ({
        id: `clip-${index}`,
        url: `https://cdn.anteisuba.com/clips/${index}.mp4`,
        label: `片子${index}`,
        kind: 'video',
      }),
    )
    const { result } = render()

    act(() => {
      result.current.send('三段比一比', chips)
    })
    await settle()

    expect(captureClipFrames).toHaveBeenCalledTimes(2)
    expect(requests[0]?.videoClips?.map((clip) => clip.label)).toEqual([
      '片子1',
      '片子2',
    ])
    const lines = systemLines('clipsOverCap')
    expect(lines).toHaveLength(1)
    expect(lines[0]?.kind === 'system' ? lines[0].count : null).toBe(2)
  })

  it('抽帧失败 → 片子照样上去（没有帧），线程里留一行带原因码的系统行', async () => {
    captureClipFrames.mockResolvedValue({
      ok: false,
      reason: VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas,
      message: 'tainted',
    })
    const { result } = render()

    act(() => {
      result.current.send('看看这段哪里有问题', [VIDEO_CHIP])
    })
    await settle()

    expect(requests).toHaveLength(1)
    expect(requests[0]?.videoClips).toEqual([
      { sourceUrl: CLIP_URL, label: VIDEO_CHIP.label },
    ])
    const line = systemLines('videoFramesFailed')[0]
    expect(line?.kind === 'system' ? line.subject : null).toBe(
      VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas,
    )
  })

  it('图片台也一样（哪里指着片子就看哪里）：视频照旧作为媒体输入发上去，由服务端摘掉', async () => {
    hostDomain.current = 'image'
    const { result } = render()

    act(() => {
      result.current.send('这段的画风', [VIDEO_CHIP, IMAGE_CHIP])
    })
    await settle()

    expect(captureClipFrames).toHaveBeenCalledWith(CLIP_URL)
    expect(requests[0]?.videoClips).toHaveLength(1)
    expect(requests[0]?.mediaAttachments).toEqual([
      { kind: 'video', label: VIDEO_CHIP.label, url: VIDEO_CHIP.url },
    ])
    expect(requests[0]?.mentionedAssets?.map((asset) => asset.url)).toEqual([
      IMAGE_CHIP.url,
    ])
  })

  it('⛔ 没指着片子 → 一帧都不抽', async () => {
    const { result } = render()

    act(() => {
      result.current.send('这张海报怎么样', [IMAGE_CHIP])
    })
    await settle()

    expect(captureClipFrames).not.toHaveBeenCalled()
    expect(requests[0]?.videoClips).toBeUndefined()
  })

  it('抽帧那几秒里带子写「正在抽帧」，跑完复位', async () => {
    const released: (() => void)[] = []
    captureClipFrames.mockImplementation(
      () =>
        new Promise((resolve) => {
          released.push(() => {
            resolve(capturedOk(4))
          })
        }),
    )
    const { result } = render()

    act(() => {
      result.current.send('看看这段哪里有问题', [VIDEO_CHIP])
    })
    await settle()
    expect(store.getOperatorState().capturingFrames).toBe(true)
    expect(requests).toHaveLength(0)

    released[0]?.()
    await settle()
    expect(store.getOperatorState().capturingFrames).toBe(false)
    expect(requests).toHaveLength(1)
  })
})

describe('旧内核（本地开关选 v2）的视频域：照旧抽三帧走看片评审', () => {
  beforeEach(() => {
    window.localStorage.setItem(
      ASSISTANT_KERNEL_STORAGE_KEY,
      ASSISTANT_KERNEL_IDS.v2,
    )
  })

  it('📎 一段片子 → 请求带 videoFrames（三帧）且片子进准入名单', async () => {
    const { result } = render()

    act(() => {
      result.current.send('看看这段哪里有问题', [VIDEO_CHIP])
    })
    await settle()

    expect(captureVideoEndpointFrames).toHaveBeenCalledWith(CLIP_URL)
    expect(captureClipFrames).not.toHaveBeenCalled()
    const frames = requests[0]?.videoFrames
    expect(frames?.sourceUrl).toBe(CLIP_URL)
    expect(frames?.frames).toHaveLength(3)
    expect(requests[0]?.videoClips).toBeUndefined()
    expect(requests[0]?.kernel).toBe(ASSISTANT_KERNEL_IDS.v2)
    expect(requests[0]?.mentionedAssets?.[0]?.url).toBe(CLIP_URL)
  })

  it('域就是判据：`ASSISTANT_PROTOCOL_DOMAIN_IDS.video` 之外不抽三帧', async () => {
    hostDomain.current = 'image'
    const { result } = render()

    act(() => {
      result.current.send('看看这段哪里有问题', [VIDEO_CHIP])
    })
    await settle()

    expect(hostDomain.current).not.toBe(ASSISTANT_PROTOCOL_DOMAIN_IDS.video)
    expect(captureVideoEndpointFrames).not.toHaveBeenCalled()
    expect(requests[0]?.mentionedAssets ?? []).toHaveLength(0)
  })
})
