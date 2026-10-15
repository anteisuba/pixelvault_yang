import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { useInViewAutoplay } from './use-in-view-autoplay'

type ObserverCallback = (
  entries: { target: Element; intersectionRatio: number }[],
) => void

let observerCallback: ObserverCallback | null = null

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observerCallback = callback
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function makeVideo(): HTMLVideoElement {
  const video = document.createElement('video')
  let paused = true
  Object.defineProperty(video, 'paused', { get: () => paused })
  video.play = vi.fn(() => {
    paused = false
    return Promise.resolve()
  })
  video.pause = vi.fn(() => {
    paused = true
  })
  document.body.appendChild(video)
  return video
}

function mount(video: HTMLVideoElement) {
  return renderHook(() => useInViewAutoplay({ current: video }, true))
}

function show(videos: HTMLVideoElement[], ratio = 1) {
  observerCallback?.(
    videos.map((target) => ({ target, intersectionRatio: ratio })),
  )
}

function setMobile(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: mobile }))
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  setMobile(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('useInViewAutoplay', () => {
  it('plays at most six visible videos in reading order and lets the next one in when one leaves', () => {
    const videos = Array.from({ length: 8 }, makeVideo)
    const hooks = videos.map(mount)
    show(videos)

    expect(videos.map((video) => video.paused)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ])

    hooks[0]?.unmount()
    expect(videos[0]?.paused).toBe(true)
    expect(videos[6]?.paused).toBe(false)
    expect(videos[7]?.paused).toBe(true)
    hooks.slice(1).forEach((hook) => hook.unmount())
  })

  it('pauses a video that drops under 60% visible', () => {
    const videos = [makeVideo(), makeVideo()]
    const hooks = videos.map(mount)
    show(videos)
    show([videos[0] as HTMLVideoElement], 0.4)

    expect(videos[0]?.paused).toBe(true)
    expect(videos[1]?.paused).toBe(false)
    hooks.forEach((hook) => hook.unmount())
  })

  it('caps phones at four', () => {
    setMobile(true)
    const videos = Array.from({ length: 6 }, makeVideo)
    const hooks = videos.map(mount)
    show(videos)

    expect(videos.filter((video) => !video.paused)).toHaveLength(4)
    hooks.forEach((hook) => hook.unmount())
  })
})
