import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { type ImageBatchCount } from '@/constants/studio'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  settle,
  type StudioHandle,
} from '@/test/studio-harness'
import { MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import { StudioMobileComposer } from './StudioMobileComposer'

/**
 * 移动端底部 composer（owner 2026-10-02「Claude 式最简」），全程真的：真工作台、真
 * `useStudioGenerateAction`（禁用判据 / 原因 / 提交）、真「＋」抽屉、真模型选择器、真规格
 * chip、真费用行、真视频素材；只假网络（工作台挂载那几条回空、生成提交）与屏宽。
 *
 * ⚠ 原「模型选择器从按钮正上方弹、图片档多选」只断言了传给子组件的 props（`popoverSide` /
 * `selectedOptionIds`），换成真选择器后没有可看的结果，没有迁。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-mobile' }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const M = (key: string, values?: Record<string, string | number>) =>
  text(`StudioMobile.${key}`, values)
const BLOCKED = (key: string, values?: Record<string, string | number>) =>
  text(`StudioPromptArea.blocked.${key}`, values)
const MODEL_LABEL = (key: string) => text(`Models.${key}.label`)

const TEMPLATES = { open: false, onToggle: vi.fn() }
const REFERENCE = 'https://cdn.example.com/reference.png'

let server: ReturnType<typeof fakeStudioServer>
beforeEach(() => {
  stubBrowserLayout()
  setViewportWidth(MOBILE_WIDTH)
  Element.prototype.scrollIntoView = vi.fn()
  server = fakeStudioServer()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

interface Setup {
  video?: boolean
  /** 主模型；`null` = 不选。 */
  model?: string | null
  /** 再挂几个同厂商的（图片档多模型）。 */
  extra?: string[]
  prompt?: string
  batch?: ImageBatchCount
  duration?: number
  references?: string[]
  overlay?: React.ReactNode
}

/** 真工作台：摆好模态、模型、提示词、张数 / 时长、参考图，再渲染 composer。 */
async function renderComposer({
  video = false,
  model = video
    ? AI_MODELS.SEEDANCE_20_VOLCENGINE
    : AI_MODELS.OPENAI_GPT_IMAGE_2,
  extra = [],
  prompt = '',
  batch,
  duration,
  references = [],
  overlay,
}: Setup = {}) {
  const view = renderWithStudio(
    <div className="studio-layout-v2">
      <StudioMobileComposer templates={TEMPLATES} overlay={overlay} />
    </div>,
  )
  await settle()
  act(() => {
    const { dispatch, imageUpload } = view.studio.current
    if (video) dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
    if (model)
      dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${model}` })
    for (const id of extra)
      dispatch({ type: 'TOGGLE_EXTRA_MODEL', payload: `workspace:${id}` })
    if (prompt) dispatch({ type: 'SET_PROMPT', payload: prompt })
    if (batch) dispatch({ type: 'SET_IMAGE_BATCH_COUNT', payload: batch })
    if (duration) dispatch({ type: 'SET_VIDEO_DURATION', payload: duration })
    for (const url of references) imageUpload.addReferenceImage(url)
  })
  await settle()
  return view.studio as { current: StudioHandle }
}

const modelChip = () => screen.getByTestId('studio-mobile-model-chip')
const generateKey = () => screen.getByTestId('studio-mobile-generate')
const referenceRemove = () =>
  screen.queryByRole('button', {
    name: text('ImageChip.removeReferenceImage', { index: 1 }),
  })

describe('StudioMobileComposer', () => {
  /**
   * 输入框卡里只有提示词与一行 `＋ · 模型 · 规格 · 专属 ……… 生成`。参考图 / 模板 / 角色
   * 收进「＋」，写法切换挪到舞台左上角 —— 这一条上再长出来任何一颗都算回退。
   */
  it('输入条只有一行：＋ · 模型 · 规格 · 生成；参考图 / 模板 / 角色都收进「＋」', async () => {
    await renderComposer()
    expect(screen.getByRole('button', { name: M('add') })).toBeInTheDocument()
    expect(modelChip()).toBeInTheDocument()
    expect(screen.getByTestId('studio-spec-chip')).toBeInTheDocument()
    expect(generateKey()).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: text('ImageChip.label') }),
    ).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: M('add') }))
    const sheet = await screen.findByRole('dialog')
    expect(
      within(sheet).getByText(text('PromptLibrary.templatePicker')),
    ).toBeInTheDocument()
    expect(
      within(sheet).getByText(text('StudioV2.characters')),
    ).toBeInTheDocument()
  })

  it('挂着的参考图在输入框卡里看得见；撤销条挂在输入条上沿', async () => {
    await renderComposer({
      references: [REFERENCE],
      overlay: <div role="status">undo</div>,
    })
    expect(referenceRemove()).toBeInTheDocument()
    expect(screen.getByText('undo')).toBeInTheDocument()
  })

  it('量出输入条的高度写给舞台，长高了跟着更新，卸载时清掉', async () => {
    // jsdom 没有布局：ResizeObserver 与 getBoundingClientRect 由这里代答（浏览器边界）。
    const callbacks: (() => void)[] = []
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          callbacks.push(callback)
        }
        observe() {}
        unobserve() {}
        disconnect = disconnect
      },
    )
    let height = 180
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ height }) as DOMRect,
    )
    const view = renderWithStudio(
      <div className="studio-layout-v2">
        <StudioMobileComposer templates={TEMPLATES} />
      </div>,
    )
    await settle()
    const layout =
      view.container.querySelector<HTMLElement>('.studio-layout-v2')!
    const value = () =>
      layout.style.getPropertyValue('--studio-mobile-composer-height')
    expect(value()).toBe('180px')

    height = 268
    act(() => callbacks.forEach((callback) => callback()))
    expect(value()).toBe('268px')

    view.unmount()
    expect(disconnect).toHaveBeenCalled()
    expect(value()).toBe('')
  })

  it('模型 chip 写的是当前选中的那一个', async () => {
    await renderComposer()
    expect(modelChip()).toHaveTextContent(MODEL_LABEL('openaiGptImage2'))
  })

  it('多模型照实写「N 个模型」，生成键上一枚角标 = 模型数 × 每模型张数', async () => {
    await renderComposer({
      model: AI_MODELS.OPENAI_GPT_IMAGE_2,
      extra: [AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE],
      batch: 2,
      prompt: 'a cat',
    })
    // 折成一个模型名就等于在手机上把「一次跑几路」这件事藏起来。
    expect(modelChip()).toHaveTextContent(M('modelChipMulti', { count: 2 }))
    expect(
      screen.getByTestId('studio-mobile-generate-count'),
    ).toHaveTextContent('4')
    expect(generateKey()).toHaveAttribute(
      'aria-label',
      text('StudioV2.generateCount', { count: 4 }),
    )
  })

  it('只出一张时不挂角标', async () => {
    await renderComposer({ prompt: 'a cat' })
    expect(screen.queryByTestId('studio-mobile-generate-count')).toBeNull()
    expect(generateKey()).toHaveAttribute('aria-label', M('generate'))
  })

  it('没写提示词：圆键 aria-disabled，无障碍名就是那条原因；⛔ 真禁用（点了要能弹提示）', async () => {
    await renderComposer()
    const button = generateKey()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-label', BLOCKED('promptRequired'))
    expect(button).not.toBeDisabled()

    fireEvent.click(button)
    await settle()
    expect(
      server.requests.filter((r) => r.path === API_ENDPOINTS.STUDIO_GENERATE),
    ).toHaveLength(0)
  })

  it('圆键走的是共用的生成动作：真提交一次', async () => {
    server.on(
      'POST',
      API_ENDPOINTS.STUDIO_GENERATE,
      () => new Promise<Response>(() => {}),
    )
    await renderComposer({ prompt: 'a cat' })
    expect(generateKey()).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(generateKey())
    await settle()
    expect(
      server.requests.filter((r) => r.path === API_ENDPOINTS.STUDIO_GENERATE),
    ).toHaveLength(1)
  })
})

/**
 * 视频档（`studio-video-mobile-request.md`）。同一个组件按模态分支：chip 集合、费用行、
 * 按钮上的时长各自对，而闸门与请求组装仍旧只有 `useStudioGenerateAction` 一份。
 */
describe('StudioMobileComposer · 视频档', () => {
  it('模型 chip 写的是当前那一条型号 —— 视频恒单选', async () => {
    await renderComposer({ video: true })
    // 视频那颗只写型号（`triggerVariantOnly`）：Seedance 2.0 → 「2.0」。
    expect(modelChip()).toHaveTextContent('2.0')
    expect(modelChip()).not.toHaveTextContent(M('modelChipMulti', { count: 2 }))
  })

  it('挂着的素材排在输入框卡里（素材排，⛔ 参考图条）；「＋」里是视频素材那一套', async () => {
    await renderComposer({ video: true, references: [REFERENCE] })
    expect(screen.getByTestId('studio-video-asset-rail')).toBeInTheDocument()
    expect(referenceRemove()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: M('add') }))
    const sheet = await screen.findByRole('dialog')
    expect(
      within(sheet).getByText(text('StudioVideoSlots.pickVideo')),
    ).toBeInTheDocument()
    // 视频「＋」只有模板，⛔ 角色。
    expect(within(sheet).queryByText(text('StudioV2.characters'))).toBeNull()
  })

  it('费用行走共用的一行版报价', async () => {
    await renderComposer({ video: true })
    expect(screen.getByTestId('studio-mobile-cost-line')).toBeInTheDocument()
  })

  it('⭐ 生成键上带这一枪的时长，图片那枚张数角标不出现', async () => {
    await renderComposer({ video: true, duration: 10, prompt: 'a cat walks' })
    expect(
      screen.getByTestId('studio-mobile-generate-duration'),
    ).toHaveTextContent('10s')
    expect(screen.queryByTestId('studio-mobile-generate-count')).toBeNull()
  })

  it('出声不再单独一颗 —— 它在规格抽屉里', async () => {
    await renderComposer({ video: true })
    expect(screen.queryByTestId('studio-mobile-audio-chip')).toBeNull()
    expect(screen.queryByTestId('studio-mobile-audio-ref-chip')).toBeNull()
    expect(screen.queryByTestId('studio-mobile-script-chip')).toBeNull()
  })

  it('⭐ 没选模型：规格 chip 整颗不渲染，模型 chip 写自己的占位（⛔ 禁用原因那句）', async () => {
    await renderComposer({ video: true, model: null })
    expect(screen.queryByTestId('studio-spec-chip')).toBeNull()
    expect(modelChip()).toHaveTextContent(M('modelChipEmpty'))
    expect(modelChip()).not.toHaveTextContent(BLOCKED('modelRequired'))
    expect(generateKey()).toHaveAttribute(
      'aria-label',
      BLOCKED('modelRequired'),
    )
  })

  it('同时在跑的满了：圆键说队列满，原因照样只从共用的生成动作出', async () => {
    // 每一条都交上去了、还在跑（状态一直是 IN_PROGRESS）。
    let n = 0
    server
      .on('POST', API_ENDPOINTS.GENERATE_VIDEO, () => {
        n += 1
        return Response.json({
          success: true,
          data: { jobId: `job-${n}`, requestId: `req-${n}` },
        })
      })
      .on('GET', API_ENDPOINTS.GENERATE_VIDEO_STATUS, (request) =>
        Response.json({
          success: true,
          data: {
            jobId: request.nextUrl.searchParams.get('jobId'),
            status: 'IN_PROGRESS',
          },
        }),
      )
    const studio = await renderComposer({ video: true, prompt: 'a cat walks' })
    for (let i = 0; i < 4; i += 1) {
      act(() => {
        void studio.current.generation.generate({
          mode: 'video',
          video: {
            modelId: AI_MODELS.SEEDANCE_20_VOLCENGINE,
            prompt: 'a cat walks',
            aspectRatio: '16:9',
            duration: 5,
          },
        })
      })
      await settle()
    }
    const button = generateKey()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute(
      'aria-label',
      BLOCKED('videoQueueFull', { max: 4 }),
    )
    expect(button).not.toBeDisabled()
  })
})
