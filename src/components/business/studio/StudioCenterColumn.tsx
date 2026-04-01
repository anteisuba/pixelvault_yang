'use client'

import { memo, useState, useCallback } from 'react'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

import { StudioPromptArea } from './StudioPromptArea'
import { StudioGenerateBar } from './StudioGenerateBar'
import { StudioToolbarPanels } from './StudioToolbarPanels'

export const StudioCenterColumn = memo(function StudioCenterColumn({
  className,
}: {
  className?: string
}) {
  const { dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()

  // Global drop zone: accept dragged history images as reference images
  const [isDragOver, setIsDragOver] = useState(false)

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-studio-ref')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }, [])

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    if (
      e.currentTarget === e.target ||
      !e.currentTarget.contains(e.relatedTarget as Node)
    ) {
      setIsDragOver(false)
    }
  }, [])

  const handleGlobalDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const studioRef = e.dataTransfer.getData('application/x-studio-ref')
      if (!studioRef) return
      try {
        const { url } = JSON.parse(studioRef) as { url: string }
        if (url) {
          await imageUpload.addFromUrl(url)
          dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
        }
      } catch {
        // Ignore invalid data
      }
    },
    [imageUpload, dispatch],
  )

  return (
    <div
      className={cn(
        'space-y-4 transition-colors',
        isDragOver &&
          'ring-2 ring-primary/40 ring-inset rounded-xl bg-primary/5',
        className,
      )}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      <StudioPromptArea />
      <StudioGenerateBar />
      <StudioToolbarPanels />
    </div>
  )
})
