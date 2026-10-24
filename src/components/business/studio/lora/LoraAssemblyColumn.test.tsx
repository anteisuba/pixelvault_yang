import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
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

let mockScale = 0.8
let mockExtraIds: string[] = []
const mockReorder = vi.fn()
const asset = (id: string, name: string) => ({
  id,
  name,
  loraUrl: `https://civitai.com/api/download/models/${id}`,
  baseModelFamily: 'Illustrious',
  coverImageUrl: null,
  defaultScale: 1,
})
vi.mock('@/hooks/use-active-lora-stack', () => ({
  useActiveLoraStack: () => ({
    items: [
      { asset: asset('roccia', 'Roccia'), scale: mockScale },
      ...mockExtraIds.map((id) => ({ asset: asset(id, id), scale: 1 })),
    ],
    mountEvent: null,
    setScale: vi.fn(),
    setEnabled: vi.fn(),
    remove: vi.fn(),
    reorder: mockReorder,
  }),
}))

function columnProps() {
  return {
    compatibleBases: [],
    selectedBase: null,
    onSelectBase: vi.fn(),
    needsKeySetup: false,
    onRequestKeySetup: vi.fn(),
    loraScaleConfig: undefined,
    onAddLora: vi.fn(),
    onPickFromCharacter: vi.fn(),
    collapsed: true,
    onCollapsedChange: vi.fn(),
  }
}

function renderColumn() {
  const all = columnProps()
  render(<LoraAssemblyColumn {...all} />)
  return all
}

const column = () => screen.getByTestId('lora-assembly-column')
const stripButton = () =>
  screen.getByRole('button', { name: 'LoraWorkbench:spine.editAssembly' })

describe('LoraAssemblyColumn · 竖条', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockScale = 0.8
  })

  it('expands the column in place on the generate stage', () => {
    const props = renderColumn()

    fireEvent.click(stripButton())
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false)
  })

  it('权重被别处改了（助手搭配卡 / 撤销）读数走到新值', async () => {
    const props = columnProps()
    const { rerender } = render(<LoraAssemblyColumn {...props} />)
    expect(screen.getByText('×0.80')).toBeInTheDocument()

    mockScale = 0.5
    rerender(<LoraAssemblyColumn {...props} />)
    await waitFor(() => expect(screen.getByText('×0.50')).toBeInTheDocument())
  })
})

describe('LoraAssemblyColumn · 拖着排序让位（动效样片 P）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockScale = 0.8
    mockExtraIds = ['kira', 'sola']
  })

  const rowOrder = () =>
    Array.from(document.querySelectorAll('[data-reorder-id]')).map((row) =>
      row.getAttribute('data-reorder-id'),
    )
  const row = (id: string) =>
    document.querySelector(`[data-reorder-id="${id}"]`) as HTMLElement
  const dataTransfer = { effectAllowed: '', dropEffect: '' }
  // jsdom 没有 DragEvent，事件初始化里的 clientY 不会落到事件上，手动补。
  const dragAt = (
    kind: 'dragOver' | 'drop',
    target: HTMLElement,
    clientY: number,
  ) => {
    const event = createEvent[kind](target, { dataTransfer })
    Object.defineProperty(event, 'clientY', { value: clientY })
    fireEvent(target, event)
  }

  it('makes way live while dragging, then commits that order on drop', () => {
    render(<LoraAssemblyColumn {...columnProps()} collapsed={false} />)
    expect(rowOrder()).toEqual(['roccia', 'kira', 'sola'])

    fireEvent.dragStart(row('roccia'), { dataTransfer })
    // jsdom 里各行布局高度都是 0：指针在列表下面 = 落到最后一格。
    dragAt('dragOver', row('sola'), 200)
    expect(rowOrder()).toEqual(['kira', 'sola', 'roccia'])
    expect(mockReorder).not.toHaveBeenCalled()

    dragAt('drop', row('roccia'), 200)
    expect(mockReorder).toHaveBeenCalledWith('roccia', 'sola')
  })

  it('springs everyone back when the drag is cancelled', () => {
    render(<LoraAssemblyColumn {...columnProps()} collapsed={false} />)

    fireEvent.dragStart(row('roccia'), { dataTransfer })
    dragAt('dragOver', row('sola'), 200)
    expect(rowOrder()).toEqual(['kira', 'sola', 'roccia'])

    fireEvent.dragEnd(row('roccia'), { dataTransfer })
    expect(rowOrder()).toEqual(['roccia', 'kira', 'sola'])
    expect(mockReorder).not.toHaveBeenCalled()
  })
})
