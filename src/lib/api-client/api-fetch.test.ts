import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from './api-fetch'

const fetchMock = vi.fn<typeof fetch>()
const getToken =
  vi.fn<(options?: { skipCache?: boolean }) => Promise<string | null>>()

function respond(status: number): Response {
  return new Response(JSON.stringify({ success: status < 400 }), { status })
}

describe('apiFetch', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    getToken.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    ;(window as unknown as { Clerk?: unknown }).Clerk = {
      session: { getToken },
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as unknown as { Clerk?: unknown }).Clerk
  })

  it('refreshes an expired session and resends the same request once', async () => {
    // 2026-10-29：助手想了 65 秒才出图，带出去的会话 token 已过期 → 门口 401。
    fetchMock
      .mockResolvedValueOnce(respond(401))
      .mockResolvedValueOnce(respond(200))
    getToken.mockResolvedValueOnce('fresh')
    const init = { method: 'POST', body: '{"prompt":"x"}' }

    const response = await apiFetch('/api/studio/generate', init)

    expect(response.status).toBe(200)
    expect(getToken).toHaveBeenCalledWith({ skipCache: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/studio/generate', init)
  })

  it('hands the 401 back when the session cannot be refreshed', async () => {
    fetchMock.mockResolvedValueOnce(respond(401))
    getToken.mockResolvedValueOnce(null)

    const response = await apiFetch('/api/studio/generate')

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('refreshes once for several requests rejected together', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(401))
      .mockResolvedValueOnce(respond(401))
    fetchMock.mockResolvedValue(respond(200))
    let resolveToken: (token: string) => void = () => {}
    getToken.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveToken = resolve
      }),
    )

    const pending = Promise.all([
      apiFetch('/api/studio/generate'),
      apiFetch('/api/studio/generate/status'),
    ])
    await vi.waitFor(() => expect(getToken).toHaveBeenCalledOnce())
    resolveToken('fresh')

    const responses = await pending
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(getToken).toHaveBeenCalledOnce()
  })

  it('leaves requests to other hosts alone', async () => {
    // R2 预签名上传回 401 与会话无关，续会话重发只会再错一次。
    fetchMock.mockResolvedValueOnce(respond(401))

    const response = await apiFetch('https://r2.example.com/upload', {
      method: 'PUT',
    })

    expect(response.status).toBe(401)
    expect(getToken).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('passes non-401 failures straight through', async () => {
    fetchMock.mockResolvedValueOnce(respond(404))

    const response = await apiFetch('/api/projects/missing')

    expect(response.status).toBe(404)
    expect(getToken).not.toHaveBeenCalled()
  })
})
