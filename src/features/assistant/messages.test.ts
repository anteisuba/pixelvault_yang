import { describe, expect, it, vi } from 'vitest'
import type { ModelMessage } from 'ai'

import {
  clearOldToolResults,
  historyMessages,
  hydratePictures,
  lookedPicturesMessage,
  openingUserMessage,
  stripForFallback,
} from './messages'
import { renderSkill } from './skills'

const bytes = (url: string) => ({
  data: new Uint8Array(Buffer.from(url)),
  mediaType: 'image/png',
})

describe('图留在眼前', () => {
  it('存的是地址，发之前换成字节；下不来的说一句', async () => {
    const load = vi.fn(async (url: string) =>
      url.includes('broken') ? null : bytes(url),
    )
    const messages = [
      openingUserMessage('BENCH', [
        { url: 'https://cdn.test/a.png', label: '图1' },
        { url: 'https://cdn.test/broken.png', label: '图2' },
      ]),
    ]
    const [hydrated] = await hydratePictures(messages, load)
    const content = hydrated!.content as { type: string; text?: string }[]
    expect(content.filter((part) => part.type === 'image')).toHaveLength(1)
    expect(
      content.some((part) => part.text?.includes('could not be loaded')),
    ).toBe(true)
    expect(content.some((part) => part.text === '[picture: 图1]')).toBe(true)
  })

  it('超过上限时最早的那几张换成一行字，最近的留着', async () => {
    const load = vi.fn(async (url: string) => bytes(url))
    const messages: ModelMessage[] = [
      lookedPicturesMessage([
        { url: 'https://cdn.test/old.png', label: 'old' },
      ]),
      lookedPicturesMessage([
        { url: 'https://cdn.test/new-1.png', label: 'n1' },
        { url: 'https://cdn.test/new-2.png', label: 'n2' },
      ]),
    ]
    await hydratePictures(messages, load, 2)
    expect(load.mock.calls.map(([url]) => url)).toEqual([
      'https://cdn.test/new-1.png',
      'https://cdn.test/new-2.png',
    ])
  })
})

describe('换保守接法', () => {
  it('拿掉思考块与厂商自己跑的联网，留说的话与我们的工具调用', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning',
            text: 'thinking',
            providerOptions: { a: { s: 'sig' } },
          },
          {
            type: 'tool-call',
            toolCallId: 's1',
            toolName: 'web_search',
            input: {},
            providerExecuted: true,
          },
          { type: 'text', text: 'ok' },
          { type: 'tool-call', toolCallId: 'c1', toolName: 'edit', input: {} },
        ],
      },
    ]
    const stripped = stripForFallback(messages)
    const assistant = stripped[1]!.content as {
      type: string
      toolName?: string
    }[]
    expect(assistant.map((part) => part.type)).toEqual(['text', 'tool-call'])
    expect(assistant[1]!.toolName).toBe('edit')
  })
})

describe('之前几轮的对白', () => {
  it('开头必须是创作者说的，空白的不算', () => {
    const lines = [
      { role: 'assistant' as const, content: 'stray' },
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: '  ' },
      { role: 'assistant' as const, content: 'b' },
    ]
    expect(historyMessages(lines).map((line) => line.content)).toEqual([
      'a',
      'b',
    ])
    expect(historyMessages([lines[0]!])).toEqual([])
  })
})

describe('清旧工具结果（第 6 步）', () => {
  const limits = {
    clearToolResultsChars: 1_000,
    keepToolSteps: 2,
    clearableResultChars: 100,
  }
  const step = (id: string, value: string): ModelMessage[] => [
    {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: id, toolName: 'find', input: {} },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: id,
          toolName: 'find',
          output: { type: 'text', value },
        },
      ],
    },
  ]
  const outputs = (messages: readonly ModelMessage[]) =>
    messages.flatMap((message) =>
      message.role === 'tool'
        ? message.content.map((part) =>
            part.type === 'tool-result' && part.output.type === 'text'
              ? part.output.value
              : '',
          )
        : [],
    )

  it('没超线原样不动（同一个数组）', () => {
    const messages = [
      ...step('a', 'x'.repeat(300)),
      ...step('b', 'y'.repeat(300)),
    ]
    expect(clearOldToolResults(messages, limits)).toBe(messages)
  })

  it('超线了：最近两步与短结果留着，更早的长结果换成一行', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'go' },
      ...step('a', `first line of a ${'x'.repeat(400)}`),
      ...step('b', 'short'),
      ...step('c', 'y'.repeat(400)),
      ...step('d', 'z'.repeat(400)),
    ]
    const cleared = outputs(clearOldToolResults(messages, limits))
    expect(cleared[0]).toMatch(
      /^\(cleared to save room; it began: "first line of a/,
    )
    expect(cleared[1]).toBe('short')
    expect(cleared[2]).toBe('y'.repeat(400))
    expect(cleared[3]).toBe('z'.repeat(400))
  })

  it('清掉的那一步里读过的技能原样留着；再清一次不变', () => {
    const skill = renderSkill('参考图分工')
    const messages: ModelMessage[] = [
      { role: 'user', content: 'go' },
      ...step('a', `${skill}\n\nTHE BENCH ${'x'.repeat(400)}`),
      ...step('b', 'y'.repeat(400)),
      ...step('c', 'z'.repeat(400)),
    ]
    const once = clearOldToolResults(messages, limits)
    const cleared = outputs(once)[0]!
    expect(cleared).toMatch(/^\(cleared to save room;/)
    expect(cleared).toContain(skill)
    expect(cleared).not.toContain('x'.repeat(400))
    expect(outputs(clearOldToolResults(once, limits))[0]).toBe(cleared)
  })
})
