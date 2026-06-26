import { describe, expect, it } from 'vitest'

import {
  CINEMATIC_EMOTION_GRAMMAR,
  CINEMATIC_SHOT_GRAMMAR,
} from '@/constants/cinematic-grammar'

describe('cinematic-grammar', () => {
  it('emotion grammar drives the story layer (through-line + dual emotion)', () => {
    expect(CINEMATIC_EMOTION_GRAMMAR).toContain('EMOTIONAL ARCHITECTURE')
    expect(CINEMATIC_EMOTION_GRAMMAR).toContain('through-line')
    expect(CINEMATIC_EMOTION_GRAMMAR).toContain('dual emotion')
    // Story layer must NOT prescribe camera mechanics — that belongs to shots.
    expect(CINEMATIC_EMOTION_GRAMMAR).not.toContain('Z-AXIS')
  })

  it('shot grammar carries camera language, Z-axis depth, and白描 performance', () => {
    expect(CINEMATIC_SHOT_GRAMMAR).toContain('SHOT GRAMMAR')
    expect(CINEMATIC_SHOT_GRAMMAR).toContain('Z-AXIS DEPTH')
    expect(CINEMATIC_SHOT_GRAMMAR).toContain('PHYSICAL PERFORMANCE')
    expect(CINEMATIC_SHOT_GRAMMAR).toContain('dolly zoom')
    // The signature Z-axis rewrite must survive any future edit.
    expect(CINEMATIC_SHOT_GRAMMAR).toContain("camera's rear-right blind spot")
  })

  it('stays model-neutral — no video-model brand names leak into the grammar', () => {
    expect(CINEMATIC_EMOTION_GRAMMAR.toLowerCase()).not.toContain('seedance')
    expect(CINEMATIC_SHOT_GRAMMAR.toLowerCase()).not.toContain('seedance')
  })
})
