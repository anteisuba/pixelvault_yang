'use client'

import { useCallback, useRef, type ChangeEvent } from 'react'
import { Trash2, Upload, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { NODE_STATUS_IDS } from '@/constants/node-types'
import { useReferenceVideoUpload } from '@/hooks/node/use-reference-video-upload'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'

interface VideoReferenceInspectorProps {
  node: NodeWorkflowNode
}

const ACCEPTED_VIDEO_MIME = 'video/mp4,video/quicktime,video/webm'

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / 1024 / 1024
  return `${mb.toFixed(1)} MB`
}

export function VideoReferenceInspector({
  node,
}: VideoReferenceInspectorProps) {
  const t = useTranslations('StudioNode.videoReference')
  const { updateNodeData } = useNodeWorkflowActions()
  const { uploadFile, isUploading } = useReferenceVideoUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mediaUrl =
    typeof node.data.mediaUrl === 'string' ? node.data.mediaUrl : null
  const mediaLabel =
    typeof node.data.mediaLabel === 'string' ? node.data.mediaLabel : null
  const videoThumbnailUrl =
    typeof node.data.videoThumbnailUrl === 'string'
      ? node.data.videoThumbnailUrl
      : undefined

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return

      const patch = await uploadFile(file)
      if (!patch) return

      updateNodeData(node.id, { ...patch, status: NODE_STATUS_IDS.done })
    },
    [node.id, updateNodeData, uploadFile],
  )

  const handleClear = useCallback(() => {
    updateNodeData(node.id, {
      mediaUrl: undefined,
      mediaLabel: undefined,
      status: NODE_STATUS_IDS.idle,
    })
  }, [node.id, updateNodeData])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
        <p className="text-sm font-semibold text-node-foreground">
          {t('title')}
        </p>
        <p className="mt-1 text-xs leading-5 text-node-muted">
          {t('description')}
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_VIDEO_MIME}
        className="hidden"
        onChange={(event) => void handleFileChange(event)}
      />

      <div className="relative aspect-video overflow-hidden rounded-xl border border-node-panel-inner bg-node-panel-soft">
        {mediaUrl ? (
          <video
            src={mediaUrl}
            poster={videoThumbnailUrl}
            className="h-full w-full object-cover"
            controls
            muted
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-node-port-video/20 text-node-port-video">
              <Video className="size-5" />
            </span>
            <p className="text-xs leading-5 text-node-muted">
              {t('emptyPreview')}
            </p>
          </div>
        )}
        {isUploading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
            <Spinner size="lg" className="text-node-muted" />
            <span className="text-xs font-semibold">{t('uploading')}</span>
          </div>
        ) : null}
      </div>

      {mediaLabel ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-xs">
          <span className="truncate text-node-foreground">{mediaLabel}</span>
          <span className="shrink-0 text-node-muted">
            {formatBytes(
              typeof node.data.sizeBytes === 'number'
                ? node.data.sizeBytes
                : undefined,
            )}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={openFilePicker}
          disabled={isUploading}
          className="bg-node-foreground text-node-canvas hover:bg-node-foreground/90"
        >
          <Upload className="mr-2 size-4" />
          {mediaUrl ? t('replace') : t('upload')}
        </Button>
        {mediaUrl ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={isUploading}
          >
            <Trash2 className="mr-2 size-4" />
            {t('clear')}
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-node-panel-inner bg-node-panel-soft p-3 text-xs leading-5 text-node-muted">
        <p>{t('constraints')}</p>
      </div>
    </div>
  )
}
