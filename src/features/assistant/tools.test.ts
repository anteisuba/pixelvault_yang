import { describe, expect, it } from 'vitest'

import {
  AskInputSchema,
  EditInputSchema,
  LookInputSchema,
  parseToolInput,
  toModelJsonSchema,
} from './tools'

describe('新内核工具入参：宽进', () => {
  it('Claude 式省略可空字段照样读得懂（基线里 write 参数不对的 7 次都是这一种）', () => {
    const parsed = parseToolInput(
      EditInputSchema,
      { changes: [{ op: 'prompt', mode: 'replace', text: 'a cat' }] },
      'edit',
    )
    expect(parsed).toEqual({
      ok: true,
      value: { changes: [{ op: 'prompt', mode: 'replace', text: 'a cat' }] },
    })
  })

  it('整串 JSON、单个对象当数组、数字写成字符串、大小写都认', () => {
    const parsed = parseToolInput(
      EditInputSchema,
      JSON.stringify({
        changes: { op: 'COUNT', count: '2' },
      }),
      'edit',
    )
    expect(parsed).toEqual({
      ok: true,
      value: { changes: [{ op: 'count', count: 2 }] },
    })
  })

  it('`change` 写成单数也认，find/replace 单个对象也认', () => {
    const parsed = parseToolInput(
      EditInputSchema,
      {
        change: {
          op: 'prompt',
          mode: 'edit',
          edits: { find: 'girl', replace: 'boy' },
        },
      },
      'edit',
    )
    expect(parsed.ok && parsed.value.changes[0]?.edits).toEqual([
      { find: 'girl', replace: 'boy' },
    ])
  })

  it('真读不懂时只说哪一格、让它只改那一格', () => {
    const parsed = parseToolInput(
      EditInputSchema,
      { changes: [{ op: 'paint' }] },
      'edit',
    )
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.error).toContain('changes.0.op')
    expect(!parsed.ok && parsed.error).toContain('call edit again')
  })

  it('look 什么都不给 = 只读台子', () => {
    expect(parseToolInput(LookInputSchema, undefined, 'look')).toEqual({
      ok: true,
      value: {},
    })
  })

  it('look 的旧叫法 pictures 照认', () => {
    expect(
      parseToolInput(LookInputSchema, { pictures: ['图_1624'] }, 'look'),
    ).toEqual({ ok: true, value: { names: ['图_1624'] } })
  })

  it('ask 至少两个选项', () => {
    const parsed = parseToolInput(
      AskInputSchema,
      { question: '哪个？', options: [{ label: 'A' }] },
      'ask',
    )
    expect(parsed.ok).toBe(false)
  })
})

describe('给模型看的 JSON schema：严格模式的形状', () => {
  it('每个对象字段都必填、不收别的字段，可空的写成 X | null', () => {
    const schema = toModelJsonSchema(LookInputSchema) as {
      required: string[]
      additionalProperties: boolean
      properties: Record<string, { anyOf?: { type: string }[] }>
    }
    expect(schema.required).toEqual(['names', 'question', 'tagger'])
    expect(schema.additionalProperties).toBe(false)
    expect(
      schema.properties.question?.anyOf?.map((entry) => entry.type),
    ).toContain('null')
  })
})

describe('给模型看的 JSON schema：别家的自然形状', () => {
  it('只有真必需的必填（Claude 不会被逼着把二十格都填上）', () => {
    const schema = toModelJsonSchema(EditInputSchema, false) as {
      required: string[]
      properties: {
        changes: { items: { required?: string[] } }
      }
    }
    expect(schema.required).toEqual(['changes'])
    expect(schema.properties.changes.items.required).toEqual(['op'])
  })
})
