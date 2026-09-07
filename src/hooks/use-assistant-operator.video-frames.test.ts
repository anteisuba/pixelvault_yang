import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { VIDEO_FRAME_CAPTURE_REASONS } from '@/constants/video-analysis'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

/**
 * 视频域评审的**帧生产者接线**（第二期最后一环）。
 *
 * ⭐ 为什么单独一份文件而不是并进 `use-assistant-operator.test.ts`：那份把宿主
 * 桩成了图片域（`domain: 'image'`），而本文件要验的第一条恰恰是「域不同，行为不同」
 * —— `vi.mock` 是模块级的，同一份文件里换不了域。
 */

const streamAssistantOperatorAPI = vi.hoisted(() => vi.fn())
const captureVideoEndpointFrames = vi.hoisted(() => vi.fn())
const hostDomain = vi.hoisted(() => ({ current: 'video' as 'video' | 'image' }))

vi.mock('@/lib/api-client/assistant-operator', () => ({
  streamAssistantOperatorAPI,
}))

vi.mock('@/lib/video-frame-capture', () => ({ captureVideoEndpointFrames }))

vi.mock('next-intl', () => {
  const t = Object.assign((key: string) => `i18n:${key}`, { has: () => false })
  return { useLocale: () => 'zh', useTranslations: () => t }
})

vi.mock('@/contexts/studio-operator-host', () => ({
  useStudioOperatorHost: () => ({
    domain: hostDomain.current,
    buildSnapshot: () => ({ prompt: '', availableModels: [] }),
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

function capturedOk() {
  return {
    ok: true as const,
    plan: { entries: [] },
    durationSeconds: 6,
    width: 1024,
    height: 576,
    frames: [0, 1, 2].map((index) => ({
      index,
      timestampSeconds: index * 3,
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
  captureVideoEndpointFrames.mockResolvedValue(capturedOk())
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
  return renderHook(() => operator.useAssistantOperator())
}

describe('视频域评审：请求发出去之前先抽三帧', () => {
  it('@ 了一段片子 → 请求带 videoFrames（三帧）且 sourceUrl 就是那段片子', async () => {
    const { result } = render()

    act(() => {
      result.current.send('看看这段哪里有问题', [VIDEO_CHIP])
    })
    await settle()

    expect(captureVideoEndpointFrames).toHaveBeenCalledWith(CLIP_URL)
    expect(requests).toHaveLength(1)
    const frames = requests[0]?.videoFrames
    expect(frames?.sourceUrl).toBe(CLIP_URL)
    expect(frames?.frames).toHaveLength(3)
    expect(frames?.durationSeconds).toBe(6)
    // ⚠ 那段片子同时得进准入名单，否则服务端按 `unknownAsset` 拒它自己的目标。
    expect(requests[0]?.mentionedAssets?.[0]?.url).toBe(CLIP_URL)
  })

  it('⛔ 目标是图片 → 一帧都不抽（视频域里挂静态图也一样）', async () => {
    const { result } = render()

    act(() => {
      result.current.send('这张海报怎么样', [IMAGE_CHIP])
    })
    await settle()

    expect(captureVideoEndpointFrames).not.toHaveBeenCalled()
    expect(requests[0]?.videoFrames).toBeUndefined()
  })

  it('⛔ 图片域一字不改：@ 视频也不抽帧，且视频不进准入名单', async () => {
    hostDomain.current = 'image'
    const { result } = render()

    act(() => {
      result.current.send('看看这段哪里有问题', [VIDEO_CHIP])
    })
    await settle()

    expect(captureVideoEndpointFrames).not.toHaveBeenCalled()
    expect(requests[0]?.videoFrames).toBeUndefined()
    expect(requests[0]?.mentionedAssets ?? []).toHaveLength(0)
  })

  it('抽帧失败 → 照常发出去，但线程里留一行带原因码的系统行（⛔ 不静默）', async () => {
    captureVideoEndpointFrames.mockResolvedValue({
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
    expect(requests[0]?.videoFrames).toBeUndefined()
    const line = store
      .getOperatorState()
      .entries.find(
        (entry) =>
          entry.kind === 'system' && entry.code === 'videoFramesFailed',
      )
    expect(line).toBeDefined()
    expect(line?.kind === 'system' ? line.subject : null).toBe(
      VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas,
    )
  })

  it('抽帧那几秒里带子写「正在抽帧」，跑完复位', async () => {
    const released: (() => void)[] = []
    captureVideoEndpointFrames.mockImplementation(
      () =>
        new Promise((resolve) => {
          released.push(() => {
            resolve(capturedOk())
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

  it('域就是判据：`ASSISTANT_PROTOCOL_DOMAIN_IDS.video` 之外不触发', () => {
    expect(hostDomain.current).toBe(ASSISTANT_PROTOCOL_DOMAIN_IDS.video)
  })
})
