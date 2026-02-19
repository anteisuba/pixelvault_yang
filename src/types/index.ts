import { z } from "zod";
import { AI_MODELS } from "@/constants/models";
import type { AspectRatio } from "@/constants/config";

// Re-export ModelOption from constants for convenience
export type { ModelOption } from "@/constants/models";

// ─── Generate Request ─────────────────────────────────────────────

/** Zod schema for image generation request validation */
export const GenerateRequestSchema = z.object({
  /** User's text prompt describing the desired image */
  prompt: z
    .string()
    .min(1, "Prompt is required")
    .max(4000, "Prompt must be less than 4000 characters"),
  /** Selected AI model identifier */
  modelId: z.nativeEnum(AI_MODELS),
  /** Aspect ratio for the generated image */
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
});

/** Image generation request type (derived from Zod schema) */
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

// ─── Generate Response ────────────────────────────────────────────

/** Successful generation response data */
export interface GenerateResponseData {
  generation: GenerationRecord;
}

/** Image generation API response */
export interface GenerateResponse {
  /** Whether the generation was successful */
  success: boolean;
  /** Response data (present when success is true) */
  data?: GenerateResponseData;
  /** Error message (present when success is false) */
  error?: string;
}

// ─── Image Record ─────────────────────────────────────────────────

export type OutputType = "IMAGE" | "VIDEO" | "AUDIO";
export type GenerationStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface GenerationRecord {
  id: string;
  createdAt: Date;
  outputType: OutputType;
  status: GenerationStatus;
  url: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  duration?: number | null;
  prompt: string;
  negativePrompt?: string | null;
  model: string;
  provider: string;
  creditsCost: number;
  isPublic: boolean;
  userId?: string | null;
}