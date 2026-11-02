/**
 * 从素材栏拖出来的那一张（换皮 R4 · 样片 AF「素材拖上主线」）。
 *
 * ⚠ HTML5 拖放在 `dragover` 里**读不到载荷**（只给类型），可主线要在拖的途中就按这一张
 *   的长短让出空位、只对认得它的轨让位 —— 拖起时把这两样记在这里，`dragend` 清掉。只在本页
 *   有效：从别处拖进来的东西没有它，就按默认长度让位。
 * ⚠ 浏览器自己画拖着走的那张图：拖起时换成一张**放大一点、带影子**的（`setLiftedDragImage`），
 *   读起来是「拿起来了」，⛔ 不是一张半透明截图。
 */

import {
  EDIT_ASSET_DRAG,
  EDIT_TRACK_IDS,
  type EditTrackId,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'

export interface EditAssetDrag {
  readonly kind:
    | typeof NODE_MEDIA_KIND_IDS.video
    | typeof NODE_MEDIA_KIND_IDS.audio
  /** 落进去大概多长（量不到就缺席，按默认长度让位）。 */
  readonly durationSec?: number
}

let current: EditAssetDrag | null = null

export function beginEditAssetDrag(drag: EditAssetDrag): void {
  current = drag
}

export function endEditAssetDrag(): void {
  current = null
}

export function currentEditAssetDrag(): EditAssetDrag | null {
  return current
}

/**
 * 把拖着走的那张图换成「拿起来了」的样子：原格子的一份拷贝，放大 8%、带影子。⚠ 浏览器在
 * `dragstart` 那一刻同步截图，拷贝只需要活到这一拍结束。
 */
export function setLiftedDragImage(
  event: React.DragEvent<HTMLElement>,
  source: HTMLElement,
): void {
  if (typeof event.dataTransfer.setDragImage !== 'function') return
  const rect = source.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const { liftScale, shadowPx: pad, shadow } = EDIT_ASSET_DRAG
  const frame = document.createElement('div')
  frame.style.cssText = `position:fixed;top:-10000px;left:-10000px;padding:${pad}px;pointer-events:none;`
  const copy = source.cloneNode(true) as HTMLElement
  copy.style.width = `${rect.width * liftScale}px`
  copy.style.height = `${rect.height * liftScale}px`
  copy.style.boxShadow = `0 ${pad / 2}px ${pad}px ${shadow}`
  copy.style.transform = 'none'
  frame.appendChild(copy)
  document.body.appendChild(frame)
  event.dataTransfer.setDragImage(
    frame,
    pad + (event.clientX - rect.left) * liftScale,
    pad + (event.clientY - rect.top) * liftScale,
  )
  window.setTimeout(() => frame.remove(), 0)
}

/** 哪条轨收这一种素材：视频只进主线，声音进台词或配乐。 */
export function laneTakesAsset(
  track: EditTrackId,
  kind: EditAssetDrag['kind'],
): boolean {
  return kind === NODE_MEDIA_KIND_IDS.video
    ? track === EDIT_TRACK_IDS.video
    : track === EDIT_TRACK_IDS.audio || track === EDIT_TRACK_IDS.music
}
