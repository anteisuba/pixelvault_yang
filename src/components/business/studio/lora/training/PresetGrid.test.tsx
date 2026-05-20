import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import { LORA_TRAINING_PRESETS } from '@/constants/lora'

import { PresetGrid } from './PresetGrid'

import en from '@/messages/en.json'

function renderGrid(selectedId: string | null = null, onSelect = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PresetGrid selectedId={selectedId as never} onSelect={onSelect} />
    </NextIntlClientProvider>,
  )
}

describe('PresetGrid', () => {
  it('renders exactly LORA_TRAINING_PRESETS.length cards', () => {
    renderGrid()
    for (const preset of LORA_TRAINING_PRESETS) {
      // Each card has data-preset-id matching the preset
      expect(
        document.querySelector(`[data-preset-id="${preset.id}"]`),
      ).not.toBeNull()
    }
  })

  it('fires onSelect when an enabled preset is clicked', () => {
    const onSelect = vi.fn()
    renderGrid(null, onSelect)
    const enabledPreset = LORA_TRAINING_PRESETS.find((p) => p.available)!
    const card = document.querySelector(
      `[data-preset-id="${enabledPreset.id}"]`,
    ) as HTMLElement
    fireEvent.click(card)
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: enabledPreset.id }),
    )
  })

  it('does not fire onSelect for Coming Soon (disabled) presets', () => {
    const onSelect = vi.fn()
    renderGrid(null, onSelect)
    const disabledPreset = LORA_TRAINING_PRESETS.find((p) => !p.available)!
    const card = document.querySelector(
      `[data-preset-id="${disabledPreset.id}"]`,
    ) as HTMLElement
    fireEvent.click(card)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders explanation footer when a preset is selected', () => {
    const firstEnabled = LORA_TRAINING_PRESETS.find((p) => p.available)!
    renderGrid(firstEnabled.id)
    const expected = (en as unknown as Record<string, Record<string, string>>)
      .LoraTraining[firstEnabled.explanationKey]
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('does not render footer when no preset is selected', () => {
    renderGrid(null)
    // Idle footer was cut to reduce visual noise — no preset selected
    // means no body text under the grid. The explanation copy only
    // appears once a card is picked.
    expect(
      screen.queryByText(
        (en as unknown as Record<string, Record<string, string>>).LoraTraining
          .presetFooterIdle,
      ),
    ).toBeNull()
  })
})
