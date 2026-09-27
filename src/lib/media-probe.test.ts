import { afterEach, describe, expect, it, vi } from 'vitest'

import { probeMediaProblem } from './media-probe'

afterEach(() => {
  vi.unstubAllGlobals()
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
