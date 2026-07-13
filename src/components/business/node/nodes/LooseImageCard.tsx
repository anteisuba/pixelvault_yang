'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { NodeResizer, NodeToolbar, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE } from '@/constants/node-studio'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import {
  CanvasImageSelectionToolbar,
  canOfferCanvasImageEdit,
  NodeSelectionToolbarChrome,
} from '../CanvasImageSelectionToolbar'
import { CanvasQuickEditPrompt } from '../CanvasQuickEditPrompt'

interface LooseImageCardProps {
  id: string
  data: NodeWorkflowNodeData
  selected?: boolean
  /** React Flow node width (from resize / initial size). */
  width?: number
  /** React Flow node height (from resize / initial size). */
  height?: number
}

function getImageUrl(data: NodeWorkflowNodeData): string {
  if (typeof data.mediaUrl === 'string' && data.mediaUrl.trim()) {
    return data.mediaUrl
  }
  if (typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    return data.imageUrl
  }
  return ''
}

/**
 * Pure-image canvas object. Size is owned by the React Flow node (width/height);
 * NodeResizer corner handles drag to scale. Content always fills 100% so resize
 * is not fought by a fixed Tailwind width.
 */
export function LooseImageCard({
  id,
  data,
  selected,
  width,
  height,
}: LooseImageCardProps) {
  const t = useTranslations('StudioNode.ingest.looseImage')
  const mediaUrl = getImageUrl(data)
  const [quickEditOpen, setQuickEditOpen] = useState(false)
  const [naturalSize, setNaturalSize] = useState<{
    width: number
    height: number
  } | null>(null)

  const label =
    (typeof data.mediaLabel === 'string' && data.mediaLabel.trim()) ||
    (typeof data.sourceLabel === 'string' && data.sourceLabel.trim()) ||
    t('untitled')

  const frameWidth = width ?? NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE
  const frameHeight = height ?? NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE

  const displaySize = useMemo(() => {
    const mediaW =
      typeof data.mediaWidth === 'number' && data.mediaWidth > 0
        ? Math.round(data.mediaWidth)
        : naturalSize?.width
    const mediaH =
      typeof data.mediaHeight === 'number' && data.mediaHeight > 0
        ? Math.round(data.mediaHeight)
        : naturalSize?.height
    if (!mediaW || !mediaH) return null
    return { width: mediaW, height: mediaH }
  }, [data.mediaHeight, data.mediaWidth, naturalSize])

  const offerEdit = canOfferCanvasImageEdit(data)

  return (
    <div
      data-testid="loose-image-card"
      className={cn(
        'group relative box-border select-none',
        selected && 'z-10',
      )}
      style={{
        width: frameWidth,
        height: frameHeight,
      }}
    >
      {/*
        Corner + edge handles: drag any corner to scale the image on canvas.
        keepAspectRatio so pure images don't shear.
      */}
      <NodeResizer
        nodeId={id}
        isVisible={Boolean(selected) && !quickEditOpen}
        minWidth={120}
        minHeight={120}
        maxWidth={2400}
        maxHeight={2400}
        keepAspectRatio
        autoScale
        color="var(--node-paint)"
        handleStyle={{
          width: 12,
          height: 12,
          borderRadius: 2,
          borderWidth: 2,
          borderColor: 'var(--node-paint)',
          backgroundColor: 'var(--node-panel)',
          // Sit outside the paint outline so the hit target is easy to grab.
        }}
        lineStyle={{
          borderColor: 'var(--node-paint)',
          borderWidth: 1,
          opacity: 0.55,
        }}
      />

      <NodeToolbar
        nodeId={id}
        isVisible={Boolean(selected) && !quickEditOpen}
        position={Position.Top}
        offset={14}
      >
        {offerEdit ? (
          <CanvasImageSelectionToolbar
            nodeId={id}
            data={data}
            onQuickEditOpenChange={setQuickEditOpen}
            quickEditOpen={quickEditOpen}
          />
        ) : (
          <NodeSelectionToolbarChrome
            nodeId={id}
            data={data}
            selected={selected}
          />
        )}
      </NodeToolbar>

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 -top-5 flex items-end justify-between gap-2 px-0.5 text-[11px] leading-4',
          selected ? 'text-node-paint' : 'text-node-muted',
        )}
      >
        <span className="min-w-0 truncate font-medium" title={label}>
          {label}
        </span>
        {displaySize ? (
          <span className="shrink-0 tabular-nums opacity-90">
            {displaySize.width} × {displaySize.height}
          </span>
        ) : (
          <span className="shrink-0 tabular-nums opacity-80">
            {Math.round(frameWidth)} × {Math.round(frameHeight)}
          </span>
        )}
      </div>

      <div
        className={cn(
          'absolute inset-0 overflow-hidden bg-node-card-window',
          selected
            ? 'outline outline-2 outline-offset-0 outline-node-paint'
            : 'outline outline-1 outline-offset-0 outline-transparent group-hover:outline-node-edge/40',
        )}
      >
        {mediaUrl ? (
          <Image
            src={mediaUrl}
            alt={t('cardAlt')}
            fill
            sizes={`${Math.round(frameWidth)}px`}
            className="object-cover"
            unoptimized
            draggable={false}
            onLoad={(event) => {
              const img = event.currentTarget
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setNaturalSize({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                })
              }
            }}
          />
        ) : null}
      </div>

      <NodeToolbar
        nodeId={id}
        isVisible={Boolean(selected) && quickEditOpen}
        position={Position.Bottom}
        offset={14}
      >
        <CanvasQuickEditPrompt
          nodeId={id}
          data={data}
          fileLabel={label}
          onClose={() => setQuickEditOpen(false)}
        />
      </NodeToolbar>
    </div>
  )
}
