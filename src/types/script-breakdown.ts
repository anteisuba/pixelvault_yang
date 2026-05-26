import { z } from 'zod'

import {
  DEFAULT_SCRIPT_PLANNER_PROVIDER,
  SCRIPT_BREAKDOWN_COPY_RISKS,
  SCRIPT_BREAKDOWN_LIMITS,
  SCRIPT_PLANNER_PROVIDERS,
} from '@/constants/script-breakdown'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { LOCALES } from '@/i18n/routing'

const BreakdownIdSchema = z.string().trim().min(1).max(80)
const BreakdownTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(SCRIPT_BREAKDOWN_LIMITS.fieldMaxLength)

export const CharacterDraftSchema = z.object({
  id: BreakdownIdSchema,
  label: BreakdownTextSchema,
  nameSuggestion: BreakdownTextSchema,
  role: BreakdownTextSchema,
  functionInStory: BreakdownTextSchema,
  personality: BreakdownTextSchema,
  visualSeed: BreakdownTextSchema,
  goal: BreakdownTextSchema,
})

export const SceneDraftSchema = z.object({
  id: BreakdownIdSchema,
  label: BreakdownTextSchema,
  summary: BreakdownTextSchema,
  location: BreakdownTextSchema,
  timeOfDay: BreakdownTextSchema,
  mood: BreakdownTextSchema,
})

export const ActionDraftSchema = z.object({
  id: BreakdownIdSchema,
  sceneId: BreakdownIdSchema,
  label: BreakdownTextSchema,
  description: BreakdownTextSchema,
})

export const BeatDraftSchema = z.object({
  id: BreakdownIdSchema,
  sceneId: BreakdownIdSchema,
  label: BreakdownTextSchema,
  emotionalTurn: BreakdownTextSchema,
  description: BreakdownTextSchema,
})

export const ShotDraftSchema = z.object({
  id: BreakdownIdSchema,
  sceneId: BreakdownIdSchema,
  beatId: BreakdownIdSchema.optional(),
  label: BreakdownTextSchema,
  camera: BreakdownTextSchema,
  composition: BreakdownTextSchema,
  promptSeed: BreakdownTextSchema,
  // Duration is user-driven (LLM doesn't emit timestamps in breakdown
  // mode) — used by the Seedance node when spawning the full workflow.
  startSecond: z.number().min(0).max(600).optional(),
  endSecond: z.number().min(0).max(600).optional(),
  // User-driven bindings, same role as on SeedancePromptTimelineItem.
  characterIds: z.array(BreakdownIdSchema).max(12).optional(),
  backgroundIds: z.array(BreakdownIdSchema).max(4).optional(),
  /** Per-shot cap on reference images. Falls back to model capability. */
  maxReferences: z.number().int().min(0).max(9).optional(),
})

export const ScriptBreakdownRequestSchema = z.object({
  idea: z.string().trim().min(1).max(SCRIPT_BREAKDOWN_LIMITS.ideaMaxLength),
  plannerProvider: z
    .enum(SCRIPT_PLANNER_PROVIDERS)
    .default(DEFAULT_SCRIPT_PLANNER_PROVIDER),
  apiKeyId: z.string().trim().min(1).max(160).optional(),
  locale: z.enum(LOCALES),
})

export const ScriptBreakdownResultSchema = z.object({
  title: z.string().trim().min(1).max(SCRIPT_BREAKDOWN_LIMITS.titleMaxLength),
  logline: z
    .string()
    .trim()
    .min(1)
    .max(SCRIPT_BREAKDOWN_LIMITS.loglineMaxLength),
  referenceIntent: z
    .string()
    .trim()
    .min(1)
    .max(SCRIPT_BREAKDOWN_LIMITS.referenceIntentMaxLength),
  copyRisk: z.enum(SCRIPT_BREAKDOWN_COPY_RISKS).default('low'),
  characters: z
    .array(CharacterDraftSchema)
    .max(SCRIPT_BREAKDOWN_LIMITS.maxCharacters),
  scenes: z.array(SceneDraftSchema).max(SCRIPT_BREAKDOWN_LIMITS.maxScenes),
  actions: z.array(ActionDraftSchema).max(SCRIPT_BREAKDOWN_LIMITS.maxActions),
  beats: z.array(BeatDraftSchema).max(SCRIPT_BREAKDOWN_LIMITS.maxBeats),
  shots: z.array(ShotDraftSchema).max(SCRIPT_BREAKDOWN_LIMITS.maxShots),
})

export const ScriptBreakdownPlannerSchema = z.object({
  adapterType: z.nativeEnum(AI_ADAPTER_TYPES),
  modelId: z.string().trim().min(1),
  label: z.string().trim().min(1),
})

export const ScriptBreakdownResponseDataSchema = z.object({
  breakdown: ScriptBreakdownResultSchema,
  planner: ScriptBreakdownPlannerSchema,
})

export const ScriptBreakdownApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: ScriptBreakdownResponseDataSchema,
})

export type CharacterDraft = z.infer<typeof CharacterDraftSchema>
export type SceneDraft = z.infer<typeof SceneDraftSchema>
export type ActionDraft = z.infer<typeof ActionDraftSchema>
export type BeatDraft = z.infer<typeof BeatDraftSchema>
export type ShotDraft = z.infer<typeof ShotDraftSchema>
export type ScriptBreakdownRequest = z.infer<
  typeof ScriptBreakdownRequestSchema
>
export type ScriptBreakdownResult = z.infer<typeof ScriptBreakdownResultSchema>
export type ScriptBreakdownPlanner = z.infer<
  typeof ScriptBreakdownPlannerSchema
>
export type ScriptBreakdownResponseData = z.infer<
  typeof ScriptBreakdownResponseDataSchema
>
export type ScriptBreakdownApiSuccessResponse = z.infer<
  typeof ScriptBreakdownApiSuccessResponseSchema
>
