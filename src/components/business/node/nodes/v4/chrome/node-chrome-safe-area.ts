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
  readonly zoom: number
  readonly sidebarOpen: boolean
  /** 浮层未经画布缩放时的布局尺寸。 */
  readonly content: { readonly width: number; readonly height: number }
  readonly position: 'top' | 'bottom'
}

export interface NodeChromeLayout {
  readonly left: number
  readonly top: number
  readonly scale: number
  readonly originX: number
  readonly originY: '0' | '100%'
  readonly visible: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 与 node-polish-2/mock.html 的 layoutChrome 保持相同的逐帧夹位顺序。 */
export function layoutNodeChrome({
  viewport,
  card,
  zoom,
  sidebarOpen,
  content,
  position,
}: NodeChromeLayoutInput): NodeChromeLayout {
  const scale = clamp(zoom, 0.6, 1)
  const safeLeft = sidebarOpen ? 346 : 72
  const safeTop = 64
  const safeRight = viewport.width - 16
  const safeBottom = viewport.height - 76
  const width = content.width * scale
  const height = content.height * scale
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
    scale,
    originX: clamp((cardCenterX - left) / scale, 0, content.width),
    originY: position === 'top' ? '100%' : '0',
    visible,
  }
}
