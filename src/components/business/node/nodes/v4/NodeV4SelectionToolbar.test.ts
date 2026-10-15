import { afterEach, describe, expect, it, vi } from 'vitest'

const { downloadRemoteAsset } = vi.hoisted(() => ({
  downloadRemoteAsset: vi.fn(),
}))
vi.mock('@/lib/api-client', () => ({ downloadRemoteAsset }))

import { triggerNodeV4Download } from './NodeV4SelectionToolbar'

const URL_ON_CDN =
  'https://cdn.anteisuba.com/generations/abc/image/2026-10-10_36e3b145.png'

describe('triggerNodeV4Download', () => {
  afterEach(() => vi.restoreAllMocks())

  it('走下载接口、按地址里的文件名落盘，⛔ 不开新页', async () => {
    downloadRemoteAsset.mockResolvedValueOnce({ success: true })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    triggerNodeV4Download(URL_ON_CDN)
    await vi.waitFor(() =>
      expect(downloadRemoteAsset).toHaveBeenCalledWith(
        URL_ON_CDN,
        '2026-10-10_36e3b145.png',
      ),
    )
    expect(open).not.toHaveBeenCalled()
  })

  it('接口失败才退回开新页', async () => {
    downloadRemoteAsset.mockResolvedValueOnce({ success: false })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    triggerNodeV4Download(URL_ON_CDN)
    await vi.waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        URL_ON_CDN,
        '_blank',
        'noopener,noreferrer',
      ),
    )
  })
})
