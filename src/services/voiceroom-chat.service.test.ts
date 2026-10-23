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
vi.mock('@/services/voiceroom.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/voiceroom.service')>()
  return {
    ...actual,
    appendVoiceLine: mocks.appendVoiceLine,
    dispatchLine: mocks.dispatchLine,
  }
})

import { streamVoiceRoomChat } from './voiceroom-chat.service'

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
    // 绑着的角色就是她：提示词用角色名和设定。
    expect(mocks.llmTextStream.mock.calls[0][0].systemPrompt).toContain(
      'You are Denia',
    )
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
