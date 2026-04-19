import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ScriptTopicInput } from './ScriptTopicInput'

const messages = {
  VideoScript: {
    emptyStateHint: 'Describe a topic…',
    topicLabel: 'Topic',
    topicPlaceholder: 'A cat learns to fly',
    durationLabel: 'Total duration',
    duration30s: '30 s',
    duration60s: '60 s',
    duration120s: '120 s',
    sceneCountPreview: '{count} scene(s)',
    consistencyModeLabel: 'Consistency',
    consistencyCharacterCard: 'Character card',
    consistencyFirstFrameRef: 'First-frame reference',
    characterCardLabel: 'Character card',
    characterCardMissing: 'Pick a character card to continue',
    styleCardLabel: 'Style card (optional)',
    videoModelLabel: 'Video model',
    videoModelSeedance: 'Seedance 2 Fast',
    videoModelKling: 'Kling Pro',
    generateButton: 'Generate script',
    generatingButton: 'Drafting…',
  },
}

function renderInput(
  props: Partial<Parameters<typeof ScriptTopicInput>[0]> = {},
) {
  const onSubmit = props.onSubmit ?? vi.fn()
  return {
    onSubmit,
    ...render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ScriptTopicInput
          isGenerating={props.isGenerating ?? false}
          error={props.error ?? null}
          onSubmit={onSubmit}
        />
      </NextIntlClientProvider>,
    ),
  }
}

describe('ScriptTopicInput', () => {
  it('renders placeholder + disabled generate button when topic empty', () => {
    renderInput()
    expect(
      screen.getByPlaceholderText('A cat learns to fly'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Generate script' }),
    ).toBeDisabled()
  })

  it('enables generate button once topic typed', () => {
    renderInput()
    fireEvent.change(screen.getByLabelText('Topic'), {
      target: { value: 'hello world' },
    })
    expect(
      screen.getByRole('button', { name: 'Generate script' }),
    ).toBeEnabled()
  })

  it('submits with first_frame_ref default + seedance model', () => {
    const { onSubmit } = renderInput()
    fireEvent.change(screen.getByLabelText('Topic'), {
      target: { value: 'A dog surfs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate script' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'A dog surfs',
        targetDuration: 30,
        consistencyMode: 'first_frame_ref',
        videoModelId: 'seedance-2-fast',
        characterCardId: null,
      }),
    )
  })

  it('shows loading label when isGenerating=true', () => {
    renderInput({ isGenerating: true })
    expect(screen.getByRole('button', { name: 'Drafting…' })).toBeDisabled()
  })

  it('surfaces error message in an alert', () => {
    renderInput({ error: 'Script generation failed.' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Script generation failed.',
    )
  })
})
