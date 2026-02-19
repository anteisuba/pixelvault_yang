"use client";

import { useState } from "react";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";

import { useGenerateImage } from "@/hooks/use-generate";
import { AI_MODELS } from "@/constants/models";
import { ModelSelector } from "@/components/business/ModelSelector";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Main form for generating AI images.
 *
 * Contains model selector, prompt textarea, generate button,
 * and displays the generated image or error.
 */
export function GenerateForm() {
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState<string>(AI_MODELS.SDXL);
  const { isGenerating, error, generatedGeneration, generate } =
    useGenerateImage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    await generate({
      prompt: prompt.trim(),
      modelId: modelId as AI_MODELS,
      aspectRatio: "1:1",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Model Selector */}
      <ModelSelector value={modelId} onChange={setModelId} />

      {/* Prompt Input */}
      <div className="space-y-2">
        <label htmlFor="prompt" className="text-sm font-medium text-foreground">
          Prompt
        </label>
        <Textarea
          id="prompt"
          placeholder="Describe the image you want to generate..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          disabled={isGenerating}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">
          {prompt.length} / 4000 characters
        </p>
      </div>

      {/* Generate Button */}
      <Button
        type="submit"
        size="lg"
        disabled={!prompt.trim() || isGenerating}
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            Generate Image
          </>
        )}
      </Button>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Generated Image */}
      {generatedGeneration && (
        <div className="overflow-hidden rounded-lg border animate-in fade-in-0 zoom-in-95 duration-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={generatedGeneration.url}
            alt={generatedGeneration.prompt}
            className="h-auto w-full object-cover"
          />
        </div>
      )}
    </form>
  );
}
