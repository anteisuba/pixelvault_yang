import { describe, expect, it } from 'vitest'

import {
  CANVAS_IMAGE_EDIT_CAPABILITIES,
  getCanvasImageEditCapability,
  HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITIES,
  READY_CANVAS_IMAGE_EDIT_CAPABILITIES,
} from '@/constants/canvas-image-edit-capabilities'
import { CANVAS_CAPABILITY_DESCRIPTORS } from '@/lib/canvas-capability-runtime'
import {
  CanvasImageEditCapabilitySchema,
  HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
  READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
} from '@/types/canvas-image-edit'
import { NodeWorkflowNodeDataSchema } from '@/types/node-workflow'

describe('canvas image edit capability registry', () => {
  it('registers ready capabilities and keeps remaining placeholders hidden', () => {
    expect(READY_CANVAS_IMAGE_EDIT_CAPABILITIES.map(({ id }) => id)).toEqual([
      ...READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
    ])
    expect(HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITIES.map(({ id }) => id)).toEqual([
      ...HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
    ])
    // 五条。沿革：2026-08-18 `decompose` 与 `outpaint` 整条删除（owner 定功能
    // 废弃）、`object-replace` / `style-transfer` 因全仓零执行路径退回 hidden；
    // 2026-08-19 E3 把 `object-replace` 连同注释层建出来并提回 ready。
    // `style-transfer` 仍然没有执行路径。
    expect(READY_CANVAS_IMAGE_EDIT_CAPABILITIES).toHaveLength(5)
    expect(HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITIES).toHaveLength(2)
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

  // ⚠ 这条是 2026-08-18 E0 真机验底的产物，别删。`object-replace` /
  // `style-transfer` 曾经挂着 `availability: 'ready'` 混进菜单和工作区左栏，
  // 而 `CanvasCapabilityRequest` 里根本没有它们 —— 用户点开看到的是一个空
  // 面板。`ready` 是对用户的承诺，承诺的另一头必须真有人接。
  it('backs every ready capability with a runtime case', () => {
    const runtimeIds = new Set(
      CANVAS_CAPABILITY_DESCRIPTORS.map(({ id }) => id),
    )

    expect(
      READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS.filter(
        (id) => !runtimeIds.has(id),
      ),
    ).toEqual([])
  })

  it('degrades malformed persisted edit lineage without rejecting the node', () => {
    const parsed = NodeWorkflowNodeDataSchema.safeParse({
      prompt: '',
      status: 'done',
      mediaWidth: -1,
      mediaHeight: 0,
      derivedFromNodeId: '',
      derivedFromGenerationId: '',
      // text-render remains hidden/placeholder and is not a valid ready lineage id
      editCapability: 'not-a-real-edit-capability',
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
