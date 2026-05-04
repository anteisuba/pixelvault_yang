import { describe, expect, it } from 'vitest'

import { compileScenePrompt } from '@/services/scene-prompt-compiler.service'
import type { VideoScriptScene } from '@/types/video-script'

const baseScene: VideoScriptScene = {
  id: 'scene-1',
  scriptId: 'script-1',
  orderIndex: 0,
  duration: 6,
  cameraShot: 'medium',
  action: 'A courier crosses a rain-soaked alley.',
  dialogue: null,
  transition: 'cut',
}

describe('compileScenePrompt', () => {
  it('compiles a basic scene prompt', () => {
    const result = compileScenePrompt(baseScene, { videoModelId: 'kling-pro' })

    expect(result.prompt).toContain(baseScene.action)
    expect(result.prompt).toContain('[Camera: medium]')
  })

  it('injects character card continuity', () => {
    const result = compileScenePrompt(baseScene, {
      videoModelId: 'kling-pro',
      characterCard: {
        name: 'Mira',
        appearance: 'silver jacket, short black hair',
      },
    })

    expect(result.prompt).toContain(
      '[Character: Mira - silver jacket, short black hair]',
    )
  })

  it('injects style card guidance', () => {
    const result = compileScenePrompt(baseScene, {
      videoModelId: 'kling-pro',
      styleCard: { style: 'neon noir, wet pavement reflections' },
    })

    expect(result.prompt).toContain(
      '[Style: neon noir, wet pavement reflections]',
    )
  })

  it('injects previous scene continuity', () => {
    const result = compileScenePrompt(baseScene, {
      videoModelId: 'kling-pro',
      previousScene: {
        action: 'Mira unlocks a glowing briefcase.',
        clipGenerationId: 'gen-prev',
      },
    })

    expect(result.prompt).toContain(
      '[Continuity: Previous scene shows Mira unlocks a glowing briefcase. Maintain visual consistency.]',
    )
  })

  it('falls back to action and camera without optional context', () => {
    const result = compileScenePrompt(baseScene, { videoModelId: 'kling-pro' })

    expect(result.prompt).toBe(
      'A courier crosses a rain-soaked alley.\n[Camera: medium]',
    )
  })
})
