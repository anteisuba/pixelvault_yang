import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  it('父级对话栏收起（visibility: hidden）时，打开状态的语音条必须继续隐藏，⛔ 用 visibility: visible 穿透出来', async () => {
    server.voiceCardId = 'voice-1'
    const css = readFileSync(
      join(process.cwd(), 'src/styles/assistant.css'),
      'utf8',
    )
    const stripRules = css
      .match(/\.operator-voice-strip[^{]*\{[^}]*\}/g)
      ?.join('\n')
    expect(stripRules).toBeTruthy()
    const style = document.createElement('style')
    style.textContent = stripRules!
    document.head.appendChild(style)

    try {
      expect(style.sheet?.cssRules.length).toBeGreaterThanOrEqual(2)

      const { rerender } = render(
        <div style={{ visibility: 'hidden' }}>
          <StudioOperatorVoiceStrip />
        </div>,
      )
      const strip = screen.getByTestId('operator-voice-strip')
      await waitFor(() => expect(strip).toHaveAttribute('data-open', 'true'))
      expect(getComputedStyle(strip).visibility).toBe('hidden')

      rerender(
        <div style={{ visibility: 'visible' }}>
          <StudioOperatorVoiceStrip />
        </div>,
      )
      expect(getComputedStyle(strip).visibility).toBe('visible')
    } finally {
      style.remove()
    }
  })
})
