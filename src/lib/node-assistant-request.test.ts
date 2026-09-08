import { describe, expect, it } from 'vitest'

import { NODE_STUDIO_ASSISTANT_LIMITS } from '@/constants/node-studio'
import { sanitizeNodeAssistantRequest } from '@/lib/node-assistant-request'
import type { NodeAssistantRequest } from '@/types/node-assistant'

function v4Node(id: string): NodeAssistantRequest['nodes'][number] {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'result',
      name: id,
      status: 'idle',
      createdAt: '2026-09-08T00:00:00.000Z',
    },
  }
}

function baseRequest(
  overrides: Partial<NodeAssistantRequest> = {},
): NodeAssistantRequest {
  return {
    locale: 'zh',
    messages: [{ role: 'user', content: 'hello' }],
    nodes: [v4Node('node-1')],
    edges: [],
    selectedNodeIds: ['node-1'],
    ...overrides,
  }
}

describe('sanitizeNodeAssistantRequest', () => {
  it('drops empty messages but keeps full multi-turn history under the DoS cap', () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: index === 3 ? '   ' : `msg-${index}`,
    }))

    const result = sanitizeNodeAssistantRequest(baseRequest({ messages }))

    // One empty shell removed; no product truncation of the rest.
    expect(result.messages).toHaveLength(39)
    expect(result.messages.every((message) => message.content.length > 0)).toBe(
      true,
    )
    expect(result.messages[0]?.content).toBe('msg-0')
    expect(result.messages.at(-1)?.content).toBe('msg-39')
  })

  it('omits empty apiKeyId and non-http references', () => {
    const result = sanitizeNodeAssistantRequest(
      baseRequest({
        apiKeyId: '   ',
        references: [
          {
            id: 'bad',
            nodeId: 'n1',
            kind: 'image',
            url: '/relative/path.png',
            label: 'bad',
          },
          {
            id: 'good',
            nodeId: 'n2',
            kind: 'image',
            url: 'https://cdn.example.com/a.png',
            thumbnailUrl: 'not-a-url',
            label: 'good',
          },
        ],
      }),
    )

    expect(result.apiKeyId).toBeUndefined()
    expect(result.references).toEqual([
      {
        id: 'good',
        nodeId: 'n2',
        kind: 'image',
        url: 'https://cdn.example.com/a.png',
        label: 'good',
      },
    ])
  })

  it('keeps uploaded assistant media even when it is not a canvas node', () => {
    const result = sanitizeNodeAssistantRequest(
      baseRequest({
        references: [
          {
            id: 'uploaded-image:1',
            source: 'upload',
            kind: 'image',
            url: 'https://cdn.example.com/reference.png',
            thumbnailUrl: 'https://cdn.example.com/reference-thumb.png',
            label: 'reference.png',
          },
        ],
      }),
    )

    expect(result.references).toEqual([
      {
        id: 'uploaded-image:1',
        source: 'upload',
        kind: 'image',
        url: 'https://cdn.example.com/reference.png',
        thumbnailUrl: 'https://cdn.example.com/reference-thumb.png',
        label: 'reference.png',
      },
    ])
  })

  it('caps selectedNodeIds', () => {
    const selectedNodeIds = Array.from(
      { length: NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes + 5 },
      (_, index) => `node-${index}`,
    )
    const result = sanitizeNodeAssistantRequest(
      baseRequest({ selectedNodeIds }),
    )
    expect(result.selectedNodeIds).toHaveLength(
      NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes,
    )
  })

  // v4 起节点是整份 `NodeV4`，⛔ 不再逐字段白名单（理由见 `sanitizeNodes` 的头注）。
  // 这里钉的是接替它的那两道闸：节点数上限、悬空边。
  it('节点数按 maxV4Nodes 截断', () => {
    const nodes = Array.from(
      { length: NODE_STUDIO_ASSISTANT_LIMITS.maxV4Nodes + 5 },
      (_, index) => v4Node(`node-${index}`),
    )
    const result = sanitizeNodeAssistantRequest(baseRequest({ nodes }))
    expect(result.nodes).toHaveLength(NODE_STUDIO_ASSISTANT_LIMITS.maxV4Nodes)
  })

  // 悬空边会被快照渲染成一条指向不存在节点的槽行 —— 模型读到的是「这里挂了个
  // 东西」，比没有更坏。
  it('两端有一头不在这次节点里的边一律丢掉', () => {
    const result = sanitizeNodeAssistantRequest(
      baseRequest({
        nodes: [v4Node('a'), v4Node('b')],
        edges: [
          {
            id: 'e1',
            source: 'a',
            sourceHandle: 'out',
            target: 'b',
            slot: 'reference',
          },
          {
            id: 'e2',
            source: 'a',
            sourceHandle: 'out',
            target: 'ghost',
            slot: 'reference',
          },
        ],
      }),
    )
    expect(result.edges.map((edge) => edge.id)).toEqual(['e1'])
  })

  it('does not truncate long assistant history on later turns', () => {
    const longAssistant = '镜'.repeat(20_000)
    const result = sanitizeNodeAssistantRequest(
      baseRequest({
        messages: [
          { role: 'user', content: '帮我写分镜' },
          { role: 'assistant', content: longAssistant },
          { role: 'user', content: '再细化第二镜' },
        ],
      }),
    )

    expect(result.messages).toHaveLength(3)
    expect(result.messages[1]?.content).toBe(longAssistant)
    expect(result.messages[2]?.content).toBe('再细化第二镜')
  })
})
