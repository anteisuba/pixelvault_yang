import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/services/image-transform/handle-style-transform', () => ({
  handleStyleTransform: vi.fn(),
}))

import { transformImage } from '@/services/image-transform.service'
import { handleStyleTransform } from '@/services/image-transform/handle-style-transform'
import { NotImplementedError } from '@/lib/errors'
import type { TransformInput, TransformOutput } from '@/types/transform'

const mockHandleStyle = vi.mocked(handleStyleTransform)

// ─── Fixtures ───────────────────────────────────────────────────

const STYLE_INPUT: TransformInput = {
  input: { type: 'image', data: 'data:image/png;base64,abc' },
  subject: { type: 'upload', imageData: 'data:image/png;base64,abc' },
  style: { type: 'preset', presetId: 'preset-watercolor' },
  transformation: { type: 'style' },
  preservation: { structure: 0.7, text: 0.9, composition: 0.6, people: 0.7 },
  variants: 4,
}

const MOCK_OUTPUT: TransformOutput = {
  original: { url: 'data:image/png;base64,abc', width: 512, height: 512 },
  variants: [
    {
      status: 'success',
      result: {
        url: 'https://r2.example/1.png',
        width: 512,
        height: 512,
        cost: 1,
      },
    },
  ],
  totalCost: 1,
}

// ─── Tests ──────────────────────────────────────────────────────

describe('transformImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes style type to handleStyleTransform', async () => {
    mockHandleStyle.mockResolvedValue(MOCK_OUTPUT)

    const result = await transformImage('user_clerk_123', STYLE_INPUT)

    expect(mockHandleStyle).toHaveBeenCalledWith('user_clerk_123', STYLE_INPUT)
    expect(result).toEqual(MOCK_OUTPUT)
  })

  it('throws NotImplementedError for pose type', async () => {
    const input = {
      ...STYLE_INPUT,
      transformation: { type: 'pose' as const },
    }

    await expect(transformImage('user_clerk_123', input)).rejects.toThrow(
      NotImplementedError,
    )
    expect(mockHandleStyle).not.toHaveBeenCalled()
  })

  it('throws NotImplementedError for background type', async () => {
    const input = {
      ...STYLE_INPUT,
      transformation: { type: 'background' as const },
    }

    await expect(transformImage('user_clerk_123', input)).rejects.toThrow(
      NotImplementedError,
    )
  })

  it('throws NotImplementedError for garment type', async () => {
    const input = {
      ...STYLE_INPUT,
      transformation: { type: 'garment' as const },
    }

    await expect(transformImage('user_clerk_123', input)).rejects.toThrow(
      'garment transformation',
    )
  })

  it('throws NotImplementedError for detail type', async () => {
    const input = {
      ...STYLE_INPUT,
      transformation: { type: 'detail' as const },
    }

    await expect(transformImage('user_clerk_123', input)).rejects.toThrow(
      'detail transformation',
    )
  })

  it('propagates errors from handleStyleTransform', async () => {
    mockHandleStyle.mockRejectedValue(new Error('Provider timeout'))

    await expect(transformImage('user_clerk_123', STYLE_INPUT)).rejects.toThrow(
      'Provider timeout',
    )
  })
})
