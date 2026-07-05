import { describe, expect, it } from 'vitest'

import { appendMissingTriggers } from './lora-prompt-triggers'

describe('appendMissingTriggers (B10-5 / §2②)', () => {
  it('appends triggers not already present in the prompt', () => {
    const result = appendMissingTriggers('a girl, danjin', ['danjin', 'jinxi'])
    expect(result.appendedTriggers).toEqual(['jinxi'])
    expect(result.prompt).toBe('a girl, danjin, jinxi')
  })

  it('is case-insensitive and never double-appends', () => {
    const result = appendMissingTriggers('A GIRL, JinXi', ['jinxi'])
    expect(result.appendedTriggers).toEqual([])
    expect(result.prompt).toBe('A GIRL, JinXi')
  })

  it('dedupes and skips blank triggers, preserving order', () => {
    const result = appendMissingTriggers('base', ['  ', 'aki', 'aki', 'yuki'])
    expect(result.appendedTriggers).toEqual(['aki', 'yuki'])
    expect(result.prompt).toBe('base, aki, yuki')
  })

  it('handles an empty prompt without a leading separator', () => {
    const result = appendMissingTriggers('', ['aki'])
    expect(result.prompt).toBe('aki')
    expect(result.appendedTriggers).toEqual(['aki'])
  })

  it('returns the prompt untouched when all triggers are present', () => {
    const result = appendMissingTriggers('aki, yuki', ['aki', 'yuki'])
    expect(result.appendedTriggers).toEqual([])
    expect(result.prompt).toBe('aki, yuki')
  })
})
