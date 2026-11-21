import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'

import { VOICE_CARD_PROVIDER } from '@/constants/voice-cards'
import type { CharacterCardRecord, VoiceCardRecord } from '@/types'
import { renderWithApp } from '@/test/app-harness'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import { VoicesPage } from './VoicesPage'

// 只假网络：真 `useVoicesPage` → 真 `useVoiceLibrary` + 真角色库 + 真试听。
const api = vi.hoisted(() => ({
  listVoiceCardsAPI: vi.fn(),
  listVoicesAPI: vi.fn(),
  listCharacterCardsAPI: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  ...api,
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
// 「用这副嗓子配音」跳配音台：测试里没有 app router，只记它往哪跳。
const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('@/i18n/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/navigation')>()),
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
}))

function voice(id: string, name: string, cloned = false): VoiceCardRecord {
  return {
    id,
    name,
    provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
    coverImage: null,
    referenceAudioUrl: cloned ? 'https://cdn.test/ref.mp3' : null,
    sampleAudioUrl: null,
    voiceId: `fish-${id}`,
  } as unknown as VoiceCardRecord
}

const DENIA = {
  id: 'denia',
  name: 'Denia',
  voiceCardId: 'v1',
  looks: [
    {
      id: 'look',
      isDefault: true,
      referenceSlots: [{ url: 'https://cdn.test/denia.png', isPrimary: true }],
    },
  ],
} as unknown as CharacterCardRecord

beforeEach(() => {
  api.listVoiceCardsAPI.mockResolvedValue({
    success: true,
    data: {
      items: [
        voice('v1', 'Warm'),
        voice('v2', 'Calm'),
        voice('v3', 'Mine', true),
      ],
      total: 3,
    },
  })
  api.listVoicesAPI.mockResolvedValue({
    success: true,
    data: { items: [], total: 0 },
  })
  api.listCharacterCardsAPI.mockResolvedValue({ success: true, data: [DENIA] })
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function renderPage() {
  renderWithApp(<VoicesPage />)
  // 卡片拉回来了（分组药丸菜单上的数到了）。
  await vi.waitFor(() => expect(api.listVoiceCardsAPI).toHaveBeenCalledTimes(1))
}

function openScopeMenu() {
  fireEvent.pointerDown(screen.getByTestId('library-scope-select'), {
    button: 0,
    ctrlKey: false,
  })
}

describe('VoicesPage · desktop library', () => {
  beforeEach(() => setViewportWidth(DESKTOP_WIDTH))

  it('shows the scope pill and my voices', async () => {
    await renderPage()
    await screen.findByText('Warm')
    expect(screen.getByTestId('library-scope-select')).toHaveTextContent(
      '全部音色',
    )
    expect(screen.getByRole('button', { name: '克隆音色' })).toBeInTheDocument()
    expect(screen.getByText('Warm')).toBeInTheDocument()
    expect(await screen.findByText('角色：Denia')).toBeInTheDocument()
  })

  it('switches to 我的克隆 through the scope pill, listing only cloned voices', async () => {
    await renderPage()
    openScopeMenu()
    expect(
      screen.getByRole('menuitem', { name: /全部音色\s*Fish Audio/ }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /我的克隆/ }))
    expect(screen.getByTestId('library-scope-select')).toHaveTextContent(
      /我的克隆/,
    )
    expect(await screen.findByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Warm')).not.toBeInTheDocument()
  })

  it('我的音色「…」→「用这副嗓子配音」：跳配音台带 ?voice=，⛔ 改绑定', async () => {
    await renderPage()
    await screen.findByText('Warm')
    fireEvent.pointerDown(
      screen.getByRole('button', { name: '「Warm」的操作' }),
      { button: 0, ctrlKey: false },
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: '用这副嗓子配音' }),
    )
    expect(nav.push).toHaveBeenCalledWith('/studio/audio?voice=v1')
  })
})

describe('VoicesPage · phone', () => {
  beforeEach(() => setViewportWidth(MOBILE_WIDTH, { touch: true }))

  // 手机和桌面同一副库骨架：同一颗分组药丸，没有另一套切换条。
  it('lands on 全部音色 with the same scope pill', async () => {
    await renderPage()
    expect(await screen.findByTestId('library-scope-select')).toHaveTextContent(
      '全部音色',
    )
    // 卡片拉回来了：菜单里数到了。
    await screen.findByText('Warm')
    openScopeMenu()
    expect(
      await screen.findByRole('menuitem', { name: /收藏\s*2/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /我的克隆\s*1/ }),
    ).toBeInTheDocument()
  })

  it('lists cloned voices on the cloned tab', async () => {
    await renderPage()
    await screen.findByText('Warm')
    openScopeMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: /我的克隆/ }))
    expect(await screen.findByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Warm')).not.toBeInTheDocument()
  })
})
