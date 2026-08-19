import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  editImageAPI: vi.fn(),
  extractElementAPI: vi.fn(),
  createExtractedElementAPI: vi.fn(),
  inpaintImageAPI: vi.fn(),
}))

import {
  createExtractedElementAPI,
  editImageAPI,
  extractElementAPI,
  inpaintImageAPI,
} from '@/lib/api-client'
import { CanvasDerivedImageOutputsSchema } from '@/types/canvas-image-edit'
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
          id: 'upscale',
          resultStrategy: 'derive-right',
        }),
      ]),
    )
    expect(canvasCapabilityRuntime.open('inpaint')).toMatchObject({
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

  // ⚠ 2026-08-18 E0 真机验底逮到的那条（当时的现场是已删除的扩展画布：它给
  // fal 传 `sync_mode: true`，于是 provider 回的 `imageUrl` 是个 2MB 级的
  // `data:` URI —— 撞穿 `CanvasDerivedImageOutputSchema` 的 `imageUrl.max(4000)`，
  // `placeDerivedImages()` 静默返回 `[]`，图生成了也落库了，画布上什么都不长）。
  // provider 那条 URL 本来就不该进节点（fal 链接会过期），派生节点一律取服务端
  // 已落 R2 的 `generation.url`。
  it('places the persisted R2 url, not the provider payload', async () => {
    const dataUri = `data:image/png;base64,${'A'.repeat(8000)}`
    vi.mocked(inpaintImageAPI).mockResolvedValue({
      success: true,
      data: {
        imageUrl: dataUri,
        width: 1536,
        height: 1024,
        generation: {
          id: 'generation-3',
          url: 'https://cdn.example.com/persisted-inpaint.png',
        },
      },
    } as never)

    const result = await runCanvasCapability({
      capability: 'inpaint',
      target,
      maskImageUrl: 'data:image/png;base64,AAAA',
      prompt: 'a red jacket',
      modelId: 'model-1',
    })

    expect(result.outputs[0]?.imageUrl).toBe(
      'https://cdn.example.com/persisted-inpaint.png',
    )
    // 真正要守的不是那个字符串，是「这批 output 过得了落节点那道 schema」。
    expect(
      CanvasDerivedImageOutputsSchema.safeParse(result.outputs).success,
    ).toBe(true)
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
