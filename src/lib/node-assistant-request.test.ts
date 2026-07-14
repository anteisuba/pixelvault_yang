import { describe, expect, it } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { NODE_STUDIO_ASSISTANT_LIMITS } from '@/constants/node-studio'
import { sanitizeNodeAssistantRequest } from '@/lib/node-assistant-request'
import type { NodeAssistantRequest } from '@/types/node-assistant'

function baseRequest(
  overrides: Partial<NodeAssistantRequest> = {},
): NodeAssistantRequest {
  return {
    locale: 'zh',
    messages: [{ role: 'user', content: 'hello' }],
    nodes: [
      {
        id: 'node-1',
        type: NODE_TYPE_IDS.composer,
        status: NODE_STATUS_IDS.idle,
        title: 'Composer',
      },
    ],
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
