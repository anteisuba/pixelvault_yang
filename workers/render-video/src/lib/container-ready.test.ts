import { describe, expect, it, vi } from 'vitest'

import { waitUntilListening } from './container-ready'

function clock() {
  let t = 0
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
  }
}

describe('waitUntilListening', () => {
  it('returns as soon as the health probe answers', async () => {
    const probe = vi.fn().mockResolvedValue(new Response('{}'))

    await waitUntilListening(probe, { timeoutMs: 1000, intervalMs: 100 })

    expect(probe).toHaveBeenCalledOnce()
  })

  it('keeps probing while the server is still booting', async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('The container is not listening in the TCP address'),
      )
      .mockRejectedValueOnce(
        new Error('The container is not listening in the TCP address'),
      )
      .mockResolvedValue(new Response('{}'))

    await waitUntilListening(probe, {
      timeoutMs: 1000,
      intervalMs: 100,
      ...clock(),
    })

    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('treats a non-ok health answer as not ready yet', async () => {
    const probe = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValue(new Response('{}'))

    await waitUntilListening(probe, {
      timeoutMs: 1000,
      intervalMs: 100,
      ...clock(),
    })

    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('gives up after the deadline with the last reason', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('not listening'))

    await expect(
      waitUntilListening(probe, {
        timeoutMs: 300,
        intervalMs: 100,
        ...clock(),
      }),
    ).rejects.toThrow('container not ready after 300ms: not listening')
    expect(probe).toHaveBeenCalledTimes(4)
  })
})
