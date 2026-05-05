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
}) {
  const props = {
    imageUrl: 'https://example.com/source.png',
    imageWidth: 640,
    imageHeight: 480,
    onApply: overrides?.onApply ?? vi.fn(),
    onCancel: overrides?.onCancel ?? vi.fn(),
  }

  render(<StudioInpaintEditor {...props} />)
  return props
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

beforeEach(() => {
  const context = createCanvasContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,mask',
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

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn()
    renderEditor({ onCancel })

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
  })
})
