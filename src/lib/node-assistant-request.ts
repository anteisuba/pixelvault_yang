import { NODE_STUDIO_ASSISTANT_LIMITS } from '@/constants/node-studio'
import type {
  NodeAssistantMediaReference,
  NodeAssistantMessage,
  NodeAssistantNodeContext,
  NodeAssistantRequest,
} from '@/types/node-assistant'

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeMessages(
  messages: NodeAssistantMessage[],
): NodeAssistantMessage[] {
  // Do not truncate content or drop mid-history turns for product reasons —
  // only strip empty shells (failed streams) and apply the hard DoS cap.
  return messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-NODE_STUDIO_ASSISTANT_LIMITS.maxMessages)
}

function sanitizeNodes(
  nodes: NodeAssistantNodeContext[],
): NodeAssistantNodeContext[] {
  return nodes
    .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodes)
    .map((node) => {
      const title = node.title.trim() || node.type
      const summary = node.summary?.trim()
      return {
        id: node.id.trim(),
        type: node.type,
        status: node.status,
        title: title.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength),
        ...(summary
          ? {
              summary: summary.slice(
                0,
                NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength,
              ),
            }
          : {}),
      }
    })
    .filter((node) => node.id.length > 0 && node.title.length > 0)
}

function sanitizeReferences(
  references: NodeAssistantMediaReference[] | undefined,
): NodeAssistantMediaReference[] | undefined {
  if (!references?.length) return undefined

  const cleaned = references
    .map((reference) => {
      const url = reference.url.trim()
      if (!isHttpUrl(url)) return null

      const thumbnail =
        typeof reference.thumbnailUrl === 'string'
          ? reference.thumbnailUrl.trim()
          : ''
      const label = reference.label.trim() || reference.kind

      return {
        id: reference.id.trim(),
        nodeId: reference.nodeId.trim(),
        kind: reference.kind,
        url: url.slice(0, 4000),
        ...(thumbnail && isHttpUrl(thumbnail)
          ? { thumbnailUrl: thumbnail.slice(0, 4000) }
          : {}),
        label: label.slice(0, 160),
      } satisfies NodeAssistantMediaReference
    })
    .filter((reference): reference is NodeAssistantMediaReference =>
      Boolean(reference?.id && reference.nodeId),
    )
    .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxReferences)

  return cleaned.length > 0 ? cleaned : undefined
}

/**
 * Clamp / clean a node-assistant payload so it matches
 * `NodeAssistantRequestSchema` even when the UI has a long history, multi-select
 * over the limit, empty failed-turn messages, or non-http media URLs.
 */
export function sanitizeNodeAssistantRequest(
  request: NodeAssistantRequest,
): NodeAssistantRequest {
  const messages = sanitizeMessages(request.messages)
  const apiKeyId = request.apiKeyId?.trim()

  return {
    messages,
    nodes: sanitizeNodes(request.nodes ?? []),
    selectedNodeIds: (request.selectedNodeIds ?? [])
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes),
    references: sanitizeReferences(request.references),
    locale: request.locale,
    ...(apiKeyId ? { apiKeyId } : {}),
    ...(request.research ? { research: true } : {}),
  }
}

/**
 * Best-effort pre-clean for untyped JSON bodies (API route). Returns the
 * original value when the shape is too broken to sanitize.
 */
export function sanitizeNodeAssistantRequestBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const record = body as Record<string, unknown>
  if (!Array.isArray(record.messages)) return body

  try {
    return sanitizeNodeAssistantRequest(
      record as unknown as NodeAssistantRequest,
    )
  } catch {
    return body
  }
}
