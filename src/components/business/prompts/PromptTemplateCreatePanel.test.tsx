import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { TAG_TEMPLATE_PLACEHOLDER_MODEL_ID } from '@/constants/prompt-library'

/**
 * 新建弹窗（pages/prompts.md「新建」，画板 `TgA_New`）：类型三格分段；选「标签」后
 * 提示词大框换成两块格子，⛔ 没有模型那一行；存成图片模板 + 标签标记（在这里新建）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/prompt-tag-search', () => ({ searchPromptTags: () => [] }))
vi.mock('@/lib/api-client/novelai-tags', () => ({
  getNovelAiTagSuggestionsAPI: vi.fn(),
}))
const mockCreateRecipe = vi.fn()
vi.mock('@/lib/api-client/recipes', () => ({
  createRecipeAPI: (...args: unknown[]) => mockCreateRecipe(...args),
}))

import { PromptTemplateCreatePanel } from './PromptTemplateCreatePanel'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

beforeEach(() => {
  mockCreateRecipe.mockReset()
  mockCreateRecipe.mockResolvedValue({ success: true, data: { id: 'new' } })
})

function openDialog() {
  render(<PromptTemplateCreatePanel />)
  fireEvent.click(screen.getByRole('button', { name: 'createAction' }))
}

function typeTags(label: string, text: string) {
  const input = screen.getByRole('combobox', { name: label })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('PromptTemplateCreatePanel', () => {
  it('类型三格：图片 · 视频 · 标签；选标签换成两块格子，没有模型那一行', async () => {
    openDialog()

    expect(
      screen.getAllByRole('radio').map((radio) => radio.textContent),
    ).toEqual(['outputTypeImage', 'outputTypeVideo', 'typeTags'])
    expect(
      screen.getByRole('combobox', { name: 'createModelLabel' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'typeTags' }))

    expect(
      screen.getByRole('combobox', { name: 'tagsLabel' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'negativeTagsLabel' }),
    ).toBeInTheDocument()
    // 提示词那一块淡出 200 再拿掉（切类型的交叉淡入淡出）。
    await waitFor(() =>
      expect(
        screen.queryByRole('combobox', { name: 'createModelLabel' }),
      ).toBeNull(),
    )
    expect(screen.getByText('createTagsNote')).toBeInTheDocument()
  })

  it('标签模板存成图片模板 + 在这里新建的标记，模型只是占格', async () => {
    openDialog()
    fireEvent.click(screen.getByRole('radio', { name: 'typeTags' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'createNameLabel' }), {
      target: { value: '雨夜 · 撑伞' },
    })
    typeTags('tagsLabel', '1girl, holding umbrella, rain')
    typeTags('negativeTagsLabel', 'lowres')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'createSubmit' }))
    })

    expect(mockCreateRecipe).toHaveBeenCalledWith({
      name: '雨夜 · 撑伞',
      outputType: 'IMAGE',
      compiledPrompt: '1girl, holding umbrella, rain',
      negativePrompt: 'lowres',
      modelId: TAG_TEMPLATE_PLACEHOLDER_MODEL_ID,
      provider: expect.any(String),
      params: { promptDialect: 'tags', origin: 'prompts' },
    })
  })

  it('一个标签都没有就不存，说一句', async () => {
    openDialog()
    fireEvent.click(screen.getByRole('radio', { name: 'typeTags' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'createNameLabel' }), {
      target: { value: '空的' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'createSubmit' }))
    })

    expect(mockCreateRecipe).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('createTagsRequired')
  })
})
