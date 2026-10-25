import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseSseStream } from '@/lib/sse'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  db: {
    voiceRoom: { findFirst: vi.fn() },
    characterCard: { findFirst: vi.fn() },
    voiceLine: { findMany: vi.fn() },
  },
  appendVoiceLine: vi.fn(),
  dispatchLine: vi.fn(),
  llmTextStream: vi.fn(),
  resolveAssistantRoute: vi.fn(),
  runAssistantNext: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: mocks.resolveAssistantRoute,
}))
vi.mock('@/services/llm-text.service', () => ({
  llmTextStream: mocks.llmTextStream,
}))
vi.mock('@/features/assistant/kernel', () => ({
  runAssistantNext: mocks.runAssistantNext,
}))
vi.mock('@/services/voiceroom.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/voiceroom.service')>()
  return {
    ...actual,
    appendVoiceLine: mocks.appendVoiceLine,
    dispatchLine: mocks.dispatchLine,
  }
})

import {
  streamVoiceRoomChat,
  voiceChatKernelMessages,
} from './voiceroom-chat.service'

const DENIA_ID = '11111111-1111-4111-8111-111111111111'
const YUKI_ID = '22222222-2222-4222-8222-222222222222'

const CAST = [
  { id: 'voice-1', kind: 'voice', name: 'Warm', coverImage: null },
  { id: 'builtin:sfx', kind: 'sfx', name: '音效', coverImage: null },
]

async function readEvents(response: Response) {
  const events: { event: string; data: unknown }[] = []
  for await (const frame of parseSseStream(response.body!)) {
    events.push({ event: frame.event, data: JSON.parse(frame.data) })
  }
  return events
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.voiceRoom.findFirst.mockResolvedValue({
    id: 'room-1',
    cast: CAST,
    _count: { lines: 0 },
  })
  mocks.db.characterCard.findFirst.mockResolvedValue({
    id: DENIA_ID,
    name: 'Denia',
    persona: { identity: '图书馆管理员' },
  })
  mocks.db.voiceLine.findMany.mockResolvedValue([])
  mocks.resolveAssistantRoute.mockResolvedValue({
    route: { adapterType: 'deepseek', apiKey: 'k', providerConfig: {} },
    modelId: 'deepseek-chat',
  })
  mocks.llmTextStream.mockImplementation(async function* () {
    yield 'Denia: 在'
    yield '的。'
  })
  mocks.appendVoiceLine.mockImplementation(async (_roomId, line) => ({
    id: line.speakerKind === 'user' ? 'line-user' : 'line-reply',
    ...line,
  }))
  mocks.dispatchLine.mockResolvedValue('job-1')
  mocks.runAssistantNext.mockImplementation(async function* () {
    yield { type: 'message_delta', delta: '在' }
    yield { type: 'message_delta', delta: '的。' }
    yield { type: 'message', text: '在的。' }
    yield { type: 'done' }
  })
})

const REQUEST = {
  roomId: 'room-1',
  speakerId: 'voice-1',
  text: '在吗',
  pace: 'normal' as const,
}

describe('streamVoiceRoomChat', () => {
  it('saves your line, streams her reply in character, then voices it', async () => {
    const response = await streamVoiceRoomChat(
      'clerk-1',
      REQUEST,
      new AbortController().signal,
    )
    const events = await readEvents(response)

    expect(events.map((item) => item.event)).toEqual([
      'user',
      'delta',
      'delta',
      'reply',
    ])
    expect(mocks.appendVoiceLine.mock.calls[0][1]).toMatchObject({
      speakerKind: 'user',
      text: '在吗',
      jobId: null,
    })
    // 名字前缀被剥掉、按选的念法派出声音，台词挂上那个 job。
    expect(mocks.dispatchLine).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '在的。',
        delivery: expect.objectContaining({ pace: 'normal' }),
      }),
    )
    expect(mocks.appendVoiceLine.mock.calls[1][1]).toMatchObject({
      speakerId: 'voice-1',
      text: '在的。',
      jobId: 'job-1',
    })
    // 绑着角色卡：走助手新内核的聊天模式，扮的就是这张卡。
    expect(mocks.runAssistantNext.mock.calls[0][1]).toMatchObject({
      chatCharacterId: DENIA_ID,
      domain: 'home',
      messages: [{ role: 'user', content: '在吗' }],
    })
    expect(mocks.llmTextStream).not.toHaveBeenCalled()
    // 配音间没有接力条：给内核一个比接口时限短的时限，到点先交出写好的话。
    expect(
      mocks.runAssistantNext.mock.calls[0][2].timeBudget.hardMs,
    ).toBeLessThan(120_000)
  })

  it('keeps the thin writer for a voice with no character card', async () => {
    mocks.db.characterCard.findFirst.mockResolvedValue(null)
    mocks.llmTextStream.mockImplementation(async function* () {
      yield 'Warm: 在的。'
    })
    const response = await streamVoiceRoomChat(
      'clerk-1',
      REQUEST,
      new AbortController().signal,
    )
    await readEvents(response)

    expect(mocks.runAssistantNext).not.toHaveBeenCalled()
    expect(mocks.appendVoiceLine.mock.calls[1][1]).toMatchObject({
      text: '在的。',
    })
  })

  it('saves your pictures on your line and her web sources on hers', async () => {
    mocks.runAssistantNext.mockImplementation(async function* () {
      yield {
        type: 'step',
        step: {
          id: 's1',
          tool: 'search_web',
          status: 'done',
          result: {
            results: [
              { title: '官网', url: 'https://a.example/1', snippet: '' },
              { title: '重复', url: 'https://a.example/1', snippet: '' },
            ],
          },
        },
      }
      yield { type: 'message_delta', delta: '我查' }
      yield { type: 'message_delta', delta: '查到了。', restart: true }
      yield { type: 'message', text: '查到了。' }
    })
    const image = {
      id: 'gen-1',
      url: 'https://cdn.example/a.png',
      label: '图_3',
      seq: 3,
    }
    const response = await streamVoiceRoomChat(
      'clerk-1',
      { ...REQUEST, images: [image] },
      new AbortController().signal,
    )
    const events = await readEvents(response)

    expect(events[2]).toMatchObject({
      event: 'delta',
      data: { text: '查到了。', restart: true },
    })
    expect(mocks.runAssistantNext.mock.calls[0][1].mentionedAssets).toEqual([
      { id: 'gen-1', url: 'https://cdn.example/a.png', label: '图_3', seq: 3 },
    ])
    expect(mocks.appendVoiceLine.mock.calls[0][1]).toMatchObject({
      attachments: { images: [image] },
    })
    expect(mocks.appendVoiceLine.mock.calls[1][1]).toMatchObject({
      text: '查到了。',
      attachments: {
        sources: [{ title: '官网', url: 'https://a.example/1' }],
      },
    })
  })

  it('keeps her words when the voice cannot be made, and says why', async () => {
    mocks.dispatchLine.mockRejectedValue(new Error('no fish key'))
    const response = await streamVoiceRoomChat(
      'clerk-1',
      REQUEST,
      new AbortController().signal,
    )
    const events = await readEvents(response)

    expect(events.map((item) => item.event)).toEqual([
      'user',
      'delta',
      'delta',
      'reply',
      'error',
    ])
    expect(mocks.appendVoiceLine.mock.calls[1][1]).toMatchObject({
      text: '在的。',
      jobId: null,
    })
  })

  it('only types when the room has its voice off', async () => {
    const response = await streamVoiceRoomChat(
      'clerk-1',
      { ...REQUEST, voice: false },
      new AbortController().signal,
    )
    const events = await readEvents(response)

    expect(events.map((item) => item.event)).toEqual([
      'user',
      'delta',
      'delta',
      'reply',
    ])
    expect(mocks.dispatchLine).not.toHaveBeenCalled()
    expect(mocks.appendVoiceLine.mock.calls[1][1]).toMatchObject({
      text: '在的。',
      jobId: null,
    })
  })

  it('uses the character card picked for this room before the voice binding', async () => {
    mocks.db.voiceRoom.findFirst.mockResolvedValue({
      id: 'room-1',
      cast: [{ ...CAST[0], characterCardId: YUKI_ID }, CAST[1]],
      _count: { lines: 0 },
    })
    mocks.db.characterCard.findFirst.mockResolvedValueOnce({
      id: YUKI_ID,
      name: 'Yuki',
      persona: {},
    })
    const response = await streamVoiceRoomChat(
      'clerk-1',
      REQUEST,
      new AbortController().signal,
    )
    await readEvents(response)

    expect(
      mocks.db.characterCard.findFirst.mock.calls[0][0].where,
    ).toMatchObject({ id: YUKI_ID, isDeleted: false })
    expect(mocks.runAssistantNext.mock.calls[0][1]).toMatchObject({
      chatCharacterId: YUKI_ID,
    })
  })

  it('lets her hear your files and keeps the pictures she found online', async () => {
    const found = {
      imageUrl: 'https://img.example/a.jpg',
      usableAsInput: true,
      sourceVerdict: 'allowed' as const,
    }
    mocks.runAssistantNext.mockImplementation(async function* () {
      yield {
        type: 'step',
        step: {
          id: 's2',
          tool: 'search_web_images',
          status: 'done',
          payload: { query: '雪景', limit: 8 },
          result: { totalFound: 1, images: [found] },
        },
      }
      yield { type: 'message', text: '找到一张。' }
    })
    const file = {
      id: 'gen-a',
      url: 'https://cdn.example/a.mp3',
      kind: 'audio' as const,
      label: '录音',
    }
    const response = await streamVoiceRoomChat(
      'clerk-1',
      { ...REQUEST, files: [file] },
      new AbortController().signal,
    )
    await readEvents(response)

    expect(mocks.runAssistantNext.mock.calls[0][1].mediaAttachments).toEqual([
      { kind: 'audio', url: 'https://cdn.example/a.mp3', label: '录音' },
    ])
    expect(mocks.appendVoiceLine.mock.calls[0][1]).toMatchObject({
      attachments: { files: [file] },
    })
    expect(mocks.appendVoiceLine.mock.calls[1][1]).toMatchObject({
      attachments: { webImages: [{ query: '雪景', images: [found] }] },
    })
  })

  it('refuses to chat with the sound-effects speaker before opening a stream', async () => {
    await expect(
      streamVoiceRoomChat(
        'clerk-1',
        { ...REQUEST, speakerId: 'builtin:sfx' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ errorCode: 'VOICE_ROOM_CHAT_VOICE_ONLY' })
    expect(mocks.appendVoiceLine).not.toHaveBeenCalled()
  })
})

describe('voiceChatKernelMessages', () => {
  it('turns the room into her side and yours, merging back-to-back lines', () => {
    expect(
      voiceChatKernelMessages(
        [
          { who: 'user', name: '', text: '早' },
          { who: 'self', name: 'Warm', text: '早呀' },
          { who: 'other', name: 'Yuki', text: '我也在' },
        ],
        '今天去哪',
      ),
    ).toEqual([
      { role: 'user', content: '早' },
      { role: 'assistant', content: '早呀' },
      { role: 'user', content: 'Yuki: 我也在\n今天去哪' },
    ])
  })
})
