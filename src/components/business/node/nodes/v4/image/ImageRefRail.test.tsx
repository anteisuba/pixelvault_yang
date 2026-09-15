import { render, fireEvent, waitFor } from '@testing-library/react'
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
  it('shows numbered thumbs and source names', () => {
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
    expect(
      container.querySelector('[data-image-rail-index]')?.textContent,
    ).toBe('1')
    expect(container.querySelector('[data-image-rail-name]')?.textContent).toBe(
      '夜景',
    )
  })

  it('picks a generated canvas image', async () => {
    const onPickFromCanvas = vi.fn()
    render(
      <ImageRefRail
        items={[]}
        capacity={3}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        candidates={[{ id: 'gen_1', name: '成图 A', thumbnailUrl: '/g.png' }]}
        onPickFromCanvas={onPickFromCanvas}
        onUpload={vi.fn()}
        onLibrary={vi.fn()}
      />,
    )
    fireEvent.pointerDown(document.querySelector('[data-image-rail-add]')!, {
      button: 0,
    })
    const candidate = await waitFor(
      () =>
        document.querySelector(
          '[data-image-rail-candidate="gen_1"]',
        ) as HTMLElement,
    )
    fireEvent.click(candidate)
    expect(onPickFromCanvas).toHaveBeenCalledWith('gen_1')
  })

  it('greys the add button when the model cap is full', () => {
    const { container } = render(
      <ImageRefRail
        items={[ITEM]}
        capacity={1}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        candidates={[]}
        onPickFromCanvas={vi.fn()}
        onUpload={vi.fn()}
        onLibrary={vi.fn()}
      />,
    )
    expect(
      (container.querySelector('[data-image-rail-add]') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
})
