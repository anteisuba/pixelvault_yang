import { describe, expect, it } from 'vitest'

import { isNodeWorkflowGenerating } from './node-workflow-edge-visual'

describe('isNodeWorkflowGenerating', () => {
  it('is true while running or pending', () => {
    expect(isNodeWorkflowGenerating('running', undefined)).toBe(true)
    expect(isNodeWorkflowGenerating(undefined, 'pending')).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isNodeWorkflowGenerating('idle', 'idle')).toBe(false)
    expect(isNodeWorkflowGenerating('done', 'success')).toBe(false)
    expect(isNodeWorkflowGenerating(undefined, undefined)).toBe(false)
  })
})
