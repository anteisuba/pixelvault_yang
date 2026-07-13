import {
  NODE_STUDIO_IMAGE_EDIT_HANDOFF,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_PROJECTS,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { isRemoteImageUrl } from '@/lib/image-input'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

interface SearchParamReader {
  get(name: string): string | null
}

export interface CanvasImageEditHandoffRequest {
  signature: string
  sourceUrl?: string
  generationId?: string
  width?: number
  height?: number
}

export type CanvasImageEditHandoffResolution =
  | { kind: 'reuse'; nodeId: string }
  | { kind: 'create'; patch: Partial<NodeWorkflowNodeData> }

export type CanvasImageEditHandoffSessionDecision =
  | { kind: 'skip' }
  | { kind: 'focus'; nodeId: string }
  | { kind: 'resolve'; staleNodeId?: string }

function readTrimmedValue(
  searchParams: SearchParamReader,
  key: string,
  maxLength: number,
): string | undefined {
  const value = searchParams.get(key)?.trim()
  if (!value || value.length > maxLength) return undefined
  return value
}

function readDimension(
  searchParams: SearchParamReader,
  key: string,
): number | undefined {
  const value = searchParams.get(key)
  if (!value) return undefined

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.round(parsed)
}

/**
 * Parse only the legacy image-edit handoff fields needed by Canvas. This does
 * not mutate the URL: `editTask` remains available to the later image-edit
 * workspace, while its value still participates in request idempotency.
 */
export function readCanvasImageEditHandoff(
  searchParams: SearchParamReader,
): CanvasImageEditHandoffRequest | null {
  const { queryKeys } = NODE_STUDIO_IMAGE_EDIT_HANDOFF
  if (
    searchParams.get(queryKeys.tool) !== NODE_STUDIO_IMAGE_EDIT_HANDOFF.toolId
  ) {
    return null
  }

  const rawSourceUrl = readTrimmedValue(
    searchParams,
    queryKeys.sourceUrl,
    NODE_STUDIO_IMAGE_EDIT_HANDOFF.maxSourceUrlLength,
  )
  const sourceUrl =
    rawSourceUrl && isRemoteImageUrl(rawSourceUrl) ? rawSourceUrl : undefined
  const generationId = readTrimmedValue(
    searchParams,
    queryKeys.generationId,
    NODE_STUDIO_PROJECTS.idMaxLength,
  )
  const width = readDimension(searchParams, queryKeys.width)
  const height = readDimension(searchParams, queryKeys.height)
  const editTask = readTrimmedValue(
    searchParams,
    queryKeys.editTask,
    NODE_STUDIO_IMAGE_EDIT_HANDOFF.maxEditTaskLength,
  )

  return {
    signature: JSON.stringify([
      NODE_STUDIO_IMAGE_EDIT_HANDOFF.toolId,
      sourceUrl ?? null,
      generationId ?? null,
      width ?? null,
      height ?? null,
      editTask ?? null,
    ]),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(generationId ? { generationId } : {}),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  }
}

export function getCanvasImageEditHandoffRequestKey(
  userId: string,
  projectId: string,
  requestSignature: string,
): string {
  return JSON.stringify([userId, projectId, requestSignature])
}

/**
 * Keep effect replay idempotent while a newly created node is waiting for the
 * next render. This is intentionally pure so project switches and React
 * Strict Mode replay can be verified without mounting the full canvas.
 */
export function decideCanvasImageEditHandoffSession(input: {
  requestKey: string
  activeRequestKey: string | null
  pendingRequestKey: string | null
  rememberedNodeId?: string
  rememberedNodeExists: boolean
}): CanvasImageEditHandoffSessionDecision {
  if (input.activeRequestKey === input.requestKey) {
    return { kind: 'skip' }
  }

  if (input.pendingRequestKey === input.requestKey) {
    return input.rememberedNodeId && input.rememberedNodeExists
      ? { kind: 'focus', nodeId: input.rememberedNodeId }
      : { kind: 'skip' }
  }

  if (input.rememberedNodeId && input.rememberedNodeExists) {
    return { kind: 'focus', nodeId: input.rememberedNodeId }
  }

  return {
    kind: 'resolve',
    ...(input.rememberedNodeId ? { staleNodeId: input.rememberedNodeId } : {}),
  }
}

function isImageNode(node: NodeWorkflowNode): boolean {
  const mediaKind =
    node.data.mediaKind ?? NODE_MEDIA_KIND_BY_NODE_TYPE[node.type]
  return mediaKind === NODE_MEDIA_KIND_IDS.image
}

function nodeMediaUrl(node: NodeWorkflowNode): string | undefined {
  const url = node.data.mediaUrl ?? node.data.imageUrl
  return url?.trim() || undefined
}

function findExistingSourceNode(
  nodes: readonly NodeWorkflowNode[],
  request: CanvasImageEditHandoffRequest,
): NodeWorkflowNode | undefined {
  if (request.generationId) {
    const generationMatch = nodes.find(
      (node) =>
        isImageNode(node) &&
        (node.data.generationId === request.generationId ||
          node.data.sourceGenerationId === request.generationId),
    )
    if (generationMatch) return generationMatch
  }

  if (request.sourceUrl) {
    return nodes.find(
      (node) => isImageNode(node) && nodeMediaUrl(node) === request.sourceUrl,
    )
  }

  return undefined
}

function findEmptyLooseImageNode(
  nodes: readonly NodeWorkflowNode[],
): NodeWorkflowNode | undefined {
  return nodes.find(
    (node) =>
      node.type === NODE_TYPE_IDS.image &&
      node.data.role === undefined &&
      nodeMediaUrl(node) === undefined,
  )
}

/**
 * Resolve a safe Canvas target without mutating existing images. The caller
 * either focuses the returned node or creates one role-less image node with
 * the returned patch.
 */
export function resolveCanvasImageEditHandoff(
  nodes: readonly NodeWorkflowNode[],
  request: CanvasImageEditHandoffRequest,
): CanvasImageEditHandoffResolution {
  const existingSource = findExistingSourceNode(nodes, request)
  if (existingSource) {
    return { kind: 'reuse', nodeId: existingSource.id }
  }

  if (!request.sourceUrl) {
    const emptyLooseImage = findEmptyLooseImageNode(nodes)
    return emptyLooseImage
      ? { kind: 'reuse', nodeId: emptyLooseImage.id }
      : { kind: 'create', patch: {} }
  }

  return {
    kind: 'create',
    patch: {
      imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
      mediaKind: NODE_MEDIA_KIND_IDS.image,
      mediaUrl: request.sourceUrl,
      generationStatus: NODE_GENERATION_STATUS_IDS.success,
      status: NODE_STATUS_IDS.done,
      ...(request.generationId
        ? {
            generationId: request.generationId,
            sourceGenerationId: request.generationId,
          }
        : {}),
      ...(request.width === undefined ? {} : { mediaWidth: request.width }),
      ...(request.height === undefined ? {} : { mediaHeight: request.height }),
    },
  }
}
