const ROSTER_GHOST_SIZE_PX = 72

export function createRosterDragGhost(url: string | undefined): HTMLElement {
  const ghost = document.createElement('div')
  ghost.dataset.rosterDragGhost = 'true'
  ghost.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${ROSTER_GHOST_SIZE_PX}px`,
    `height:${ROSTER_GHOST_SIZE_PX}px`,
    'border-radius:12px',
    'overflow:hidden',
    'pointer-events:none',
    'visibility:hidden',
    'opacity:0.92',
    'box-shadow:var(--shadow-node-panel)',
    'z-index:var(--z-index-canvas-drag)',
  ].join(';')

  if (url) {
    const image = document.createElement('img')
    image.src = url
    image.alt = ''
    image.draggable = false
    image.style.cssText =
      'width:100%;height:100%;object-fit:cover;display:block'
    ghost.appendChild(image)
  } else {
    ghost.style.background = 'var(--node-panel-inner)'
  }

  document.body.appendChild(ghost)
  return ghost
}

export function updateRosterDragGhost(
  ghost: HTMLElement | null,
  clientX: number,
  clientY: number,
  overDropTarget: boolean,
): void {
  if (!ghost) return
  const half = ROSTER_GHOST_SIZE_PX / 2
  ghost.style.transform = `translate(${clientX - half}px, ${clientY - half}px)`
  ghost.style.visibility = overDropTarget ? 'visible' : 'hidden'
}
