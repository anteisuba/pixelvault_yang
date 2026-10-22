import { describe, expect, it, vi } from 'vitest'
import type { ModelMessage } from 'ai'

import {
  historyMessages,
  hydratePictures,
  lookedPicturesMessage,
  openingUserMessage,
  stripForFallback,
} from './messages'

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
  it('从最近往前放得下为止，开头必须是创作者说的', () => {
    const lines = [
      { role: 'user' as const, content: 'a'.repeat(50) },
      { role: 'assistant' as const, content: 'b'.repeat(50) },
      { role: 'user' as const, content: 'c' },
      { role: 'assistant' as const, content: 'd' },
    ]
    expect(
      historyMessages(lines, 3, 1_000).map((line) => line.content),
    ).toEqual(['c', 'd'])
    expect(historyMessages(lines, 10, 1_000)).toHaveLength(4)
  })
})
