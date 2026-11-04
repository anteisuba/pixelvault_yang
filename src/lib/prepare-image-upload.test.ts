// @vitest-environment jsdom
/**
 * 上传前压图：真 `compressImageToLimit` 一起跑。jsdom 没有 createImageBitmap / canvas 编码，
 * 这两样浏览器能力用小桩替（不是假自己的模块）；提示走 sonner（第三方，替掉看弹了哪句）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
  loading: vi.fn(() => 'loading-id'),
  dismiss: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

import { prepareImageUpload } from '@/lib/prepare-image-upload'

const MB = 1024 * 1024
const FIVE_MB = 5 * MB

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['stub'], name, { type })
  Object.defineProperty(file, 'size', { value: size, configurable: true })
  return file
}

/** 浏览器解码 + canvas 重编码：每次 toBlob 回一个 `encodedBytes` 大的图。 */
function installBrowserImage(options: {
  encodedBytes: number
  drawImage?: () => void
}) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
  )
  const original = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return original(tag)
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: options.drawImage ?? (() => {}) }),
      toBlob: (callback: (blob: Blob | null) => void, type: string) =>
        callback(new Blob([new Uint8Array(options.encodedBytes)], { type })),
    } as unknown as HTMLCanvasElement
  }) as typeof document.createElement)
}

const messages = {
  compressing: 'Compressing…',
  compressed: ({ from, to }: { from: string; to: string }) =>
    `Compressed ${from} → ${to}`,
  gifTooLarge: 'GIF too large',
  tooLarge: 'File too large',
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('prepareImageUpload', () => {
  it('没超上限：原文件原样回，不弹任何提示、也不调 onError', async () => {
    const file = makeFile('small.png', 'image/png', 1024)
    const onError = vi.fn()

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
      onError,
    })

    expect(result).toBe(file)
    expect(toastMock.loading).not.toHaveBeenCalled()
    expect(toastMock.message).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('超了：压到上限以下，回压好的文件并报大小变化', async () => {
    installBrowserImage({ encodedBytes: 2 * MB })
    const file = makeFile('big.png', 'image/png', 8 * MB)

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
    })

    expect(result).not.toBe(file)
    expect(result?.size).toBe(2 * MB)
    expect(result?.type).toBe('image/png')
    expect(toastMock.loading).toHaveBeenCalledWith('Compressing…')
    expect(toastMock.dismiss).toHaveBeenCalledWith('loading-id')
    expect(toastMock.message).toHaveBeenCalledWith('Compressed 8.0 → 2.0')
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('动图 GIF 压不了：报 gifTooLarge，onError 同一句', async () => {
    const file = makeFile('big.gif', 'image/gif', 8 * MB)
    const onError = vi.fn()

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
      onError,
    })

    expect(result).toBeNull()
    expect(toastMock.error).toHaveBeenCalledWith('GIF too large')
    expect(toastMock.dismiss).toHaveBeenCalledWith('loading-id')
    expect(onError).toHaveBeenCalledWith('GIF too large')
  })

  it('怎么压都下不去：报 tooLarge（不是 GIF 那句）', async () => {
    installBrowserImage({ encodedBytes: 50 * MB })
    const file = makeFile('huge.png', 'image/png', 50 * MB)

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
    })

    expect(result).toBeNull()
    expect(toastMock.error).toHaveBeenCalledWith('File too large')
    expect(toastMock.error).not.toHaveBeenCalledWith('GIF too large')
  })

  it('canvas 自己炸了（普通 Error）：也报 tooLarge', async () => {
    installBrowserImage({
      encodedBytes: 1,
      drawImage: () => {
        throw new Error('canvas exploded')
      },
    })
    const file = makeFile('weird.png', 'image/png', 8 * MB)

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
    })

    expect(result).toBeNull()
    expect(toastMock.error).toHaveBeenCalledWith('File too large')
  })

  it('调用方自己写进度（inlineProgress）：不弹加载提示，只报一次结果', async () => {
    installBrowserImage({ encodedBytes: 2 * MB })
    const file = makeFile('big.png', 'image/png', 8 * MB)

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
      inlineProgress: true,
    })

    expect(result?.size).toBe(2 * MB)
    expect(toastMock.loading).not.toHaveBeenCalled()
    expect(toastMock.dismiss).not.toHaveBeenCalled()
    expect(toastMock.message).toHaveBeenCalledTimes(1)
  })
})
