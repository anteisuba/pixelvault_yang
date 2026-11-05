'use client'

import type { GenerationRecord } from '@/types'

/**
 * 「转 PNG」弹窗的全局 store（owner 2026-11-05 svg-output mockup ②③）。
 *
 * - `gate`：拿 SVG 当输入（参考图、改图）。这些入口只吃位图，收到 SVG 时
 *   `await requestSvgToPng({ url, mode: 'gate' })` —— 用户确认 → 转好 → 交回
 *   新 PNG 作品；取消 → null，入口什么都不落。
 * - `convert`：结果卡 / 详情里的「转 PNG」键，同一个弹窗，不需要接结果。
 *
 * 为什么是模块级 store：入口散在 hook（参考图槽）和好几个组件里，弹窗只该有
 * 一份（`SvgToPngDialogHost`），⛔ 每个入口各挂一个。同一时刻只排一条，新的
 * 请求顶掉旧的（旧的按取消）。
 */

export type SvgToPngRequestMode = 'gate' | 'convert'

export interface SvgToPngRequest {
  readonly url: string
  /** 作品 id：只用来起文件名；参考图槽只拿得到 URL。 */
  readonly id?: string
  readonly mode: SvgToPngRequestMode
  readonly resolve: (png: GenerationRecord | null) => void
}

let current: SvgToPngRequest | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function requestSvgToPng(params: {
  url: string
  id?: string
  mode: SvgToPngRequestMode
}): Promise<GenerationRecord | null> {
  current?.resolve(null)
  return new Promise((resolve) => {
    current = { ...params, resolve }
    emit()
  })
}

export function settleSvgToPngRequest(png: GenerationRecord | null) {
  const request = current
  if (!request) return
  current = null
  request.resolve(png)
  emit()
}

export function subscribeSvgToPngRequest(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSvgToPngRequest(): SvgToPngRequest | null {
  return current
}
