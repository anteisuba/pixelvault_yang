import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LoraAssetRecord } from '@/types'

import { LoraMountPills } from './LoraMountPills'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}))

const stack = vi.hoisted(() => ({
  items: [] as { asset: LoraAssetRecord; scale?: number; enabled?: boolean }[],
  setEnabled: vi.fn(),
  setScale: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/hooks/use-active-lora-stack', () => ({
  useActiveLoraStack: () => ({ ...stack, mountEvent: null }),
}))

function asset(id: string, name: string): LoraAssetRecord {
  return {
    id,
    name,
    styleCode: '',
    source: 'imported',
    type: 'style',
    baseModelFamily: 'illustrious',
    provider: 'civitai',
    triggerWord: 'wtrcolor',
    loraUrl: `https://example.com/${id}.safetensors`,
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: 0.8,
    isPublic: false,
    isOwn: false,
    createdAt: '2026-10-25T00:00:00.000Z',
  } as LoraAssetRecord
}

describe('LoraMountPills（LoRA 收进输入框，ui-spec ㊲）', () => {
  beforeEach(() => {
    if (!('ResizeObserver' in globalThis)) {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      )
    }
    stack.items = [
      { asset: asset('a', 'Watercolor v3'), scale: 0.8 },
      { asset: asset('b', 'Forest light'), enabled: false },
    ]
    stack.setEnabled.mockReset()
    stack.remove.mockReset()
  })

  const renderPills = (onAddLora = vi.fn()) =>
    render(
      <LoraMountPills
        selectedBase={null}
        loraScaleConfig={{ min: 0, max: 2, step: 0.05, default: 1 }}
        onAddLora={onAddLora}
      />,
    )

  it('one pill per mount with its weight, a paused one faded; last is 「+ LoRA」', () => {
    const onAddLora = vi.fn()
    renderPills(onAddLora)
    const watercolor = screen.getByRole('button', {
      name: 'pill.openLabel:Watercolor v3',
    })
    expect(watercolor).toHaveTextContent('0.8')
    expect(
      screen.getByRole('button', { name: 'pill.openLabel:Forest light' }),
    ).toHaveClass('opacity-50')
    fireEvent.click(screen.getByRole('button', { name: 'pill.addLabel' }))
    expect(onAddLora).toHaveBeenCalled()
  })

  it('a pill opens its card: switch, triggers, and 卸下', () => {
    renderPills()
    fireEvent.click(
      screen.getByRole('button', { name: 'pill.openLabel:Watercolor v3' }),
    )
    expect(screen.getByText('wtrcolor')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('switch', { name: 'spine.disableLora:Watercolor v3' }),
    )
    expect(stack.setEnabled).toHaveBeenCalledWith('a', false)
    fireEvent.click(screen.getByRole('button', { name: 'pill.remove' }))
    expect(stack.remove).toHaveBeenCalledWith('a')
  })
})
