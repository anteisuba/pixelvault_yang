import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCheckImage = vi.fn()
const mockCheckVideo = vi.fn()
const mockCheckAudio = vi.fn()

vi.mock('@/lib/api-client', () => ({
  checkImageGenerationStatusAPI: (...args: unknown[]) =>
    mockCheckImage(...args),
  checkVideoStatusAPI: (...args: unknown[]) => mockCheckVideo(...args),
  checkAudioStatusAPI: (...args: unknown[]) => mockCheckAudio(...args),
}))

import type { NodeV4, NodeV4Data } from '@/types/node-workflow'

import { useNodeGenerationReconcileV4 } from './use-node-generation-reconcile-v4'

const NOW = '2026-09-08T00:00:00.000Z'

function node(id: string, data: Partial<NodeV4Data> = {}): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'result',
      name: id,
      status: 'running',
      createdAt: NOW,
      ...data,
    } as NodeV4Data,
  }
}

function mount(nodes: NodeV4[]) {
  const setMedia = vi.fn()
  const setRunState = vi.fn()
  const reportFailure = vi.fn()
  const view = renderHook(() =>
    useNodeGenerationReconcileV4({
      nodes,
      setMedia,
      setRunState,
      reportFailure,
    }),
  )
  return { setMedia, setRunState, reportFailure, view }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useNodeGenerationReconcileV4', () => {
  it('没有在飞的 job 就一个探针都不发', async () => {
    mount([node('a', { mediaJobId: undefined })])
    await Promise.resolve()
    expect(mockCheckImage).not.toHaveBeenCalled()
  })

  it('COMPLETED → 回填 url 与 generationId、清掉 job id、状态转 done', async () => {
    mockCheckImage.mockResolvedValue({
      success: true,
      data: {
        status: 'COMPLETED',
        generation: { id: 'gen-1', url: 'https://cdn/a.png' },
      },
    })
    const { setMedia, setRunState } = mount([
      node('a', { mediaJobId: 'job-1' }),
    ])

    await waitFor(() => expect(setMedia).toHaveBeenCalled())
    expect(mockCheckImage).toHaveBeenCalledWith('job-1')
    expect(setMedia).toHaveBeenCalledWith('a', {
      url: 'https://cdn/a.png',
      generationId: 'gen-1',
      mediaJobId: undefined,
      imageSource: 'generated',
    })
    expect(setRunState).toHaveBeenCalledWith('a', 'done')
  })

  it('视频走视频探针，并把 poster 一起回填', async () => {
    mockCheckVideo.mockResolvedValue({
      success: true,
      data: {
        status: 'COMPLETED',
        generation: {
          id: 'gen-2',
          url: 'https://cdn/a.mp4',
          thumbnailUrl: 'https://cdn/a.jpg',
        },
      },
    })
    const { setMedia } = mount([
      node('v', { kind: 'video', subtype: 'shot', mediaJobId: 'job-2' }),
    ])

    await waitFor(() => expect(setMedia).toHaveBeenCalled())
    expect(mockCheckImage).not.toHaveBeenCalled()
    expect(setMedia.mock.calls[0]?.[1]).toMatchObject({
      url: 'https://cdn/a.mp4',
      videoThumbnailUrl: 'https://cdn/a.jpg',
    })
  })

  // ⚠ 还在跑的绝不能被清成失败 —— 那会让一单明明在跑的生成显示成「失败」。
  it('IN_PROGRESS → 什么都不动，留着下一轮再问', async () => {
    mockCheckImage.mockResolvedValue({
      success: true,
      data: { status: 'IN_PROGRESS' },
    })
    const { setMedia, setRunState, reportFailure } = mount([
      node('a', { mediaJobId: 'job-1' }),
    ])

    await waitFor(() => expect(mockCheckImage).toHaveBeenCalled())
    expect(setMedia).not.toHaveBeenCalled()
    expect(setRunState).not.toHaveBeenCalled()
    expect(reportFailure).not.toHaveBeenCalled()
  })

  it('网络抛错 → 同样留着 pending，不当成失败', async () => {
    mockCheckImage.mockRejectedValue(new Error('offline'))
    const { setMedia, setRunState, reportFailure } = mount([
      node('a', { mediaJobId: 'job-1' }),
    ])

    await waitFor(() => expect(mockCheckImage).toHaveBeenCalled())
    expect(setMedia).not.toHaveBeenCalled()
    expect(setRunState).not.toHaveBeenCalled()
    expect(reportFailure).not.toHaveBeenCalled()
  })

  it('FAILED → 清 job id、状态转 failed、把原因交给调用方去说', async () => {
    mockCheckImage.mockResolvedValue({
      success: true,
      data: { status: 'FAILED', error: 'provider said no', errorCode: 'X' },
    })
    const { setMedia, setRunState, reportFailure } = mount([
      node('a', { mediaJobId: 'job-1' }),
    ])

    await waitFor(() => expect(reportFailure).toHaveBeenCalled())
    expect(reportFailure).toHaveBeenCalledWith('a', {
      error: 'provider said no',
      errorCode: 'X',
    })
    expect(setMedia).toHaveBeenCalledWith('a', { mediaJobId: undefined })
    expect(setRunState).toHaveBeenCalledWith('a', 'failed')
  })

  it('多个在飞的 job 一轮全问一遍', async () => {
    mockCheckImage.mockResolvedValue({
      success: true,
      data: { status: 'IN_QUEUE' },
    })
    mount([node('a', { mediaJobId: 'j1' }), node('b', { mediaJobId: 'j2' })])

    await waitFor(() => expect(mockCheckImage).toHaveBeenCalledTimes(2))
    expect(mockCheckImage.mock.calls.map((call) => call[0]).sort()).toEqual([
      'j1',
      'j2',
    ])
  })
})
