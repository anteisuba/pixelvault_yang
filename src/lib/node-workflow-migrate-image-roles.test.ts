import { describe, expect, it } from 'vitest'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
  NodeWorkflowState,
} from '@/types/node-workflow'

import { migrateImageRoles } from './node-workflow-migrate-image-roles'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Partial<NodeWorkflowNodeData> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: NODE_STATUS_IDS.idle, ...data },
  }
}

describe('migrateImageRoles', () => {
  it('folds each legacy image type into image + role, preserving data', () => {
    const state: NodeWorkflowState = {
      nodes: [
        makeNode('c', NODE_TYPE_IDS.characterImage, { characterName: 'Mira' }),
        makeNode('b', NODE_TYPE_IDS.backgroundImage),
        makeNode('s', NODE_TYPE_IDS.shot),
        makeNode('f', NODE_TYPE_IDS.frameImage),
      ],
      edges: [],
    }

    const next = migrateImageRoles(state)

    expect(next.nodes.map((node) => node.type)).toEqual([
      NODE_TYPE_IDS.image,
      NODE_TYPE_IDS.image,
      NODE_TYPE_IDS.image,
      NODE_TYPE_IDS.image,
    ])
    expect(next.nodes.map((node) => node.data.role)).toEqual([
      NODE_IMAGE_ROLE_IDS.character,
      NODE_IMAGE_ROLE_IDS.background,
      NODE_IMAGE_ROLE_IDS.shot,
      NODE_IMAGE_ROLE_IDS.frame,
    ])
    // Non-type data survives the rewrite.
    expect(next.nodes[0]?.data.characterName).toBe('Mira')
  })

  it('normalizes legacy imageUrl → mediaUrl and drops the ignored imageMode gate', () => {
    const state: NodeWorkflowState = {
      nodes: [
        // Legacy character node: result in imageUrl, stale imageMode='choice'.
        makeNode('c', NODE_TYPE_IDS.characterImage, {
          imageUrl: 'https://cdn.test/x.png',
          imageMode: 'choice',
          imageSource: 'existing',
        }),
        // Already-image node (previously migrated) still carrying imageUrl-only.
        makeNode('i', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.character,
          imageUrl: 'https://cdn.test/y.png',
          imageMode: 'choice',
        }),
      ],
      edges: [],
    }

    const next = migrateImageRoles(state)

    expect(next.nodes[0]?.type).toBe(NODE_TYPE_IDS.image)
    expect(next.nodes[0]?.data.mediaUrl).toBe('https://cdn.test/x.png')
    expect(next.nodes[0]?.data.imageMode).toBeUndefined()
    expect(next.nodes[1]?.data.mediaUrl).toBe('https://cdn.test/y.png')
    expect(next.nodes[1]?.data.imageMode).toBeUndefined()
  })

  it('leaves non-image nodes + edges untouched (same reference)', () => {
    const state: NodeWorkflowState = {
      nodes: [
        makeNode('t', NODE_TYPE_IDS.shotText),
        makeNode('v', NODE_TYPE_IDS.voice),
        makeNode('d', NODE_TYPE_IDS.seedance),
      ],
      edges: [{ id: 'e', source: 't', target: 'd' }],
    }

    expect(migrateImageRoles(state)).toBe(state)
  })

  it('is idempotent — a second pass is a no-op', () => {
    const state: NodeWorkflowState = {
      nodes: [makeNode('s', NODE_TYPE_IDS.shot)],
      edges: [],
    }

    const once = migrateImageRoles(state)
    const twice = migrateImageRoles(once)

    expect(twice).toBe(once)
  })
})
