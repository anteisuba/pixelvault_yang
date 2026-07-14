import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  editImageAPI: vi.fn(),
  decomposeImageAPI: vi.fn(),
  extractElementAPI: vi.fn(),
  createExtractedElementAPI: vi.fn(),
  inpaintImageAPI: vi.fn(),
  outpaintImageAPI: vi.fn(),
}))

import {
  createExtractedElementAPI,
  decomposeImageAPI,
  editImageAPI,
  extractElementAPI,
} from '@/lib/api-client'
import {
  canvasCapabilityRuntime,
  runCanvasCapability,
} from './canvas-capability-runtime'

const target = {
  sourceUrl: 'https://cdn.example.com/source.png',
  sourceGenerationId: 'generation-1',
  sourceWidth: 1024,
  sourceHeight: 768,
}

describe('runCanvasCapability', () => {
  it('exposes the typed capability registry and result strategy', () => {
    expect(canvasCapabilityRuntime.listFor()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'decompose',
          resultStrategy: 'derive-layers',
        }),
        expect.objectContaining({
          id: 'upscale',
          resultStrategy: 'derive-right',
        }),
      ]),
    )
    expect(canvasCapabilityRuntime.open('outpaint')).toMatchObject({
      output: 'single-image',
      resultStrategy: 'derive-right',
    })
  })

  it('normalizes single-image edits into derived outputs', async () => {
    vi.mocked(editImageAPI).mockResolvedValue({
      success: true,
      data: {
        imageUrl: 'https://cdn.example.com/upscaled.png',
        width: 2048,
        height: 1536,
        generation: { id: 'generation-2' },
      },
    } as never)

    const result = await runCanvasCapability({
      capability: 'upscale',
      target,
      targetScale: '2x',
      modelId: 'model-1',
    })

    expect(result).toEqual({
      success: true,
      outputs: [
        expect.objectContaining({
          imageUrl: 'https://cdn.example.com/upscaled.png',
          generationId: 'generation-2',
          editCapability: 'upscale',
        }),
      ],
    })
  })

  it('preserves decomposed layer labels and dimensions', async () => {
    vi.mocked(decomposeImageAPI).mockResolvedValue({
      success: true,
      data: {
        generationId: 'generation-decompose',
        layers: [
          { name: 'Subject', imageUrl: 'https://cdn.example.com/subject.png' },
          { name: 'Mask', imageUrl: 'data:image/png;base64,invalid' },
        ],
      },
    } as never)

    const result = await runCanvasCapability({
      capability: 'decompose',
      target,
      modelId: 'model-1',
    })

    expect(result.outputs).toEqual([
      expect.objectContaining({
        label: 'Subject',
        width: 1024,
        height: 768,
        generationId: 'generation-decompose',
      }),
    ])
    expect(result.batchId).toBe(result.outputs[0]?.batchId)
  })

  it('keeps extraction usable when gallery persistence fails', async () => {
    vi.mocked(extractElementAPI).mockResolvedValue({
      success: true,
      data: {
        imageUrl: 'https://cdn.example.com/element.png',
        width: 300,
        height: 200,
      },
    } as never)
    vi.mocked(createExtractedElementAPI).mockResolvedValue({
      success: false,
      error: 'gallery unavailable',
    } as never)

    const result = await runCanvasCapability({
      capability: 'extract-element',
      target,
      prompt: 'jacket',
      invert: false,
      modelId: 'model-1',
    })

    expect(result.success).toBe(true)
    expect(result.saveWarning).toBe(true)
    expect(result.outputs[0]?.imageUrl).toContain('element.png')
  })
})
