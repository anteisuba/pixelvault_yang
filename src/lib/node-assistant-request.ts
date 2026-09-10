import { NODE_STUDIO_ASSISTANT_LIMITS } from '@/constants/node-studio'
import type {
  NodeAssistantMediaReference,
  NodeAssistantMessage,
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

/**
 * v4 整图的 DoS 闸（③e）。
 *
 * ⚠ 这里**不再逐字段白名单**：v3 的投影是一个七字段的窄对象，抄一份白名单是可行
 * 的；v4 送的是节点自己那份 `data`（四族各二十余字段 + 槽 binding + 版本表），
 * 手抄一遍等于把 `NodeV4Schema` 在这里再实现一次，而漏掉的字段会在发请求前被
 * **安静地丢掉** —— 编译过、测试过、真机上模型照样看不见。形状校验归服务端那份
 * Zod（唯一事实源），这里只做「别发太多」和「别发没有 id 的」。
 */
/**
 * 调用方手上的图是**只读**的（RF store / v4 graph 都不给可变引用），而
 * `NodeAssistantRequest` 是 Zod 推出来的可变数组。⛔ 不在调用方 `[...nodes]` 拷一
 * 份绕过去：那是每轮对话把整张图复制一遍，且掩盖了「这里读不写」这个事实。
 */
export type NodeAssistantRequestInput = Omit<
  NodeAssistantRequest,
  'nodes' | 'edges'
> & {
  readonly nodes: readonly NodeAssistantRequest['nodes'][number][]
  readonly edges?: readonly NodeAssistantRequest['edges'][number][]
}

function sanitizeNodes(
  nodes: NodeAssistantRequestInput['nodes'],
): NodeAssistantRequest['nodes'] {
  return nodes
    .filter((node) => node.id.trim().length > 0)
    .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxV4Nodes)
}

function sanitizeEdges(
  edges: readonly NodeAssistantRequest['edges'][number][],
  nodes: NodeAssistantRequest['nodes'],
): NodeAssistantRequest['edges'] {
  const ids = new Set(nodes.map((node) => node.id))
  // 悬空边（两端有一头不在本次发出的节点里）一律丢：快照会把它渲染成一条指向
  // 不存在节点的槽行，而模型读到的是「这里挂了个东西」——比没有更坏。
  return edges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxV4Edges)
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
  request: NodeAssistantRequestInput,
): NodeAssistantRequest {
  const messages = sanitizeMessages(request.messages)
  const apiKeyId = request.apiKeyId?.trim()
  const llmModelId = request.llmModelId?.trim()

  const nodes = sanitizeNodes(request.nodes ?? [])

  return {
    messages,
    nodes,
    edges: sanitizeEdges(request.edges ?? [], nodes),
    ...(request.currentShotNo === undefined
      ? {}
      : { currentShotNo: request.currentShotNo }),
    selectedNodeIds: (request.selectedNodeIds ?? [])
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes),
    references: sanitizeReferences(request.references),
    locale: request.locale,
    ...(apiKeyId ? { apiKeyId } : {}),
    ...(llmModelId ? { llmModelId } : {}),
    ...(request.research ? { research: true } : {}),
    ...(request.deskPlan ? { deskPlan: true } : {}),
    ...(request.edit ? { edit: request.edit } : {}),
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
      record as unknown as NodeAssistantRequestInput,
    )
  } catch {
    return body
  }
}
