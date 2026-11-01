import { useMemo, useState, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  LoraPickSelectionProvider,
  type LoraPickEntry,
  type LoraPickSelection,
} from './lora-pick-selection'
import { LoraLibraryTile } from './LoraLibraryTile'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      values
        ? `${namespace}:${key}(${Object.values(values).join('|')})`
        : `${namespace}:${key}`,
}))

const handoff = vi.hoisted(() => ({ value: null as (() => void) | null }))
vi.mock('@/contexts/studio-library-pick', () => ({
  useLoraBenchHandoff: () => handoff.value,
}))

function PickHarness({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<readonly LoraPickEntry[]>([])
  const value = useMemo<LoraPickSelection>(
    () => ({
      isSelected: (id) => selected.some((entry) => entry.id === id),
      toggle: (entry) =>
        setSelected((current) =>
          current.some((item) => item.id === entry.id)
            ? current.filter((item) => item.id !== entry.id)
            : [...current, entry],
        ),
    }),
    [selected],
  )
  return (
    <LoraPickSelectionProvider value={value}>
      {children}
      <output data-testid="picked">
        {selected.map((entry) => entry.id).join(',')}
      </output>
    </LoraPickSelectionProvider>
  )
}

const base = {
  name: 'Sue',
  meta: 'Illustrious · ↓ 1.2K',
  coverUrl: null,
  pickId: 'civitai:1',
}

describe('LoraLibraryTile（挑选框 ui-spec ㉔）', () => {
  it('框外：点整格开详情', () => {
    const onOpen = vi.fn()
    render(
      <LoraLibraryTile
        {...base}
        mounted={false}
        onOpen={onOpen}
        onMount={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sue' }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('框里：点整格 = 圈 / 不圈，⛔ 开详情、⛔ 当场挂', () => {
    const onOpen = vi.fn()
    const onMount = vi.fn()
    render(
      <PickHarness>
        <LoraLibraryTile
          {...base}
          mounted={false}
          onOpen={onOpen}
          onMount={onMount}
        />
      </PickHarness>,
    )
    const tile = screen.getByRole('button', {
      name: 'LoraWorkbench.picker:selectLabel(Sue)',
    })
    expect(tile).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(tile)
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('picked')).toHaveTextContent('civitai:1')
    expect(onOpen).not.toHaveBeenCalled()
    expect(onMount).not.toHaveBeenCalled()
    fireEvent.click(tile)
    expect(screen.getByTestId('picked')).toBeEmptyDOMElement()
  })

  it('框里已挂的：写「已挂」，点它照旧开详情', () => {
    const onOpen = vi.fn()
    render(
      <PickHarness>
        <LoraLibraryTile {...base} mounted onOpen={onOpen} onMount={vi.fn()} />
      </PickHarness>,
    )
    expect(screen.getByText('LoraWorkbench.picker:mounted')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sue' }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('LoRA 台没开：「更多」里写「去 LoRA 台用」，已挂的也能点', () => {
    handoff.value = vi.fn()
    const onMount = vi.fn()
    render(
      <LoraLibraryTile {...base} mounted onOpen={vi.fn()} onMount={onMount} />,
    )
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'LoraWorkbench.browse:more' }),
      { key: 'Enter' },
    )
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'LoraWorkbench.browse:useOnBenchLabel(Sue)',
      }),
    )
    expect(onMount).toHaveBeenCalled()
    handoff.value = null
  })
})
