import { z } from 'zod'

import {
  DEFAULT_SCRIPT_PLANNER_PROVIDER,
  SCRIPT_BREAKDOWN_COPY_RISKS,
  SCRIPT_PLANNER_PROVIDERS,
} from '@/constants/script-breakdown'
import { SEEDANCE_PROMPT_PLAN_LIMITS } from '@/constants/seedance-prompt-plan'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { LOCALES } from '@/i18n/routing'

export const SeedancePromptTimelineItemSchema = z.object({
  startSecond: z.number().min(0).max(600),
  endSecond: z.number().min(0).max(600),
  action: z
    .string()
    .trim()
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.timelineActionMaxLength),
  camera: z
    .string()
    .trim()
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.timelineCameraMaxLength),
  composition: z
    .string()
    .trim()
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.timelineCompositionMaxLength)
    .optional(),
  // User-driven bindings used when spawning the full workflow. The LLM
  // doesn't populate these — they're filled as the user edits the plan
  // and tells the Inspector which character / background each beat needs.
  // Empty / absent means "any character / no specific background".
  characterIds: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  backgroundIds: z.array(z.string().trim().min(1).max(80)).max(4).optional(),
  /** Per-shot cap on reference images. Falls back to model capability. */
  maxReferences: z.number().int().min(0).max(9).optional(),
})

// Summary of the reference assets wired into the downstream Seedance node at
// plan time. Lets the planner orchestrate Seedance's multimodal @VideoN /
// @AudioN tokens with intent instead of leaving the fal builder to prepend
// semantically-empty tokens. Best-effort: empty when the graph has no refs yet.
export const SeedancePromptPlanReferenceAudioSchema = z.object({
  characterName: z.string().trim().min(1).max(80).optional(),
})

export const SeedancePromptPlanReferencesSchema = z.object({
  imageCount: z.number().int().min(0).max(9).default(0),
  videoCount: z.number().int().min(0).max(3).default(0),
  audio: z.array(SeedancePromptPlanReferenceAudioSchema).max(3).default([]),
})

export const SeedancePromptPlanRequestSchema = z.object({
  idea: z.string().trim().min(1).max(SEEDANCE_PROMPT_PLAN_LIMITS.ideaMaxLength),
  plannerProvider: z
    .enum(SCRIPT_PLANNER_PROVIDERS)
    .default(DEFAULT_SCRIPT_PLANNER_PROVIDER),
  apiKeyId: z.string().trim().min(1).max(160).optional(),
  locale: z.enum(LOCALES),
  references: SeedancePromptPlanReferencesSchema.optional(),
})

export const SeedancePromptPlanResultSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.titleMaxLength),
  visualDescription: z
    .string()
    .trim()
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.visualDescriptionMaxLength),
  timeline: z
    .array(SeedancePromptTimelineItemSchema)
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.maxTimelineItems),
  motion: z
    .string()
    .trim()
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.motionMaxLength),
  camera: z
    .string()
    .trim()
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.cameraMaxLength),
  duration: z
    .string()
    .trim()
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.durationMaxLength),
  audioIntent: z
    .string()
    .trim()
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.audioIntentMaxLength),
  finalPrompt: z
    .string()
    .trim()
    .min(1)
    .max(SEEDANCE_PROMPT_PLAN_LIMITS.finalPromptMaxLength),
  copyRisk: z.enum(SCRIPT_BREAKDOWN_COPY_RISKS).default('low'),
})

export const SeedancePromptPlanPlannerSchema = z.object({
  adapterType: z.nativeEnum(AI_ADAPTER_TYPES),
  modelId: z.string().trim().min(1),
  label: z.string().trim().min(1),
})

export const SeedancePromptPlanResponseDataSchema = z.object({
  plan: SeedancePromptPlanResultSchema,
  planner: SeedancePromptPlanPlannerSchema,
})

export const SeedancePromptPlanApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: SeedancePromptPlanResponseDataSchema,
})

export type SeedancePromptTimelineItem = z.infer<
  typeof SeedancePromptTimelineItemSchema
>
export type SeedancePromptPlanReferences = z.infer<
  typeof SeedancePromptPlanReferencesSchema
>
export type SeedancePromptPlanRequest = z.infer<
  typeof SeedancePromptPlanRequestSchema
>
export type SeedancePromptPlanResult = z.infer<
  typeof SeedancePromptPlanResultSchema
>
export type SeedancePromptPlanPlanner = z.infer<
  typeof SeedancePromptPlanPlannerSchema
>
export type SeedancePromptPlanResponseData = z.infer<
  typeof SeedancePromptPlanResponseDataSchema
>
export type SeedancePromptPlanApiSuccessResponse = z.infer<
  typeof SeedancePromptPlanApiSuccessResponseSchema
>
