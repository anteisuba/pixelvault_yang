'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  HOME_V4_SCROLL,
  HOME_V4_SECTIONS,
  type HomeV4Section,
} from '@/constants/homepage-v4'
import { clamp01 } from '@/lib/home-v4-beats'

/** 段 id → 该段的 0–1 进度。 */
export type HomeV4Progress = Readonly<Record<string, number>>

export interface HomeV4Scrub {
  /** 每一段的进度。降级时全是 `REST_PROGRESS`。 */
  progress: HomeV4Progress
  /** 视口中线落在哪一段上 —— 目录高亮与媒体播放都读它。 */
  activeId: string
  /**
   * 钉住 + scrub 生效中。`false` = 降级：手机、`prefers-reduced-motion`，
   * 以及**挂载之前**（服务端与首帧）——那时每段直接渲染结果态。
   */
  enabled: boolean
  /** 把 `<section>` 交给引擎。放在 `ref` 上。 */
  register: (id: string) => (element: HTMLElement | null) => void
  /** 把某一段滚到给定进度上。目录、键盘、画布步骤按钮共用这一条路。 */
  jumpTo: (id: string, progress?: number) => void
}

/** 进度量化到这一档再进 state：不量化的话每一帧都是一次 React 重渲染。 */
const STEPS = 240

function quantize(value: number): number {
  return Math.round(clamp01(value) * STEPS) / STEPS
}

function restProgress(): HomeV4Progress {
  const rest: Record<string, number> = {}
  for (const section of HOME_V4_SECTIONS) {
    rest[section.id] = HOME_V4_SCROLL.REST_PROGRESS
  }
  return rest
}

/** 一段有多少滚动行程可用（px）。不钉住的段用一屏，钉住的段用超出的部分。 */
function travelOf(
  section: HomeV4Section,
  height: number,
  viewport: number,
): number {
  if (!section.scrub) return Math.max(1, viewport)
  return Math.max(1, height - viewport)
}

/**
 * 首页长卷（v5）的**唯一进度源**。
 *
 * 读 `scrollY` 一次，算出九段各自的 0–1，交给演示去画。三件事是承重的：
 *
 * - **降级先判。** 手机（`<= MOBILE_MAX_PX`）与 `prefers-reduced-motion` 下
 *   引擎根本不启动，每段停在 `REST_PROGRESS`（= 1，结果态）。挂载之前也一样，
 *   所以服务端渲染出来的就是完整的结果态：没有 JS 的访客看到的是内容，不是
 *   六个空舞台，水合也不会错位。
 * - **滚动事件里不读布局。** `scroll` / `resize` 只置脏标记并要一帧；所有
 *   `getBoundingClientRect()` 都在那一帧里读完再一次性写 state。⛔ 千万不要在
 *   事件回调里边读边写，那是每滚一格强制同步布局一次。
 * - **跳段就是滚过去。** `jumpTo` 不写覆盖态，它算出那个进度对应的
 *   `scrollTop` 然后滚过去 —— 页面永远只有一个进度源，按钮态与滚动态不可能
 *   互相打架。
 */
export function useHomeV4Scrub(): HomeV4Scrub {
  const elements = useRef(new Map<string, HTMLElement>())
  const frame = useRef(0)
  const [enabled, setEnabled] = useState(false)
  const [progress, setProgress] = useState<HomeV4Progress>(restProgress)
  const [activeId, setActiveId] = useState(HOME_V4_SECTIONS[0].id)

  const register = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) elements.current.set(id, element)
      else elements.current.delete(id)
    },
    [],
  )

  const jumpTo = useCallback(
    (id: string, target: number = HOME_V4_SCROLL.JUMP_PROGRESS) => {
      const element = elements.current.get(id)
      const section = HOME_V4_SECTIONS.find((entry) => entry.id === id)
      if (!element || !section) return
      const viewport = window.innerHeight
      const top = element.getBoundingClientRect().top + window.scrollY
      const travel = section.scrub
        ? Math.max(0, element.offsetHeight - viewport)
        : 0
      window.scrollTo({ top: top + clamp01(target) * travel })
    },
    [],
  )

  useEffect(() => {
    const scrubQuery = window.matchMedia(
      `(min-width: ${HOME_V4_SCROLL.MOBILE_MAX_PX + 1}px) and (prefers-reduced-motion: no-preference)`,
    )

    const measure = () => {
      frame.current = 0
      if (!scrubQuery.matches) return
      const viewport = window.innerHeight
      const middle = viewport / 2
      const next: Record<string, number> = {}
      let active = HOME_V4_SECTIONS[0].id

      for (const section of HOME_V4_SECTIONS) {
        const element = elements.current.get(section.id)
        if (!element) {
          next[section.id] = HOME_V4_SCROLL.REST_PROGRESS
          continue
        }
        const rect = element.getBoundingClientRect()
        const travel = travelOf(section, rect.height, viewport)
        next[section.id] = quantize(-rect.top / travel)
        if (rect.top <= middle && rect.bottom > middle) active = section.id
      }

      setProgress((current) => {
        for (const section of HOME_V4_SECTIONS) {
          if (current[section.id] !== next[section.id]) return next
        }
        return current
      })
      setActiveId(active)
    }

    const request = () => {
      if (frame.current) return
      frame.current = window.requestAnimationFrame(measure)
    }

    const applyMode = () => {
      setEnabled(scrubQuery.matches)
      if (scrubQuery.matches) request()
      else setProgress(restProgress())
    }

    applyMode()
    scrubQuery.addEventListener('change', applyMode)
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request, { passive: true })
    return () => {
      if (frame.current) window.cancelAnimationFrame(frame.current)
      frame.current = 0
      scrubQuery.removeEventListener('change', applyMode)
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
    }
  }, [])

  return { progress, activeId, enabled, register, jumpTo }
}
