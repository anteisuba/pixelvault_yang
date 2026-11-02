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
import { StudioTagTextField } from './StudioTagTextField'
import type { TagChip } from '@/types/tag-composer'

function setup(chips: TagChip[] = [], onLookup?: (chip: TagChip) => void) {
  const onChange = vi.fn()
  const utils = render(
    <StudioTagTextField
      label="positiveLabel"
      polarity="positive"
      chips={chips}
      onChange={onChange}
      onLookup={onLookup}
    />,
  )
  const input = screen.getByRole('combobox') as HTMLTextAreaElement
  return { ...utils, onChange, input }
}

/** 把光标放在 `caret`（缺省末尾）再改字 —— 像真的打字一样。 */
function type(input: HTMLTextAreaElement, value: string, caret = value.length) {
  fireEvent.change(input, {
    target: { value, selectionStart: caret, selectionEnd: caret },
  })
}

function placeCaret(input: HTMLTextAreaElement, at: number) {
  input.setSelectionRange(at, at)
  fireEvent.select(input)
}

describe('StudioTagTextField', () => {
  it('框里就是一段逗号分隔的字', () => {
    const { input } = setup([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1.2 },
    ])
    expect(input).toHaveValue('1girl, rain:1.2')
    // 权重写在字里（浅一档），⛔ 界面上出现 `{tag}` / `(tag:1.2)` / ×。
    expect(screen.queryByText(/×/)).toBeNull()
  })

  it('打字即改：逗号切成标签，打到一半的尾巴留在框里', () => {
    const { onChange, input } = setup()
    type(input, '1girl, rain, ')
    expect(onChange).toHaveBeenLastCalledWith([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1 },
    ])
    expect(input).toHaveValue('1girl, rain, ')
  })

  it('权重写成 tag:1.2 就是权重', () => {
    const { onChange, input } = setup()
    type(input, 'rain:1.2')
    expect(onChange).toHaveBeenLastCalledWith([{ text: 'rain', weight: 1.2 }])
  })

  it('数值组里的逗号不切', () => {
    const { onChange, input } = setup()
    type(input, '1.5::rain, night::, city')
    expect(onChange).toHaveBeenLastCalledWith([
      { text: '1.5::rain, night::', weight: 1 },
      { text: 'city', weight: 1 },
    ])
  })

  it('删字就是删标签', () => {
    const { onChange, input } = setup([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1 },
    ])
    type(input, '1girl')
    expect(onChange).toHaveBeenLastCalledWith([{ text: '1girl', weight: 1 }])
  })

  it('⌥⌫ 删掉光标前的整个标签', () => {
    const { onChange, input } = setup([
      { text: '1girl', weight: 1 },
      { text: 'neon city', weight: 1 },
    ])
    placeCaret(input, 16)
    fireEvent.keyDown(input, { key: 'Backspace', altKey: true })
    expect(onChange).toHaveBeenLastCalledWith([{ text: '1girl', weight: 1 }])
    expect(input).toHaveValue('1girl')
  })

  it('⌘↑ / ⌘↓ 给光标所在的标签调权重', () => {
    const { onChange, input } = setup([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1 },
    ])
    placeCaret(input, 9)
    fireEvent.keyDown(input, { key: 'ArrowUp', metaKey: true })
    expect(input).toHaveValue('1girl, rain:1.05')
    expect(onChange).toHaveBeenLastCalledWith([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1.05 },
    ])
    fireEvent.keyDown(input, { key: 'ArrowDown', ctrlKey: true })
    expect(input).toHaveValue('1girl, rain')
  })

  it('双击选中整个标签', () => {
    const { input } = setup([
      { text: '1girl', weight: 1 },
      { text: 'neon city', weight: 1 },
    ])
    input.setSelectionRange(9, 9)
    fireEvent.doubleClick(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([7, 16])
  })

  it('⌘ + 点一个标签去看详情', () => {
    const onLookup = vi.fn()
    const { input } = setup(
      [
        { text: '1girl', weight: 1 },
        { text: 'rain', weight: 1.2 },
      ],
      onLookup,
    )
    input.setSelectionRange(9, 9)
    fireEvent.click(input, { metaKey: true })
    expect(onLookup).toHaveBeenCalledWith({ text: 'rain', weight: 1.2 })
    onLookup.mockClear()
    fireEvent.click(input)
    expect(onLookup).not.toHaveBeenCalled()
  })

  it('光标所在的标签底下一层淡灰', () => {
    const { input, container } = setup([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1 },
    ])
    expect(container.querySelector('.bg-fill-strong')).toBeNull()
    fireEvent.focus(input)
    placeCaret(input, 9)
    expect(container.querySelector('.bg-fill-strong')?.textContent).toBe('rain')
  })

  it('外面换了内容就整段换掉', () => {
    const { input, rerender } = setup([{ text: '1girl', weight: 1 }])
    rerender(
      <StudioTagTextField
        label="positiveLabel"
        polarity="positive"
        chips={[
          { text: '1girl', weight: 1 },
          { text: 'hatsune miku', weight: 1 },
        ]}
        onChange={vi.fn()}
      />,
    )
    expect(input).toHaveValue('1girl, hatsune miku')
  })

  it('输入法确认候选时回车不动', () => {
    const { input } = setup()
    fireEvent.focus(input)
    type(input, '1gi')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(input).toHaveValue('1gi')
  })

  it('按 Enter 接受补全里高亮的那一条，后面补上逗号', () => {
    const { onChange, input } = setup()
    fireEvent.focus(input)
    type(input, '1gi')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('1girl, ')
    expect(onChange).toHaveBeenLastCalledWith([{ text: '1girl', weight: 1 }])
  })

  it('补全只查光标所在那一段', async () => {
    const { input } = setup([{ text: 'rain', weight: 1 }])
    fireEvent.focus(input)
    type(input, 'rain, 1g')
    expect(await screen.findByRole('option', { name: '1girl' })).toBeVisible()
  })

  it('滑动候选时不选中，点击候选才加入标签', async () => {
    const { onChange, input } = setup()
    fireEvent.focus(input)
    type(input, '1gi')
    onChange.mockClear()
    const option = await screen.findByRole('option', { name: '1girl' })
    expect(input).toHaveAttribute('aria-activedescendant', option.id)
    fireEvent.pointerDown(option, { pointerType: 'touch' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(option)
    expect(onChange).toHaveBeenLastCalledWith([{ text: '1girl', weight: 1 }])
  })

  it('补全列表避开软键盘，并在可视区域恢复后重新定位', async () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 340,
      offsetTop: 0,
    })
    vi.stubGlobal('visualViewport', viewport)
    const { input } = setup()
    const box = input.parentElement!.parentElement!
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(20, 200, 335, 96),
    )
    fireEvent.focus(input)
    type(input, '1gi')
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
      <StudioTagTextField
        modelId="nai-diffusion-5-curated"
        label="official"
        polarity="positive"
        chips={[]}
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('combobox', {
      name: 'official',
    }) as HTMLTextAreaElement
    fireEvent.focus(input)
    type(input, 'denia')
    await waitFor(() =>
      expect(screen.getByText('officialTagsSource')).toBeInTheDocument(),
    )
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith([
      { text: 'denia (wuthering waves)', weight: 1 },
    ])
  })
  it('keeps manual input working on provider failure without showing local results', async () => {
    vi.mocked(getNovelAiTagSuggestionsAPI).mockRejectedValue(
      new Error('UPSTREAM_ERROR'),
    )
    const onChange = vi.fn()
    render(
      <StudioTagTextField
        modelId="nai-diffusion-5-curated"
        label="offline"
        polarity="positive"
        chips={[]}
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('combobox', {
      name: 'offline',
    }) as HTMLTextAreaElement
    fireEvent.focus(input)
    type(input, '1gi')
    await waitFor(() =>
      expect(screen.getByText('officialTagsError')).toBeInTheDocument(),
    )
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(onChange).toHaveBeenLastCalledWith([{ text: '1gi', weight: 1 }])
  })
})
