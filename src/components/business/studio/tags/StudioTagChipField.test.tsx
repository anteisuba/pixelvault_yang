import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

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

vi.mock('@/lib/api-client/novelai-tags', () => ({
  getNovelAiTagSuggestionsAPI: vi.fn(),
}))
import { getNovelAiTagSuggestionsAPI } from '@/lib/api-client/novelai-tags'
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

  it('keeps a numeric emphasis group intact until Enter', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: '1.5::rain, night' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '1.5::rain, night::, city' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([
      { text: '1.5::rain, night::', weight: 1 },
      { text: 'city', weight: 1 },
    ])
  })

  it('回车落格', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: 'neon city' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([{ text: 'neon city', weight: 1 }])
  })

  it('输入法确认候选时不提前提交标签', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: '樱花' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('樱花')
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([{ text: '樱花', weight: 1 }])
  })

  it('删除标签不会重新聚焦输入框，点击空白处仍能输入', () => {
    const { input, onChange } = setup([{ text: 'solo', weight: 1 }])
    fireEvent.click(screen.getByRole('button', { name: 'removeTag' }))
    expect(onChange).toHaveBeenCalledWith([])
    expect(input).not.toHaveFocus()
    fireEvent.click(input.parentElement!)
    expect(input).toHaveFocus()
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

  it('滑动候选时不选中，点击候选才加入标签', async () => {
    const { onChange, input } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1gi' } })
    const option = await screen.findByRole('option', { name: '1girl' })
    expect(input).toHaveAttribute('aria-activedescendant', option.id)
    fireEvent.pointerDown(option, { pointerType: 'touch' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(option)
    expect(onChange).toHaveBeenCalledWith([{ text: '1girl', weight: 1 }])
  })

  it('补全列表避开软键盘，并在可视区域恢复后重新定位', async () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 340,
      offsetTop: 0,
    })
    vi.stubGlobal('visualViewport', viewport)
    const { input } = setup()
    vi.spyOn(input.parentElement!, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(20, 200, 335, 96),
    )
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1gi' } })
    const list = await screen.findByRole('listbox')
    expect(list).toHaveStyle({
      bottom: `${window.innerHeight - 196}px`,
      maxHeight: '196px',
    })
    viewport.height = 600
    act(() => {
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(list).toHaveStyle({ top: '300px', maxHeight: '240px' })
    expect(list.style.bottom).toBe('')
  })
})

// 查资料 B 动效表：新落进来的那一格放大落位、浅底褪掉；一开始就在的不演。
describe('标签落进来', () => {
  it('只有后加进来的那一格带落位动画', () => {
    const chips = [{ text: '1girl', weight: 1 }]
    const { rerender } = render(
      <StudioTagChipField
        label="positiveLabel"
        polarity="positive"
        chips={chips}
        onChange={vi.fn()}
      />,
    )
    const landing = () =>
      [...document.querySelectorAll('.animate-tag-land')].map(
        (node) => node.textContent,
      )
    expect(landing()).toEqual([])
    rerender(
      <StudioTagChipField
        label="positiveLabel"
        polarity="positive"
        chips={[{ text: 'hatsune miku', weight: 1 }, ...chips]}
        onChange={vi.fn()}
      />,
    )
    expect(landing()).toEqual(['hatsune miku'])
  })
})

describe('official NAI completion', () => {
  it('accepts the selected canonical role tag without changing its spelling', async () => {
    vi.mocked(getNovelAiTagSuggestionsAPI).mockResolvedValue({
      tags: [
        { tag: 'denia (breakdown) (wuthering waves)', confidence: 0 },
        { tag: 'denia (wuthering waves)', confidence: 0 },
      ],
    })
    const onChange = vi.fn()
    render(
      <StudioTagChipField
        modelId="nai-diffusion-5-curated"
        label="official"
        polarity="positive"
        chips={[]}
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('combobox', { name: 'official' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'denia' } })
    await waitFor(() =>
      expect(screen.getByText('officialTagsSource')).toBeInTheDocument(),
    )
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([
      { text: 'denia (wuthering waves)', weight: 1 },
    ])
  })
  it('keeps manual input working on provider failure without showing local results', async () => {
    vi.mocked(getNovelAiTagSuggestionsAPI).mockRejectedValue(
      new Error('UPSTREAM_ERROR'),
    )
    const onChange = vi.fn()
    render(
      <StudioTagChipField
        modelId="nai-diffusion-5-curated"
        label="offline"
        polarity="positive"
        chips={[]}
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('combobox', { name: 'offline' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1gi' } })
    await waitFor(() =>
      expect(screen.getByText('officialTagsError')).toBeInTheDocument(),
    )
    expect(input).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([{ text: '1gi', weight: 1 }])
  })
})
