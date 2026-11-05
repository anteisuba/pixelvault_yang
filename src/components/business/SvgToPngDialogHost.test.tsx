import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'

// 只假边界：网络（上传 API、CDN fetch）与浏览器画图（Image 解码、canvas 导出）。
// `useSvgToPng` / 光栅化 / 弹窗 store 都是真的。
const uploadImageFileAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  uploadImageFileAPI,
}))

import { SvgToPngDialogHost } from '@/components/business/SvgToPngDialogHost'
import { requestSvgToPng } from '@/lib/svg-to-png-request'
import type { GenerationRecord } from '@/types'
import { renderWithApp } from '@/test/app-harness'
import { installFakeCanvas2d } from '@/test/fake-canvas-2d'
import { stubFetch } from '@/test/fake-fetch'
import { text } from '@/test/i18n-text'

const png = {
  id: 'png-1',
  url: 'https://cdn.example.com/a.png',
} as GenerationRecord

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"/>'

/** jsdom 不解码图片：设了 src 就当载好了。 */
class LoadedImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

beforeEach(() => {
  uploadImageFileAPI.mockReset()
  stubFetch(() => new Response(SVG, { status: 200 }))
  installFakeCanvas2d()
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    callback: BlobCallback,
  ) {
    callback(new Blob(['png'], { type: 'image/png' }))
  })
  vi.stubGlobal('Image', LoadedImage)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = () => 'blob:svg'
      static revokeObjectURL = () => {}
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function uploadedFile(): File {
  return uploadImageFileAPI.mock.calls.at(-1)?.[0] as File
}

describe('SvgToPngDialogHost', () => {
  it('gate: asks first, converts at the default 2048 and hands back the PNG', async () => {
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: { generation: png },
    })
    renderWithApp(<SvgToPngDialogHost />)

    let pending!: Promise<GenerationRecord | null>
    act(() => {
      pending = requestSvgToPng({
        url: 'https://cdn.example.com/a.svg',
        id: 'svg-12345678',
        mode: 'gate',
      })
    })

    expect(await screen.findByText(text('SvgToPng.gateTitle'))).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: text('SvgToPng.gateConfirm') }),
    )

    await expect(pending).resolves.toBe(png)
    expect(uploadedFile().name).toBe('antei-svg-1234-2048.png')
    expect(uploadedFile().type).toBe('image/png')
    await waitFor(() =>
      expect(screen.queryByText(text('SvgToPng.gateTitle'))).toBeNull(),
    )
  })

  it('convert: picks another long edge; cancel resolves null without uploading', async () => {
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: { generation: png },
    })
    renderWithApp(<SvgToPngDialogHost />)

    let first!: Promise<GenerationRecord | null>
    act(() => {
      first = requestSvgToPng({ url: 'https://x/1.svg', mode: 'convert' })
    })
    expect(await screen.findByText(text('SvgToPng.convertTitle'))).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: '4096' }))
    fireEvent.click(
      screen.getByRole('button', { name: text('SvgToPng.action') }),
    )
    await expect(first).resolves.toBe(png)
    expect(uploadedFile().name).toBe('antei-svg-4096.png')

    let second!: Promise<GenerationRecord | null>
    act(() => {
      second = requestSvgToPng({ url: 'https://x/2.svg', mode: 'gate' })
    })
    fireEvent.click(
      await screen.findByRole('button', { name: text('SvgToPng.gateCancel') }),
    )
    await expect(second).resolves.toBeNull()
    expect(uploadImageFileAPI).toHaveBeenCalledTimes(1)
  })

  it('stays open when the upload fails so the user can retry', async () => {
    uploadImageFileAPI.mockResolvedValue({ success: false, error: 'boom' })
    renderWithApp(<SvgToPngDialogHost />)
    act(() => {
      void requestSvgToPng({ url: 'https://x/3.svg', mode: 'gate' })
    })
    fireEvent.click(
      await screen.findByRole('button', { name: text('SvgToPng.gateConfirm') }),
    )
    await waitFor(() => expect(uploadImageFileAPI).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: text('SvgToPng.gateConfirm') }),
      ).toBeTruthy(),
    )
    expect(screen.getByText(text('SvgToPng.gateTitle'))).toBeTruthy()
  })
})
