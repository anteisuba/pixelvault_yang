'use client'

// Side-effect import: registers the `<model-viewer>` custom element on
// `customElements`. Must run only on the client (gated by the dynamic
// `ssr:false` boundary in ModelViewer.tsx).
import '@google/model-viewer'

import { useCallback, useEffect, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ModelViewerInnerProps {
  src: string
  poster?: string
  alt?: string
  autoRotate?: boolean
  cameraControls?: boolean
  ar?: boolean
  iosSrc?: string
  className?: string
  loadingFallback?: ReactNode
  /**
   * Called once with a PNG/WEBP blob shortly after the mesh becomes
   * visible. Used by Studio3DWorkspace to upload a poster thumbnail so
   * the asset browser can render a real preview.
   */
  onPosterCaptured?: (blob: Blob) => void
  onModelVisible?: () => void
  /**
   * Children are rendered inside the `<model-viewer>` element, so you can
   * pass `<button slot="ar-button">…</button>` to override the default
   * AR trigger. model-viewer wires the slot automatically.
   */
  children?: ReactNode
}

// Minimal typing for the JSX element so we don't have to pull in @google/model-viewer's
// global JSX augmentation (which conflicts with React 19 strict types).
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          poster?: string
          alt?: string
          'auto-rotate'?: boolean | ''
          'camera-controls'?: boolean | ''
          ar?: boolean | ''
          'ios-src'?: string
          'shadow-intensity'?: string | number
          exposure?: string | number
          'environment-image'?: string
          loading?: 'auto' | 'lazy' | 'eager'
          reveal?: 'auto' | 'manual'
        },
        HTMLElement
      >
    }
  }
}

// Shape of the methods we actually call on the element. Avoids pulling in
// @google/model-viewer's full type ambient (which clashes with React 19).
interface ModelViewerElement extends HTMLElement {
  toBlob: (opts?: {
    mimeType?: string
    qualityArgument?: number
    idealAspect?: boolean
  }) => Promise<Blob>
}

export default function ModelViewerInner({
  src,
  poster,
  alt,
  autoRotate = true,
  cameraControls = true,
  ar = true,
  iosSrc,
  className,
  onPosterCaptured,
  onModelVisible,
  children,
}: ModelViewerInnerProps) {
  const ref = useRef<HTMLElement | null>(null)
  // Track whether we've already captured for this src so HMR / re-renders
  // don't trigger repeat uploads while staying on the same mesh.
  const capturedForRef = useRef<string | null>(null)

  const capturePoster = useCallback(async () => {
    if (!onPosterCaptured) return
    if (capturedForRef.current === src) return
    const el = ref.current as ModelViewerElement | null
    if (!el || typeof el.toBlob !== 'function') return
    try {
      const blob = await el.toBlob({
        mimeType: 'image/png',
        idealAspect: true,
      })
      capturedForRef.current = src
      onPosterCaptured(blob)
    } catch {
      // Non-fatal — poster upload is a polish, not core functionality.
    }
  }, [onPosterCaptured, src])

  useEffect(() => {
    const el = ref.current
    if (!el || (!onPosterCaptured && !onModelVisible)) return

    // model-viewer fires 'load' once the GLB is parsed and 'model-visibility'
    // when it's actually painted to the canvas. Wait for the latter so the
    // captured frame contains rendered geometry rather than the poster.
    const handleVisibility = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail
      if (detail?.visible) {
        onModelVisible?.()
        // Tiny delay lets auto-rotate land a stable frame instead of frame 0.
        setTimeout(() => {
          void capturePoster()
        }, 600)
      }
    }

    el.addEventListener('model-visibility', handleVisibility)
    return () => {
      el.removeEventListener('model-visibility', handleVisibility)
    }
  }, [capturePoster, onModelVisible, onPosterCaptured])

  return (
    <model-viewer
      ref={ref as React.Ref<HTMLElement>}
      src={src}
      poster={poster}
      alt={alt}
      auto-rotate={autoRotate ? '' : undefined}
      camera-controls={cameraControls ? '' : undefined}
      ar={ar ? '' : undefined}
      ios-src={iosSrc}
      shadow-intensity="1"
      exposure="1"
      loading="eager"
      reveal="auto"
      className={cn('size-full bg-transparent', className)}
      style={{ width: '100%', height: '100%' }}
    >
      {children}
    </model-viewer>
  )
}
