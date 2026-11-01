'use client'

import { useEffect, useRef } from 'react'

import { STUDIO_GENERATION_DRAG_MIME } from '@/constants/studio'

/** 拖影：72px 圆角缩略图。 */
const DRAG_PREVIEW_SIZE = 72

/**
 * 画廊 / 舞台上的图做成可拖的源（原生 HTML5 拖拽，跟全站其它跨区拖放同一套）。
 *
 * - `application/x-studio-ref`：舞台（StudioCanvas）与输入框（use-image-upload）认它，
 *   落下 = 加参考图。
 * - `text/uri-list`：拖到别的应用 / 桌面时就是一张图的地址。
 * - 拖影是 72px 缩略图。
 *
 * ⚠ 拖拽分工：页面里的排序 / 挪位置用 dnd-kit；跨区域、跨窗口、带文件的拖放用原生
 * HTML5 + `src/constants` 里的 MIME（dnd-kit 走指针事件，接不到桌面拖进来的文件）。
 *
 * 把返回的 ref 挂到要拖的那个 DOM 上。
 */
export function useStudioDraggable<
  T extends HTMLElement = HTMLDivElement,
>(opts: { url: string | undefined; generationId: string; outputType: string }) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || opts.outputType !== 'IMAGE' || !opts.url) return

    const url = opts.url
    const generationId = opts.generationId

    // 子级 <img> 天生可拖，会抢走拖拽（拖出去的是图片本身而不是这块）。
    el.querySelectorAll('img').forEach((img) => {
      img.setAttribute('draggable', 'false')
    })
    el.setAttribute('draggable', 'true')

    const onDragStart = (event: DragEvent) => {
      const data = event.dataTransfer
      if (!data) return
      data.effectAllowed = 'copy'
      data.setData(
        STUDIO_GENERATION_DRAG_MIME,
        JSON.stringify({ url, id: generationId }),
      )
      data.setData('text/uri-list', url)
      setThumbnailDragImage(data, url)
    }

    el.addEventListener('dragstart', onDragStart)
    return () => {
      el.removeEventListener('dragstart', onDragStart)
      el.removeAttribute('draggable')
    }
  }, [opts.generationId, opts.url, opts.outputType])

  return ref
}

/**
 * 拖影换成缩略图：先挂到屏幕外让浏览器截下来，下一帧再拿掉。
 * 图还没进缓存时浏览器会退回默认拖影，不报错。
 */
function setThumbnailDragImage(data: DataTransfer, url: string) {
  const img = document.createElement('img')
  img.src = url
  Object.assign(img.style, {
    position: 'fixed',
    top: '-1000px',
    left: '-1000px',
    width: `${DRAG_PREVIEW_SIZE}px`,
    height: `${DRAG_PREVIEW_SIZE}px`,
    objectFit: 'cover',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    pointerEvents: 'none',
  })
  document.body.appendChild(img)
  data.setDragImage(img, DRAG_PREVIEW_SIZE / 2, DRAG_PREVIEW_SIZE / 2)
  window.requestAnimationFrame(() => img.remove())
}
