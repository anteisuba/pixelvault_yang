'use client'

import { memo, useMemo } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/counter.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'

import type { GenerationRecord } from '@/types'

interface StudioLightboxProps {
  generations: GenerationRecord[]
  index: number
  open: boolean
  onClose: () => void
}

export const StudioLightbox = memo(function StudioLightbox({
  generations,
  index,
  open,
  onClose,
}: StudioLightboxProps) {
  const slides = useMemo(
    () =>
      generations
        .filter((g) => g.url)
        .map((g) => ({
          src: g.url,
          alt: g.prompt?.slice(0, 100) ?? '',
          width: g.width ?? 1024,
          height: g.height ?? 1024,
        })),
    [generations],
  )

  if (slides.length === 0) return null

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Zoom, Counter, Thumbnails]}
      carousel={{ finite: false }}
      zoom={{
        maxZoomPixelRatio: 3,
        scrollToZoom: true,
      }}
      thumbnails={{
        position: 'bottom',
        width: 80,
        height: 80,
        gap: 8,
        borderRadius: 8,
      }}
      styles={{
        container: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
        },
      }}
      animation={{
        fade: 300,
        swipe: 300,
      }}
    />
  )
})
