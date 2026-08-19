import { fireEvent, render, screen } from '@testing-library/react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { StudioInpaintEditor } from './StudioInpaintEditor'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

class ResizeObserverMock {
  observe() {
    return undefined
  }
  unobserve() {
    return undefined
  }
  disconnect() {
    return undefined
  }
}

function createCanvasContext(): CanvasRenderingContext2D {
  const imageData: ImageData = {
    data: new Uint8ClampedArray(16),
    width: 2,
    height: 2,
    colorSpace: 'srgb',
  }

  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => imageData),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
      colorSpace: 'srgb',
    })),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D

  return context
}

function renderEditor(overrides?: {
  onApply?: (maskDataUrl: string, prompt: string) => void
  onCancel?: () => void
  imageWidth?: number
  imageHeight?: number
}) {
  const props = {
    imageUrl: 'https://example.com/source.png',
    imageWidth: overrides?.imageWidth ?? 640,
    imageHeight: overrides?.imageHeight ?? 480,
    onApply: overrides?.onApply ?? vi.fn(),
    onCancel: overrides?.onCancel ?? vi.fn(),
  }

  render(<StudioInpaintEditor {...props} />)
  return props
}

/** 每次 `toDataURL` 时那张 canvas 的尺寸，用来断言导出的是哪一张。 */
const exportedCanvasSizes: string[] = []
/** 当前用例那份 mock 出来的 2D context —— 用来断言画笔与拉框各自落了什么。 */
let canvasContext: CanvasRenderingContext2D

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

beforeEach(() => {
  // jsdom 的 getBoundingClientRect 全返 0，而 `getCanvasPoint` 拿 0 宽就直接
  // 放弃 —— 不打桩的话所有指针用例都是空跑。
  vi.spyOn(
    HTMLCanvasElement.prototype,
    'getBoundingClientRect',
  ).mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 300,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  } as DOMRect)
  const context = createCanvasContext()
  canvasContext = context
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context,
  )
  exportedCanvasSizes.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    function (this: HTMLCanvasElement) {
      exportedCanvasSizes.push(`${this.width}x${this.height}`)
      return 'data:image/png;base64,mask'
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('StudioInpaintEditor', () => {
  it('renders canvas and toolbar controls', () => {
    renderEditor()

    expect(screen.getByLabelText('canvasLabel')).toBeInTheDocument()
    expect(screen.getByText('brushSize')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eraser' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'clearAll' })).toBeInTheDocument()
  })

  it('passes mask data URL and prompt to onApply', () => {
    const onApply = vi.fn()
    renderEditor({ onApply })

    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'A red sports car' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(onApply).toHaveBeenCalledWith(
      'data:image/png;base64,mask',
      'A red sports car',
    )
  })

  // ⚠ 2026-08-18 真机三连测：源图 1672×941 时，蒙版 1024×1024 → FLUX Pro Fill
  // 500；蒙版 1024×576（长宽比已经对上）→ **仍然 500**；蒙版 1672×941 → 出图。
  // 所以绘制面可以按 MAX_CANVAS_EDGE 收着，导出必须逐像素回到源图尺寸。
  it('exports the mask at the source resolution, not the bounded drawing size', () => {
    renderEditor({ imageWidth: 1672, imageHeight: 941 })

    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'a red jacket' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(exportedCanvasSizes.at(-1)).toBe('1672x941')
    // 绘制面确实还是收着的，否则这条断言就没意义了。
    expect(exportedCanvasSizes).not.toContain('1024x576')
  })

  it('skips the rescale when the source already fits the drawing canvas', () => {
    renderEditor({ imageWidth: 640, imageHeight: 480 })

    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'a red jacket' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(exportedCanvasSizes).toEqual(['640x480'])
  })

  // E2 验收（`docs/references/pages/studio-image-edit.md` §5）：**框选与涂抹
  // 必须产出同构的 maskDataUrl** —— 同一块蒙版画布、同一条导出路径。拉框要是
  // 自己另开一条导出，E3 的多框编号就会和画笔的蒙版对不上。
  it('box select paints into the same mask canvas as the brush', () => {
    renderEditor({ imageWidth: 1672, imageHeight: 941 })
    fireEvent.click(screen.getByRole('button', { name: /toolBox/ }))

    const canvas = screen.getByLabelText('canvasLabel')
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30 })
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 150 })
    fireEvent.pointerUp(canvas, { clientX: 160, clientY: 150 })

    // 框是在松手时一次性填进蒙版的，走的是 fillRect 而不是画笔的 stroke。
    expect(canvasContext.fillRect).toHaveBeenCalledTimes(1)
    expect(canvasContext.stroke).not.toHaveBeenCalled()
  })

  it('ignores a box too small to be intentional', () => {
    renderEditor({ imageWidth: 1672, imageHeight: 941 })
    fireEvent.click(screen.getByRole('button', { name: /toolBox/ }))

    const canvas = screen.getByLabelText('canvasLabel')
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30 })
    fireEvent.pointerUp(canvas, { clientX: 41, clientY: 30 })

    expect(canvasContext.fillRect).not.toHaveBeenCalled()
  })

  it('exports a box-drawn mask at the source resolution, same as the brush', () => {
    const onApply = vi.fn()
    renderEditor({ imageWidth: 1672, imageHeight: 941, onApply })
    fireEvent.click(screen.getByRole('button', { name: /toolBox/ }))

    const canvas = screen.getByLabelText('canvasLabel')
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30 })
    fireEvent.pointerUp(canvas, { clientX: 160, clientY: 150 })

    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'a red jacket' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(exportedCanvasSizes.at(-1)).toBe('1672x941')
    expect(onApply).toHaveBeenCalledWith(
      'data:image/png;base64,mask',
      'a red jacket',
    )
  })

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn()
    renderEditor({ onCancel })

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
  })
})
