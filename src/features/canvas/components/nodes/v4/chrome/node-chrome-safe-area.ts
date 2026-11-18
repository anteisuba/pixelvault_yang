/** 选中节点浮层的位置。所有尺寸均为 React Flow 画布局部的屏幕像素。 */
export interface NodeChromeLayoutInput {
  readonly viewport: { readonly width: number; readonly height: number }
  /** 卡面，不含上方屏幕 22px 的卡名行。 */
  readonly card: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  /** 安全区左界（`canvasShellSafeLeftPx`）。 */
  readonly safeLeft: number
  /** 浮层的布局尺寸（屏幕像素；浮层恒为 1 倍，⛔ 不跟画布缩放）。 */
  readonly content: { readonly width: number; readonly height: number }
  readonly position: 'top' | 'bottom'
}

export interface NodeChromeLayout {
  readonly left: number
  readonly top: number
  readonly originX: number
  readonly originY: '0' | '100%'
  readonly visible: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 与 node-polish-2/mock.html 的 layoutChrome 保持相同的逐帧夹位顺序。
 *
 * ⚠ 2026-11-18：浮层**恒为屏幕 1 倍**，⛔ 不再按画布缩放（原 09-29 是 0.6–1）。
 * 初始适应常落在 13% 左右，那时工具条与提示词栏缩到 0.6，字小到读不清、键小到点不准；
 * 锚点（贴卡居中）与夹进安全区不变，只是尺寸不再跟 zoom 走。
 */
export function layoutNodeChrome({
  viewport,
  card,
  safeLeft,
  content,
  position,
}: NodeChromeLayoutInput): NodeChromeLayout {
  const safeTop = 64
  const safeRight = viewport.width - 16
  const safeBottom = viewport.height - 76
  const { width, height } = content
  const cardCenterX = card.x + card.width / 2

  const visible = !(
    card.x + card.width < safeLeft ||
    card.x > safeRight ||
    card.y + card.height < safeTop ||
    card.y > safeBottom
  )

  let left = clamp(cardCenterX - width / 2, safeLeft, safeRight - width)
  const top =
    position === 'top'
      ? Math.max(card.y - 22 - 8 - height, safeTop)
      : Math.min(card.y + card.height + 10, safeBottom - height)

  if (position === 'bottom') {
    const minimapLeft = viewport.width - 16 - 194 - 12
    const minimapTop = viewport.height - 16 - 128 - 12
    if (top + height > minimapTop && left + width > minimapLeft) {
      left = Math.max(safeLeft, minimapLeft - width)
    }
  }

  return {
    left,
    top,
    originX: clamp(cardCenterX - left, 0, content.width),
    originY: position === 'top' ? '100%' : '0',
    visible,
  }
}
