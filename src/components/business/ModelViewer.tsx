'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

interface ModelViewerProps {
  /** Public URL of the GLB file (typically `generation.modelUrl`) */
  src: string
  /** Optional poster PNG shown before the mesh loads */
  poster?: string
  /** Tailwind classes for the wrapper element */
  className?: string
  /** Aria label / model name */
  alt?: string
  /** Auto-rotate the model on load (default: true) */
  autoRotate?: boolean
  /** Allow user to orbit / zoom (default: true) */
  cameraControls?: boolean
  /** Show AR button (default: true; iOS needs ios-src USDZ to actually launch AR) */
  ar?: boolean
  /** Optional iOS USDZ for AR Quick Look */
  iosSrc?: string
  /**
   * Called once with a PNG blob shortly after the mesh becomes visible.
   * Used by Studio3DWorkspace to upload a poster thumbnail.
   */
  onPosterCaptured?: (blob: Blob) => void
  /**
   * Forwarded into the underlying `<model-viewer>` so callers can drop a
   * `<button slot="ar-button">…</button>` to replace model-viewer's
   * default AR icon. Passes through unchanged.
   */
  children?: React.ReactNode
}

// `<model-viewer>` is a Custom Element. It registers `customElements.define`
// at import time, which throws "customElements is undefined" under SSR.
// `next/dynamic` with `ssr:false` defers the import to the client.
const ModelViewerInner = dynamic(() => import('./ModelViewerInner'), {
  ssr: false,
})

export function ModelViewer({ className, ...rest }: ModelViewerProps) {
  const t = useTranslations('Model3DGenerate')

  return (
    <div
      className={cn(
        'relative flex size-full items-center justify-center overflow-hidden rounded-xl bg-muted/30',
        className,
      )}
    >
      <ModelViewerInner
        loadingFallback={
          <span className="text-sm text-muted-foreground">
            {t('viewerLoading')}
          </span>
        }
        {...rest}
      />
    </div>
  )
}

export type { ModelViewerProps }
export type ModelViewerInnerProps = ComponentProps<typeof ModelViewerInner>
