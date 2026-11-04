import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'

import { StudioModelCapabilityChips } from './StudioModelCapabilityChips'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

// 专属那颗 chip 的弹层是 Radix Popover，jsdom 没有 ResizeObserver。
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const T = (key: string, values?: Record<string, string | number>) =>
  text(`StudioCapabilityChips.${key}`, values)
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** 「专属 · <模型名>」：模型名走真的型号文案，这里只认前缀。 */
const SECTION = new RegExp(`^${escape(T('sectionLabel', { model: '' }))}`)
const ONLY_FOR = new RegExp(
  `^${T('onlyFor', { models: '\u0000' })
    .split('\u0000')
    .map(escape)
    .join('.+')}$`,
)

/** 真工作台里挂 chip 行，再用真 reducer 选模型 / 额外模型 / 参数，用真 hook 挂参考图。 */
function renderChips(
  setup: {
    dialect?: 'tags'
    modelId?: string
    extraModelIds?: string[]
    advancedParams?: Record<string, unknown>
    referenceImages?: string[]
  } = {},
  props: React.ComponentProps<typeof StudioModelCapabilityChips> = {},
) {
  const view = renderWithStudio(<StudioModelCapabilityChips {...props} />)
  apply(view.studio.current, setup)
  return view
}

function apply(
  studio: StudioHandle,
  {
    dialect,
    modelId,
    extraModelIds = [],
    advancedParams,
    referenceImages = [],
  }: Parameters<typeof renderChips>[0] & object,
) {
  act(() => {
    if (dialect)
      studio.dispatch({ type: 'SET_PROMPT_DIALECT', payload: dialect })
    if (modelId)
      studio.dispatch({
        type: 'SET_OPTION_ID',
        payload: `workspace:${modelId}`,
      })
    for (const id of extraModelIds)
      studio.dispatch({
        type: 'TOGGLE_EXTRA_MODEL',
        payload: `workspace:${id}`,
      })
    if (advancedParams)
      studio.dispatch({ type: 'SET_ADVANCED_PARAMS', payload: advancedParams })
    for (const url of referenceImages) studio.imageUpload.addReferenceImage(url)
  })
}

describe('StudioModelCapabilityChips', () => {
  beforeEach(() => {
    fakeStudioServer()
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders one chip per model-specific capability', () => {
    renderChips({ modelId: AI_MODELS.OPENAI_GPT_IMAGE_2 })
    expect(screen.getByText(SECTION)).toBeInTheDocument()
    expect(screen.getByText(T('capability.quality'))).toBeInTheDocument()
    expect(screen.getByText(T('capability.background'))).toBeInTheDocument()
    expect(screen.getByText(T('capability.style'))).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  // 没有专属能力 = 整段（虚线 + 小标 + chip 行）不渲染。
  it('renders nothing for a model with no model-specific capability', () => {
    const { container } = renderChips({ modelId: AI_MODELS.GEMINI_PRO_IMAGE })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing before a model is picked', () => {
    const { container, studio } = renderChips()
    act(() => studio.current.dispatch({ type: 'SET_OPTION_ID', payload: '' }))
    expect(container).toBeEmptyDOMElement()
  })

  // 选中态把当前取值写进 chip 上；默认态只写能力名。
  it('prints the current value only once the chip leaves its default', () => {
    const { studio } = renderChips({ modelId: AI_MODELS.OPENAI_GPT_IMAGE_2 })
    expect(screen.getByText(T('capability.quality'))).toBeInTheDocument()
    apply(studio.current, { advancedParams: { quality: 'high' } })
    expect(
      screen.getByText(
        `${T('capability.quality')} · ${text('AdvancedSettings.qualityOption.high')}`,
      ),
    ).toBeInTheDocument()
  })

  it('toggles a boolean capability in place without opening a popover', () => {
    const { studio } = renderChips({ modelId: AI_MODELS.OPENAI_GPT_IMAGE_2 })
    fireEvent.click(screen.getByRole('switch'))
    expect(studio.current.state.advancedParams).toEqual({ preview: true })
    expect(screen.getByRole('switch')).toBeChecked()
  })

  // 整个对象带过去，只换一个键 —— SET_ADVANCED_PARAMS 是整体替换。
  it('keeps the rest of advancedParams when one chip changes', () => {
    const { studio } = renderChips({
      modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
      advancedParams: { resolution: '2K', seed: 7 },
    })
    fireEvent.click(screen.getByRole('switch'))
    expect(studio.current.state.advancedParams).toEqual({
      resolution: '2K',
      seed: 7,
      preview: true,
    })
  })

  it('shows reference strength only after a reference image is attached', () => {
    // 还在册、认参考强度的是 NovelAI V5（标签台）；FLUX LoRA 已下架选不到。
    const { studio } = renderChips({
      dialect: 'tags',
      modelId: AI_MODELS.NOVELAI_V5_FULL,
    })
    const name = T('capability.referenceStrength')
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    apply(studio.current, { referenceImages: ['https://example.com/a.png'] })
    expect(screen.getByRole('button', { name })).toBeEnabled()
  })

  // owner 2026-09-26「不只 GPT 有，其他模型也有」：多选时列的是这一轮所有模型的
  // 并集，⛔ 不只看主模型；只有部分模型认的那一项注明只对谁生效。
  it('lists every run model’s capabilities, not only the primary’s', () => {
    renderChips(
      {
        modelId: AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
        extraModelIds: [AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE],
        // Seedream 的背景 / 拆图层只在图生图成立 —— 挂一张图它们才出现。
        referenceImages: ['https://example.com/a.png'],
      },
      { variant: 'single' },
    )
    fireEvent.click(screen.getByRole('button', { name: SECTION }))

    // 两个模型都认的引导系数不注；只有 Pro 认的两项注明只对谁生效。
    expect(screen.getByText(T('capability.background'))).toBeInTheDocument()
    expect(
      screen.getByText(T('capability.layerDecomposition')),
    ).toBeInTheDocument()
    expect(screen.getAllByText(ONLY_FOR)).toHaveLength(2)
  })
})
