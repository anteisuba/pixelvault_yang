import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { fakeServer, renderWithApp } from '@/test/app-harness'
import { text } from '@/test/i18n-text'
import { characterCardFixture } from '@/test/studio-harness'
import type { VoiceBenchData } from '@/types/voice-bench'

import { VoiceBench } from './VoiceBench'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/voice',
  useRouter: () => ({ push: vi.fn() }),
}))

/**
 * 只假 api-client 边界：真 `useVoiceBench` / `usePersonaVoice` / `useAssistantPersona` /
 * `useOperatorVoice` 都跑，回什么由这里定。角色卡列表走 `fakeServer`。
 */
const api = vi.hoisted(() => ({
  bench: null as unknown,
  persona: null as unknown,
  speak: vi.fn(),
  rewrite: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  getVoiceBenchAPI: async () => ({ success: true, data: api.bench }),
  getAssistantPersonaAPI: async () => ({ success: true, data: api.persona }),
  getVoiceCardAPI: async (id: string) => ({
    success: true,
    data: { id, name: 'Warm' },
  }),
  speakAssistantReplyAPI: api.speak,
  rewriteVoiceBenchTextAPI: api.rewrite,
  checkAudioStatusAPI: () => new Promise(() => {}),
}))

const T = (key: string) => text(`VoiceBench.${key}`)
const ok = (data: unknown) => Response.json({ success: true, data })

const HARU = {
  ...ASSISTANT_PERSONA_DEFAULTS,
  name: '晴',
  character: { id: 'c1', name: '晴', faceUrl: null, hasSpeech: true },
}

function renderBench() {
  return renderWithApp(<VoiceBench />, { inner: ApiKeysProvider })
}

/** 等真 hook 把台词拉回来。 */
const lineRow = () => screen.findByTestId('voice-bench-line')

beforeEach(() => {
  api.speak.mockReset()
  api.rewrite.mockReset()
  api.persona = HARU
  api.bench = {
    characterCardId: 'c1',
    voiceCardId: 'v1',
    lines: [
      {
        id: 'g1',
        text: '[whispering] 嘘，书会被吵醒的。',
        url: 'https://cdn.test/g1.mp3',
        duration: null,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ],
  } satisfies Partial<VoiceBenchData> as unknown
  fakeServer()
    .on('GET', API_ENDPOINTS.CHARACTER_CARDS, () =>
      ok([characterCardFixture({ id: 'c1', name: '晴', voiceCardId: 'v1' })]),
    )
    .on('GET', API_ENDPOINTS.API_KEYS, () => ok([]))
})
afterEach(() => vi.unstubAllGlobals())

describe('VoiceBench（配音台 ③）', () => {
  it('一行一句：句首语气单独摆，▶ 和「放回输入框」各一颗；写一句按回车就念', async () => {
    api.speak.mockReturnValue(new Promise(() => {}))
    renderBench()
    const row = await lineRow()
    expect(row).toHaveTextContent('[whispering]')
    expect(row).toHaveTextContent('嘘，书会被吵醒的。')
    const box = screen.getByRole('textbox', { name: T('placeholder') })
    fireEvent.click(screen.getByRole('button', { name: T('editLine') }))
    expect(box).toHaveValue('[whispering] 嘘，书会被吵醒的。')

    fireEvent.change(box, { target: { value: '欢迎来到图书馆。' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    // 真 useVoiceBench 排上一句、交给念那一跳。
    await waitFor(() =>
      expect(api.speak).toHaveBeenCalledWith(
        expect.objectContaining({ text: '欢迎来到图书馆。' }),
      ),
    )
    expect(screen.getByText(T('pending'))).toBeInTheDocument()
  })

  it('语气菜单：点一个就把 [标记] 插到光标处', async () => {
    renderBench()
    await lineRow()
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '别回头走吧' } })
    box.setSelectionRange(3, 3)
    fireEvent.click(screen.getByTestId('voice-bench-cues'))
    fireEvent.click(screen.getByTitle('[sighing]'))
    expect(box.value).toBe('别回头[sighing]走吧')
  })

  it('按她说：改好的字回到输入框，⛔ 直接念', async () => {
    api.rewrite.mockResolvedValue({
      success: true,
      data: { text: '欢迎光临～这里是图书馆哦。' },
    })
    renderBench()
    await lineRow()
    const box = screen.getByRole('textbox', { name: T('placeholder') })
    fireEvent.change(box, { target: { value: '欢迎来到图书馆。' } })
    fireEvent.click(screen.getByTestId('voice-bench-rewrite'))
    expect(api.rewrite).toHaveBeenCalledWith({ text: '欢迎来到图书馆。' })
    await waitFor(() => expect(box).toHaveValue('欢迎光临～这里是图书馆哦。'))
    expect(api.speak).not.toHaveBeenCalled()
  })

  it('默认助手：先换个角色，⛔ 输入框', async () => {
    api.persona = { ...ASSISTANT_PERSONA_DEFAULTS, character: null }
    api.bench = { characterCardId: null, voiceCardId: null, lines: [] }
    renderBench()
    expect(await screen.findByText(T('noPersonaTitle'))).toBeInTheDocument()
    expect(screen.queryByTestId('voice-bench-composer')).toBeNull()
  })

  it('还在念 / 缺嗓子的那一句就地标出来', async () => {
    // 第一句服务端说「没绑嗓子」，第二句一直在念。
    api.speak
      .mockResolvedValueOnce({
        success: false,
        error: 'unbound',
        errorCode: 'ASSISTANT_VOICE_UNBOUND',
      })
      .mockReturnValueOnce(new Promise(() => {}))
    renderBench()
    await lineRow()
    const box = screen.getByRole('textbox', { name: T('placeholder') })
    fireEvent.change(box, { target: { value: '走吧\n在呢' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(
      await screen.findByRole('button', { name: T('pickVoice') }),
    ).toBeInTheDocument()
    expect(screen.getByText(T('pending'))).toBeInTheDocument()
  })
})
