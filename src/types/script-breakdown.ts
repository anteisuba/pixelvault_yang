import { z } from 'zod'

import {
  SCRIPT_BREAKDOWN_LIMITS,
  SCRIPT_PLANNER_PROVIDER_OPTIONS,
} from '@/constants/script-breakdown'

export const ScriptBreakdownLocaleSchema = z.enum(['en', 'ja', 'zh'])

export const ReferenceBorrowAspectSchema = z.enum([
  'tone',
  'plot_structure',
  'relationship_dynamic',
  'scene_mood',
  'camera_language',
  'world_rules',
])

export const CopyRiskSchema = z.enum(['low', 'medium', 'high'])

export const ShotTypeSchema = z.enum([
  'establishing',
  'wide',
  'medium',
  'closeup',
  'reaction',
])

export const ShotReferenceNeedSchema = z.enum([
  'none',
  'character',
  'scene',
  'first_frame',
  'last_frame',
  'first_and_last_frame',
  'multi_reference',
])

export const ScriptBreakdownRequestSchema = z.object({
  idea: z.string().trim().min(1).max(SCRIPT_BREAKDOWN_LIMITS.IDEA_MAX_LENGTH),
  plannerProvider: z.enum(SCRIPT_PLANNER_PROVIDER_OPTIONS).default('auto'),
  apiKeyId: z.string().trim().min(1).optional(),
  locale: ScriptBreakdownLocaleSchema.default('en'),
})

export type ScriptBreakdownRequest = z.infer<
  typeof ScriptBreakdownRequestSchema
>

export const CharacterDraftSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(40),
  nameSuggestion: z.string().trim().min(1).max(80),
  role: z.string().trim().min(1).max(120),
  functionInStory: z.string().trim().min(1).max(300),
  personality: z.string().trim().min(1).max(300),
  visualSeed: z.string().trim().min(1).max(500),
  goal: z.string().trim().min(1).max(300),
})

export const SceneDraftSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  locationType: z.string().trim().min(1).max(160),
  timeOfDay: z.string().trim().min(1).max(80),
  mood: z.string().trim().min(1).max(160),
  lighting: z.string().trim().min(1).max(200),
  keyProps: z.array(z.string().trim().min(1).max(80)).max(8),
  visualSeed: z.string().trim().min(1).max(500),
})

export const ActionDraftSchema = z.object({
  id: z.string().trim().min(1).max(40),
  actorIds: z.array(z.string().trim().min(1).max(40)).min(1).max(4),
  sceneId: z.string().trim().min(1).max(40),
  verb: z.string().trim().min(1).max(80),
  object: z.string().trim().min(1).max(160),
  consequence: z.string().trim().min(1).max(300),
})

export const BeatDraftSchema = z.object({
  id: z.string().trim().min(1).max(40),
  orderIndex: z.number().int().min(0),
  title: z.string().trim().min(1).max(120),
  durationSec: z
    .number()
    .int()
    .min(SCRIPT_BREAKDOWN_LIMITS.MIN_BEAT_DURATION_SEC)
    .max(SCRIPT_BREAKDOWN_LIMITS.MAX_BEAT_DURATION_SEC),
  sceneId: z.string().trim().min(1).max(40),
  characterIds: z.array(z.string().trim().min(1).max(40)).min(1).max(4),
  visibleAction: z.string().trim().min(1).max(700),
  emotionalTurn: z.string().trim().min(1).max(260),
  consequence: z.string().trim().min(1).max(300),
})

export const ShotDraftSchema = z.object({
  id: z.string().trim().min(1).max(40),
  beatId: z.string().trim().min(1).max(40),
  orderIndex: z.number().int().min(0),
  shotType: ShotTypeSchema,
  cameraMotion: z.string().trim().min(1).max(200),
  startState: z.string().trim().min(1).max(500),
  endState: z.string().trim().min(1).max(500),
  requiredCharacterIds: z.array(z.string().trim().min(1).max(40)).min(1).max(4),
  requiredSceneId: z.string().trim().min(1).max(40),
  referenceNeed: ShotReferenceNeedSchema,
})

export const ScriptBreakdownResultSchema = z.object({
  title: z.string().trim().min(1).max(120),
  logline: z.string().trim().min(1).max(400),
  referenceIntent: z.object({
    referenceName: z.string().trim().min(1).max(120).optional(),
    summary: z.string().trim().min(1).max(400),
    borrowAspects: z.array(ReferenceBorrowAspectSchema).max(6),
    copyRisk: CopyRiskSchema,
    rewriteGuidance: z.string().trim().min(1).max(500),
  }),
  characters: z
    .array(CharacterDraftSchema)
    .min(1)
    .max(SCRIPT_BREAKDOWN_LIMITS.MAX_CHARACTERS),
  scenes: z
    .array(SceneDraftSchema)
    .min(1)
    .max(SCRIPT_BREAKDOWN_LIMITS.MAX_SCENES),
  actions: z
    .array(ActionDraftSchema)
    .min(1)
    .max(SCRIPT_BREAKDOWN_LIMITS.MAX_ACTIONS),
  beats: z.array(BeatDraftSchema).min(1).max(SCRIPT_BREAKDOWN_LIMITS.MAX_BEATS),
  shots: z.array(ShotDraftSchema).min(1).max(SCRIPT_BREAKDOWN_LIMITS.MAX_SHOTS),
})

export type ScriptBreakdownResult = z.infer<typeof ScriptBreakdownResultSchema>

export const ScriptBreakdownPlannerInfoSchema = z.object({
  adapterType: z.enum(['gemini', 'openai']),
  modelId: z.string(),
  label: z.string(),
})

export type ScriptBreakdownPlannerInfo = z.infer<
  typeof ScriptBreakdownPlannerInfoSchema
>

export const ScriptBreakdownResponseDataSchema = z.object({
  breakdown: ScriptBreakdownResultSchema,
  planner: ScriptBreakdownPlannerInfoSchema,
})

export type ScriptBreakdownResponseData = z.infer<
  typeof ScriptBreakdownResponseDataSchema
>

export interface ScriptBreakdownResponse {
  success: boolean
  data?: ScriptBreakdownResponseData
  error?: string
}
