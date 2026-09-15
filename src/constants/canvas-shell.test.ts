import { describe, expect, it } from 'vitest'

import {
  CANVAS_SHELL_ASSISTANT,
  canvasAssistantWidthLimits,
} from '@/constants/canvas-shell'

describe('CANVAS_SHELL_ASSISTANT', () => {
  it('expanded two-column dock is always wider than the chat dock', () => {
    expect(CANVAS_SHELL_ASSISTANT.expandedMinWidthPx).toBeGreaterThan(
      CANVAS_SHELL_ASSISTANT.maxWidthPx,
    )
    expect(CANVAS_SHELL_ASSISTANT.expandedDefaultWidthPx).toBe(720)
    expect(canvasAssistantWidthLimits(false).defaultWidthPx).toBe(
      CANVAS_SHELL_ASSISTANT.defaultWidthPx,
    )
    expect(canvasAssistantWidthLimits(true).defaultWidthPx).toBe(
      CANVAS_SHELL_ASSISTANT.expandedDefaultWidthPx,
    )
  })
})
