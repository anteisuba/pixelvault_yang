'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useCallback } from 'react'
import { GripVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { StoryPanelRecord } from '@/types'
import { cn } from '@/lib/utils'

interface StoryImagePickerProps {
  panels: StoryPanelRecord[]
  onReorder: (panelIds: string[]) => void
}

export function StoryImagePicker({ panels, onReorder }: StoryImagePickerProps) {
  const t = useTranslations('StoryBoard')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIndex(index)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault()
      if (dragIndex === null || dragIndex === dropIndex) {
        setDragIndex(null)
        setOverIndex(null)
        return
      }

      const reordered = [...panels]
      const [moved] = reordered.splice(dragIndex, 1)
      reordered.splice(dropIndex, 0, moved)
      onReorder(reordered.map((p) => p.id))

      setDragIndex(null)
      setOverIndex(null)
    },
    [dragIndex, panels, onReorder],
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setOverIndex(null)
  }, [])

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t('reorderHint')}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {panels.map((panel, index) => (
          <div
            key={panel.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={cn(
              'group relative flex shrink-0 cursor-grab items-center gap-1 rounded-xl border transition-all active:cursor-grabbing',
              dragIndex === index && 'opacity-40',
              overIndex === index && dragIndex !== index
                ? 'border-primary bg-primary/5'
                : 'border-border/75',
            )}
          >
            <div className="flex items-center px-1 text-muted-foreground/50">
              <GripVertical className="size-3.5" />
            </div>
            <div className="size-16 overflow-hidden rounded-r-lg">
              {panel.generation?.url ? (
                <img
                  src={panel.generation.url}
                  alt={`Panel ${index + 1}`}
                  className="size-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                  {index + 1}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
