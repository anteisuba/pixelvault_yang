import 'server-only'

import type { VideoScriptScene } from '@/types/video-script'

interface ScenePromptContext {
  characterCard?: { name: string; appearance: string } | null
  styleCard?: { style: string } | null
  previousScene?: { action: string; clipGenerationId?: string | null } | null
  videoModelId: string
}

export function compileScenePrompt(
  scene: VideoScriptScene,
  context: ScenePromptContext,
): { prompt: string; negativePrompt?: string } {
  const promptParts: string[] = []

  if (context.characterCard) {
    promptParts.push(
      `[Character: ${context.characterCard.name} - ${context.characterCard.appearance}]`,
    )
  }

  if (context.styleCard) {
    promptParts.push(`[Style: ${context.styleCard.style}]`)
  }

  if (context.previousScene) {
    const previousAction = trimTrailingSentencePunctuation(
      context.previousScene.action,
    )
    promptParts.push(
      `[Continuity: Previous scene shows ${previousAction}. Maintain visual consistency.]`,
    )
  }

  promptParts.push(scene.action)

  if (scene.cameraShot) {
    promptParts.push(`[Camera: ${scene.cameraShot}]`)
  }

  return { prompt: promptParts.join('\n') }
}

function trimTrailingSentencePunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/, '')
}
