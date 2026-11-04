import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import { VOICE_CARD_PROVIDER } from '@/constants/voice-cards'
import type { VoiceCardRecord } from '@/types'
import { renderWithApp } from '@/test/app-harness'

import { VoicePickerDialog } from './VoicePickerDialog'

// 只假网络：真 `useVoiceLibrary`（收藏 / 公开库 / 收藏成卡）、真训练表单、真试听 hook。
const api = vi.hoisted(() => ({
  listVoiceCardsAPI: vi.fn(),
  listVoicesAPI: vi.fn(),
  createVoiceCardAPI: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  ...api,
}))

function voice(id: string, name: string): VoiceCardRecord {
  return {
    id,
    name,
    provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
    coverImage: null,
    referenceAudioUrl: null,
    sampleAudioUrl: null,
    voiceId: `fish-${id}`,
  } as unknown as VoiceCardRecord
}

const CREATED = voice('v9', 'Narrator')

beforeEach(() => {
  api.listVoiceCardsAPI.mockResolvedValue({
    success: true,
    data: { items: [voice('v1', 'Warm'), voice('v2', 'Calm')], total: 2 },
  })
  api.listVoicesAPI.mockResolvedValue({
    success: true,
    data: {
      items: [
        {
          id: 'p1',
          title: 'Narrator',
          description: '',
          languages: ['zh'],
          tags: [],
          author: { nickname: 'fish' },
          coverImage: null,
          samples: [],
        },
      ],
      total: 1,
    },
  })
  api.createVoiceCardAPI.mockResolvedValue({ success: true, data: CREATED })
})
afterEach(() => vi.clearAllMocks())

function renderPicker(props: Partial<Parameters<typeof VoicePickerDialog>[0]>) {
  const onPick = vi.fn()
  const onOpenChange = vi.fn()
  renderWithApp(
    <VoicePickerDialog
      open
      onOpenChange={onOpenChange}
      onPick={onPick}
      {...props}
    />,
  )
  return { onPick, onOpenChange }
}

describe('VoicePickerDialog（挑音色 ui-spec ㉔ · S26）', () => {
  it('点一格就选上、框关掉；已在场的写「已在」点不了', async () => {
    const { onPick, onOpenChange } = renderPicker({
      takenIds: new Set(['v1']),
    })
    expect(screen.getAllByText('挑音色').length).toBeGreaterThan(0)
    expect(await screen.findByText('已在')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '挑 Warm' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '挑 Calm' }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'v2' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('公开库的先收藏成一张卡，再把那张卡交出去', async () => {
    const { onPick } = renderPicker({})
    fireEvent.click(await screen.findByRole('button', { name: '挑 Narrator' }))
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(CREATED))
    // 收藏那一下真发出去了：建的是这副公开嗓子的卡。
    expect(api.createVoiceCardAPI).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Narrator', voiceId: 'p1' }),
    )
  })

  it('位置满了：标题旁写一句，格子都点不了', async () => {
    renderPicker({ fullLabel: '最多 4 位' })
    expect(screen.getByText('最多 4 位')).toBeInTheDocument()
    await waitFor(() => expect(api.listVoicesAPI).toHaveBeenCalled())
    expect(await screen.findAllByText('Calm')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^挑 / })).toBeNull()
  })
})
