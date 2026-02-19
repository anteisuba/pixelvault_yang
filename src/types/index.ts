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
  /** URL of the generated image */
  imageUrl: string;
  /** The prompt used for generation */
  prompt: string;
  /** The model used for generation */
  model: string;
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

/** Database Image record (corresponds to Prisma Image model) */
export interface ImageRecord {
  /** Unique identifier (cuid) */
  id: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Permanent URL (R2 public link) */
  url: string;
  /** File path in R2 bucket */
  storageKey: string;
  /** User's text prompt */
  prompt: string;
  /** Optional negative prompt */
  negativePrompt?: string | null;
  /** AI model identifier used for generation */
  model: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Associated user ID (null for guest generations) */
  userId?: string | null;
  /** Whether the image is visible in the public gallery */
  isPublic: boolean;
}
