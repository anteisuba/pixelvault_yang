import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useThirdPartyImage } from './use-third-party-image'

const BASE = 'https://img.anteisuba.com'
const PIXIV = 'https://i.pximg.net/img-original/img/1_p0.png'
const THUMB = 'https://encrypted-tbn0.gstatic.com/images?q=1'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('useThirdPartyImage', () => {
  it('打代理只带源站、直连不带 Referer；取不到就换下一个地址，全试完 = exhausted', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', BASE)
    const { result } = renderHook(() => useThirdPartyImage(PIXIV, THUMB))

    expect(result.current.src).toBe(
      `${BASE}/hotlink/i.pximg.net/img-original/img/1_p0.png`,
    )
    expect(result.current.referrerPolicy).toBe('origin')

    act(() => result.current.onError())
    expect(result.current.src).toBe(PIXIV)
    expect(result.current.referrerPolicy).toBe('no-referrer')

    act(() => result.current.onError())
    expect(result.current.src).toBe(THUMB)

    act(() => result.current.onError())
    expect(result.current.src).toBeNull()
    expect(result.current.exhausted).toBe(true)
  })

  it('换了一张图就从头试', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', '')
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useThirdPartyImage(url),
      { initialProps: { url: 'https://a.example/1.jpg' } },
    )
    act(() => result.current.onError())
    expect(result.current.exhausted).toBe(true)

    rerender({ url: 'https://a.example/2.jpg' })
    expect(result.current.src).toBe('https://a.example/2.jpg')
    expect(result.current.exhausted).toBe(false)
  })
})
