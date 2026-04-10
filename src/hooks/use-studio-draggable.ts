'use client'

import { useEffect, useRef } from 'react'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'

/**
 * Wraps Pragmatic DnD `draggable()` for studio gallery images.
 *
 * - Sets internal data (`type: 'studio-generation'`) for Pragmatic DnD drop targets.
 * - Sets external data (`application/x-studio-ref`) for backward-compat HTML5 drop targets
 *   (StudioCanvas, use-image-upload).
 * - Renders a 72px thumbnail as the drag ghost.
 *
 * Attach the returned ref to the draggable DOM element.
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

    // Prevent child <img> from intercepting drag (images are natively draggable).
    // Without this, event.target is the <img> (not our registered <div>),
    // so Pragmatic DnD ignores the drag.
    el.querySelectorAll('img').forEach((img) => {
      img.setAttribute('draggable', 'false')
    })

    return draggable({
      element: el,
      getInitialData: () => ({
        type: 'studio-generation',
        generationId,
        url,
      }),
      getInitialDataForExternal: () => ({
        'application/x-studio-ref': JSON.stringify({
          url,
          id: generationId,
        }),
        'text/uri-list': url,
      }),
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          render({ container }) {
            const img = document.createElement('img')
            img.src = url
            Object.assign(img.style, {
              width: '72px',
              height: '72px',
              objectFit: 'cover',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            })
            container.appendChild(img)
          },
        })
      },
    })
  }, [opts.generationId, opts.url, opts.outputType])

  return ref
}
