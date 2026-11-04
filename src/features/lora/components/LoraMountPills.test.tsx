import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoraStackProvider } from '@/features/lora/hooks/use-active-lora-stack'
import {
  LORA_STACK_CLERK_ID,
  loraAsset,
  seedLoraStack,
} from '@/test/lora-stack'

import { LoraMountPills } from './LoraMountPills'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
}))

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
    window.localStorage.clear()
    seedLoraStack([
      {
        asset: loraAsset('a', {
          name: 'Watercolor v3',
          triggerWord: 'wtrcolor',
        }),
        scale: 0.8,
      },
      { asset: loraAsset('b', { name: 'Forest light' }), enabled: false },
    ])
  })

  const renderPills = (onAddLora = vi.fn()) =>
    render(
      <LoraStackProvider>
        <LoraMountPills
          selectedBase={null}
          loraScaleConfig={{ min: 0, max: 2, step: 0.05, default: 1 }}
          onAddLora={onAddLora}
        />
      </LoraStackProvider>,
    )

  it('one pill per mount with its weight, a paused one faded; last is 「+ LoRA」', async () => {
    const onAddLora = vi.fn()
    renderPills(onAddLora)
    const watercolor = await screen.findByRole('button', {
      name: 'pill.openLabel:Watercolor v3',
    })
    expect(watercolor).toHaveTextContent('0.8')
    expect(
      screen.getByRole('button', { name: 'pill.openLabel:Forest light' }),
    ).toHaveClass('opacity-50')
    fireEvent.click(screen.getByRole('button', { name: 'pill.addLabel' }))
    expect(onAddLora).toHaveBeenCalled()
  })

  it('a pill opens its card: switch, triggers, and 卸下', async () => {
    renderPills()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'pill.openLabel:Watercolor v3',
      }),
    )
    expect(screen.getByText('wtrcolor')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('switch', { name: 'spine.disableLora:Watercolor v3' }),
    )
    // 关掉 = 这一把暂停（药丸变淡），不卸
    expect(
      screen.getByRole('button', { name: 'pill.openLabel:Watercolor v3' }),
    ).toHaveClass('opacity-50')
    fireEvent.click(screen.getByRole('button', { name: 'pill.remove' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'pill.openLabel:Watercolor v3' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'pill.openLabel:Forest light' }),
    ).toBeInTheDocument()
  })
})
