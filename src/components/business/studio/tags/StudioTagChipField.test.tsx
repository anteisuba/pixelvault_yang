import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
// 补全的词库是 5 万行的生成文件，组件测里只关心「选中一条会落一格」。
vi.mock('@/lib/prompt-tag-search', () => ({
  searchPromptTags: ({ query }: { query: string }) =>
    query.startsWith('1g')
      ? [
          {
            tag: {
              id: 'danbooru:1girl',
              promptText: '1girl',
              label: '1girl',
              popularity: 50,
            },
            score: 1,
            isSelected: false,
          },
        ]
      : [],
}))

import { StudioTagChipField } from './StudioTagChipField'
import type { TagChip } from '@/types/tag-composer'

function setup(chips: TagChip[] = []) {
  const onChange = vi.fn()
  render(
    <StudioTagChipField
      label="positiveLabel"
      polarity="positive"
      chips={chips}
      onChange={onChange}
    />,
  )
  return { onChange, input: screen.getByRole('combobox') }
}

describe('StudioTagChipField', () => {
  it('打到逗号就落格，最后一段留在输入框里', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: '1girl, rain' } })
    expect(onChange).toHaveBeenCalledWith([{ text: '1girl', weight: 1 }])
    expect(input).toHaveValue('rain')
  })

  it('回车落格', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: 'neon city' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([{ text: 'neon city', weight: 1 }])
  })

  // 同一个词送两遍在扩散模型里等于被悄悄加权。
  it('已经在场的词不重复落格', () => {
    const { onChange, input } = setup([{ text: '1girl', weight: 1 }])
    fireEvent.change(input, { target: { value: '1GIRL,' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('空输入框上退格删掉最后一格', () => {
    const { onChange, input } = setup([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1.2 },
    ])
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledWith([{ text: '1girl', weight: 1 }])
  })

  it('有字时退格做本职工作，不删格子', () => {
    const { onChange, input } = setup([{ text: '1girl', weight: 1 }])
    fireEvent.change(input, { target: { value: 'ra' } })
    onChange.mockClear()
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(onChange).not.toHaveBeenCalled()
  })

  // 权重统一显示成 ×1.2，⛔ 界面上不出现 `{tag}` / `(tag:1.2)`。
  it('带权重的格子把倍数写在 chip 上', () => {
    setup([{ text: 'rain', weight: 1.2 }])
    expect(screen.getByText('×1.2')).toBeInTheDocument()
  })

  it('按 Enter 接受补全里高亮的那一条', () => {
    const { onChange, input } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1gi' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([{ text: '1girl', weight: 1 }])
  })
})
