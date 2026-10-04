import { afterEach, describe, expect, it, vi } from 'vitest'

import { inpaintImageAPI, objectReplaceAPI } from './image-edit'

const request = {
  imageUrl: 'https://example.com/source.png',
  maskImageUrl: 'data:image/png;base64,mask',
  modelId: 'gpt-image-2.5-sunburst',
  prompt: 'Change the sky',
  options: { preview: true },
}

afterEach(() => vi.unstubAllGlobals())

describe('asynchronous image edits', () => {
  const params = {
    imageUrl: 'https://example.com/source.png',
    modelId: 'ideogram-4.5',
    annotations: [{ index: 1, instruction: 'Make it blue' }],
    apiKeyId: 'selected-key',
  }
  it('waits for the archived result and retains the original final response contract', async () => {
    const generation = {
      id: 'result',
      url: 'https://cdn.example.com/result.png',
      width: 1672,
      height: 941,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ success: true, data: { jobId: 'edit-job' } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: { status: 'COMPLETED', generation },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    expect(await objectReplaceAPI(params)).toMatchObject({
      success: true,
      data: { imageUrl: generation.url, width: 1672, height: 941, generation },
    })
    expect(fetchMock.mock.calls[1][0]).toContain('jobId=edit-job')
  })
  it('cancels a submitted job if abort happened while submission was in flight', async () => {
    const controller = new AbortController()
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        controller.abort()
        return Response.json({ success: true, data: { jobId: 'edit-job' } })
      })
      .mockResolvedValue(Response.json({ success: true, data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    expect(
      (await objectReplaceAPI(params, { signal: controller.signal })).success,
    ).toBe(false)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/generations/cancel')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      jobIds: ['edit-job'],
    })
  })
  it('returns a terminal status API error immediately with its localization key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ success: true, data: { jobId: 'edit-job' } }),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            success: false,
            error: 'Not found',
            errorCode: 'job_not_found',
            i18nKey: 'errors.common.notFound',
          },
          { status: 404 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    expect(await objectReplaceAPI(params)).toMatchObject({
      success: false,
      error: 'Not found',
      errorCode: 'job_not_found',
      i18nKey: 'errors.common.notFound',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

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
