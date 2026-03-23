'use client'

import VideoPlayer from '@/components/business/VideoPlayer'

interface GalleryDetailVideoPlayerProps {
  src: string
  width?: number
  height?: number
}

export function GalleryDetailVideoPlayer({
  src,
  width,
  height,
}: GalleryDetailVideoPlayerProps) {
  return (
    <VideoPlayer
      src={src}
      width={width}
      height={height}
      className="max-h-[70svh] rounded-none border-0"
    />
  )
}
