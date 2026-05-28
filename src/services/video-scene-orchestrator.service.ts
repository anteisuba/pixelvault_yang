import 'server-only'

import {
  MAX_SCENE_RETRIES,
  VIDEO_SCENE_DEFAULT_ASPECT_RATIO,
  VIDEO_SCRIPT_MODEL_TO_GENERATION_MODEL_ID,
} from '@/constants/video-scene'
import type { CameraShot, Transition } from '@/constants/video-script'
import {
  type SceneAdvanceResult,
  type SceneOrchestratorStatus,
  VideoScriptSceneStatus,
  VideoScriptStatus,
} from '@/types/video-script'
import { compileScenePrompt } from '@/services/kernel/scene-prompt-compiler.service'
import {
  GenerateImageServiceError,
  isGenerateImageServiceError,
} from '@/services/generate-image.service'
import {
  checkVideoGenerationStatusForUserId,
  submitVideoGenerationForUserId,
} from '@/services/generate-video.service'
import { VideoScriptNotFoundError } from '@/services/video-script.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

const RETRY_COUNT_PREFIX = '[scene-retry-count:'
type SceneStartReason = 'scene_active' | 'no_pending_scenes' | 'claim_lost'

interface SceneStartResult {
  started: boolean
  currentSceneIndex: number
  reason?: SceneStartReason
}

interface LoadedScene {
  id: string
  orderIndex: number
  duration: number
  cameraShot: CameraShot
  action: string
  dialogue: string | null
  transition: Transition
  frameGenerationId: string | null
  clipGenerationId: string | null
  status: VideoScriptSceneStatus
  errorMessage: string | null
}

interface LoadedScript {
  id: string
  userId: string
  status: VideoScriptStatus
  characterCardId: string | null
  styleCardId: string | null
  videoModelId: keyof typeof VIDEO_SCRIPT_MODEL_TO_GENERATION_MODEL_ID
  scenes: LoadedScene[]
}

export async function startSceneOrchestration(
  scriptId: string,
  userId: string,
): Promise<SceneStartResult> {
  const script = await getOwnedScript(scriptId, userId)

  if (script.status !== VideoScriptStatus.SCRIPT_READY) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Only SCRIPT_READY video scripts can be orchestrated',
      400,
    )
  }

  const runningScene = getRunningScene(script.scenes)
  if (runningScene) {
    return {
      started: false,
      currentSceneIndex: runningScene.orderIndex,
      reason: 'scene_active',
    }
  }

  const firstPendingScene = script.scenes.find(
    (scene) => scene.status === VideoScriptSceneStatus.PENDING,
  )

  if (!firstPendingScene) {
    if (allScenesReady(script.scenes)) {
      await markScriptComplete(script.id)
      return {
        started: false,
        currentSceneIndex: -1,
        reason: 'no_pending_scenes',
      }
    }

    const activeScene = getActiveScene(script.scenes)
    return {
      started: false,
      currentSceneIndex: activeScene?.orderIndex ?? 0,
      reason: 'no_pending_scenes',
    }
  }

  const started = await startSceneGeneration(
    script,
    firstPendingScene,
    userId,
    0,
  )
  if (!started) {
    return {
      started: false,
      currentSceneIndex: firstPendingScene.orderIndex,
      reason: 'claim_lost',
    }
  }

  return { started: true, currentSceneIndex: firstPendingScene.orderIndex }
}

export async function advanceScene(
  scriptId: string,
  userId: string,
): Promise<SceneAdvanceResult> {
  const script = await getOwnedScript(scriptId, userId)

  if (allScenesReady(script.scenes)) {
    await markScriptComplete(script.id)
    return buildAdvanceResult(
      script.scenes.at(-1)?.orderIndex ?? 0,
      VideoScriptSceneStatus.CLIP_READY,
      script.scenes,
      true,
    )
  }

  const scene = getActiveScene(script.scenes)
  if (!scene) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Video script has no scenes to advance',
      400,
    )
  }

  if (
    scene.status === VideoScriptSceneStatus.PENDING ||
    scene.status === VideoScriptSceneStatus.FRAME_READY
  ) {
    const retryCount = getRetryCount(scene)
    await startSceneGeneration(script, scene, userId, retryCount)
    return buildAdvanceResult(
      scene.orderIndex,
      VideoScriptSceneStatus.CLIP_GENERATING,
      script.scenes,
      false,
      retryCount,
    )
  }

  if (scene.status === VideoScriptSceneStatus.CLIP_GENERATING) {
    return advanceGeneratingClip(script, scene, userId)
  }

  if (scene.status === VideoScriptSceneStatus.FAILED) {
    return retryFailedScene(script, scene, userId)
  }

  return buildAdvanceResult(
    scene.orderIndex,
    scene.status,
    script.scenes,
    false,
    getRetryCount(scene),
  )
}

export async function retryScene(
  scriptId: string,
  sceneIndex: number,
  userId: string,
): Promise<void> {
  const script = await getOwnedScript(scriptId, userId)
  const scene = script.scenes.find((item) => item.orderIndex === sceneIndex)

  if (!scene) {
    throw new GenerateImageServiceError('JOB_NOT_FOUND', 'Scene not found', 404)
  }

  if (scene.status !== VideoScriptSceneStatus.FAILED) {
    throw new GenerateImageServiceError(
      'INVALID_JOB',
      'Only failed scenes can be retried',
      400,
    )
  }

  await startSceneGeneration(script, scene, userId, getRetryCount(scene) + 1)
}

export async function getSceneStatus(
  scriptId: string,
  userId: string,
): Promise<SceneOrchestratorStatus> {
  const script = await getOwnedScript(scriptId, userId)
  const completedScenes = countCompletedScenes(script.scenes)
  const progress =
    script.scenes.length === 0
      ? 0
      : Math.round((completedScenes / script.scenes.length) * 100)

  return {
    scriptId: script.id,
    scriptStatus: deriveScriptStatus(script),
    scenes: script.scenes.map((scene) => ({
      index: scene.orderIndex,
      action: scene.action,
      status: scene.status,
      hasFrame: Boolean(scene.frameGenerationId),
      hasClip:
        scene.status === VideoScriptSceneStatus.CLIP_READY &&
        Boolean(scene.clipGenerationId),
      retryCount: getRetryCount(scene),
      errorMessage: stripRetryMessage(scene.errorMessage),
    })),
    progress,
  }
}

async function advanceGeneratingClip(
  script: LoadedScript,
  scene: LoadedScene,
  userId: string,
): Promise<SceneAdvanceResult> {
  if (!scene.clipGenerationId) {
    const retryCount = getRetryCount(scene)
    const failedScene = withSceneFailure(
      scene,
      retryCount,
      'Missing clip job ID',
    )
    await markSceneFailed(scene, retryCount, 'Missing clip job ID')
    return retryFailedScene(script, failedScene, userId)
  }

  const retryCount = getRetryCount(scene)

  try {
    const status = await checkVideoGenerationStatusForUserId(
      userId,
      scene.clipGenerationId,
    )

    if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
      return buildAdvanceResult(
        scene.orderIndex,
        VideoScriptSceneStatus.CLIP_GENERATING,
        script.scenes,
        false,
        retryCount,
      )
    }

    if (status.status === 'FAILED' || !status.generation) {
      const failedScene = withSceneFailure(
        scene,
        retryCount,
        'Video generation failed on provider side',
      )
      await markSceneFailed(
        scene,
        retryCount,
        'Video generation failed on provider side',
      )
      return retryFailedScene(script, failedScene, userId)
    }

    await db.videoScriptScene.update({
      where: { id: scene.id },
      data: {
        status: VideoScriptSceneStatus.CLIP_READY,
        clipGenerationId: status.generation.id,
        errorMessage: null,
      },
    })

    return advanceScene(script.id, userId)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Video status check failed'
    const failedScene = withSceneFailure(scene, retryCount, message)
    await markSceneFailed(scene, retryCount, message)

    if (isGenerateImageServiceError(error) && error.status >= 500) {
      return retryFailedScene(script, failedScene, userId)
    }

    throw error
  }
}

async function retryFailedScene(
  script: LoadedScript,
  scene: LoadedScene,
  userId: string,
): Promise<SceneAdvanceResult> {
  const retryCount = getRetryCount(scene)

  if (retryCount >= MAX_SCENE_RETRIES) {
    await db.videoScript.update({
      where: { id: script.id },
      data: { status: VideoScriptStatus.FAILED },
    })

    return buildAdvanceResult(
      scene.orderIndex,
      VideoScriptSceneStatus.FAILED,
      script.scenes,
      false,
      retryCount,
    )
  }

  const nextRetryCount = retryCount + 1
  const started = await startSceneGeneration(
    script,
    scene,
    userId,
    nextRetryCount,
  )

  return buildAdvanceResult(
    scene.orderIndex,
    VideoScriptSceneStatus.CLIP_GENERATING,
    script.scenes,
    false,
    started ? nextRetryCount : retryCount,
  )
}

async function startSceneGeneration(
  script: LoadedScript,
  scene: LoadedScene,
  userId: string,
  retryCount: number,
): Promise<boolean> {
  const claimed = await db.videoScriptScene.updateMany({
    where: {
      id: scene.id,
      status: scene.status,
    },
    data: {
      status: VideoScriptSceneStatus.CLIP_GENERATING,
      clipGenerationId: null,
      errorMessage: retryCount > 0 ? formatRetryMessage(retryCount) : null,
    },
  })

  if (claimed.count === 0) {
    logger.warn('Video scene already claimed by another request', {
      scriptId: script.id,
      sceneId: scene.id,
      sceneIndex: scene.orderIndex,
      expectedStatus: scene.status,
    })
    return false
  }

  const [characterCard, styleCard, referenceGeneration] = await Promise.all([
    getCharacterContext(script.characterCardId, userId),
    getStyleContext(script.styleCardId, userId),
    getReferenceGeneration(scene.frameGenerationId, userId),
  ])
  const previousScene = script.scenes.find(
    (item) => item.orderIndex === scene.orderIndex - 1,
  )
  const compiled = compileScenePrompt(scene, {
    characterCard,
    styleCard,
    previousScene: previousScene
      ? {
          action: previousScene.action,
          clipGenerationId: previousScene.clipGenerationId,
        }
      : null,
    videoModelId: script.videoModelId,
  })
  const modelId = VIDEO_SCRIPT_MODEL_TO_GENERATION_MODEL_ID[script.videoModelId]

  try {
    const result = await submitVideoGenerationForUserId(userId, {
      prompt: compiled.prompt,
      modelId,
      aspectRatio: VIDEO_SCENE_DEFAULT_ASPECT_RATIO,
      duration: scene.duration,
      referenceImage: referenceGeneration?.url,
      negativePrompt: compiled.negativePrompt,
      characterCardIds: script.characterCardId
        ? [script.characterCardId]
        : undefined,
    })

    await db.videoScriptScene.update({
      where: { id: scene.id },
      data: {
        clipGenerationId: result.jobId,
        errorMessage: retryCount > 0 ? formatRetryMessage(retryCount) : null,
      },
    })

    logger.info('Video scene generation started', {
      scriptId: script.id,
      sceneIndex: scene.orderIndex,
      jobId: result.jobId,
      retryCount,
    })

    return true
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Scene generation failed'
    await markSceneFailed(scene, retryCount, message)
    throw error
  }
}

async function getOwnedScript(
  scriptId: string,
  userId: string,
): Promise<LoadedScript> {
  const script = await db.videoScript.findFirst({
    where: { id: scriptId, userId },
    include: { scenes: { orderBy: { orderIndex: 'asc' } } },
  })

  if (!script) {
    throw new VideoScriptNotFoundError(scriptId)
  }

  return {
    id: script.id,
    userId: script.userId,
    status: script.status,
    characterCardId: script.characterCardId,
    styleCardId: script.styleCardId,
    videoModelId:
      script.videoModelId as keyof typeof VIDEO_SCRIPT_MODEL_TO_GENERATION_MODEL_ID,
    scenes: script.scenes.map((scene) => ({
      id: scene.id,
      orderIndex: scene.orderIndex,
      duration: scene.duration,
      cameraShot: scene.cameraShot as CameraShot,
      action: scene.action,
      dialogue: scene.dialogue,
      transition: scene.transition as Transition,
      frameGenerationId: scene.frameGenerationId,
      clipGenerationId: scene.clipGenerationId,
      status: scene.status,
      errorMessage: scene.errorMessage,
    })),
  }
}

async function getCharacterContext(
  characterCardId: string | null,
  userId: string,
): Promise<{ name: string; appearance: string } | null> {
  if (!characterCardId) return null

  const card = await db.characterCard.findFirst({
    where: { id: characterCardId, userId, isDeleted: false },
    select: { name: true, characterPrompt: true },
  })

  if (!card) return null

  return { name: card.name, appearance: card.characterPrompt }
}

async function getStyleContext(
  styleCardId: string | null,
  userId: string,
): Promise<{ style: string } | null> {
  if (!styleCardId) return null

  const card = await db.styleCard.findFirst({
    where: { id: styleCardId, userId, isDeleted: false },
    select: { stylePrompt: true },
  })

  if (!card) return null

  return { style: card.stylePrompt }
}

async function getReferenceGeneration(
  generationId: string | null,
  userId: string,
): Promise<{ url: string } | null> {
  if (!generationId) return null

  return db.generation.findFirst({
    where: { id: generationId, userId },
    select: { url: true },
  })
}

async function markSceneFailed(
  scene: LoadedScene,
  retryCount: number,
  message: string,
): Promise<void> {
  await db.videoScriptScene.update({
    where: { id: scene.id },
    data: {
      status: VideoScriptSceneStatus.FAILED,
      errorMessage: formatRetryMessage(retryCount, message),
    },
  })
}

async function markScriptComplete(scriptId: string): Promise<void> {
  await db.videoScript.update({
    where: { id: scriptId },
    data: { status: VideoScriptStatus.COMPLETED },
  })
}

function getActiveScene(scenes: LoadedScene[]): LoadedScene | undefined {
  return scenes.find(
    (scene) => scene.status !== VideoScriptSceneStatus.CLIP_READY,
  )
}

function getRunningScene(scenes: LoadedScene[]): LoadedScene | undefined {
  return scenes.find(
    (scene) =>
      scene.status !== VideoScriptSceneStatus.PENDING &&
      scene.status !== VideoScriptSceneStatus.CLIP_READY &&
      scene.status !== VideoScriptSceneStatus.FAILED,
  )
}

function allScenesReady(scenes: LoadedScene[]): boolean {
  return (
    scenes.length > 0 &&
    scenes.every((scene) => scene.status === VideoScriptSceneStatus.CLIP_READY)
  )
}

function countCompletedScenes(scenes: LoadedScene[]): number {
  return scenes.filter(
    (scene) => scene.status === VideoScriptSceneStatus.CLIP_READY,
  ).length
}

function buildAdvanceResult(
  sceneIndex: number,
  sceneStatus: VideoScriptSceneStatus,
  scenes: LoadedScene[],
  isComplete: boolean,
  retryCount = 0,
): SceneAdvanceResult {
  return {
    sceneIndex,
    sceneStatus,
    isComplete,
    retriesRemaining: Math.max(0, MAX_SCENE_RETRIES - retryCount),
    totalScenes: scenes.length,
    completedScenes: countCompletedScenes(scenes),
  }
}

function deriveScriptStatus(script: LoadedScript): string {
  if (
    script.status === VideoScriptStatus.COMPLETED ||
    script.status === VideoScriptStatus.FAILED
  ) {
    return script.status
  }

  const hasStartedScene = script.scenes.some(
    (scene) => scene.status !== VideoScriptSceneStatus.PENDING,
  )

  return hasStartedScene ? 'GENERATING' : script.status
}

function getRetryCount(scene: LoadedScene): number {
  if (!scene.errorMessage?.startsWith(RETRY_COUNT_PREFIX)) return 0

  const endIndex = scene.errorMessage.indexOf(']')
  if (endIndex < 0) return 0

  const rawCount = scene.errorMessage.slice(RETRY_COUNT_PREFIX.length, endIndex)
  const parsed = Number.parseInt(rawCount, 10)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function formatRetryMessage(retryCount: number, message?: string): string {
  const prefix = `${RETRY_COUNT_PREFIX}${retryCount}]`
  return message ? `${prefix} ${message}` : prefix
}

function stripRetryMessage(message: string | null): string | null {
  if (!message?.startsWith(RETRY_COUNT_PREFIX)) return message

  const endIndex = message.indexOf(']')
  if (endIndex < 0) return message

  const stripped = message.slice(endIndex + 1).trim()
  return stripped.length > 0 ? stripped : null
}

function withSceneFailure(
  scene: LoadedScene,
  retryCount: number,
  message: string,
): LoadedScene {
  return {
    ...scene,
    status: VideoScriptSceneStatus.FAILED,
    errorMessage: formatRetryMessage(retryCount, message),
  }
}
