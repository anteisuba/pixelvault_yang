import { describe, expect, it } from 'vitest'

import { ROUTES, studioCanvasEditPath, studioImageEditPath } from './routes'

const SOURCE_OPTIONS = {
  generationId: 'generation-1',
  sourceUrl: 'https://cdn.example/image.png?variant=full',
  width: 1280,
  height: 720,
}

describe('studio image-edit route helpers', () => {
  it('builds a Canvas image-edit deep link', () => {
    expect(studioCanvasEditPath()).toBe(
      `${ROUTES.STUDIO_NODE}?canvasTool=image-edit`,
    )

    const url = new URL(studioCanvasEditPath(SOURCE_OPTIONS), 'https://test')

    expect(url.pathname).toBe(ROUTES.STUDIO_NODE)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      canvasTool: 'image-edit',
      generationId: 'generation-1',
      sourceUrl: 'https://cdn.example/image.png?variant=full',
      width: '1280',
      height: '720',
    })
  })

  it('keeps existing callers on the legacy editor during convergence', () => {
    expect(studioImageEditPath()).toBe(ROUTES.STUDIO_EDIT)

    const url = new URL(studioImageEditPath(SOURCE_OPTIONS), 'https://test')

    expect(url.pathname).toBe(ROUTES.STUDIO_EDIT)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      generationId: 'generation-1',
      sourceUrl: 'https://cdn.example/image.png?variant=full',
      width: '1280',
      height: '720',
    })
  })
})
