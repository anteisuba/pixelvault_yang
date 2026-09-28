import { afterEach, describe, expect, it, vi } from 'vitest'

import { MEDIA_PROBE_TIMEOUT_MS } from '@/constants/media-probe'

import { probeMediaDuration, probeMediaProblem } from './media-probe'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('probeMediaProblem', () => {
  it('404 / 410 = 源文件已删', async () => {
    for (const status of [404, 410]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status }))
      await expect(probeMediaProblem('https://cdn/x.png')).resolves.toBe('gone')
    }
  })

  it('别的状态码与网络失败都只算暂时读不到，⛔ 不说成已删除', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503 }))
    await expect(probeMediaProblem('https://cdn/x.png')).resolves.toBe(
      'unreachable',
    )
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(probeMediaProblem('https://cdn/x.png')).resolves.toBe(
      'unreachable',
    )
  })

  it('用 HEAD 问，不下整张图', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 404 })
    vi.stubGlobal('fetch', fetchMock)
    await probeMediaProblem('https://cdn/x.png')
    expect(fetchMock).toHaveBeenCalledWith('https://cdn/x.png', {
      method: 'HEAD',
      cache: 'no-store',
    })
  })
})

describe('probeMediaDuration', () => {
  /** jsdom 不真的加载媒体：造一只元素，`src` 一设就按剧本派事件。 */
  function stubMediaElement(script: { duration?: number; fail?: boolean }) {
    const element = document.createElement('video')
    const created = vi
      .spyOn(document, 'createElement')
      .mockImplementation(() => element)
    Object.defineProperty(element, 'duration', {
      get: () => script.duration ?? Number.NaN,
    })
    Object.defineProperty(element, 'src', {
      set: () => {
        queueMicrotask(() => {
          if (script.fail) element.onerror?.(new Event('error'))
          else if (script.duration !== undefined)
            element.onloadedmetadata?.(new Event('loadedmetadata'))
        })
      },
      configurable: true,
    })
    return created
  }

  it('读到元数据：返回秒数，只拉元数据', async () => {
    const created = stubMediaElement({ duration: 16.3 })
    await expect(
      probeMediaDuration('https://cdn/dance.mp4', 'video'),
    ).resolves.toBe(16.3)
    expect(created).toHaveBeenCalledWith('video')
  })

  it('读失败：null（调用方按不知道放行）', async () => {
    stubMediaElement({ fail: true })
    await expect(
      probeMediaDuration('https://cdn/x.mp3', 'audio'),
    ).resolves.toBeNull()
  })

  it('事件永远不来（标签页隐藏）：超时后 null，⛔ 不挂住发送', async () => {
    vi.useFakeTimers()
    stubMediaElement({})
    const pending = probeMediaDuration('https://cdn/x.mp4', 'video')
    await vi.advanceTimersByTimeAsync(MEDIA_PROBE_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })
})
