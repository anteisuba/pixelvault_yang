import { useLayoutEffect, type ReactNode } from 'react'
import { act, fireEvent, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { SAMPLE_PROMPT_STORAGE_KEY } from '@/constants/sample-prompts'
import {
  STUDIO_GUIDE_SEEN_STORAGE_KEY,
  STUDIO_GENERATION_DRAG_MIME,
  STUDIO_TEMPLATES_PANEL_ID,
} from '@/constants/studio'
import { WORKFLOW_IDS, type WorkflowId } from '@/constants/workflows'
import {
  useStudioContext,
  type VideoAudioReference,
} from '@/contexts/studio-context'
import {
  StudioOperatorHostProvider,
  type StudioOperatorHost,
} from '@/contexts/studio-operator-host'
import { setOperatorPrimed } from '@/hooks/use-studio-operator-store'
import { ImageIcon } from '@/components/icons'
import { renderWithApp } from '@/test/app-harness'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  settle,
  StudioProviders,
  type StudioHandle,
} from '@/test/studio-harness'
import { DESKTOP_WIDTH, setViewportWidth } from '@/test/viewport'

import { StudioPromptArea } from './StudioPromptArea'

/**
 * 桌面提示词区，全程真的：真工作台、真 `useStudioGenerateAction`（闸门 / 原因 / 请求组装）、
 * 真 `PromptInput`（根容器冒泡抢焦点那一手也是真的）、真参考图上传 / 拖放、真视频素材与
 * 发送口、真模型名单；只假网络（工作台挂载那几条、`POST /api/generate-video` 等）与屏宽。
 * 「发了什么」看的是真请求体。
 *
 * - 助手宿主给的是一份空宿主（参数栏里的变更轨要它在；这里不验助手）。
 * - `sonner` 是外部包：只换成可观察的 `toast` 看「有没有弹」。
 *
 * ⚠ 没有迁的：
 * - 负面提示词那几条 class 断言（`grid-rows-[0fr]`、`h-[46px]` 之类）：那是皮肤，不是结果；
 *   改成断言展开 / 收起与输入写回。
 * - 「图片工作流下的视频载荷不带 workflowId」：真工作台里选图片工作流就落到图片模态，
 *   视频提交在那个状态下到不了。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-prompt' }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
  Toaster: () => null,
}))

const PA = (key: string, values?: Record<string, string | number>) =>
  text(`StudioPromptArea.${key}`, values)
const NEGATIVE = PA('negativePromptLabel')
const GENERATE = text('StudioV2.generate')

/** 生产树里提示词区长在助手宿主里（参数栏的变更轨要它）；这里给一份什么都不做的。 */
const EMPTY_OPERATOR_HOST: StudioOperatorHost = {
  workspace: 'image-natural',
  domain: 'image',
  face: {
    domainIcon: ImageIcon,
    contextLine: () => '',
    emptyLine: '',
    inputPlaceholder: '',
    specLine: true,
  },
  buildSnapshot: () => ({ prompt: '', availableModels: [] }),
  results: [],
  referenceImages: [],
  open: false,
  setOpen: () => {},
  apply: {
    getState: () => ({ prompt: '', advancedParams: {} }),
    dispatch: () => {},
    resolveOptionId: () => null,
    addReference: () => {},
    removeReference: () => {},
    addAudioReference: () => {},
    removeAudioReference: () => {},
    setSound: () => {},
    mountUserUrl: () => {},
    unmountUserUrl: () => {},
    setPrimed: setOperatorPrimed,
  },
}

let server: ReturnType<typeof fakeStudioServer>
let videoBodies: Record<string, unknown>[]

beforeEach(() => {
  stubBrowserLayout()
  setViewportWidth(DESKTOP_WIDTH)
  localStorage.clear()
  localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
  // 首次进来会往空提示词里填一句示例；除了专门验它的那条，都当作来过了。
  localStorage.setItem(SAMPLE_PROMPT_STORAGE_KEY, '1')
  Element.prototype.scrollIntoView = vi.fn()
  vi.mocked(toast.info).mockClear()
  vi.mocked(toast.error).mockClear()
  videoBodies = []
  let jobs = 0
  server = fakeStudioServer()
    .on('POST', API_ENDPOINTS.GENERATE_VIDEO, async (request) => {
      videoBodies.push(await request.json())
      jobs += 1
      return Response.json({
        success: true,
        data: { jobId: `job-${jobs}`, requestId: `req-${jobs}` },
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
})
afterEach(() => vi.unstubAllGlobals())

interface AreaProps {
  layout?: 'column' | 'bottom'
  templatesOpen?: boolean
  onToggleTemplates?: () => void
}

/** 真工作台里挂提示词区；`rerender` 换 props 时工作台状态不丢。 */
function renderArea(props: AreaProps = {}) {
  const studio = { current: null as unknown as StudioHandle }
  function Area({
    layout = 'column',
    templatesOpen = false,
    onToggleTemplates = () => {},
  }: AreaProps) {
    const ctx = useStudioContext()
    useLayoutEffect(() => {
      studio.current = ctx
    })
    return (
      <StudioOperatorHostProvider host={EMPTY_OPERATOR_HOST}>
        <StudioPromptArea
          layout={layout}
          templates={{ open: templatesOpen, onToggle: onToggleTemplates }}
          characterCards={{ open: false, onToggle: () => {} }}
        />
      </StudioOperatorHostProvider>
    )
  }
  const view = renderWithApp(<Area {...props} />, { inner: StudioProviders })
  return {
    studio,
    rerender: (next: AreaProps) => view.rerender(<Area {...next} />),
  }
}

interface Setup {
  workflow?: WorkflowId
  model?: string | null
  prompt?: string
  advancedParams?: Record<string, unknown>
  audioRefs?: VideoAudioReference[]
  generateAudio?: boolean | null
}

/** 摆好工作流（决定模态）、模型、提示词、高级参数、音频参考。 */
async function arrange(
  studio: { current: StudioHandle },
  {
    workflow = WORKFLOW_IDS.QUICK_IMAGE,
    model,
    prompt,
    advancedParams,
    audioRefs,
    generateAudio,
  }: Setup,
) {
  await settle()
  act(() => {
    const { dispatch } = studio.current
    dispatch({ type: 'SET_SELECTED_WORKFLOW_ID', payload: workflow })
  })
  act(() => {
    const { dispatch } = studio.current
    if (model !== undefined)
      dispatch({
        type: 'SET_OPTION_ID',
        payload: model ? `workspace:${model}` : null,
      })
    if (prompt !== undefined) dispatch({ type: 'SET_PROMPT', payload: prompt })
    if (advancedParams)
      dispatch({ type: 'SET_ADVANCED_PARAMS', payload: advancedParams })
    if (audioRefs)
      dispatch({ type: 'SET_VIDEO_AUDIO_REFS', payload: audioRefs })
    if (generateAudio !== undefined)
      dispatch({ type: 'SET_VIDEO_GENERATE_AUDIO', payload: generateAudio })
  })
  await settle()
}

async function renderArranged(setup: Setup = {}, props: AreaProps = {}) {
  const view = renderArea(props)
  await arrange(view.studio, setup)
  return view
}

describe('负面提示词（参数栏）', () => {
  // 2026-08-22 owner：「我没看到有负面提示词的地方」—— 字段活着、门没开。折叠行是那道门。
  it('⭐ 有入口：折叠行收着时不渲染输入框', async () => {
    await renderArranged()
    const row = screen.getByRole('button', { name: new RegExp(NEGATIVE) })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(row).toHaveAttribute('aria-controls', 'studio-negative-prompt-input')
    expect(screen.queryByRole('textbox', { name: NEGATIVE })).toBeNull()
  })

  it('展开后能写，写回 advancedParams，⚠ 同住一个对象的参数不丢', async () => {
    const { studio } = await renderArranged({ advancedParams: { seed: 1234 } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(NEGATIVE) }))
    const input = screen.getByRole('textbox', { name: NEGATIVE })
    expect(input).toHaveAttribute('id', 'studio-negative-prompt-input')
    fireEvent.change(input, { target: { value: 'blurry' } })
    expect(studio.current.state.advancedParams).toMatchObject({
      seed: 1234,
      negativePrompt: 'blurry',
    })
  })

  // 2026-08-22 owner：「甚至无法点击」—— `PromptInput` 根容器在冒泡时把焦点抢回主提示词框。
  it('⛔ 点负面框时容器不许把焦点抢回主提示词框', async () => {
    await renderArranged()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(NEGATIVE) }))
    const negative = screen.getByRole('textbox', { name: NEGATIVE })
    negative.focus()
    fireEvent.click(negative)
    expect(document.activeElement).toBe(negative)
    expect(document.activeElement).not.toBe(
      screen.getByRole('textbox', { name: text('StudioForm.promptLabel') }),
    )
  })

  it('⛔ 展开后不再重复同一句 placeholder', async () => {
    await renderArranged()
    const row = screen.getByRole('button', { name: new RegExp(NEGATIVE) })
    expect(row).toHaveTextContent(PA('negativePromptPlaceholder'))
    fireEvent.click(row)
    expect(row).not.toHaveTextContent(PA('negativePromptPlaceholder'))
    expect(screen.getByRole('textbox', { name: NEGATIVE })).toHaveAttribute(
      'placeholder',
      PA('negativePromptPlaceholder'),
    )
  })

  it('清空写成「没设过」而不是空串（空串会被当成设过一个空负面带进请求）', async () => {
    const { studio } = await renderArranged({
      advancedParams: { negativePrompt: 'bad hands' },
    })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(NEGATIVE) }))
    fireEvent.change(screen.getByRole('textbox', { name: NEGATIVE }), {
      target: { value: '' },
    })
    expect(studio.current.state.advancedParams.negativePrompt).toBeUndefined()
  })
})

/** 底部输入框布局（owner 2026-09-26，图片自然语言台桌面）。 */
describe('底部输入框布局', () => {
  it('负面提示词是工具行的一颗 chip：点开出现一行，写回整个对象', async () => {
    const { studio } = await renderArranged(
      { advancedParams: { seed: 7 } },
      { layout: 'bottom' },
    )
    const chip = screen.getByRole('button', { name: NEGATIVE })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('textbox', { name: NEGATIVE })).toBeNull()

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByRole('textbox', { name: NEGATIVE }), {
      target: { value: 'blurry' },
    })
    expect(studio.current.state.advancedParams).toMatchObject({
      seed: 7,
      negativePrompt: 'blurry',
    })
  })

  it('已经写了负面词时那一行常驻，不用再点', async () => {
    await renderArranged(
      { advancedParams: { negativePrompt: 'watermark' } },
      { layout: 'bottom' },
    )
    expect(screen.getByRole('textbox', { name: NEGATIVE })).toHaveValue(
      'watermark',
    )
  })

  it('① 圆键：被挡住时仍可点，点了左边出一行缺什么，⛔ 再弹 toast', async () => {
    await renderArranged(
      { model: AI_MODELS.OPENAI_GPT_IMAGE_2, prompt: '' },
      { layout: 'bottom' },
    )
    const button = screen.getByRole('button', {
      name: new RegExp(`^${GENERATE} · `),
    })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(screen.queryByText(PA('blocked.promptRequired'))).toBeNull()

    fireEvent.click(button)
    expect(screen.getByText(PA('blocked.promptRequired'))).toBeInTheDocument()
    // 同一件事只说一遍：左边那行说了，就不再弹 toast。
    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('① 圆键生成中是 ■ 停止：点一下取消整轮，⛔ 再发一枪', async () => {
    server.on(
      'POST',
      API_ENDPOINTS.STUDIO_GENERATE,
      () => new Promise<Response>(() => {}),
    )
    const { studio } = await renderArranged(
      { model: AI_MODELS.OPENAI_GPT_IMAGE_2, prompt: 'a cat' },
      { layout: 'bottom' },
    )
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${GENERATE} · `) }),
    )
    await settle()
    expect(studio.current.generation.isGenerating).toBe(true)

    fireEvent.click(
      screen.getByRole('button', { name: text('GenerationCancel.cancelAll') }),
    )
    await settle()
    expect(studio.current.generation.isGenerating).toBe(false)
    expect(
      server.requests.filter((r) => r.path === API_ENDPOINTS.STUDIO_GENERATE),
    ).toHaveLength(1)
  })
})

describe('示例提示词', () => {
  it('第一次来、提示词是空的：填一句示例，并记下来过了', async () => {
    localStorage.removeItem(SAMPLE_PROMPT_STORAGE_KEY)
    const { studio } = renderArea()
    await settle()
    expect(studio.current.state.prompt).toBe(PA('samplePrompts.quickImage'))
    expect(localStorage.getItem(SAMPLE_PROMPT_STORAGE_KEY)).toBe('1')
  })

  it('来过了就不再填', async () => {
    const { studio } = renderArea()
    await settle()
    expect(studio.current.state.prompt).toBe('')
  })
})

describe('参考图', () => {
  it('参考图面板开着时按它的触发键，⛔ 先被「点外面就收」关掉', async () => {
    const { studio } = await renderArranged()
    act(() =>
      studio.current.dispatch({ type: 'OPEN_PANEL', payload: 'refImage' }),
    )
    fireEvent.pointerDown(
      screen.getByRole('button', { name: text('ImageChip.label') }),
    )
    expect(studio.current.state.panels.refImage).toBe(true)
  })

  it('从结果区拖进提示词框的图挂成参考图', async () => {
    const { studio } = await renderArranged()
    fireEvent.drop(screen.getByRole('group'), {
      dataTransfer: {
        types: [STUDIO_GENERATION_DRAG_MIME],
        getData: (type: string) =>
          type === STUDIO_GENERATION_DRAG_MIME
            ? JSON.stringify({ url: 'https://cdn.example.com/reference.png' })
            : '',
        files: [],
      },
    })
    await settle()
    expect(studio.current.imageUpload.referenceImages).toContain(
      'https://cdn.example.com/reference.png',
    )
  })

  it('粘贴进来的图还在上传时就有「上传中」，⛔ 等传完才有反馈', async () => {
    server.on(
      'POST',
      API_ENDPOINTS.UPLOAD_IMAGE_DIRECT,
      () => new Promise<Response>(() => {}),
    )
    await renderArranged()
    const file = new File(['png'], 'paste.png', { type: 'image/png' })
    fireEvent.paste(
      screen.getByRole('textbox', { name: text('StudioForm.promptLabel') }),
      {
        clipboardData: {
          files: [file],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
          types: ['Files'],
          getData: () => '',
        },
      },
    )
    await settle()
    expect(screen.getByRole('status')).toHaveTextContent(
      text('ImageUpload.uploading'),
    )
  })
})

/** 厂商声明的上限保留前置闸：那是真实的 encoder 限制（与请求边界的 32000 无关）。 */
it('提示词按型号的上限卡（Gemini 3 Pro Image = 8000）：超了显示字数、生成键禁用', async () => {
  await renderArranged({
    model: AI_MODELS.GEMINI_PRO_IMAGE,
    prompt: 'a'.repeat(8001),
  })
  expect(screen.getByText('8001/8000')).toBeInTheDocument()
  const generate = screen.getByRole('button', {
    name: new RegExp(`^${GENERATE}$`),
  })
  expect(generate).toBeDisabled()
})

/**
 * 视频台 A（owner 2026-09-27「素材在输入框里」）：工具行左组是 素材 · 模板，⛔ 没有参考图
 * chip；「模板」开合的是舞台上那块面板（宿主持有开合）。
 */
describe('视频台（底部输入框）', () => {
  const video = { workflow: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO }

  it('工具行左组是 素材 · 模板，⛔ 没有参考图', async () => {
    await renderArranged(video, { layout: 'bottom' })
    expect(screen.getByTestId('video-asset-add')).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: text('PromptLibrary.templatePicker'),
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: text('ImageChip.label') }),
    ).toBeNull()
  })

  it('「模板」开合舞台上的模板面板（⛔ 弹窗）', async () => {
    const onToggleTemplates = vi.fn()
    const view = await renderArranged(video, {
      layout: 'bottom',
      onToggleTemplates,
    })
    const chip = () =>
      screen.getByRole('button', { name: text('PromptLibrary.templatePicker') })
    expect(chip()).toHaveAttribute('aria-expanded', 'false')
    expect(chip()).not.toHaveAttribute('aria-haspopup')
    fireEvent.click(chip())
    expect(onToggleTemplates).toHaveBeenCalledTimes(1)

    view.rerender({ layout: 'bottom', templatesOpen: true, onToggleTemplates })
    expect(chip()).toHaveAttribute('aria-controls', STUDIO_TEMPLATES_PANEL_ID)
  })

  it('拖进输入框的图走视频素材那条：进素材排，⛔ 挂成图片参考', async () => {
    const { studio } = await renderArranged(
      { ...video, model: AI_MODELS.SEEDANCE_25_VOLCENGINE },
      { layout: 'bottom' },
    )
    const url = 'https://cdn.example.com/frame.png'
    fireEvent.drop(screen.getByRole('group'), {
      dataTransfer: {
        types: ['text/uri-list'],
        getData: (type: string) => (type === 'text/uri-list' ? url : ''),
        files: [],
      },
    })
    await settle()
    const rail = screen.getByTestId('studio-video-asset-rail')
    expect(rail.querySelector(`img[src="${url}"]`)).not.toBeNull()
    expect(
      screen.queryByRole('button', {
        name: text('ImageChip.removeReferenceImage', { index: 1 }),
      }),
    ).toBeNull()
    expect(studio.current.state.outputType).toBe('video')
  })
})

describe('视频提交载荷', () => {
  async function submitVideo(
    setup: Setup,
    sentModel = setup.model ?? AI_MODELS.SEEDANCE_25_VOLCENGINE,
  ) {
    await renderArranged(
      {
        model: AI_MODELS.SEEDANCE_25_VOLCENGINE,
        prompt: 'Make a cinematic establishing shot',
        ...setup,
      },
      { layout: 'bottom' },
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^${GENERATE} · `),
      }),
    )
    await settle()
    await settle()
    expect(videoBodies).toHaveLength(1)
    // 跑的就是选中的那一条型号（⛔ 落回目录里别的默认）。
    expect(videoBodies[0]).toMatchObject({ modelId: sentModel })
    return videoBodies[0]!
  }

  it.each([
    WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    WORKFLOW_IDS.CHARACTER_TO_VIDEO,
  ])('带上视频工作流 %s', async (workflow) => {
    expect(await submitVideo({ workflow })).toMatchObject({
      workflowId: workflow,
    })
  })

  /**
   * 台账 A：schema / service / worker 早就收 `audioUrls` + `audioBindings`，断点是请求组装
   * 不填它们 —— 界面上挂得上、请求里一个字都没有，而且三绿。
   */
  it('挂上的音频送进 audioUrls，并按归属填 audioBindings.characterName', async () => {
    const body = await submitVideo(
      {
        workflow: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
        audioRefs: [
          {
            id: 'a1',
            url: 'https://cdn.example.com/hinata.mp3',
            fileName: 'hinata.mp3',
            ownerName: 'ひなた',
          },
          {
            id: 'a2',
            url: 'https://cdn.example.com/narration.mp3',
            fileName: 'narration.mp3',
          },
        ],
      },
      // 挂了音频 → 发送口换到同一型号的参考端点（它收音频）。
      AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
    )
    expect(body.audioUrls).toEqual([
      'https://cdn.example.com/hinata.mp3',
      'https://cdn.example.com/narration.mp3',
    ])
    // ⚠ 没归属的那条不带 characterName（schema 上是 `.min(1).optional()`）。
    expect(body.audioBindings).toEqual([
      { url: 'https://cdn.example.com/hinata.mp3', characterName: 'ひなた' },
      { url: 'https://cdn.example.com/narration.mp3' },
    ])
  })

  it('⛔ 这个型号不收音频：挂着的音频这次不发', async () => {
    const body = await submitVideo({
      workflow: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
      model: AI_MODELS.MINIMAX_H3_MAX_TURBO,
      audioRefs: [
        {
          id: 'a1',
          url: 'https://cdn.example.com/hinata.mp3',
          fileName: 'hinata.mp3',
        },
      ],
    })
    expect(body).not.toHaveProperty('audioUrls')
    expect(body).not.toHaveProperty('audioBindings')
  })

  it('一条都没挂时，两个字段都不出现', async () => {
    const body = await submitVideo({
      workflow: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    })
    expect(body).not.toHaveProperty('audioUrls')
    expect(body).not.toHaveProperty('audioBindings')
  })

  /** `generateAudio` 三态：「没设过」与发一个 `false` 在目录默认为 true 的模型上相反。 */
  it('没设过就不发 generateAudio —— 留给模型目录默认', async () => {
    const body = await submitVideo({
      workflow: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
      generateAudio: null,
    })
    expect(body).not.toHaveProperty('generateAudio')
  })

  it('用户拨过就发那个显式布尔', async () => {
    const body = await submitVideo({
      workflow: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
      generateAudio: false,
    })
    expect(body.generateAudio).toBe(false)
  })
})
