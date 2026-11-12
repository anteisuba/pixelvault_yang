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

  // 手机和桌面同一副库骨架：左栏收成顶上一条切换条（2026-11-12 手机端）。
  it('lands on 全部 with the section switch instead of the rail', async () => {
    await renderPage()
    // 下面还有一条语言筛选也以「全部」开头：只在分区那一条里找。
    const sections = await screen.findByRole('tablist', { name: '音色' })
    expect(within(sections).getByRole('tab', { name: '全部' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: '收藏 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '我的克隆 1' })).toBeInTheDocument()
    expect(await screen.findByText('Warm')).toBeInTheDocument()
  })

  it('lists cloned voices on the cloned tab', async () => {
    await renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: '我的克隆 1' }))
    expect(await screen.findByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Warm')).not.toBeInTheDocument()
  })
})
