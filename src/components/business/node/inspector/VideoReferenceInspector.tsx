'use client'

import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { Loader2, Trash2, Upload, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { NODE_STATUS_IDS } from '@/constants/node-types'
import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { uploadReferenceVideoAPI } from '@/lib/api-client'
import { captureVideoThumbnail } from '@/lib/video-thumbnail'
import { REFERENCE_VIDEO_MAX_DURATION_SECONDS } from '@/constants/node-studio'
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

/**
 * Read a File's playback duration in the browser by loading it into a hidden
 * <video> element. We need this to enforce fal's per-clip cap (≤15s) before
 * sending bytes over the wire.
 */
async function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    const cleanup = () => {
      URL.revokeObjectURL(video.src)
      video.remove()
    }
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      cleanup()
      resolve(duration)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('Failed to read video metadata'))
    }
    video.src = URL.createObjectURL(file)
  })
}

export function VideoReferenceInspector({
  node,
}: VideoReferenceInspectorProps) {
  const t = useTranslations('StudioNode.videoReference')
  const { updateNodeData } = useNodeWorkflowActions()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

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

      // Validate duration client-side so we don't ship a 30s clip across the
      // wire only to get it rejected at the fal layer.
      let durationSeconds = 0
      try {
        durationSeconds = await readVideoDurationSeconds(file)
      } catch {
        toast.error(t('errors.metadataFailed'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      if (durationSeconds > REFERENCE_VIDEO_MAX_DURATION_SECONDS) {
        toast.error(
          t('errors.tooLong', {
            max: REFERENCE_VIDEO_MAX_DURATION_SECONDS,
            actual: durationSeconds.toFixed(1),
          }),
          {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          },
        )
        return
      }

      setIsUploading(true)
      try {
        // Grab a poster frame client-side so the manually-uploaded clip carries
        // the same thumbnail the AI-generated path gets (§9.2). Best-effort:
        // a null capture just means no poster, never a failed upload.
        const thumbnailBlob = await captureVideoThumbnail(file)
        const response = await uploadReferenceVideoAPI(file, thumbnailBlob)
        if (!response.success || !response.data) {
          toast.error(response.error ?? t('errors.uploadFailed'), {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          })
          return
        }

        updateNodeData(node.id, {
          mediaUrl: response.data.url,
          mediaLabel: response.data.fileName,
          videoThumbnailUrl: response.data.thumbnailUrl,
          status: NODE_STATUS_IDS.done,
        })
        toast.success(t('uploaded'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
      } finally {
        setIsUploading(false)
      }
    },
    [node.id, t, updateNodeData],
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
            <Loader2 className="size-5 animate-spin text-node-muted" />
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
