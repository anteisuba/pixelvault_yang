'use client'

import { useState, useCallback, useRef } from 'react'

interface UseImageUploadReturn {
  /** First reference image (backward compat for single-image adapters) */
  referenceImage: string | undefined
  setReferenceImage: (image: string | undefined) => void
  /** All reference images (for multi-image adapters like Gemini) */
  referenceImages: string[]
  addReferenceImage: (image: string) => void
  removeReferenceImage: (index: number) => void
  clearAllImages: () => void
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
 * Supports multiple reference images — new images are appended to the list.
 * `referenceImage` returns the first image for backward compatibility.
 */
export function useImageUpload(): UseImageUploadReturn {
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const referenceImage = referenceImages[0] as string | undefined

  const loadImageAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  const addReferenceImage = useCallback((image: string) => {
    setReferenceImages((prev) => [...prev, image])
  }, [])

  const removeReferenceImage = useCallback((index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearAllImages = useCallback(() => {
    setReferenceImages([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Legacy setter — replaces all images with a single one (or clears)
  const setReferenceImage = useCallback((image: string | undefined) => {
    setReferenceImages(image ? [image] : [])
  }, [])

  const handleFileChange = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      const base64 = await loadImageAsBase64(file)
      addReferenceImage(base64)
    },
    [loadImageAsBase64, addReferenceImage],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      // Support dropping multiple files
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/'),
      )
      for (const file of files) {
        const base64 = await loadImageAsBase64(file)
        addReferenceImage(base64)
      }
    },
    [loadImageAsBase64, addReferenceImage],
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
      const files = e.target.files
      if (!files) return
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          const base64 = await loadImageAsBase64(file)
          addReferenceImage(base64)
        }
      }
    },
    [loadImageAsBase64, addReferenceImage],
  )

  // Legacy clear — clears all images
  const clearImage = clearAllImages

  return {
    referenceImage,
    setReferenceImage,
    referenceImages,
    addReferenceImage,
    removeReferenceImage,
    clearAllImages,
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
