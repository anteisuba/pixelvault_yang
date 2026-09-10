import { afterEach, describe, expect, it, vi } from 'vitest'

import { inpaintImageAPI } from './image-edit'

const request = {
  imageUrl: 'https://example.com/source.png',
  maskImageUrl: 'data:image/png;base64,mask',
  modelId: 'gpt-image-2.5-sunburst',
  prompt: 'Change the sky',
  options: { preview: true },
}

afterEach(() => vi.unstubAllGlobals())

describe('image edit stream client', () => {
  it('reports previews but resolves only with the saved final response', async () => {
    const final = {
      success: true,
      data: {
        imageUrl: 'https://example.com/final.png',
        generation: { id: 'saved', url: 'https://example.com/final.png' },
        width: 1024,
        height: 1024,
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          `event: open\ndata: {}\n\nevent: preview\ndata: {"url":"data:image/png;base64,cHJldmlldw=="}\n\nevent: completed\ndata: ${JSON.stringify(final)}\n\n`,
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const preview = vi.fn()
    expect(await inpaintImageAPI(request, { onPreview: preview })).toEqual(
      final,
    )
    expect(preview).toHaveBeenCalledWith('data:image/png;base64,cHJldmlldw==')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/image/edit-stream',
      expect.objectContaining({
        body: JSON.stringify({ ...request, action: 'inpaint' }),
      }),
    )
  })
  it('does not accept a truncated stream as a saved edit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('event: open\ndata: {}\n\n')),
    )
    expect((await inpaintImageAPI(request)).success).toBe(false)
  })
})
