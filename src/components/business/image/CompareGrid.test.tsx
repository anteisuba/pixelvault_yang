import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord, RunItem } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/business/ImageCard', () => ({
  ImageCard: ({ generation }: { generation: GenerationRecord }) => (
    <div data-testid="image-card" data-url={generation.url} />
  ),
}))

vi.mock('@/components/business/studio-shared', () => ({
  StudioGeneratingProgress: () => <div data-testid="progress" />,
}))

// §3.0b 第 4 条的注入口。用桩件断言「按了哪一格就带哪一格的 URL」——
// 真实实现要 StudioProvider，而这里要验的是接线不是 reducer。
const askAssistantMock = vi.fn()
vi.mock('@/hooks/use-ask-assistant-about-image', () => ({
  useAskAssistantAboutImage: () => askAssistantMock,
}))

import { CompareGrid } from './CompareGrid'

function makeGeneration(id: string, url: string): GenerationRecord {
  return { id, url, prompt: 'a cat' } as GenerationRecord
}

function makeItem(overrides: Partial<RunItem>): RunItem {
  return {
    id: 'item-1',
    modelId: 'flux-dev',
    status: 'generating',
    generation: null,
    error: null,
    ...overrides,
  } as RunItem
}

const completedItems: RunItem[] = [
  makeItem({
    id: 'a',
    modelId: 'flux-dev',
    status: 'completed',
    generation: makeGeneration('gen-a', 'https://cdn.example.com/a.png'),
  }),
  makeItem({
    id: 'b',
    modelId: 'seedream-4',
    status: 'completed',
    generation: makeGeneration('gen-b', 'https://cdn.example.com/b.png'),
  }),
]

beforeEach(() => {
  askAssistantMock.mockClear()
})

describe('CompareGrid — 问助手 entry', () => {
  it('offers one ask-assistant button per completed cell and passes that cell own url', () => {
    render(
      <CompareGrid
        items={completedItems}
        selectedItemId={null}
        onSelect={vi.fn()}
        elapsedSeconds={3}
      />,
    )

    const buttons = screen.getAllByRole('button', { name: 'toolAskAssistant' })
    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[1])
    expect(askAssistantMock).toHaveBeenCalledWith(
      'https://cdn.example.com/b.png',
    )
  })

  // ⚠ 整格是「选为最佳」的点击区。不 stopPropagation 的话，问一句助手会顺手
  // 把这张定为最佳 —— 一次点击干了两件事，其中一件用户没要求。
  it('does not select the cell as winner when asking the assistant', () => {
    const onSelect = vi.fn()
    render(
      <CompareGrid
        items={completedItems}
        selectedItemId={null}
        onSelect={onSelect}
        elapsedSeconds={3}
      />,
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'toolAskAssistant' })[0],
    )
    expect(askAssistantMock).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('hides the entry on cells that have no image yet', () => {
    render(
      <CompareGrid
        items={[
          makeItem({ id: 'a', status: 'generating' }),
          makeItem({ id: 'b', status: 'failed', error: 'boom' }),
        ]}
        selectedItemId={null}
        onSelect={vi.fn()}
        elapsedSeconds={3}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'toolAskAssistant' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the entry on the already-selected cell', () => {
    render(
      <CompareGrid
        items={completedItems}
        selectedItemId="gen-a"
        onSelect={vi.fn()}
        elapsedSeconds={3}
      />,
    )

    // 「选为最佳」那条悬浮条在选中格上是不渲染的；引用提问与选中与否无关，
    // 两张都要留着入口。
    expect(
      screen.getAllByRole('button', { name: 'toolAskAssistant' }),
    ).toHaveLength(2)
  })
})
