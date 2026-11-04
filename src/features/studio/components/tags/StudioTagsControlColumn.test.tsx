import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'

import { StudioTagsControlColumn } from './StudioTagsControlColumn'

/**
 * 标签台右列，全程真工作台：真 `useStudioRunModels`（标签台只跑一个模型）、真能力表、
 * 真 `CapabilitySelectControl`。
 *
 * ⚠ 原来那几条「NAI + PixAI 同选」「只选 PixAI / Tsubaki」没有迁：PixAI 已按产品决定
 * 暂停（不在可选目录里），标签台又只跑一个模型 —— 真页面上到不了那几个状态。
 */

/** 步数 / CFG 是 Radix Slider —— 它量 thumb 尺寸要 ResizeObserver（jsdom 没有）。 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn() }),
}))

const T = (key: string) => text(`StudioTags.${key}`)
const CAP = (capability: string) =>
  text(`StudioCapabilityChips.capability.${capability}`)
const OPTION = (capability: string, value: string) =>
  text(`AdvancedSettings.${capability}Option.${value}`)

function headings() {
  return screen.getAllByRole('heading').map((node) => node.textContent)
}

/** 真标签台：选一个 NovelAI 型号，按需挂参考图 / 写参数，再渲染右列。 */
function renderColumn(
  props: React.ComponentProps<typeof StudioTagsControlColumn> = {},
  {
    modelId = AI_MODELS.NOVELAI_V5_FULL as string,
    references = [] as string[],
    advancedParams = undefined as Record<string, unknown> | undefined,
  } = {},
) {
  const view = renderWithStudio(<StudioTagsControlColumn {...props} />)
  act(() => {
    const { dispatch, imageUpload } = view.studio.current
    dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
    dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${modelId}` })
    if (advancedParams)
      dispatch({ type: 'SET_ADVANCED_PARAMS', payload: advancedParams })
    for (const url of references) imageUpload.addReferenceImage(url)
  })
  return view.studio as { current: StudioHandle }
}

beforeEach(() => {
  fakeStudioServer()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})
afterEach(() => vi.unstubAllGlobals())

describe('标签台右列', () => {
  // 画板自上而下：角色构图 · 质量标签 · 采样器 / 步数 · 分辩率 / 额度 · 参考图用法。
  // ⚠ 画板没画到的能力（CFG · 参考强度）排在中间那一段，⛔ 不因为没画就藏了。
  it('按画板的顺序排卡片，采样器与步数合成一张', () => {
    renderColumn()
    expect(headings().slice(0, 3)).toEqual([
      T('characterTitle'),
      CAP('qualityToggle'),
      `${CAP('sampler')} · ${CAP('steps')}`,
    ])
    expect(headings().at(-1)).toBe(T('resolutionTitle'))
  })

  // UC 预设归编辑器主区，右列不重复画。
  it('不画归编辑器的那一条', () => {
    renderColumn()
    expect(headings()).not.toContain(CAP('ucPreset'))
  })

  it('手机上角色构图自己占一条，这一叠里不重复', () => {
    renderColumn({ hideCharacters: true })
    expect(headings()).not.toContain(T('characterTitle'))
  })

  it('单选一家时不标「只对 X 生效」', () => {
    renderColumn()
    expect(
      screen.queryByText(new RegExp(T('onlyFor').split('{')[0]!)),
    ).not.toBeInTheDocument()
  })

  // ⚠ 额度那一格报的是官方判据，⛔ 不是一个猜出来的 Anlas 数。
  it('分辩率报真尺寸与 Opus 免费窗口', () => {
    renderColumn()
    expect(screen.getByText('1024×1024')).toBeInTheDocument()
    expect(screen.getByText(T('opusFree'))).toBeInTheDocument()
  })

  it('没有参考图时不显示无效的参考控件', () => {
    renderColumn()
    expect(headings()).not.toContain(CAP('referenceStrength'))
    expect(headings()).not.toContain(CAP('img2imgNoise'))
    expect(screen.queryByText(T('referenceUsage.vibe'))).not.toBeInTheDocument()
    expect(
      screen.queryByText(T('referenceUsage.precise')),
    ).not.toBeInTheDocument()
  })

  it('上传参考图后显示图生图强度和噪声', () => {
    renderColumn({}, { references: ['https://example.com/ref.png'] })
    expect(headings()).toContain(CAP('referenceStrength'))
    expect(headings()).toContain(CAP('img2imgNoise'))
    expect(screen.getByText(T('referenceUsage.standard'))).toBeInTheDocument()
  })

  // 桌面底部输入框「专属」那颗 chip 的弹层：编辑器主区已经没有 UC 预设的位置，
  // 它进来；画中文字改成台词与画面文字（2026-10-07），弹层里不再有它；角色构图走
  // 舞台面板、额度写在价格那一格。
  it('弹层那一排法：带上 UC 预设，不画画中文字、构图与额度卡', () => {
    renderColumn({ placement: 'popover', compact: true })
    const titles = headings()
    expect(titles).toContain(CAP('ucPreset'))
    expect(titles).toContain(`${CAP('sampler')} · ${CAP('steps')}`)
    expect(titles).not.toContain(CAP('textRendering'))
    expect(titles).not.toContain(T('characterTitle'))
    expect(titles).not.toContain(T('resolutionTitle'))
    expect(
      screen.getByRole('spinbutton', { name: T('workbench.seed') }),
    ).toBeVisible()
  })
})

it('V4.5 switches between img2img and precise character controls', () => {
  const studio = renderColumn(
    {},
    {
      modelId: AI_MODELS.NOVELAI_V45_FULL,
      references: ['https://example.com/ref.png'],
      advancedParams: { seed: 42 },
    },
  )
  fireEvent.click(screen.getByText(OPTION('novelAiReferenceMode', 'precise')))
  expect(studio.current.state.advancedParams).toEqual({
    seed: 42,
    novelAiReferenceMode: 'precise',
  })
  expect(headings()).toContain(CAP('preciseReferenceStrength'))
  expect(headings()).toContain(CAP('preciseReferenceFidelity'))
  expect(headings()).not.toContain(CAP('referenceStrength'))
  expect(headings()).not.toContain(CAP('img2imgNoise'))
  expect(screen.getByText(T('preciseReferenceCost'))).toBeInTheDocument()
  expect(screen.queryByText(T('opusFree'))).not.toBeInTheDocument()
})
