import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 步数 / CFG 是 Radix Slider —— 它量 thumb 尺寸要 ResizeObserver（jsdom 没有）。 */
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

const mocks = vi.hoisted(() => ({
  runModels: [] as { modelId: string; adapterType: string }[],
  advancedParams: {} as Record<string, unknown>,
  referenceImages: [] as string[],
  dispatch: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      advancedParams: mocks.advancedParams,
      aspectRatio: '1:1',
      imageBatchCount: 1,
      activeTagCharacterIndex: null,
    },
    dispatch: mocks.dispatch,
  }),
  useStudioData: () => ({
    imageUpload: { referenceImages: mocks.referenceImages },
  }),
  useStudioGen: () => ({ isGenerating: false }),
}))
vi.mock('@/hooks/use-studio-run-models', () => ({
  useStudioRunModels: () => ({ runModels: mocks.runModels }),
}))
vi.mock('@/lib/model-options', () => ({
  getTranslatedModelLabel: (_t: unknown, modelId: string) => modelId,
}))

import { StudioTagsControlColumn } from './StudioTagsControlColumn'

const NAI_V5 = {
  modelId: AI_MODELS.NOVELAI_V5_FULL as string,
  adapterType: AI_ADAPTER_TYPES.NOVELAI as string,
}
const PIXAI = {
  modelId: AI_MODELS.PIXAI_HARUKA_V2 as string,
  adapterType: AI_ADAPTER_TYPES.PIXAI as string,
}
const TSUBAKI = {
  modelId: AI_MODELS.PIXAI_TSUBAKI_2 as string,
  adapterType: AI_ADAPTER_TYPES.PIXAI as string,
}

function headings() {
  return screen.getAllByRole('heading').map((node) => node.textContent)
}

describe('标签台右列', () => {
  beforeEach(() => {
    mocks.advancedParams = {}
    mocks.referenceImages = []
    mocks.runModels = [NAI_V5]
    mocks.dispatch.mockClear()
  })

  // 画板自上而下：角色构图 · 质量标签 · 采样器 / 步数 · 分辩率 / 额度 · 参考图用法。
  // ⚠ 画板没画到的能力（CFG · 参考强度）排在中间那一段，⛔ 不因为没画就藏了。
  it('按画板的顺序排卡片，采样器与步数合成一张', () => {
    render(<StudioTagsControlColumn />)
    expect(headings().slice(0, 3)).toEqual([
      'characterTitle',
      'capability.qualityToggle',
      'capability.sampler · capability.steps',
    ])
    expect(headings().at(-1)).toBe('resolutionTitle')
  })

  // UC 预设与 `Text:` 归编辑器主区，右列不重复画。
  it('不画归编辑器的那两条', () => {
    render(<StudioTagsControlColumn />)
    expect(headings()).not.toContain('capability.ucPreset')
    expect(headings()).not.toContain('capability.textRendering')
  })

  it('手机上角色构图自己占一条，这一叠里不重复', () => {
    render(<StudioTagsControlColumn hideCharacters />)
    expect(headings()).not.toContain('characterTitle')
  })

  // ⭐ 多选交集：只有一家支持的那些标「只对 X 生效」保持可改。
  it('多选时把只对一家生效的卡片标出来', () => {
    mocks.runModels = [NAI_V5, PIXAI]
    render(<StudioTagsControlColumn />)
    const note = `onlyFor:${NAI_V5.modelId}`
    expect(screen.getAllByText(note).length).toBeGreaterThanOrEqual(3)
    // 专属卡只提示适用模型，不降低可用控件的对比度。
    for (const button of screen.getAllByRole('button', {
      name: /qualityToggleOption/,
    })) {
      expect(button).not.toBeDisabled()
    }
  })

  it('两家都支持的那张不标也不灰', () => {
    mocks.runModels = [NAI_V5, PIXAI]
    render(<StudioTagsControlColumn />)
    const shared = screen
      .getAllByRole('heading')
      .find((node) => node.textContent === 'capability.guidanceScale')
    expect(shared).toBeDefined()
    expect(shared?.closest('section')?.className).not.toContain('opacity-60')
  })

  // ⚠ 额度那一格报的是官方判据，⛔ 不是一个猜出来的 Anlas 数。
  it('分辩率报真尺寸与 Opus 免费窗口', () => {
    render(<StudioTagsControlColumn />)
    expect(screen.getByText('1024×1024')).toBeInTheDocument()
    expect(screen.getByText('opusFree')).toBeInTheDocument()
  })

  it('没有参考图时不显示无效的参考控件', () => {
    render(<StudioTagsControlColumn />)
    expect(headings()).not.toContain('capability.referenceStrength')
    expect(headings()).not.toContain('capability.img2imgNoise')
    expect(screen.queryByText('referenceUsage.vibe')).not.toBeInTheDocument()
    expect(screen.queryByText('referenceUsage.precise')).not.toBeInTheDocument()
  })

  it('上传参考图后显示图生图强度和噪声', () => {
    mocks.referenceImages = ['https://example.com/ref.png']
    render(<StudioTagsControlColumn />)
    expect(headings()).toContain('capability.referenceStrength')
    expect(headings()).toContain('capability.img2imgNoise')
    expect(screen.getByText('referenceUsage.standard')).toBeInTheDocument()
  })

  // 标签台里没有 NAI 时，NAI 自己那几张卡整块不渲染。
  it('只选 PixAI 时不画 NAI 专属的三张卡', () => {
    mocks.runModels = [PIXAI]
    render(<StudioTagsControlColumn />)
    expect(headings()).not.toContain('characterTitle')
    expect(headings()).not.toContain('resolutionTitle')
    expect(headings()).not.toContain('referenceUsageTitle')
  })

  /**
   * ⭐ owner 真机：只选 Tsubaki.2 时右列**整个空白**（能力表当时只给 PixAI
   * 声明了 `negativePrompt` + `seed`，两者都不是 chip 形态）。
   */
  it('只选 Tsubaki.2 时右列不是空的', () => {
    mocks.runModels = [TSUBAKI]
    render(<StudioTagsControlColumn />)
    expect(headings()).toEqual(['capability.pixaiSize', 'capability.pixaiMode'])
  })

  // SDXL 档是扩散旋钮那一套，⛔ 没有 mode。
  it('只选 Haruka v2 时是 CFG / 步数那套，没有 mode', () => {
    mocks.runModels = [PIXAI]
    render(<StudioTagsControlColumn />)
    expect(headings()).toContain('capability.guidanceScale')
    expect(headings()).toContain('capability.steps')
    expect(headings()).toContain('capability.pixaiSize')
    expect(headings()).not.toContain('capability.pixaiMode')
  })

  // 同选 NAI + PixAI：两家的专属卡各自带自己的「只对 X 生效」，且都可改。
  it('NAI 与 Tsubaki 同选时，两家的专属卡各标各的', () => {
    mocks.runModels = [NAI_V5, TSUBAKI]
    render(<StudioTagsControlColumn />)

    const cardOf = (heading: string) =>
      screen
        .getAllByRole('heading')
        .find((node) => node.textContent === heading)
        ?.closest('section')

    const naiOnly = cardOf('capability.qualityToggle')
    const pixaiOnly = cardOf('capability.pixaiMode')
    expect(naiOnly?.textContent).toContain(`onlyFor:${NAI_V5.modelId}`)
    expect(pixaiOnly?.textContent).toContain(`onlyFor:${TSUBAKI.modelId}`)
    expect(naiOnly?.className).not.toContain('opacity-60')
    expect(pixaiOnly?.className).not.toContain('opacity-60')

    // 两边的按钮都可用。
    for (const name of [/qualityToggleOption/, /pixaiModeOption/]) {
      for (const button of screen.getAllByRole('button', { name })) {
        expect(button).not.toBeDisabled()
      }
    }
  })
})

it('V4.5 switches between img2img and precise character controls', () => {
  mocks.runModels = [
    {
      modelId: AI_MODELS.NOVELAI_V45_FULL,
      adapterType: AI_ADAPTER_TYPES.NOVELAI,
    },
  ]
  mocks.referenceImages = ['https://example.com/ref.png']
  mocks.advancedParams = { seed: 42 }
  const { rerender } = render(<StudioTagsControlColumn />)
  const mode = screen.getByRole('button', {
    name: 'novelAiReferenceModeOption.precise',
  })
  expect(mode).toBeEnabled()
  fireEvent.click(mode)
  expect(mocks.dispatch).toHaveBeenLastCalledWith({
    type: 'SET_ADVANCED_PARAMS',
    payload: { seed: 42, novelAiReferenceMode: 'precise' },
  })
  mocks.advancedParams = { seed: 42, novelAiReferenceMode: 'precise' }
  rerender(<StudioTagsControlColumn />)
  expect(headings()).toContain('capability.preciseReferenceStrength')
  expect(headings()).toContain('capability.preciseReferenceFidelity')
  expect(headings()).not.toContain('capability.referenceStrength')
  expect(headings()).not.toContain('capability.img2imgNoise')
  expect(screen.getByText('preciseReferenceCost')).toBeInTheDocument()
  expect(screen.queryByText('opusFree')).not.toBeInTheDocument()
})
