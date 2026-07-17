import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LORA_LIBRARY_SOURCES } from '@/constants/lora'

import {
  LoraLibraryTypeEmptyState,
  LoraLibraryTypeSparseCard,
} from './LoraLibraryTypeStates'

// S2（docs/references/pages/lora-workbench.md §3.3）稀疏引导卡 + 空态三件套。
// 文案按源分语：civitai 用 typeSparseBody，HF 用 typeSparseBodyHuggingFace
// （HF tab 不能说「Civitai 标注不全」）。

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

describe('LoraLibraryTypeSparseCard', () => {
  it('renders title + civitai body + fallback action, and fires the callback', () => {
    const onSearchFallback = vi.fn()
    const { container } = render(
      <LoraLibraryTypeSparseCard
        source={LORA_LIBRARY_SOURCES.CIVITAI}
        searchFallbackTerm="outfit"
        onSearchFallback={onSearchFallback}
      />,
    )

    expect(
      screen.getByText('LoraWorkbench:typeSparseTitle'),
    ).toBeInTheDocument()
    expect(screen.getByText('LoraWorkbench:typeSparseBody')).toBeInTheDocument()
    expect(container.querySelector('.border-dashed')).not.toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:typeSparseAction' }),
    )
    expect(onSearchFallback).toHaveBeenCalledTimes(1)
  })

  it('uses the HF-specific body copy under the huggingface source', () => {
    render(
      <LoraLibraryTypeSparseCard
        source={LORA_LIBRARY_SOURCES.HUGGINGFACE}
        searchFallbackTerm="outfit"
        onSearchFallback={vi.fn()}
      />,
    )

    expect(
      screen.getByText('LoraWorkbench:typeSparseBodyHuggingFace'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('LoraWorkbench:typeSparseBody'),
    ).not.toBeInTheDocument()
  })
})

describe('LoraLibraryTypeEmptyState', () => {
  it('renders the three-piece empty state and wires both actions', () => {
    const onSearchFallback = vi.fn()
    const onClearType = vi.fn()
    render(
      <LoraLibraryTypeEmptyState
        onSearchFallback={onSearchFallback}
        onClearType={onClearType}
      />,
    )

    expect(screen.getByText('LoraWorkbench:typeEmptyTitle')).toBeInTheDocument()
    expect(screen.getByText('LoraWorkbench:typeEmptyBody')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:typeEmptySearch' }),
    )
    expect(onSearchFallback).toHaveBeenCalledTimes(1)
    expect(onClearType).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:typeEmptyClear' }),
    )
    expect(onClearType).toHaveBeenCalledTimes(1)
  })
})
