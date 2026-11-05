import { afterEach, describe, expect, it } from 'vitest'

import type { GenerationRecord } from '@/types'
import {
  gateNonRasterInput,
  getSvgToPngRequest,
  nonRasterInputKind,
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

  // GIF 当输入（owner 2026-11-05 gif-output mockup ③）：与 SVG 共用这一个弹窗。
  it('tells SVG and GIF inputs apart and lets bitmaps through', () => {
    expect(nonRasterInputKind('https://cdn.example.com/a.svg')).toBe('svg')
    expect(nonRasterInputKind('https://cdn.example.com/a.gif')).toBe('gif')
    expect(nonRasterInputKind('data:image/gif;base64,R0lG')).toBe('gif')
    expect(nonRasterInputKind('https://cdn.example.com/a.png')).toBeNull()
    expect(nonRasterInputKind(undefined)).toBeNull()
  })

  it('gates a GIF input and hands the first-frame PNG back', async () => {
    const received: GenerationRecord[] = []
    expect(
      gateNonRasterInput({ url: 'https://x/a.png' }, (p) => received.push(p)),
    ).toBe(false)
    expect(getSvgToPngRequest()).toBeNull()

    expect(
      gateNonRasterInput({ url: 'https://x/a.gif', id: 'g1' }, (p) =>
        received.push(p),
      ),
    ).toBe(true)
    expect(getSvgToPngRequest()).toMatchObject({
      url: 'https://x/a.gif',
      id: 'g1',
      mode: 'gate',
      kind: 'gif',
    })
    settleSvgToPngRequest(png)
    await Promise.resolve()
    expect(received).toEqual([png])
  })
})
