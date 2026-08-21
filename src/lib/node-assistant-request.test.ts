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

  /**
   * ⚠ 这个白名单是本轮反复出现的那类 bug 的落点：给节点上下文加了字段却漏改这里，
   * 新字段会在**发请求前**被安静地丢掉 —— 编译过、测试过、真机上模型照样看不见。
   * 所以每加一个现值字段，就在这里钉一条。
   */
  it('切片 5 第二批的三个现值字段能活着出去（漏改白名单就红在这里）', () => {
    const result = sanitizeNodeAssistantRequest(
      baseRequest({
        nodes: [
          {
            id: 'card-1',
            type: NODE_TYPE_IDS.image,
            status: NODE_STATUS_IDS.idle,
            title: '小林',
            model: 'seedance-2.0',
            params: { resolution: '720p', generateAudio: false, seed: 42 },
            references: {
              limit: 3,
              items: [{ role: 'identity', sourceId: 'img-7' }],
            },
          },
        ],
      }),
    )

    expect(result.nodes[0]).toMatchObject({
      model: 'seedance-2.0',
      params: { resolution: '720p', generateAudio: false, seed: 42 },
      references: {
        limit: 3,
        items: [{ role: 'identity', sourceId: 'img-7' }],
      },
    })
  })

  // 空的 `params` 是**有意义的值**（「有档位、一个都没设」），与字段整个缺席
  // 是两回事。清理时把它优化掉，模型就又分不出这两种情况了。
  it('params 的空对象要原样留着，不被当成「没有」清掉', () => {
    const result = sanitizeNodeAssistantRequest(
      baseRequest({
        nodes: [
          {
            id: 'vid-1',
            type: NODE_TYPE_IDS.seedance,
            status: NODE_STATUS_IDS.idle,
            title: '镜头 1',
            params: {},
          },
        ],
      }),
    )

    expect(result.nodes[0]?.params).toEqual({})
  })

  it('参考图条目按上限截断，且不会凭空长出 URL 字段', () => {
    const items = Array.from(
      { length: NODE_STUDIO_ASSISTANT_LIMITS.maxNodeReferences + 3 },
      () => ({ role: 'identity' as const }),
    )
    const result = sanitizeNodeAssistantRequest(
      baseRequest({
        nodes: [
          {
            id: 'card-1',
            type: NODE_TYPE_IDS.image,
            status: NODE_STATUS_IDS.idle,
            title: '小林',
            references: { limit: 3, items },
          },
        ],
      }),
    )

    expect(result.nodes[0]?.references?.items).toHaveLength(
      NODE_STUDIO_ASSISTANT_LIMITS.maxNodeReferences,
    )
    expect(JSON.stringify(result.nodes[0])).not.toContain('http')
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
