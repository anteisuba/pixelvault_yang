"use client";

import { useState, useCallback } from "react";
import type { GenerateRequest } from "@/types";
import { generateImageAPI } from "@/lib/api-client";

interface UseGenerateImageReturn {
  /** Whether image generation is in progress */
  isGenerating: boolean;
  /** Error message from the last generation attempt, or null */
  error: string | null;
  /** URL of the most recently generated image, or null */
  generatedImageUrl: string | null;
  /** Trigger image generation with the given parameters */
  generate: (params: GenerateRequest) => Promise<void>;
  /** Clear the current error and generated image */
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
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(
    null,
  );

  const generate = useCallback(async (params: GenerateRequest) => {
    setIsGenerating(true);
    setError(null);
    setGeneratedImageUrl(null);

    try {
      const response = await generateImageAPI(params);

      if (response.success && response.data) {
        setGeneratedImageUrl(response.data.imageUrl);
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
    setGeneratedImageUrl(null);
  }, []);

  return { isGenerating, error, generatedImageUrl, generate, reset };
}
