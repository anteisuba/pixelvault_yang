import { NODE_ASSISTANT_OP_LIMITS } from '@/constants/node-assistant-ops'
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

function sanitizeNodeParams(
  params: NonNullable<NodeAssistantNodeContext['params']>,
): NonNullable<NodeAssistantNodeContext['params']> {
  const aspectRatio = params.aspectRatio?.trim()
  const resolution = params.resolution?.trim()
  const duration = params.duration?.trim()
  const clamp = (value: string) =>
    value.slice(0, NODE_ASSISTANT_OP_LIMITS.maxParamValueLength)
  return {
    ...(aspectRatio ? { aspectRatio: clamp(aspectRatio) } : {}),
    ...(resolution ? { resolution: clamp(resolution) } : {}),
    ...(duration ? { duration: clamp(duration) } : {}),
    ...(typeof params.generateAudio === 'boolean'
      ? { generateAudio: params.generateAudio }
      : {}),
    ...(typeof params.seed === 'number' ? { seed: params.seed } : {}),
  }
}

/**
 * ⚠ 这里是**白名单**：出去的对象逐个字段自己拼。所以给
 * `NodeAssistantNodeContextSchema` 加字段而漏改这里，新字段会在发请求前被安静
 * 地丢掉 —— 编译过、测试过、真机上模型照样看不见（判据只能是抓请求体）。
 * 加字段就来这儿加一行。
 */
function sanitizeNodes(
  nodes: NodeAssistantNodeContext[],
): NodeAssistantNodeContext[] {
  return nodes
    .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodes)
    .map((node) => {
      const title = node.title.trim() || node.type
      const promptExcerpt = node.promptExcerpt?.trim()
      const imageCategoryLabel = node.imageCategoryLabel?.trim()
      const model = node.model?.trim()
      return {
        id: node.id.trim(),
        type: node.type,
        status: node.status,
        title: title.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength),
        ...(promptExcerpt
          ? {
              promptExcerpt: promptExcerpt.slice(
                0,
                NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength,
              ),
            }
          : {}),
        ...(node.imageCategory ? { imageCategory: node.imageCategory } : {}),
        ...(node.imageCategory && imageCategoryLabel
          ? {
              imageCategoryLabel: imageCategoryLabel.slice(
                0,
                NODE_ASSISTANT_OP_LIMITS.maxCategoryLabelLength,
              ),
            }
          : {}),
        ...(model
          ? { model: model.slice(0, NODE_ASSISTANT_OP_LIMITS.maxModelIdLength) }
          : {}),
        // ⚠ `params` 的空对象要**原样留着**：它表示「这节点有档位、一个都没设」，
        // 与「这节点没有档位」（字段缺席）是两回事。
        ...(node.params ? { params: sanitizeNodeParams(node.params) } : {}),
        ...(node.references
          ? {
              references: {
                limit: Math.max(0, Math.trunc(node.references.limit)),
                items: node.references.items
                  .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodeReferences)
                  .map((item) => ({
                    role: item.role,
                    ...(item.sourceId?.trim()
                      ? { sourceId: item.sourceId.trim() }
                      : {}),
                  })),
              },
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
      const nodeId = reference.nodeId?.trim()

      return {
        id: reference.id.trim(),
        ...(nodeId ? { nodeId } : {}),
        ...(reference.source ? { source: reference.source } : {}),
        kind: reference.kind,
        url: url.slice(0, 4000),
        ...(thumbnail && isHttpUrl(thumbnail)
          ? { thumbnailUrl: thumbnail.slice(0, 4000) }
          : {}),
        label: label.slice(0, 160),
      } satisfies NodeAssistantMediaReference
    })
    .filter((reference): reference is NodeAssistantMediaReference =>
      Boolean(reference?.id),
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
  const llmModelId = request.llmModelId?.trim()

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
    ...(llmModelId ? { llmModelId } : {}),
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
