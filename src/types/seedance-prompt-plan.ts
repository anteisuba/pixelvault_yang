import { z } from 'zod'

import {
  DEFAULT_SCRIPT_PLANNER_PROVIDER,
  SCRIPT_BREAKDOWN_COPY_RISKS,
  SCRIPT_PLANNER_PROVIDERS,
} from '@/constants/script-breakdown'
import { SEEDANCE_PROMPT_PLAN_LIMITS } from '@/constants/seedance-prompt-plan'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VIDEO_REFERENCE_LIMITS } from '@/constants/video-reference-limits'
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

// The reference assets that will ACTUALLY ship with the downstream Seedance
// request, in slot order — derived from the same `buildVideoSendPreview`
// projection the send path uses (`summarizeVideoSendReferences`), never
// re-counted here. Names/kinds let the planner give every @ImageN a scoped
// job ("@Image2 fixes the room layout and light direction, nothing else")
// instead of a bare count; the ceilings are the request-level ones in
// `VIDEO_REFERENCE_LIMITS` (Seedance 2.5 reaches all three).
export const SEEDANCE_PROMPT_PLAN_IMAGE_KINDS = [
  'character',
  'background',
  'shot',
  'closeup',
] as const

export const SeedancePromptPlanReferenceImageSchema = z.object({
  /** 1-based `@ImageN` slot — the position Seedance resolves. */
  index: z.number().int().min(1).max(VIDEO_REFERENCE_LIMITS.IMAGES),
  /** Creation-layer name (`@name` token the composer renders); undefined for
   *  a category-only entry such as a keyframe. */
  name: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(SEEDANCE_PROMPT_PLAN_IMAGE_KINDS).optional(),
  /** Category label (e.g. 首帧 / 关键帧 / pose) when the slot carries one. */
  category: z.string().trim().min(1).max(80).optional(),
})

export const SeedancePromptPlanReferenceAudioSchema = z.object({
  characterName: z.string().trim().min(1).max(80).optional(),
})

export const SeedancePromptPlanReferencesSchema = z.object({
  images: z
    .array(SeedancePromptPlanReferenceImageSchema)
    .max(VIDEO_REFERENCE_LIMITS.IMAGES)
    .default([]),
  videoCount: z
    .number()
    .int()
    .min(0)
    .max(VIDEO_REFERENCE_LIMITS.VIDEOS)
    .default(0),
  audio: z
    .array(SeedancePromptPlanReferenceAudioSchema)
    .max(VIDEO_REFERENCE_LIMITS.AUDIO)
    .default([]),
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
export type SeedancePromptPlanReferenceImage = z.infer<
  typeof SeedancePromptPlanReferenceImageSchema
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
