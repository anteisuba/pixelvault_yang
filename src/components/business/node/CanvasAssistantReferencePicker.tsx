'use client'

import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  AssistantReferencePicker,
  type AssistantReferenceOption,
} from '@/components/business/assistant/AssistantReferencePicker'
import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import { uploadReferenceVideoAPI } from '@/lib/api-client'
import { captureVideoThumbnail } from '@/lib/video-thumbnail'
import type { GenerationRecord } from '@/types'
import type { NodeAssistantMediaReference } from '@/types/node-assistant'

interface CanvasAssistantReferencePickerProps {
  disabled?: boolean
  references: readonly NodeAssistantMediaReference[]
  selectedReferences: readonly NodeAssistantMediaReference[]
  onAddReference(reference: NodeAssistantMediaReference): void
}

function createReferenceId(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
}

export function CanvasAssistantReferencePicker({
  disabled = false,
  references,
  selectedReferences,
  onAddReference,
}: CanvasAssistantReferencePickerProps) {
  const t = useTranslations('StudioNode.conversation')
  const tVideo = useTranslations('StudioNode.videoReference')
  const imageUpload = useNodeReferenceUpload()

  const addImageAsset = (generation: GenerationRecord) => {
    if (generation.outputType !== 'IMAGE') return false
    onAddReference({
      id: `gallery-image:${generation.id}`,
      source: 'gallery',
      kind: 'image',
      url: generation.url,
      thumbnailUrl: generation.thumbnailUrl ?? generation.url,
      label: generation.prompt?.trim() || t('galleryImageLabel'),
    })
  }

  const uploadImage = async (file: File) => {
    const result = await imageUpload.uploadFile(
      file,
      'Node assistant reference image',
    )
    if (!result.success || !result.url) {
      toast.error(result.error ?? t('referenceUploadFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return false
    }

    onAddReference({
      id: result.generationId
        ? `uploaded-image:${result.generationId}`
        : createReferenceId('uploaded-image'),
      source: 'upload',
      kind: 'image',
      url: result.url,
      thumbnailUrl: result.url,
      label: file.name,
    })
  }

  const uploadVideo = async (file: File) => {
    // No client-side duration cap (owner call, FB-1): the card/inspector upload
    // path dropped its 15s gate; this assistant path drops the matching one so
    // "no 15s limit" holds everywhere. fal's downstream per-clip limit still
    // applies at generation time, just isn't pre-validated here.
    const thumbnailBlob = await captureVideoThumbnail(file)
    const response = await uploadReferenceVideoAPI(file, thumbnailBlob)
    if (!response.success || !response.data) {
      toast.error(response.error ?? tVideo('errors.uploadFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return false
    }

    onAddReference({
      id: createReferenceId('uploaded-video'),
      source: 'upload',
      kind: 'video',
      url: response.data.url,
      thumbnailUrl: response.data.thumbnailUrl,
      label: response.data.fileName || file.name,
    })
  }

  const addExisting = (reference: AssistantReferenceOption) => {
    const original = references.find((item) => item.id === reference.id)
    if (original) onAddReference(original)
  }

  return (
    <AssistantReferencePicker
      disabled={disabled}
      hasSelection={selectedReferences.length > 0}
      existingReferences={references}
      selectedReferenceIds={selectedReferences.map((reference) => reference.id)}
      allowVideoUpload
      labels={{
        trigger: t('addReference'),
        title: t('referencePickerTitle'),
        imageDropHint: t('imageDropHint'),
        recentImages: t('recentImages'),
        recentImagesEmpty: t('recentImagesEmpty'),
        openLibrary: t('openImageLibrary'),
        libraryTitle: t('imageLibraryTitle'),
        libraryDescription: t('imageLibraryDescription'),
        existingReferences: t('canvasReferences'),
        uploadVideo: t('uploadVideo'),
      }}
      onPickImageFile={uploadImage}
      onPickImageAsset={addImageAsset}
      onPickVideoFile={uploadVideo}
      onPickExisting={addExisting}
      triggerClassName="text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
      contentClassName="border-node-panel-inner bg-node-panel text-node-foreground shadow-node-panel"
    />
  )
}
