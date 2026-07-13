import { describe, expect, it } from 'vitest'

import {
  CANVAS_IMAGE_EDIT_CAPABILITIES,
  getCanvasImageEditCapability,
  HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITIES,
  READY_CANVAS_IMAGE_EDIT_CAPABILITIES,
} from '@/constants/canvas-image-edit-capabilities'
import {
  CanvasImageEditCapabilitySchema,
  HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
  READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
} from '@/types/canvas-image-edit'
import { NodeWorkflowNodeDataSchema } from '@/types/node-workflow'

describe('canvas image edit capability registry', () => {
  it('registers six ready capabilities and keeps the three placeholders hidden', () => {
    expect(READY_CANVAS_IMAGE_EDIT_CAPABILITIES.map(({ id }) => id)).toEqual([
      ...READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
    ])
    expect(HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITIES.map(({ id }) => id)).toEqual([
      ...HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
    ])
    expect(
      new Set(CANVAS_IMAGE_EDIT_CAPABILITIES.map(({ id }) => id)).size,
    ).toBe(CANVAS_IMAGE_EDIT_CAPABILITIES.length)
  })

  it('keeps every capability schema-valid and every ready default in its model allowlist', () => {
    for (const capability of CANVAS_IMAGE_EDIT_CAPABILITIES) {
      expect(
        CanvasImageEditCapabilitySchema.safeParse(capability).success,
      ).toBe(true)

      if (capability.availability === 'ready') {
        expect(capability.defaultModelId).not.toBeNull()
        expect(capability.models).toContain(capability.defaultModelId)
      } else {
        expect(capability.models).toEqual([])
        expect(capability.defaultModelId).toBeNull()
      }

      expect(getCanvasImageEditCapability(capability.id)).toBe(capability)
    }
  })

  it('degrades malformed persisted edit lineage without rejecting the node', () => {
    const parsed = NodeWorkflowNodeDataSchema.safeParse({
      prompt: '',
      status: 'done',
      mediaWidth: -1,
      mediaHeight: 0,
      derivedFromNodeId: '',
      derivedFromGenerationId: '',
      editCapability: 'object-replace',
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    expect(parsed.data.mediaWidth).toBeUndefined()
    expect(parsed.data.mediaHeight).toBeUndefined()
    expect(parsed.data.derivedFromNodeId).toBeUndefined()
    expect(parsed.data.derivedFromGenerationId).toBeUndefined()
    expect(parsed.data.editCapability).toBeUndefined()
  })
})
