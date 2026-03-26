'use client'

import { useState, useCallback, useRef } from 'react'

interface UseImageUploadReturn {
  referenceImage: string | undefined
  setReferenceImage: (image: string | undefined) => void
  isDragging: boolean
  setIsDragging: (dragging: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleFileChange: (file: File) => Promise<void>
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => Promise<void>
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: () => void
  openFilePicker: () => void
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  clearImage: () => void
}

/**
 * Shared hook for image upload via file picker or drag-and-drop.
 * Used by GenerateForm, VideoGenerateForm, and ArenaForm.
 */
export function useImageUpload(): UseImageUploadReturn {
  const [referenceImage, setReferenceImage] = useState<string | undefined>()
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadImageAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  const handleFileChange = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      const base64 = await loadImageAsBase64(file)
      setReferenceImage(base64)
    },
    [loadImageAsBase64],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) await handleFileChange(file)
    },
    [handleFileChange],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) await handleFileChange(file)
    },
    [handleFileChange],
  )

  const clearImage = useCallback(() => {
    setReferenceImage(undefined)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  return {
    referenceImage,
    setReferenceImage,
    isDragging,
    setIsDragging,
    fileInputRef,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    handleInputChange,
    clearImage,
  }
}
