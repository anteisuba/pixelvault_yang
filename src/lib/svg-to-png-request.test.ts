import { afterEach, describe, expect, it } from 'vitest'

import type { GenerationRecord } from '@/types'
import {
  getSvgToPngRequest,
  requestSvgToPng,
  settleSvgToPngRequest,
  subscribeSvgToPngRequest,
} from '@/lib/svg-to-png-request'

const png = {
  id: 'png-1',
  url: 'https://cdn.example.com/a.png',
} as GenerationRecord

afterEach(() => settleSvgToPngRequest(null))

describe('svg-to-png request store', () => {
  it('opens one request and resolves it with the converted PNG', async () => {
    let notified = 0
    const unsubscribe = subscribeSvgToPngRequest(() => notified++)
    const pending = requestSvgToPng({
      url: 'https://cdn.example.com/a.svg',
      mode: 'gate',
    })
    expect(getSvgToPngRequest()).toMatchObject({
      url: 'https://cdn.example.com/a.svg',
      mode: 'gate',
    })
    settleSvgToPngRequest(png)
    await expect(pending).resolves.toBe(png)
    expect(getSvgToPngRequest()).toBeNull()
    expect(notified).toBe(2)
    unsubscribe()
  })

  it('cancels the older request when a new one arrives', async () => {
    const first = requestSvgToPng({ url: 'https://x/1.svg', mode: 'convert' })
    const second = requestSvgToPng({ url: 'https://x/2.svg', mode: 'gate' })
    await expect(first).resolves.toBeNull()
    expect(getSvgToPngRequest()?.url).toBe('https://x/2.svg')
    settleSvgToPngRequest(null)
    await expect(second).resolves.toBeNull()
  })
})
