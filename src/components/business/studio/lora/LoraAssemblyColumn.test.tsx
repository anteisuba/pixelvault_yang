import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoraAssemblyColumn } from './LoraAssemblyColumn'

vi.mock('next-intl', () => ({
  useTranslations:
    (ns: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}:${key}:${JSON.stringify(values)}` : `${ns}:${key}`,
}))

vi.mock('@/components/business/studio/lora/LoraBaseModelModal', () => ({
  LoraBaseModelModal: () => null,
}))

vi.mock('@/hooks/use-active-lora-stack', () => ({
  useActiveLoraStack: () => ({
    items: [
      {
        asset: {
          id: 'roccia',
          name: 'Roccia',
          loraUrl: 'https://civitai.com/api/download/models/1',
          baseModelFamily: 'Illustrious',
          coverImageUrl: null,
          defaultScale: 1,
        },
        scale: 0.8,
      },
    ],
    mountEvent: null,
    setScale: vi.fn(),
    setEnabled: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
  }),
}))

function renderColumn(props: { onReturn?: () => void } = {}) {
  const all = {
    compatibleBases: [],
    selectedBase: null,
    onSelectBase: vi.fn(),
    needsKeySetup: false,
    onRequestKeySetup: vi.fn(),
    loraScaleConfig: undefined,
    onAddLora: vi.fn(),
    collapsed: true,
    onCollapsedChange: vi.fn(),
    ...props,
  }
  render(<LoraAssemblyColumn {...all} />)
  return all
}

const column = () => screen.getByTestId('lora-assembly-column')
const stripButton = () =>
  screen.getByRole('button', { name: 'LoraWorkbench:spine.editAssembly' })

describe('LoraAssemblyColumn · 竖条', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('floats the whole column over the library from anywhere on the strip, and tucks it back on a click outside', () => {
    const props = renderColumn({ onReturn: vi.fn() })
    expect(column()).toHaveAttribute('inert')

    fireEvent.click(stripButton())
    expect(column()).not.toHaveAttribute('inert')
    expect(props.onCollapsedChange).not.toHaveBeenCalled()
    expect(props.onReturn).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(column()).toHaveAttribute('inert')
  })

  it('tucks the floating column back when focus moves on to the library', () => {
    renderColumn({ onReturn: vi.fn() })
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    fireEvent.click(stripButton())
    expect(column()).not.toHaveAttribute('inert')

    act(() => outside.focus())
    expect(column()).toHaveAttribute('inert')
    outside.remove()
  })

  it('tucks the floating column back on Esc and hands focus back to the strip', () => {
    renderColumn({ onReturn: vi.fn() })

    fireEvent.click(stripButton())
    expect(column()).not.toHaveAttribute('inert')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(column()).toHaveAttribute('inert')
    expect(stripButton()).toHaveFocus()
  })

  it('keeps the floating column open while it is being edited', () => {
    renderColumn({ onReturn: vi.fn() })

    fireEvent.click(stripButton())
    fireEvent.pointerDown(
      screen.getByRole('switch', {
        name: 'LoraWorkbench:spine.disableLora:{"name":"Roccia"}',
      }),
    )
    expect(column()).not.toHaveAttribute('inert')
  })

  it('expands the column in place on the generate stage', () => {
    const props = renderColumn()

    fireEvent.click(stripButton())
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false)
  })
})
