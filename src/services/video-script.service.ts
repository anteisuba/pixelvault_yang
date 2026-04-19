import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VIDEO_SCRIPT_SYSTEM_PROMPT,
  deriveSceneCount,
  PHASE_1_TRANSITION,
} from '@/constants/video-script'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import {
  findActiveKeyForAdapter,
  type ResolvedApiKeyValue,
} from '@/services/apiKey.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import {
  CreateVideoScriptInputSchema,
  LLMScriptOutputSchema,
  VideoScriptSceneSchema,
  type CreateVideoScriptInput,
  type LLMScriptOutput,
  type VideoScriptRecord,
  type VideoScriptScene,
} from '@/types/video-script'
import {
  VideoScriptSceneStatus,
  VideoScriptStatus,
} from '@/lib/generated/prisma/client'

/** Ownership-not-found sentinel — callers map to 404. */
export class VideoScriptNotFoundError extends Error {
  constructor(id: string) {
    super(`VideoScript ${id} not found or not owned by user`)
    this.name = 'VideoScriptNotFoundError'
  }
}

/** LLM provider order for script generation (VS9). */
const LLM_PROVIDER_ORDER = [
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
] as const

// ─── generateScript ──────────────────────────────────────────────

/**
 * Generate a new structured script via LLM and persist it.
 * Provider fallback (VS9): try Gemini 2x, fall back to OpenAI 1x. Both fail → throw.
 */
export async function generateScript(
  input: CreateVideoScriptInput,
  userId: string,
): Promise<VideoScriptRecord> {
  const parsed = CreateVideoScriptInputSchema.parse(input)
  const totalScenes = deriveSceneCount(parsed.targetDuration)

  const userPrompt = buildUserPrompt(parsed, totalScenes)

  const llmOutput = await callLlmWithFallback(userId, userPrompt)
  const scenes = validateAndNormalizeLlmOutput(
    llmOutput,
    totalScenes,
    parsed.targetDuration,
  )

  const created = await db.videoScript.create({
    data: {
      userId,
      topic: parsed.topic,
      targetDuration: parsed.targetDuration,
      totalScenes,
      status: VideoScriptStatus.DRAFT,
      consistencyMode: parsed.consistencyMode,
      characterCardId: parsed.characterCardId ?? null,
      styleCardId: parsed.styleCardId ?? null,
      videoModelId: parsed.videoModelId,
      scenes: {
        create: scenes.map((s) => ({
          orderIndex: s.orderIndex,
          duration: s.duration,
          cameraShot: s.cameraShot,
          action: s.action,
          dialogue: s.dialogue ?? null,
          transition: s.transition,
          status: VideoScriptSceneStatus.PENDING,
        })),
      },
    },
    include: { scenes: { orderBy: { orderIndex: 'asc' } } },
  })

  logger.info('VideoScript generated', {
    scriptId: created.id,
    userId,
    totalScenes,
    targetDuration: parsed.targetDuration,
  })

  return toRecord(created)
}

function buildUserPrompt(
  input: CreateVideoScriptInput,
  totalScenes: number,
): string {
  const parts = [
    `Topic: ${input.topic}`,
    `Total duration: ${input.targetDuration} seconds`,
    `Number of scenes: ${totalScenes}`,
    `Consistency mode: ${input.consistencyMode}`,
    `Video model: ${input.videoModelId}`,
  ]
  if (input.characterCardId) {
    parts.push(`Character card bound: ${input.characterCardId}`)
  }
  if (input.styleCardId) {
    parts.push(`Style card bound: ${input.styleCardId}`)
  }
  parts.push(
    `Emit exactly ${totalScenes} scenes; durations MUST sum to ${input.targetDuration}s.`,
  )
  return parts.join('\n')
}

/**
 * Try Gemini (withRetry 2x) then OpenAI (1x). Raises on total failure.
 */
async function callLlmWithFallback(
  userId: string,
  userPrompt: string,
): Promise<string> {
  const errors: string[] = []

  for (const adapterType of LLM_PROVIDER_ORDER) {
    const key = await resolveKeyForAdapter(userId, adapterType)
    if (!key) {
      errors.push(`${adapterType}: no key available`)
      continue
    }

    const maxAttempts = adapterType === AI_ADAPTER_TYPES.GEMINI ? 2 : 1

    try {
      return await withRetry(
        () =>
          llmTextCompletion({
            systemPrompt: VIDEO_SCRIPT_SYSTEM_PROMPT,
            userPrompt,
            adapterType: key.adapterType,
            providerConfig: key.providerConfig,
            apiKey: key.keyValue,
          }),
        { maxAttempts, label: `videoScript.${adapterType}` },
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('VideoScript LLM provider failed', { adapterType, msg })
      errors.push(`${adapterType}: ${msg}`)
    }
  }

  throw new Error(
    `All LLM providers failed for script generation: ${errors.join('; ')}`,
  )
}

async function resolveKeyForAdapter(
  userId: string,
  adapterType: AI_ADAPTER_TYPES,
): Promise<ResolvedApiKeyValue | null> {
  const userKey = await findActiveKeyForAdapter(userId, adapterType)
  if (userKey) return userKey

  // Platform fallback for Gemini only (matches llm-text.service behaviour)
  if (adapterType === AI_ADAPTER_TYPES.GEMINI) {
    const { getSystemApiKey } = await import('@/lib/platform-keys')
    const platformKey = getSystemApiKey(AI_ADAPTER_TYPES.GEMINI)
    if (platformKey) {
      return {
        id: 'platform:gemini',
        modelId: 'gemini-platform',
        adapterType,
        providerConfig: {
          label: 'Gemini (platform)',
          baseUrl: AI_PROVIDER_ENDPOINTS.GEMINI,
        },
        label: 'Gemini (platform)',
        keyValue: platformKey,
      }
    }
  }

  return null
}

function validateAndNormalizeLlmOutput(
  raw: string,
  expectedScenes: number,
  targetDuration: number,
): LLMScriptOutput['scenes'] {
  const cleaned = stripMarkdownFences(raw)

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    throw new Error(
      `LLM output is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const result = LLMScriptOutputSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `LLM output failed schema validation: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    )
  }

  const scenes = result.data.scenes
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((s, idx) => ({
      ...s,
      orderIndex: idx,
      transition: PHASE_1_TRANSITION,
    }))

  if (scenes.length !== expectedScenes) {
    throw new Error(
      `LLM returned ${scenes.length} scenes, expected ${expectedScenes}`,
    )
  }

  const sum = scenes.reduce((a, s) => a + s.duration, 0)
  if (sum !== targetDuration) {
    throw new Error(
      `Scene durations sum to ${sum}s, expected ${targetDuration}s`,
    )
  }

  return scenes
}

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

// ─── updateScenes ────────────────────────────────────────────────

/** Replace scenes on a draft script. Ownership-checked. */
export async function updateScenes(
  id: string,
  scenes: VideoScriptScene[],
  userId: string,
): Promise<VideoScriptRecord> {
  await assertOwnership(id, userId)

  const validated = scenes.map((s) => VideoScriptSceneSchema.parse(s))

  const updated = await db.$transaction(async (tx) => {
    await tx.videoScriptScene.deleteMany({ where: { scriptId: id } })
    await tx.videoScriptScene.createMany({
      data: validated.map((s, idx) => ({
        scriptId: id,
        orderIndex: idx,
        duration: s.duration,
        cameraShot: s.cameraShot,
        action: s.action,
        dialogue: s.dialogue ?? null,
        transition: s.transition,
        status: VideoScriptSceneStatus.PENDING,
      })),
    })
    return tx.videoScript.update({
      where: { id },
      data: { updatedAt: new Date() },
      include: { scenes: { orderBy: { orderIndex: 'asc' } } },
    })
  })

  logger.info('VideoScript scenes updated', {
    scriptId: id,
    userId,
    sceneCount: validated.length,
  })
  return toRecord(updated)
}

// ─── confirmScript ───────────────────────────────────────────────

/** Advance DRAFT → SCRIPT_READY. Ownership-checked. */
export async function confirmScript(
  id: string,
  userId: string,
): Promise<VideoScriptRecord> {
  await assertOwnership(id, userId)

  const updated = await db.videoScript.update({
    where: { id },
    data: { status: VideoScriptStatus.SCRIPT_READY },
    include: { scenes: { orderBy: { orderIndex: 'asc' } } },
  })

  logger.info('VideoScript confirmed', { scriptId: id, userId })
  return toRecord(updated)
}

// ─── listByUser ──────────────────────────────────────────────────

export interface ListVideoScriptsResult {
  scripts: VideoScriptRecord[]
  page: number
  size: number
  total: number
}

export async function listByUser(
  userId: string,
  pagination: { page: number; size: number },
): Promise<ListVideoScriptsResult> {
  const { page, size } = pagination
  const [rows, total] = await Promise.all([
    db.videoScript.findMany({
      where: { userId },
      include: { scenes: { orderBy: { orderIndex: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    db.videoScript.count({ where: { userId } }),
  ])

  return {
    scripts: rows.map(toRecord),
    page,
    size,
    total,
  }
}

// ─── getById ─────────────────────────────────────────────────────

export async function getById(
  id: string,
  userId: string,
): Promise<VideoScriptRecord> {
  const row = await db.videoScript.findFirst({
    where: { id, userId },
    include: { scenes: { orderBy: { orderIndex: 'asc' } } },
  })
  if (!row) throw new VideoScriptNotFoundError(id)
  return toRecord(row)
}

// ─── deleteScript (VS10) ─────────────────────────────────────────

/** Hard-delete VideoScript + scenes. Generation records are preserved. */
export async function deleteScript(id: string, userId: string): Promise<void> {
  await assertOwnership(id, userId)
  await db.videoScript.delete({ where: { id } })
  logger.info('VideoScript deleted', { scriptId: id, userId })
}

// ─── Helpers ─────────────────────────────────────────────────────

async function assertOwnership(id: string, userId: string): Promise<void> {
  const row = await db.videoScript.findFirst({
    where: { id, userId },
    select: { id: true },
  })
  if (!row) throw new VideoScriptNotFoundError(id)
}

type PrismaVideoScriptWithScenes = Awaited<
  ReturnType<typeof db.videoScript.findFirstOrThrow>
> & {
  scenes: Array<
    Awaited<ReturnType<typeof db.videoScriptScene.findFirstOrThrow>>
  >
}

function toRecord(row: PrismaVideoScriptWithScenes): VideoScriptRecord {
  return {
    id: row.id,
    userId: row.userId,
    topic: row.topic,
    targetDuration: row.targetDuration as 30 | 60 | 120,
    totalScenes: row.totalScenes,
    status: row.status,
    consistencyMode: row.consistencyMode as
      | 'character_card'
      | 'first_frame_ref',
    characterCardId: row.characterCardId,
    styleCardId: row.styleCardId,
    videoModelId: row.videoModelId as 'seedance-2-fast' | 'kling-pro',
    finalVideoUrl: row.finalVideoUrl,
    scenes: row.scenes.map((s) => ({
      id: s.id,
      scriptId: s.scriptId,
      orderIndex: s.orderIndex,
      duration: s.duration,
      cameraShot: s.cameraShot as VideoScriptScene['cameraShot'],
      action: s.action,
      dialogue: s.dialogue,
      transition: s.transition as VideoScriptScene['transition'],
      frameGenerationId: s.frameGenerationId,
      clipGenerationId: s.clipGenerationId,
      status: s.status,
      errorMessage: s.errorMessage,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
