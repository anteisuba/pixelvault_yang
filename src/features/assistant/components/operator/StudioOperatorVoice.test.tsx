import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import { STUDIO_OPERATOR_VOICE } from '@/constants/studio-operator-voice'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(',')}` : key
  t.has = () => true
  return { useTranslations: () => t }
})

const server = vi.hoisted(() => ({ voiceCardId: null as string | null }))

vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<object>()),
  getAssistantPersonaAPI: async () => ({
    success: true,
    data: {
      ...ASSISTANT_PERSONA_DEFAULTS,
      name: 'Denia',
      character: {
        id: 'card-1',
        name: 'Denia',
        faceUrl: null,
        hasSpeech: true,
        hasProfile: true,
      },
    },
  }),
  listCharacterCardsAPI: async () => ({
    success: true,
    data: [
      {
        id: 'card-1',
        name: 'Denia',
        looks: [],
        voiceCardId: server.voiceCardId,
      },
    ],
  }),
  getVoiceCardAPI: async () => ({
    success: true,
    data: { id: 'voice-1', name: '清亮少女' },
  }),
}))

import { StudioOperatorVoiceStrip } from './StudioOperatorVoice'

beforeEach(() => {
  server.voiceCardId = null
  window.localStorage.setItem(
    STUDIO_OPERATOR_VOICE.storageKey,
    JSON.stringify({ on: true, modelId: STUDIO_OPERATOR_VOICE.modelIds[0] }),
  )
})

describe('StudioOperatorVoiceStrip · 那一句话', () => {
  it('没选嗓子：⛔ 说「在用声音说话」，说她还没有声音', async () => {
    render(<StudioOperatorVoiceStrip />)
    await waitFor(() =>
      expect(screen.getByTestId('operator-voice-status')).toHaveTextContent(
        'noVoice|Denia',
      ),
    )
    expect(screen.queryByText('speaking|Denia')).toBeNull()
    expect(screen.getByTestId('operator-voice-pick')).toHaveTextContent(
      'pickVoice',
    )
  })

  it('绑了嗓子：在用声音说话', async () => {
    server.voiceCardId = 'voice-1'
    render(<StudioOperatorVoiceStrip />)
    await waitFor(() =>
      expect(screen.getByTestId('operator-voice-status')).toHaveTextContent(
        'speaking|Denia',
      ),
    )
  })
})
