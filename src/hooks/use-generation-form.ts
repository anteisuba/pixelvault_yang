'use client'

import { useState, useCallback } from 'react'

import { DEFAULT_ASPECT_RATIO, type AspectRatio } from '@/constants/config'
import { useImageUpload } from '@/hooks/use-image-upload'
import { usePromptEnhance } from '@/hooks/use-prompt-enhance'

interface UseGenerationFormOptions {
  defaultAspectRatio?: string
}

/**
 * Shared form state for generation forms (image, video, arena).
 * Composes useImageUpload and usePromptEnhance with shared prompt/aspectRatio state.
 */
export function useGenerationForm(options?: UseGenerationFormOptions) {
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState<string>(
    options?.defaultAspectRatio ?? DEFAULT_ASPECT_RATIO,
  )

  const imageUpload = useImageUpload()
  const promptEnhance = usePromptEnhance()

  const resetForm = useCallback(() => {
    setPrompt('')
    setAspectRatio(options?.defaultAspectRatio ?? DEFAULT_ASPECT_RATIO)
    imageUpload.clearImage()
    promptEnhance.clearEnhancement()
  }, [options?.defaultAspectRatio, imageUpload, promptEnhance])

  const applyEnhancedPrompt = useCallback(
    (text: string) => {
      setPrompt(text)
      promptEnhance.clearEnhancement()
    },
    [promptEnhance],
  )

  return {
    // Prompt state
    prompt,
    setPrompt,

    // Aspect ratio state
    aspectRatio: aspectRatio as AspectRatio,
    setAspectRatio,

    // Image upload (delegated)
    ...imageUpload,

    // Prompt enhancement (delegated)
    isEnhancing: promptEnhance.isEnhancing,
    enhanced: promptEnhance.enhanced,
    enhancedOriginal: promptEnhance.original,
    enhancedStyle: promptEnhance.style,
    enhancePrompt: promptEnhance.enhance,
    clearEnhancement: promptEnhance.clearEnhancement,

    // Convenience
    applyEnhancedPrompt,
    resetForm,
  }
}
