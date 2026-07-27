import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT } from '@/constants/node-studio'
import type { GenerationRecord } from '@/types'

import { CanvasAppearancePanel } from './CanvasAppearancePanel'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@/components/ui/responsive-popover', () => ({
  ResponsivePopover: ({ children }: { children: ReactNode }) => children,
  ResponsivePopoverTrigger: ({ children }: { children: ReactNode }) => children,
  ResponsivePopoverContent: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/components/ui/slider', () => ({
  Slider: () => <div data-testid="opacity-slider" />,
}))

interface AssetDialogMockProps {
  open: boolean
  onSelect?(generation: GenerationRecord): void
}

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({ open, onSelect }: AssetDialogMockProps) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onSelect?.({
            id: 'generation-wallpaper',
            url: 'https://cdn.example.com/wallpaper.jpg',
            outputType: 'IMAGE',
          } as GenerationRecord)
        }
      >
        select-test-asset
      </button>
    ) : null,
}))

describe('CanvasAppearancePanel', () => {
  it('updates a preset and a valid custom hex color', () => {
    const onChange = vi.fn()
    render(<CanvasAppearancePanel appearance={undefined} onChange={onChange} />)

    fireEvent.click(screen.getAllByRole('button', { name: /presetColor/ })[0])
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: '#FFFFFF' }),
    )
    // S10（2026-07-27，token-inversion §4.5）：预设精简为只留浅色，
    // 索引 1 现在是 #F4F4F3（原 #000000 连同其余 5 档深色一起被移出预设，
    // 断言跟着常量走而非重新硬编码——见 NODE_STUDIO_CANVAS_APPEARANCE_PRESETS）。
    fireEvent.click(screen.getAllByRole('button', { name: /presetColor/ })[1])
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: '#F4F4F3' }),
    )

    // Custom picker is a native color input (no hex text field).
    const custom = screen.getByLabelText('customColor')
    fireEvent.change(custom, { target: { value: '#223344' } })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: '#223344' }),
    )
  })

  it('selects a library/upload asset and restores the default state', () => {
    const onChange = vi.fn()
    render(<CanvasAppearancePanel appearance={undefined} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'chooseImage' }))
    fireEvent.click(screen.getByRole('button', { name: 'select-test-asset' }))

    expect(onChange).toHaveBeenCalledWith({
      // 引常量而不是硬编码色值：默认底是设计决策（S1 从旧皮暖炭改成域皮肤
      // #F1F1F1），断言跟着常量走，以后再调默认不会莫名其妙红一次。
      backgroundColor: NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT.backgroundColor,
      image: {
        url: 'https://cdn.example.com/wallpaper.jpg',
        sourceGenerationId: 'generation-wallpaper',
        fit: 'cover',
        opacity: 0.28,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'restoreDefault' }))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('removes only the wallpaper while preserving the selected color', () => {
    const onChange = vi.fn()
    render(
      <CanvasAppearancePanel
        appearance={{
          backgroundColor: '#171A16',
          image: {
            url: 'https://cdn.example.com/wallpaper.jpg',
            fit: 'cover',
            opacity: 0.5,
          },
        }}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'removeImage' }))
    expect(onChange).toHaveBeenCalledWith({
      backgroundColor: '#171A16',
      image: undefined,
    })
  })
})
