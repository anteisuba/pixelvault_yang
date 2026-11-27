import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetTagPromptBlocksForTests } from '@/hooks/use-tag-prompt-blocks'
import { message as M, renderWithApp } from '@/test/app-harness'
import {
  StudioTagActiveBlocksBar,
  StudioTagBlocksPanel,
} from './StudioTagBlocksPanel'

describe('StudioTagBlocksPanel & StudioTagActiveBlocksBar', () => {
  beforeEach(() => {
    __resetTagPromptBlocksForTests()
  })

  it('creates starter blocks, splits pipe-separated items, adjusts weight, and toggles lock from active bar', () => {
    const onClose = vi.fn()
    const onOpenBlocks = vi.fn()

    renderWithApp(
      <>
        <StudioTagActiveBlocksBar onOpenBlocks={onOpenBlocks} />
        <StudioTagBlocksPanel onClose={onClose} />
      </>,
    )

    // Empty state starter creates sequential outfit block
    fireEvent.click(
      screen.getByRole('button', {
        name: M('StudioTags.blocksPanel.starters.outfitButton'),
      }),
    )
    expect(screen.getByTestId('active-tag-blocks-bar')).toBeInTheDocument()
    expect(screen.getAllByText('serafuku').length).toBeGreaterThanOrEqual(1)

    // Add pipe-separated items
    const itemInput = screen.getByRole('textbox', {
      name: M('StudioTags.blocksPanel.addItemInput'),
    })
    fireEvent.change(itemInput, { target: { value: 'sundress | hoodie' } })
    fireEvent.keyDown(itemInput, { key: 'Enter' })
    expect(screen.getByText('sundress')).toBeInTheDocument()
    expect(screen.getByText('hoodie')).toBeInTheDocument()

    // Lock toggle from the left-column active bar reflects in the stage panel
    const lockBtn = screen.getByRole('button', {
      name: M('StudioTags.blocksPanel.lockBlock').replace(
        '{name}',
        M('StudioTags.blocksPanel.starters.outfitName'),
      ),
    })
    fireEvent.click(lockBtn)
    expect(
      screen.getByText(M('StudioTags.blocksPanel.locked')),
    ).toBeInTheDocument()

    // Weight increase
    fireEvent.click(
      screen.getByRole('button', {
        name: M('StudioTags.weightControls.increase'),
      }),
    )
    expect(screen.getByText('1.05')).toBeInTheDocument()
  })

  it('creates prefix artist starter, filters inline prefix/suffix slots, and supports 1-click mute without deleting', () => {
    const onClose = vi.fn()
    const onOpenBlocks = vi.fn()

    renderWithApp(
      <>
        <StudioTagActiveBlocksBar
          target="positive"
          position="prefix"
          variant="inline"
          onOpenBlocks={onOpenBlocks}
        />
        <StudioTagActiveBlocksBar
          target="positive"
          position="suffix"
          variant="inline"
          onOpenBlocks={onOpenBlocks}
        />
        <StudioTagBlocksPanel onClose={onClose} />
      </>,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: M('StudioTags.blocksPanel.starters.artistButton'),
      }),
    )

    const prefixSlot = screen.getByTestId('active-tag-blocks-positive-prefix')
    expect(prefixSlot).toHaveTextContent(
      '0.8::artist:rella::, 0.55::artist:guweiz::',
    )
    expect(
      screen.queryByTestId('active-tag-blocks-positive-suffix'),
    ).not.toBeInTheDocument()

    // One-click mute disables the block in the inline bar while keeping the card in the panel
    fireEvent.click(
      screen.getByRole('button', {
        name: M('StudioTags.blocksPanel.disableBlock').replace(
          '{name}',
          M('StudioTags.blocksPanel.starters.artistName'),
        ),
      }),
    )
    expect(
      screen.queryByTestId('active-tag-blocks-positive-prefix'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('tag-block-card')).toBeInTheDocument()
  })
})
