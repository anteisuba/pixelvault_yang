import "server-only";

import { db } from "@/lib/db";
import type { GenerationRecord, OutputType } from "@/types";
import { PAGINATION } from "@/constants/config";

// ─── Input Types ──────────────────────────────────────────────────

export interface CreateGenerationInput {
  url: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  duration?: number;
  prompt: string;
  negativePrompt?: string;
  model: string;
  provider: string;
  creditsCost: number;
  outputType?: OutputType;
  isPublic?: boolean;
  userId?: string;
}

export interface ListGenerationsOptions {
  page?: number;
  limit?: number;
}

// ─── Service Functions ────────────────────────────────────────────

/**
 * Persist a completed generation to the database.
 * Called after the AI provider returns a result and R2 upload completes.
 */
export async function createGeneration(
  input: CreateGenerationInput,
): Promise<GenerationRecord> {
  return db.generation.create({
    data: {
      url: input.url,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      duration: input.duration,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      model: input.model,
      provider: input.provider,
      creditsCost: input.creditsCost,
      outputType: input.outputType ?? "IMAGE",
      isPublic: input.isPublic ?? true,
      userId: input.userId,
    },
  });
}

/**
 * Get all generations belonging to a specific user, newest first.
 */
export async function getUserGenerations(
  userId: string,
  {
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
  }: ListGenerationsOptions = {},
): Promise<GenerationRecord[]> {
  return db.generation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

/**
 * Get public generations for the gallery, newest first.
 */
export async function getPublicGenerations({
  page = PAGINATION.DEFAULT_PAGE,
  limit = PAGINATION.DEFAULT_LIMIT,
}: ListGenerationsOptions = {}): Promise<GenerationRecord[]> {
  return db.generation.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

/**
 * Get a single generation by its ID.
 */
export async function getGenerationById(
  id: string,
): Promise<GenerationRecord | null> {
  return db.generation.findUnique({
    where: { id },
  });
}
