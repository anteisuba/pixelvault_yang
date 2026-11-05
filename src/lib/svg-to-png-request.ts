'use client'

import type { GenerationRecord } from '@/types'
import { isGifImageUrl } from '@/lib/gif-image'
import { isSvgImageUrl } from '@/lib/svg-image'

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

/**
 * 拿来当输入之前要先变成 PNG 的两种作品：SVG（矢量，选长边转）与 GIF（动图，
 * 取第一帧，原尺寸）。owner 2026-11-05 gif-output mockup ③：两者共用这一个弹窗。
 */
export type NonRasterInputKind = 'svg' | 'gif'

export interface SvgToPngRequest {
  readonly url: string
  /** 作品 id：只用来起文件名；参考图槽只拿得到 URL。 */
  readonly id?: string
  readonly mode: SvgToPngRequestMode
  /** 缺省 = `svg`（「转 PNG」键只给 SVG）。 */
  readonly kind?: NonRasterInputKind
  readonly resolve: (png: GenerationRecord | null) => void
}

/** 这条地址拿来当输入前要不要先过弹窗；位图返回 null。 */
export function nonRasterInputKind(
  url: string | null | undefined,
): NonRasterInputKind | null {
  if (isSvgImageUrl(url)) return 'svg'
  if (isGifImageUrl(url)) return 'gif'
  return null
}

/**
 * 输入口的统一拦截：SVG / GIF 先弹窗，确认后把转好的 PNG 交给 `onPng`（取消就
 * 什么都不落），返回 true 表示已拦下、调用方直接 return；位图返回 false 照常走。
 */
export function gateNonRasterInput(
  source: { url: string; id?: string },
  onPng: (png: GenerationRecord) => void,
): boolean {
  const kind = nonRasterInputKind(source.url)
  if (!kind) return false
  void requestSvgToPng({ ...source, mode: 'gate', kind }).then((png) => {
    if (png) onPng(png)
  })
  return true
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
  kind?: NonRasterInputKind
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
