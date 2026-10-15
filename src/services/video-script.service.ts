import 'server-only'

import {
  VIDEO_SCRIPT_CHARACTER_FIELD_CHARS,
  VIDEO_SCRIPT_SYSTEM_PROMPT,
  deriveSceneCount,
  PHASE_1_TRANSITION,
} from '@/constants/video-script'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import { CharacterPersonaSchema } from '@/types'
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

/** 同一家失败时的重试次数（只重试那一家，⛔ 不换一家）。 */
const SCRIPT_LLM_MAX_ATTEMPTS = 2

// ─── generateScript ──────────────────────────────────────────────

/**
 * Generate a new structured script via LLM and persist it.
 * 写脚本用**助手那一家、那个型号**（owner 2026-10-15「全跟助手」）；同一家重试一次，
 * 仍失败就照实抛。⛔ 不再 Gemini → DeepSeek → OpenAI 依次换一家（那是悄悄花别家的钱）。
 */
export async function generateScript(
  input: CreateVideoScriptInput,
  userId: string,
): Promise<VideoScriptRecord> {
  const parsed = CreateVideoScriptInputSchema.parse(input)
  const totalScenes = deriveSceneCount(parsed.targetDuration)

  const character = parsed.characterCardId
    ? await loadScriptCharacter(parsed.characterCardId, userId)
    : null
  const userPrompt = buildUserPrompt(parsed, totalScenes, character)

  const llmOutput = await callAssistantLlm(userId, userPrompt)
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

/** 剧本里那位角色：名字 + 外观 + 身份 + 说话方式（各截一段）。 */
interface ScriptCharacter {
  name: string
  look: string
  identity: string
  speech: string
}

/**
 * 绑了角色卡时把卡的内容交给模型（附录J ④）：之前只写一行卡 id，模型不知道她是谁、
 * 怎么说话。⚠ 只认这个用户自己的、没删的卡；读不到就当没绑。
 */
async function loadScriptCharacter(
  cardId: string,
  userId: string,
): Promise<ScriptCharacter | null> {
  const card = await db.characterCard.findFirst({
    where: { id: cardId, userId, isDeleted: false },
    select: { name: true, description: true, persona: true },
  })
  if (!card) return null
  const persona = CharacterPersonaSchema.safeParse(card.persona ?? {})
  const clip = (text: string | null | undefined) =>
    (text ?? '').trim().slice(0, VIDEO_SCRIPT_CHARACTER_FIELD_CHARS)
  return {
    name: card.name,
    look: clip(card.description),
    identity: clip(persona.success ? persona.data.identity : ''),
    speech: clip(persona.success ? persona.data.speech : ''),
  }
}

function buildUserPrompt(
  input: CreateVideoScriptInput,
  totalScenes: number,
  character: ScriptCharacter | null,
): string {
  const parts = [
    `Topic: ${input.topic}`,
    `Total duration: ${input.targetDuration} seconds`,
    `Number of scenes: ${totalScenes}`,
    `Consistency mode: ${input.consistencyMode}`,
    `Video model: ${input.videoModelId}`,
  ]
  if (character) {
    parts.push(
      [
        `Main character: ${character.name}`,
        character.look ? `  Looks: ${character.look}` : null,
        character.identity ? `  Who they are: ${character.identity}` : null,
        character.speech
          ? `  How they talk: ${character.speech} — write their dialogue in this voice.`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    )
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
 * 助手那一家（没 key / 点名的那家没 key / 解不开 → `resolveAssistantRoute` 照实抛，
 * 由路由层转成「去配 key」）。同一家、同一把 key、同一个型号重试，⛔ 不换一家。
 */
async function callAssistantLlm(
  userId: string,
  userPrompt: string,
): Promise<string> {
  const { route, modelId } = await resolveAssistantRoute(userId)
  return withRetry(
    () =>
      llmTextCompletion({
        systemPrompt: VIDEO_SCRIPT_SYSTEM_PROMPT,
        userPrompt,
        adapterType: route.adapterType,
        providerConfig: route.providerConfig,
        apiKey: route.apiKey,
        modelId,
      }),
    {
      maxAttempts: SCRIPT_LLM_MAX_ATTEMPTS,
      label: `videoScript.${route.adapterType}`,
    },
  )
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
