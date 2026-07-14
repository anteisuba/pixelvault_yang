import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock('@/i18n/navigation', () => ({ redirect: redirectMock }))

import LegacyStudioEditPage, { buildLegacyStudioEditQuery } from './page'

describe('legacy Studio edit compatibility redirect', () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it('keeps only supported source parameters and a valid task', () => {
    expect(
      buildLegacyStudioEditQuery(
        {
          generationId: 'generation-1',
          sourceUrl: ['https://cdn.example/source.png', 'ignored'],
          width: '1280',
          height: '720',
          unsafe: 'drop-me',
        },
        ['inpaint'],
      ),
    ).toEqual({
      canvasTool: 'image-edit',
      generationId: 'generation-1',
      sourceUrl: 'https://cdn.example/source.png',
      width: '1280',
      height: '720',
      editTask: 'inpaint',
    })
  })

  it('falls back to the image-edit module for an unknown task', () => {
    expect(
      buildLegacyStudioEditQuery({ generationId: 'generation-1' }, [
        'unknown-task',
      ]),
    ).toEqual({
      canvasTool: 'image-edit',
      generationId: 'generation-1',
    })
  })

  it('redirects the locale-prefixed route to Canvas', async () => {
    await expect(
      LegacyStudioEditPage({
        params: Promise.resolve({ locale: 'zh', legacyTask: ['outpaint'] }),
        searchParams: Promise.resolve({
          sourceUrl: 'https://cdn.example/source.png',
          extra: 'drop-me',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(redirectMock).toHaveBeenCalledWith({
      locale: 'zh',
      href: {
        pathname: '/studio/node',
        query: {
          canvasTool: 'image-edit',
          sourceUrl: 'https://cdn.example/source.png',
          editTask: 'outpaint',
        },
      },
    })
  })
})
