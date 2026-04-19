import { z } from 'zod'

import {
  VideoScriptStatus,
  VideoScriptSceneStatus,
} from '@/lib/generated/prisma/enums'
import {
  CAMERA_SHOTS,
  CONSISTENCY_MODES,
  SCENE_DURATION_RANGE,
  TRANSITIONS,
  VIDEO_SCRIPT_VIDEO_MODELS,
} from '@/constants/video-script'

// Re-export Prisma enums for app-layer consumers
export { VideoScriptStatus, VideoScriptSceneStatus }

// ─── Scene ────────────────────────────────────────────────────────

/** Canonical shape of a single scene (API + storage). */
export const VideoScriptSceneSchema = z.object({
  id: z.string().optional(), // assigned by DB on create
  scriptId: z.string().optional(),
  orderIndex: z.number().int().min(0),
  duration: z
    .number()
    .int()
    .min(SCENE_DURATION_RANGE.min)
    .max(SCENE_DURATION_RANGE.max),
  cameraShot: z.enum(CAMERA_SHOTS),
  action: z.string().min(1).max(2000),
  dialogue: z.string().max(500).nullable().optional(),
  transition: z.enum(TRANSITIONS),
  frameGenerationId: z.string().nullable().optional(), // VS10 — plain string, no FK
  clipGenerationId: z.string().nullable().optional(),
  status: z.nativeEnum(VideoScriptSceneStatus).optional(),
  errorMessage: z.string().nullable().optional(),
})
export type VideoScriptScene = z.infer<typeof VideoScriptSceneSchema>

// ─── Script (full) ────────────────────────────────────────────────

export const VideoScriptSchema = z.object({
  id: z.string(),
  userId: z.string(),
  topic: z.string().min(1).max(1000),
  targetDuration: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  totalScenes: z.number().int().min(1),
  status: z.nativeEnum(VideoScriptStatus),
  consistencyMode: z.enum(CONSISTENCY_MODES),
  characterCardId: z.string().nullable().optional(),
  styleCardId: z.string().nullable().optional(),
  videoModelId: z.enum(VIDEO_SCRIPT_VIDEO_MODELS),
  finalVideoUrl: z.string().nullable().optional(),
  scenes: z.array(VideoScriptSceneSchema),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
})
export type VideoScriptRecord = z.infer<typeof VideoScriptSchema>

// ─── API input schemas ────────────────────────────────────────────

/** POST /api/video-script body. VS6: characterCardId required when mode = character_card. */
export const CreateVideoScriptInputSchema = z
  .object({
    topic: z.string().min(1).max(1000),
    targetDuration: z.union([z.literal(30), z.literal(60), z.literal(120)]),
    consistencyMode: z.enum(CONSISTENCY_MODES),
    characterCardId: z.string().nullable().optional(),
    styleCardId: z.string().nullable().optional(),
    videoModelId: z.enum(VIDEO_SCRIPT_VIDEO_MODELS),
  })
  .refine(
    (v) =>
      v.consistencyMode !== 'character_card' ||
      (v.characterCardId != null && v.characterCardId.length > 0),
    {
      message:
        'characterCardId is required when consistencyMode is character_card',
      path: ['characterCardId'],
    },
  )
export type CreateVideoScriptInput = z.infer<
  typeof CreateVideoScriptInputSchema
>

/** PATCH /api/video-script/[id] body — edit scenes and/or advance status. */
export const UpdateVideoScriptInputSchema = z
  .object({
    scenes: z.array(VideoScriptSceneSchema).optional(),
    status: z.nativeEnum(VideoScriptStatus).optional(),
  })
  .refine((v) => v.scenes != null || v.status != null, {
    message: 'At least one of scenes or status must be provided',
  })
export type UpdateVideoScriptInput = z.infer<
  typeof UpdateVideoScriptInputSchema
>

/** GET /api/video-script query — pagination. */
export const ListVideoScriptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(50).default(20),
})
export type ListVideoScriptsQuery = z.infer<typeof ListVideoScriptsQuerySchema>

// ─── LLM output schema ────────────────────────────────────────────

/** Schema the LLM MUST conform to. Validated via `llm-output-validator`. */
export const LLMScriptOutputSchema = z.object({
  scenes: z
    .array(
      z.object({
        orderIndex: z.number().int().min(0),
        duration: z
          .number()
          .int()
          .min(SCENE_DURATION_RANGE.min)
          .max(SCENE_DURATION_RANGE.max),
        cameraShot: z.enum(CAMERA_SHOTS),
        action: z.string().min(1).max(2000),
        dialogue: z.string().max(500).nullable().optional(),
        transition: z.enum(TRANSITIONS),
      }),
    )
    .min(1),
})
export type LLMScriptOutput = z.infer<typeof LLMScriptOutputSchema>
