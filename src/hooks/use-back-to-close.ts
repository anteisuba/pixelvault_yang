'use client'

import { useEffect, useRef } from 'react'

import { isTouchPrimary } from '@/lib/touch'

/**
 * 系统返回（安卓返回键 / iPhone 左边缘右滑 / 浏览器返回）= **先关最上面那层浮层**
 * （手机操作习惯第 3 条，owner 2026-10-15）：大图、底部抽屉开着时往历史里压一层，
 * 返回就把这一层弹掉、关最上面那一个；⛔ 直接离开整页。
 *
 * - 叠着开（看大图里再拉出抽屉）各压各的一层，返回一次只关最上面那个。
 * - 用 UI 关掉时把自己那一层**吃回来**（`history.back()`），否则开关几次后要按好几下
 *   返回才离得开页面；吃回来那一下 popstate 不再关别的层。
 * - 浮层里点链接换页：点下链接那一刻就放掉所有层（⛔ 吃回来 —— `history.back()` 是
 *   异步的，会和换页的 push 打架、把用户退回原页），历史里留一层空的，按一下返回就过。
 * - 只在触屏（`isTouchPrimary`）生效；电脑上返回照旧是换页。
 *
 * 画布节点抽屉（`CanvasMobileRail`）是这条的先例，规则相同。
 */

interface Layer {
  id: number
  close: () => void
}

const OVERLAY_STATE_KEY = '__pvOverlay'

let nextId = 1
const layers: Layer[] = []
let swallowPops = 0
let listening = false

function onPopState() {
  if (swallowPops > 0) {
    swallowPops -= 1
    return
  }
  const top = layers.pop()
  top?.close()
}

/** 点了站内链接（要换页）：放掉所有层，关的时候不再退历史。 */
function onLinkClick(event: MouseEvent) {
  if (layers.length === 0 || event.defaultPrevented) return
  const anchor =
    event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!(anchor instanceof HTMLAnchorElement)) return
  if (anchor.target && anchor.target !== '_self') return
  if (anchor.origin !== window.location.origin) return
  layers.length = 0
}

function ensureListener() {
  if (listening) return
  listening = true
  window.addEventListener('popstate', onPopState)
  document.addEventListener('click', onLinkClick, true)
}

export function useBackToClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open || !isTouchPrimary()) return
    ensureListener()
    const id = nextId++
    layers.push({ id, close: () => closeRef.current() })
    window.history.pushState(
      { ...(window.history.state as object | null), [OVERLAY_STATE_KEY]: id },
      '',
    )
    return () => {
      const index = layers.findIndex((layer) => layer.id === id)
      // 已被返回手势弹掉：历史那一层已经没了，什么都不用做。
      if (index === -1) return
      layers.splice(index, 1)
      const state = window.history.state as Record<string, unknown> | null
      const topId = state?.[OVERLAY_STATE_KEY]
      // 顶上是自己，或是叠在上面、刚关掉还没退完的那层（一起关：删掉这张图连带关菜单）。
      if (typeof topId === 'number' && topId >= id) {
        swallowPops += 1
        window.history.back()
      }
    }
  }, [open])
}
