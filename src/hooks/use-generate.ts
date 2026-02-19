"use client";

import { useState, useCallback } from "react";
import type { GenerateRequest, GenerationRecord } from "@/types";
import { generateImageAPI } from "@/lib/api-client";

interface UseGenerateImageReturn {
  /** Whether image generation is in progress */
  isGenerating: boolean;
  /** Error message from the last generation attempt, or null */
  error: string | null;
  /** The most recently generated Generation record, or null */
  generatedGeneration: GenerationRecord | null;
  /** Trigger image generation with the given parameters */
  generate: (params: GenerateRequest) => Promise<void>;
  /** Clear the current error and generated generation */
  reset: () => void;
}

/**
 * Hook for managing AI image generation state.
 *
 * Handles loading, error, and success states around the generate API call.
 */
export function useGenerateImage(): UseGenerateImageReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedGeneration, setGeneratedGeneration] =
    useState<GenerationRecord | null>(null);

  const generate = useCallback(async (params: GenerateRequest) => {
    setIsGenerating(true);
    setError(null);
    setGeneratedGeneration(null);

    try {
      const response = await generateImageAPI(params);

      if (response.success && response.data) {
        setGeneratedGeneration(response.data.generation);
      } else {
        setError(response.error ?? "Image generation failed");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setGeneratedGeneration(null);
  }, []);

  return { isGenerating, error, generatedGeneration, generate, reset };
}
