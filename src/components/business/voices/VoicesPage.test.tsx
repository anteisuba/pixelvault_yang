import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

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
  // 卡片拉回来了（页签上的数到了）。
  await vi.waitFor(() => expect(api.listVoiceCardsAPI).toHaveBeenCalledTimes(1))
}

describe('VoicesPage · desktop library', () => {
  beforeEach(() => setViewportWidth(DESKTOP_WIDTH))

  it('shows the rail with counts and my voices', async () => {
    await renderPage()
    await screen.findByText('Warm')
    const rail = screen.getByRole('navigation', { name: '音色' })
    expect(within(rail).getByText('Fish Audio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '克隆音色' })).toBeInTheDocument()
    expect(screen.getByText('Warm')).toBeInTheDocument()
    expect(await screen.findByText('角色：Denia')).toBeInTheDocument()
  })

  it('switches to 我的克隆 through the rail, listing only cloned voices', async () => {
    await renderPage()
    const rail = screen.getByRole('navigation', { name: '音色' })
    fireEvent.click(within(rail).getByRole('button', { name: /我的克隆/ }))
    expect(
      within(rail).getByRole('button', { name: /我的克隆/ }),
    ).toHaveAttribute('aria-current', 'true')
    expect(await screen.findByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Warm')).not.toBeInTheDocument()
  })
})

describe('VoicesPage · phone', () => {
  beforeEach(() => setViewportWidth(MOBILE_WIDTH, { touch: true }))

  /**
   * ⚠ 真 bug（2026-11-04 迁测试时查出，未修）：手机一进来停在「找音色」，不是「我的收藏」。
   * `useIsMobile` 第一帧回 false → 桌面那份 `VoicesLibraryDesk` 先挂一帧，它的落地 effect
   * 把页签改成 'public'；下一帧换成手机布局时页签已经被改掉了。修好后把 `.fails` 去掉。
   */
  it.fails('lands on 我的收藏 on a phone', async () => {
    await renderPage()
    expect(
      await screen.findByRole('tab', { name: '我的收藏 2' }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('shows my saved voices with counts and who uses them', async () => {
    await renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: '我的收藏 2' }))
    expect(screen.getByRole('tab', { name: '我的收藏 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: '我的克隆 1' })).toBeInTheDocument()
    expect(await screen.findByText('Warm')).toBeInTheDocument()
    expect(await screen.findByText('角色：Denia')).toBeInTheDocument()
    // 搜索框只在「找音色」出现。
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('switches tabs through the shared library kernel', async () => {
    await renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: '我的收藏 2' }))
    fireEvent.click(screen.getByRole('tab', { name: '找音色' }))
    expect(screen.getByRole('tab', { name: '找音色' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // 切到公开库就去拉公开库。
    await vi.waitFor(() => expect(api.listVoicesAPI).toHaveBeenCalled())
  })

  it('lists cloned voices on the cloned tab', async () => {
    await renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: '我的克隆 1' }))
    expect(await screen.findByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Warm')).not.toBeInTheDocument()
  })
})
