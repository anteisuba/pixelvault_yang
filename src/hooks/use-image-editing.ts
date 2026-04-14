'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import {
  editImageAPI,
  decomposeImageAPI,
  downloadRemoteAsset,
} from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'

export type ImageEditAction =
  | 'upscale'
  | 'remove-background'
  | 'decompose'
  | null

type ErrorTranslator = ((key: string) => string) & {
  has: (key: string) => boolean
}

interface UseImageEditingOptions {
  generationId: string
  generationUrl: string
  tErrors: ErrorTranslator
  labels: {
    editFailed: string
    downloadFailed: string
    editSuccess: string
    editSavedToGallery: string
    decomposeFailed: string
    decomposeSuccess: string
  }
}

export function useImageEditing({
  generationId,
  generationUrl,
  tErrors,
  labels,
}: UseImageEditingOptions) {
  const [editingAction, setEditingAction] = useState<ImageEditAction>(null)

  const editAndDownload = async (
    action: 'upscale' | 'remove-background',
    fileName: string,
  ) => {
    setEditingAction(action)
    const result = await editImageAPI(action, generationUrl)
    setEditingAction(null)

    if (!result.success || !result.data) {
      toast.error(getApiErrorMessage(tErrors, result, labels.editFailed))
      return
    }

    const downloadResult = await downloadRemoteAsset(
      result.data.imageUrl,
      fileName,
    )

    if (!downloadResult.success) {
      toast.error(
        getApiErrorMessage(tErrors, downloadResult, labels.downloadFailed),
      )
      window.open(result.data.imageUrl, '_blank', 'noopener,noreferrer')
      return
    }

    toast.success(labels.editSuccess)
  }

  const editAndSave = async (action: 'upscale' | 'remove-background') => {
    setEditingAction(action)
    const result = await editImageAPI(action, generationUrl, {
      persist: true,
      generationId,
    })
    setEditingAction(null)

    if (!result.success || !result.data) {
      toast.error(getApiErrorMessage(tErrors, result, labels.editFailed))
      return
    }

    toast.success(labels.editSavedToGallery)
  }

  const decomposeAndDownload = async () => {
    setEditingAction('decompose')
    const result = await decomposeImageAPI(generationUrl)
    setEditingAction(null)

    if (!result.success || !result.data) {
      toast.error(getApiErrorMessage(tErrors, result, labels.decomposeFailed))
      return
    }

    const downloadResult = await downloadRemoteAsset(
      result.data.psdUrl,
      `pixelvault-${generationId.slice(0, 8)}-layers.psd`,
    )

    if (!downloadResult.success) {
      toast.error(
        getApiErrorMessage(tErrors, downloadResult, labels.downloadFailed),
      )
      window.open(result.data.psdUrl, '_blank', 'noopener,noreferrer')
      return
    }

    toast.success(labels.decomposeSuccess)
  }

  return {
    editingAction,
    editAndDownload,
    editAndSave,
    decomposeAndDownload,
  }
}
