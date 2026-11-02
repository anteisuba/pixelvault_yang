import { render, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${namespace}.${key}(${JSON.stringify(values)})` : key,
}))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src as string} alt="" data-testid="rail-thumb" />
  ),
}))

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import type { VideoRailEntry } from '@/lib/video-node-rail'

import { ImageRefRail } from './ImageRefRail'

const ITEM: VideoRailEntry = {
  group: 'image',
  index: 1,
  slot: NODE_SLOT_IDS.reference,
  edgeId: 'e1',
  sourceNodeId: 'n1',
  sourceName: '夜景',
  thumbnailUrl: '/a.png',
}

describe('ImageRefRail', () => {
  it('shows a numbered 48px thumb with its source name on hover and to assistive tech', () => {
    const { container } = render(
      <ImageRefRail
        items={[ITEM]}
        capacity={3}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        candidates={[]}
        onPickFromCanvas={vi.fn()}
        onUpload={vi.fn()}
        onLibrary={vi.fn()}
      />,
    )
    const thumb = container.querySelector('[data-image-rail-item]')
    expect(thumb?.getAttribute('data-image-rail-index')).toBe('1')
    expect(thumb?.classList.contains('size-12')).toBe(true)
    expect(thumb?.getAttribute('title')).toBe('夜景')
    expect(thumb?.getAttribute('aria-label')).toContain('夜景')
    expect((thumb?.parentElement as HTMLElement).style.transform).not.toContain(
      'scale(0.72)',
    )
    expect(
      container.querySelector('[data-image-rail-badge]')?.textContent,
    ).toBe('1')
    expect(container.querySelector('[data-image-rail-name]')).toBeNull()
    expect(container.querySelector('[data-image-rail-add]')).toBeNull()
  })

  it('grows the first attached thumb when its rail mounts from empty', () => {
    const { container } = render(
      <ImageRefRail
        items={[ITEM]}
        capacity={3}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        candidates={[]}
        onPickFromCanvas={vi.fn()}
        onUpload={vi.fn()}
        onLibrary={vi.fn()}
        animateOnMount
      />,
    )
    const cell = container.querySelector('[data-image-rail-item]')
      ?.parentElement as HTMLElement
    expect(cell.style.transform).toContain('scale(0.72)')
    expect(cell.style.filter).toBe('blur(4px)')
  })

  it('keeps the attached thumb menu for opening and removing its source', () => {
    const onOpen = vi.fn()
    const onRemove = vi.fn()
    const { container } = render(
      <ImageRefRail
        items={[ITEM]}
        capacity={3}
        onOpen={onOpen}
        onRemove={onRemove}
        candidates={[]}
        onPickFromCanvas={vi.fn()}
        onUpload={vi.fn()}
        onLibrary={vi.fn()}
      />,
    )
    fireEvent.pointerDown(container.querySelector('[data-image-rail-item]')!, {
      button: 0,
    })
    fireEvent.click(screen.getByText('rail.open'))
    expect(onOpen).toHaveBeenCalledWith('n1')

    fireEvent.pointerDown(container.querySelector('[data-image-rail-item]')!, {
      button: 0,
    })
    fireEvent.click(screen.getByText('rail.remove'))
    expect(onRemove).toHaveBeenCalledWith('e1')
  })

  it('uses a 44px unnumbered thumb in the frame reference row', () => {
    const { container } = render(
      <ImageRefRail
        variant="frame"
        items={[ITEM]}
        capacity={3}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        candidates={[]}
        onPickFromCanvas={vi.fn()}
        onUpload={vi.fn()}
        onLibrary={vi.fn()}
      />,
    )
    const thumb = container.querySelector('[data-image-rail-item]')
    expect(thumb?.classList.contains('size-11')).toBe(true)
    expect(thumb?.classList.contains('rounded-lg')).toBe(true)
    expect(container.querySelector('[data-image-rail-badge]')).toBeNull()
  })

  it('shows pending upload progress without adding a second add button', () => {
    const { container } = render(
      <ImageRefRail
        items={[ITEM]}
        capacity={1}
        pending={[{ id: 'p1', name: '上传.png', progress: 42 }]}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        candidates={[]}
        onPickFromCanvas={vi.fn()}
        onUpload={vi.fn()}
        onLibrary={vi.fn()}
      />,
    )
    expect(
      container
        .querySelector('[data-image-rail-pending-state="uploading"]')
        ?.getAttribute('aria-valuenow'),
    ).toBe('42')
    expect(container.querySelector('[data-image-rail-add]')).toBeNull()
  })
})
