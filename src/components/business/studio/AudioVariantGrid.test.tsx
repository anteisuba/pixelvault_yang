import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GenerationRecord, RunItem } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { AudioVariantGrid } from './AudioVariantGrid'

function makeItem(overrides: Partial<RunItem>): RunItem {
  return {
    id: 'item-1',
    modelId: 'eleven-sfx-v2',
    status: 'generating',
    generation: null,
    error: null,
    ...overrides,
  } as RunItem
}

function makeGeneration(url: string, prompt: string): GenerationRecord {
  return { id: 'gen-1', url, prompt } as GenerationRecord
}

describe('AudioVariantGrid', () => {
  it('renders a tile per item with the right state', () => {
    const items: RunItem[] = [
      makeItem({ id: 'a', status: 'generating' }),
      makeItem({ id: 'b', status: 'failed', error: 'boom' }),
      makeItem({
        id: 'c',
        status: 'completed',
        generation: makeGeneration('https://cdn.example.com/c.mp3', 'thunder'),
      }),
    ]
    const { container } = render(<AudioVariantGrid items={items} />)

    // Generating tile shows the loading label; failed shows its error.
    expect(screen.getByText('generating')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()

    // Completed tile renders an inline player pointed at the clip.
    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
    expect(audio?.getAttribute('src')).toBe('https://cdn.example.com/c.mp3')
    // ⭐ 切片 E：**不再逐条印提示词**。变体是同一段提示词跑 N 次，四条印四遍
    // 同一句话是纯噪音；出处去详情里看。
    expect(screen.queryByText('thunder')).not.toBeInTheDocument()
  })

  it('numbers the tiles', () => {
    render(
      <AudioVariantGrid
        items={[makeItem({ id: 'a' }), makeItem({ id: 'b' })]}
      />,
    )
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })
})
