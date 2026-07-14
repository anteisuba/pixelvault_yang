import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import {
  CANVAS_ADD_GROUP_IDS,
  CANVAS_ADD_INTENT_IDS,
} from '@/constants/canvas-add-catalog'

import { CanvasAddMenu } from './CanvasAddMenu'

describe('CanvasAddMenu', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame

  beforeEach(() => {
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    window.cancelAnimationFrame = vi.fn()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
  })

  it('renders compact insert intents without a cast tray entry', () => {
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    for (const groupId of Object.values(CANVAS_ADD_GROUP_IDS)) {
      expect(
        screen.getByText(`addCatalog.groups.${groupId}`),
      ).toBeInTheDocument()
    }
    // Primary upload + 8 remaining catalog rows (image.asset not duplicated).
    expect(screen.getAllByRole('menuitem')).toHaveLength(9)
    expect(screen.queryByText('addCatalog.cast')).not.toBeInTheDocument()
    expect(
      screen.queryByText('addCatalog.items.shotText.label'),
    ).not.toBeInTheDocument()
  })

  it('returns stable intent ids for image, keyframe, and organization entries', () => {
    const onSelect = vi.fn()
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen
        .getByText('addCatalog.items.imageAsset.label')
        .closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.imageAsset)

    fireEvent.click(
      screen
        .getByText('addCatalog.items.imageKeyframe.label')
        .closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.imageKeyframe)

    fireEvent.click(
      screen
        .getByText('addCatalog.items.organizeCharacter.label')
        .closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(
      CANVAS_ADD_INTENT_IDS.organizeCharacter,
    )
  })
})
