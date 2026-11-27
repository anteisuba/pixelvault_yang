import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
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

// 补全走真词库（`searchPromptTags`）；只假 NovelAI 官方补全与双语词库那一跳网络。
vi.mock('@/lib/api-client/novelai-tags', () => ({
  getNovelAiTagSuggestionsAPI: vi.fn(),
}))
vi.mock('@/lib/api-client/tag-assist', () => ({
  getDanbooruTagSuggestionsAPI: vi.fn(async () => ({ tags: [] })),
  lookupTagMetaBatchAPI: vi.fn(async () => ({ items: {} })),
  getDanbooruCooccurrenceAPI: vi.fn(async () => ({
    queriedTags: [],
    truncated: false,
    sampleSize: 0,
    items: [],
  })),
}))
import { getNovelAiTagSuggestionsAPI } from '@/lib/api-client/novelai-tags'
import {
  getDanbooruCooccurrenceAPI,
  getDanbooruTagSuggestionsAPI,
} from '@/lib/api-client/tag-assist'
import { message as M, renderWithApp } from '@/test/app-harness'
import { StudioTagTextField } from './StudioTagTextField'
import type { TagChip } from '@/types/tag-composer'

function setup(chips: TagChip[] = [], onLookup?: (chip: TagChip) => void) {
  const onChange = vi.fn()
  const utils = renderWithApp(
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
  it('框里就是一段逗号分隔的原生权重串', () => {
    const { input, container } = setup([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1.2 },
      { text: 'blurry', weight: -2 },
    ])
    expect(input).toHaveValue('1girl, 1.2::rain::, -2::blurry::')
    expect(screen.queryByText(/×/)).toBeNull()
    expect(container.querySelector('.text-status-risk')?.textContent).toBe(
      '-2::blurry::',
    )
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

  it('同时认原生 1.2::tag::、负权重 -2::tag:: 与旧后缀 tag:1.2', () => {
    const { onChange, input } = setup()
    type(input, 'rain:1.2, -2::blurry::')
    expect(onChange).toHaveBeenLastCalledWith([
      { text: 'rain', weight: 1.2 },
      { text: 'blurry', weight: -2 },
    ])
  })

  it('数值组里的逗号不切并解析出组权重', () => {
    const { onChange, input } = setup()
    type(input, '1.5::rain, night::, city')
    expect(onChange).toHaveBeenLastCalledWith([
      { text: 'rain, night', weight: 1.5 },
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

  it('⌘↑ / ⌘↓ 与 ⌘⇧↓ 给光标所在的标签调原生权重并支持进负权', () => {
    const { onChange, input } = setup([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1 },
    ])
    placeCaret(input, 9)
    fireEvent.keyDown(input, { key: 'ArrowUp', metaKey: true })
    expect(input).toHaveValue('1girl, 1.05::rain::')
    expect(onChange).toHaveBeenLastCalledWith([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: 1.05 },
    ])
    fireEvent.keyDown(input, { key: 'ArrowDown', ctrlKey: true })
    expect(input).toHaveValue('1girl, rain')
    fireEvent.keyDown(input, {
      key: 'ArrowDown',
      metaKey: true,
      shiftKey: true,
    })
    expect(input).toHaveValue('1girl, 0.5::rain::')
  })

  it('开启 showWeightControls 时聚焦某个词可用微调键加减和反转负权', () => {
    const onChange = vi.fn()
    renderWithApp(
      <StudioTagTextField
        label="positiveLabel"
        polarity="positive"
        chips={[
          { text: '1girl', weight: 1 },
          { text: 'rain', weight: 1 },
        ]}
        showWeightControls
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('combobox') as HTMLTextAreaElement
    fireEvent.focus(input)
    placeCaret(input, 9)
    fireEvent.click(
      screen.getByRole('button', {
        name: M('StudioTags.weightControls.toNegative'),
      }),
    )
    expect(input).toHaveValue('1girl, -1::rain::')
    expect(onChange).toHaveBeenLastCalledWith([
      { text: '1girl', weight: 1 },
      { text: 'rain', weight: -1 },
    ])
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

  it('⭐ 程序性写入（套模板 / 做同款 / 撤销）后聚焦、光标落在末尾：补全不开，真打字才开', async () => {
    const { input, rerender } = setup([{ text: 'rain', weight: 1 }])
    fireEvent.focus(input)
    rerender(
      <StudioTagTextField
        label="positiveLabel"
        polarity="positive"
        chips={[
          { text: 'rain', weight: 1 },
          { text: '1gi', weight: 1 },
        ]}
        onChange={vi.fn()}
      />,
    )
    expect(input).toHaveValue('rain, 1gi')
    placeCaret(input, 9)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input).toHaveAttribute('aria-expanded', 'false')

    type(input, 'rain, 1gir')
    expect(await screen.findByRole('option', { name: '1girl' })).toBeVisible()
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
    renderWithApp(
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
      expect(
        screen.getByText((content) =>
          content.startsWith(
            M('StudioTags.officialTagsSource').split('{model}')[0]!,
          ),
        ),
      ).toBeInTheDocument(),
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
    renderWithApp(
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
      expect(
        screen.getByText(M('StudioTags.officialTagsError')),
      ).toBeInTheDocument(),
    )
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(onChange).toHaveBeenLastCalledWith([{ text: '1gi', weight: 1 }])
  })

  it('supports single-char Chinese queries with localized labels, semantic badges, and recognition info', async () => {
    vi.mocked(getNovelAiTagSuggestionsAPI).mockResolvedValue({
      tags: [
        {
          tag: 'rain',
          count: 184000,
          zh: '雨',
          source: 'dictionary',
        },
        {
          tag: 'melancholy',
          count: 420,
          zh: '忧郁',
          source: 'semantic',
        },
      ],
    })
    const onChange = vi.fn()
    renderWithApp(
      <StudioTagTextField
        modelId="nai-diffusion-5-full"
        label="bilingual"
        polarity="positive"
        chips={[]}
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('combobox', {
      name: 'bilingual',
    }) as HTMLTextAreaElement
    fireEvent.focus(input)
    type(input, '雨')
    await waitFor(() =>
      expect(
        screen.getByText(M('StudioTags.bilingualTagsSource')),
      ).toBeInTheDocument(),
    )
    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByText('雨')).toBeInTheDocument()
    expect(
      within(listbox).getByText(M('StudioTags.suggestions.semanticBadge')),
    ).toBeInTheDocument()
    expect(
      within(listbox).getByText(M('StudioTags.recognition.lowShort')),
    ).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith([{ text: 'rain', weight: 1 }])
  })

  it('queries bilingual suggestions for non-NAI models on Chinese input', async () => {
    vi.mocked(getDanbooruTagSuggestionsAPI).mockResolvedValue({
      tags: [
        { tag: 'twintails', count: 425000, zh: '双马尾', source: 'dictionary' },
      ],
    })
    const onChange = vi.fn()
    renderWithApp(
      <StudioTagTextField
        label="non-nai-zh"
        polarity="positive"
        chips={[]}
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('combobox', {
      name: 'non-nai-zh',
    }) as HTMLTextAreaElement
    fireEvent.focus(input)
    type(input, '双马尾')
    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByText('twintails')).toBeInTheDocument()
    expect(within(listbox).getByText('双马尾')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith([
      { text: 'twintails', weight: 1 },
    ])
  })

  it('Ctrl+拖选标签弹出共现浮层并可一键加入关联标签', async () => {
    vi.mocked(getDanbooruCooccurrenceAPI).mockResolvedValue({
      queriedTags: ['serafuku', 'rain'],
      truncated: false,
      sampleSize: 40,
      items: [
        { tag: 'pleated_skirt', count: 32, ratio: 0.8, zh: '百褶裙' },
        { tag: 'wet', count: 24, ratio: 0.6, zh: '湿润' },
      ],
    })
    const onChange = vi.fn()
    renderWithApp(
      <StudioTagTextField
        label="cooccur"
        polarity="positive"
        chips={[
          { text: 'serafuku', weight: 1 },
          { text: 'rain', weight: 1 },
        ]}
        enableCooccurrence
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('combobox', {
      name: 'cooccur',
    }) as HTMLTextAreaElement
    fireEvent.focus(input)
    input.setSelectionRange(0, 14)
    fireEvent.select(input)
    fireEvent.mouseUp(input, { ctrlKey: true })

    const dialog = await screen.findByRole('dialog', {
      name: M('StudioTags.cooccurrence.title'),
    })
    expect(within(dialog).getByText('pleated skirt')).toBeInTheDocument()
    expect(within(dialog).getByText('百褶裙')).toBeInTheDocument()
    fireEvent.click(
      within(dialog).getByRole('button', { name: /pleated skirt/ }),
    )
    expect(onChange).toHaveBeenLastCalledWith([
      { text: 'serafuku', weight: 1 },
      { text: 'rain', weight: 1 },
      { text: 'pleated skirt', weight: 1 },
    ])
  })
})
