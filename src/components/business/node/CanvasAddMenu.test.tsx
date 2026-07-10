import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

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

  it('keeps manual shot creation inside the image node instead of a standalone shot-text entry', () => {
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('nodeTypes.image')).toBeInTheDocument()
    expect(screen.queryByText('nodeTypes.shotText')).not.toBeInTheDocument()
  })

  // S5d ③「添加菜单更名区分」: the old single "image" row splits into
  // 图片（素材，role-less）and 镜头图（生成，role=shot）— two distinct rows
  // sharing the unified `image` node type.
  it('splits into a role-less 图片 row and a role=shot 镜头图 row', () => {
    const onSelect = vi.fn()
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('nodeTypes.image')).toBeInTheDocument()
    expect(screen.getByText('nodeTypes.shot')).toBeInTheDocument()

    fireEvent.click(
      screen.getByText('nodeTypes.image').closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(NODE_TYPE_IDS.image, undefined)

    fireEvent.click(
      screen.getByText('nodeTypes.shot').closest('button') as HTMLElement,
    )
    expect(onSelect).toHaveBeenCalledWith(
      NODE_TYPE_IDS.image,
      NODE_IMAGE_ROLE_IDS.shot,
    )
  })
})
