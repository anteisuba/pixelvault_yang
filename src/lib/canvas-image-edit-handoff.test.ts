import { describe, expect, it } from 'vitest'

import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import {
  decideCanvasImageEditHandoffSession,
  getCanvasImageEditHandoffRequestKey,
  readCanvasImageEditHandoff,
  resolveCanvasImageEditHandoff,
} from '@/lib/canvas-image-edit-handoff'
import type { NodeWorkflowNode } from '@/types/node-workflow'

const SOURCE_URL = 'https://cdn.example.com/source.png'

function createImageNode(
  id: string,
  data: NodeWorkflowNode['data'],
): NodeWorkflowNode {
  return {
    id,
    type: NODE_TYPE_IDS.image,
    position: { x: 20, y: 40 },
    data,
  }
}

describe('canvas image edit handoff', () => {
  it('only reads the image-edit tool and validates the remote source', () => {
    expect(readCanvasImageEditHandoff(new URLSearchParams())).toBeNull()

    const request = readCanvasImageEditHandoff(
      new URLSearchParams({
        canvasTool: 'image-edit',
        sourceUrl: 'data:image/png;base64,unsafe',
        generationId: 'generation-1',
        width: '-10',
        height: '720.4',
        editTask: 'inpaint',
      }),
    )

    expect(request).toMatchObject({
      generationId: 'generation-1',
      height: 720,
    })
    expect(request).not.toHaveProperty('sourceUrl')
    expect(request).not.toHaveProperty('width')
  })

  it('prefers a generation match over a different URL match and never patches it', () => {
    const request = readCanvasImageEditHandoff(
      new URLSearchParams({
        canvasTool: 'image-edit',
        sourceUrl: SOURCE_URL,
        generationId: 'generation-1',
      }),
    )
    expect(request).not.toBeNull()
    if (!request) return

    const generationNode = createImageNode('generation-node', {
      prompt: 'keep me',
      status: NODE_STATUS_IDS.done,
      generationId: 'generation-1',
      mediaUrl: 'https://cdn.example.com/other.png',
    })
    const urlNode = createImageNode('url-node', {
      prompt: '',
      status: NODE_STATUS_IDS.done,
      mediaUrl: SOURCE_URL,
    })

    expect(
      resolveCanvasImageEditHandoff([urlNode, generationNode], request),
    ).toEqual({ kind: 'reuse', nodeId: generationNode.id })
    expect(generationNode.data.prompt).toBe('keep me')
    expect(generationNode.data.mediaUrl).toBe(
      'https://cdn.example.com/other.png',
    )
  })

  it('creates a persisted role-less source once, then reuses it after refresh', () => {
    const request = readCanvasImageEditHandoff(
      new URLSearchParams({
        canvasTool: 'image-edit',
        sourceUrl: SOURCE_URL,
        generationId: 'generation-1',
        width: '1280',
        height: '720',
      }),
    )
    expect(request).not.toBeNull()
    if (!request) return

    const firstResolution = resolveCanvasImageEditHandoff([], request)
    expect(firstResolution).toEqual({
      kind: 'create',
      patch: {
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        mediaUrl: SOURCE_URL,
        mediaWidth: 1280,
        mediaHeight: 720,
        generationId: 'generation-1',
        sourceGenerationId: 'generation-1',
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        status: NODE_STATUS_IDS.done,
      },
    })
    if (firstResolution.kind !== 'create') return

    const persistedNode = createImageNode('node-imported', {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      ...firstResolution.patch,
    })
    expect(resolveCanvasImageEditHandoff([persistedNode], request)).toEqual({
      kind: 'reuse',
      nodeId: persistedNode.id,
    })
  })

  it('reuses an empty loose image when no valid source is present', () => {
    const request = readCanvasImageEditHandoff(
      new URLSearchParams({ canvasTool: 'image-edit' }),
    )
    expect(request).not.toBeNull()
    if (!request) return

    const emptyNode = createImageNode('node-empty', {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    })
    expect(resolveCanvasImageEditHandoff([emptyNode], request)).toEqual({
      kind: 'reuse',
      nodeId: emptyNode.id,
    })
  })

  it('scopes the same request signature per project', () => {
    const request = readCanvasImageEditHandoff(
      new URLSearchParams({
        canvasTool: 'image-edit',
        sourceUrl: SOURCE_URL,
        editTask: 'outpaint',
      }),
    )
    expect(request).not.toBeNull()
    if (!request) return

    const projectAKey = getCanvasImageEditHandoffRequestKey(
      'user-1',
      'project-a',
      request.signature,
    )
    expect(
      getCanvasImageEditHandoffRequestKey(
        'user-1',
        'project-a',
        request.signature,
      ),
    ).toBe(projectAKey)
    expect(
      getCanvasImageEditHandoffRequestKey(
        'user-1',
        'project-b',
        request.signature,
      ),
    ).not.toBe(projectAKey)

    expect(
      decideCanvasImageEditHandoffSession({
        requestKey: projectAKey,
        activeRequestKey: null,
        pendingRequestKey: projectAKey,
        rememberedNodeId: 'node-importing',
        rememberedNodeExists: false,
      }),
    ).toEqual({ kind: 'skip' })
    expect(
      decideCanvasImageEditHandoffSession({
        requestKey: projectAKey,
        activeRequestKey: null,
        pendingRequestKey: projectAKey,
        rememberedNodeId: 'node-importing',
        rememberedNodeExists: true,
      }),
    ).toEqual({ kind: 'focus', nodeId: 'node-importing' })
    expect(
      decideCanvasImageEditHandoffSession({
        requestKey: getCanvasImageEditHandoffRequestKey(
          'user-1',
          'project-b',
          request.signature,
        ),
        activeRequestKey: projectAKey,
        pendingRequestKey: null,
        rememberedNodeExists: false,
      }),
    ).toEqual({ kind: 'resolve' })
  })
})
