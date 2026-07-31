import { describe, expect, it } from 'vitest'

import { CANVAS_ADD_CATALOG } from '@/constants/canvas-add-catalog'
import {
  NODE_ASSISTANT_ADD_INTENTS,
  NODE_ASSISTANT_OP_LIMITS,
  NODE_ASSISTANT_OP_MARKERS,
} from '@/constants/node-assistant-ops'

import { extractNodeAssistantOps } from './node-assistant-ops'

const { open, close } = NODE_ASSISTANT_OP_MARKERS

function wrap(payload: string): string {
  return `${open}${payload}${close}`
}

describe('extractNodeAssistantOps', () => {
  it('leaves a plain reply untouched', () => {
    const result = extractNodeAssistantOps('先把小林的定妆图定下来。')
    expect(result).toEqual({
      content: '先把小林的定妆图定下来。',
      batch: null,
      malformed: false,
    })
  })

  it('extracts a complete block and strips it from the visible content', () => {
    const raw = `我来加一个角色。\n${wrap(
      '{"ops":[{"op":"add_node","intent":"organize.character","ref":"c1","name":"小林"}]}',
    )}\n加好后你确认一下。`
    const result = extractNodeAssistantOps(raw)

    expect(result.malformed).toBe(false)
    expect(result.batch?.ops).toHaveLength(1)
    expect(result.batch?.ops[0]).toMatchObject({
      op: 'add_node',
      intent: 'organize.character',
      ref: 'c1',
      name: '小林',
    })
    expect(result.content).not.toContain(open)
    expect(result.content).not.toContain('organize.character')
    expect(result.content).toContain('我来加一个角色。')
    expect(result.content).toContain('加好后你确认一下。')
  })

  it('hides a half-written payload while streaming and produces no proposal', () => {
    // 每来一个 chunk 都会重跑抽取 —— 这一条锁的就是「没闭合就不算数」。
    const raw = `我来加一个角色。\n${open}{"ops":[{"op":"add_node","inte`
    const result = extractNodeAssistantOps(raw)

    expect(result.batch).toBeNull()
    expect(result.malformed).toBe(false)
    expect(result.content).toBe('我来加一个角色。')
    expect(result.content).not.toContain('add_node')
  })

  it('reports malformed when a complete block is not readable', () => {
    const result = extractNodeAssistantOps(`好的。${wrap('{"ops":[{"op":')}`)
    expect(result.batch).toBeNull()
    expect(result.malformed).toBe(true)
    expect(result.content).toBe('好的。')
  })

  it('reports malformed for an unknown op instead of silently dropping it', () => {
    const result = extractNodeAssistantOps(
      wrap('{"ops":[{"op":"delete_node","target":"n1"}]}'),
    )
    expect(result.batch).toBeNull()
    expect(result.malformed).toBe(true)
  })

  it('reports malformed when the batch exceeds the op cap', () => {
    const ops = Array.from(
      { length: NODE_ASSISTANT_OP_LIMITS.maxOps + 1 },
      () => '{"op":"add_node","intent":"image.asset"}',
    ).join(',')
    const result = extractNodeAssistantOps(wrap(`{"ops":[${ops}]}`))
    expect(result.batch).toBeNull()
    expect(result.malformed).toBe(true)
  })

  it('tolerates a fenced json payload (models love fences)', () => {
    const result = extractNodeAssistantOps(
      wrap(
        '\n```json\n{"ops":[{"op":"rename","target":"node-1","name":"雨夜开场镜"}]}\n```\n',
      ),
    )
    expect(result.malformed).toBe(false)
    expect(result.batch?.ops[0]).toMatchObject({
      op: 'rename',
      name: '雨夜开场镜',
    })
  })

  it('keeps only the first complete block but strips every one of them', () => {
    const raw = `${wrap(
      '{"ops":[{"op":"add_node","intent":"image.shot","ref":"s1"}]}',
    )}中间说明${wrap(
      '{"ops":[{"op":"add_node","intent":"video.generate","ref":"v1"}]}',
    )}`
    const result = extractNodeAssistantOps(raw)

    expect(result.batch?.ops).toHaveLength(1)
    expect(result.batch?.ops[0]).toMatchObject({ intent: 'image.shot' })
    expect(result.content).toBe('中间说明')
  })

  it('rejects a name longer than the display-name cap', () => {
    const name = 'x'.repeat(NODE_ASSISTANT_OP_LIMITS.maxNameLength + 1)
    const result = extractNodeAssistantOps(
      wrap(`{"ops":[{"op":"rename","target":"node-1","name":"${name}"}]}`),
    )
    expect(result.batch).toBeNull()
    expect(result.malformed).toBe(true)
  })
})

describe('NODE_ASSISTANT_ADD_INTENTS', () => {
  it('covers every ＋添加 menu intent', () => {
    // 菜单加了一族而这张表没跟上时，助手会安静地少一种能建的节点 —— 让它红在
    // 这里，而不是等真机上发现「它说建不了」。
    const catalogIds = CANVAS_ADD_CATALOG.flatMap((group) =>
      group.items.map((item) => item.id),
    ).sort()
    expect([...NODE_ASSISTANT_ADD_INTENTS].sort()).toEqual(catalogIds)
  })
})
