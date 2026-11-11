import { act, fireEvent, screen, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_MODEL_CANNOT_SEE_CODE,
  ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
} from '@/constants/assistant-operator'
import {
  API_ENDPOINTS,
  IMAGE_GENERATION,
  LLM_TEXT_MODEL_IDS,
} from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  STUDIO_GENERATION_DRAG_MIME,
  STUDIO_REFERENCE_DRAG_MIME,
} from '@/constants/studio'
import { closeImageRecipeImport } from '@/hooks/use-image-recipe-import'
import { clearOperatorMentions } from '@/hooks/use-studio-operator-store'
import type { GenerationRecord } from '@/types'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { generationFixture } from '@/test/generation-fixture'
import { richText, text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'
import { DESKTOP_WIDTH, setViewportWidth } from '@/test/viewport'

import { StudioCanvas } from './StudioCanvas'

/**
 * 结果区舞台，全程真的：真生成（提交 → 轮询 → 完成）、真 `GenerationPreview` /
 * `CompareGrid` / 参考轨 / 反馈条、真「满意」评估（缺 key 就地弹真 `QuickSetupDialog`，
 * 存 key → 验 key → 接着评）、真视频发送口（哪几帧这次不发）、真拖放；只假网络、屏宽、时钟，
 * 以及 jsdom 没有的 `URL.createObjectURL`（浏览器 API）。`sonner` 是外部包，换成可观察的
 * `toast` 看「有没有照实说一句」。
 *
 * 修复回归：单张生成完成后 `StudioResultFeedback` 不渲染 —— 守卫曾写成 `!activeRun?.mode`，
 * 而单张生成路径从 B0 起就建 `mode: 'single'` 的 run、完成后不清，于是反馈条永远不出现。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-canvas' }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
  Toaster: () => null,
}))

const ok = (data: unknown) => Response.json({ success: true, data })
const EDIT = (key: string) => text(`StudioImageEdit.${key}`)
const SLOTS = (key: string) => text(`StudioVideoSlots.${key}`)
const SATISFIED = text('StudioResultFeedback.satisfied')
const REFERENCE = 'https://cdn.example.com/reference.png'

let server: ReturnType<typeof fakeStudioServer>
/** 每一枪的任务号 → 它完成时带回的那一条。 */
let jobs: Map<string, GenerationRecord>
let pending: GenerationRecord[]
let evaluations: unknown[]
let evaluateReplies: Array<() => Response>
let savedKeys: unknown[]

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  })
  stubBrowserLayout()
  setViewportWidth(DESKTOP_WIDTH)
  Element.prototype.scrollIntoView = vi.fn()
  // jsdom 没有 object URL（从图读串先拿它当预览）。
  URL.createObjectURL = () => 'blob:dropped'
  URL.revokeObjectURL = () => {}
  clearOperatorMentions()
  closeImageRecipeImport()
  vi.mocked(toast.error).mockClear()
  jobs = new Map()
  pending = []
  evaluations = []
  evaluateReplies = []
  savedKeys = []
  let n = 0
  server = fakeStudioServer()
    .on('POST', API_ENDPOINTS.STUDIO_GENERATE, () => {
      n += 1
      const jobId = `job-${n}`
      const next = pending.shift()
      if (next) jobs.set(jobId, next)
      return ok({ jobId, requestId: `req-${n}` })
    })
    .on('GET', API_ENDPOINTS.STUDIO_GENERATE_STATUS, (request) => {
      const jobId = request.nextUrl.searchParams.get('jobId') ?? ''
      const generation = jobs.get(jobId)
      return ok(
        generation
          ? { jobId, status: 'COMPLETED', generation }
          : { jobId, status: 'IN_PROGRESS' },
      )
    })
    .on('POST', API_ENDPOINTS.GENERATION_EVALUATE, async (request) => {
      evaluations.push(await request.json())
      return evaluateReplies.shift()?.() ?? ok(null)
    })
    .on('GET', API_ENDPOINTS.API_KEYS, () => ok(savedKeys))
    .on('POST', API_ENDPOINTS.API_KEYS, async (request) => {
      const body = (await request.json()) as {
        adapterType: AI_ADAPTER_TYPES
        modelId: string
      }
      const key = {
        id: 'key-new',
        modelId: body.modelId,
        adapterType: body.adapterType,
        providerConfig: getDefaultProviderConfig(body.adapterType),
        label: 'new',
        maskedKey: '••••',
        isActive: true,
        createdAt: new Date().toISOString(),
      }
      savedKeys = [key]
      return ok(key)
    })
    .on(
      'POST',
      `${API_ENDPOINTS.API_KEYS}/:id/verify`,
      (_request, { params }) =>
        params.then(({ id }) => ok({ id, status: 'available' })),
    )
})
afterEach(() => {
  closeImageRecipeImport()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

function renderCanvas(props: React.ComponentProps<typeof StudioCanvas> = {}) {
  const view = renderWithStudio(<StudioCanvas {...props} />)
  return { ...view, studio: view.studio as { current: StudioHandle } }
}

const IMAGE = generationFixture({ id: 'gen-single-1', prompt: 'a cat' })
const resultImage = (generation: GenerationRecord) =>
  document.querySelector(`img[src="${generation.url}"]`)

/** 真出一张：提交 → 轮询一拍 → 完成。 */
async function generate(
  studio: { current: StudioHandle },
  results: GenerationRecord[],
  input: Parameters<StudioHandle['generation']['generate']>[0] = {
    mode: 'image',
    image: {
      modelId: AI_MODELS.GEMINI_PRO_IMAGE,
      freePrompt: 'a cat',
      aspectRatio: '1:1',
    },
  },
) {
  pending.push(...results)
  await act(async () => {
    void studio.current.generation.generate(input)
    await vi.advanceTimersByTimeAsync(0)
  })
  await tick(IMAGE_GENERATION.POLL_INTERVAL_MS)
  await tick()
}

describe('舞台：结果 / 参考图 / 生成中', () => {
  it('有参考图、还没出结果：参考图占住舞台', async () => {
    const { studio } = renderCanvas()
    await tick()
    await act(async () => {
      await studio.current.imageUpload.addFromUrl(REFERENCE)
    })
    await tick()
    expect(screen.getByAltText(EDIT('sourceAlt'))).toHaveAttribute(
      'src',
      REFERENCE,
    )
  })

  it('有参考图、正在生成：舞台让给生成中，⛔ 还铺着参考图', async () => {
    const { studio } = renderCanvas()
    await tick()
    await act(async () => {
      await studio.current.imageUpload.addFromUrl(REFERENCE)
    })
    // 交上去了、一直没出完。
    await act(async () => {
      void studio.current.generation.generate({
        mode: 'image',
        image: {
          modelId: AI_MODELS.GEMINI_PRO_IMAGE,
          freePrompt: 'a cat',
          aspectRatio: '1:1',
        },
      })
      await vi.advanceTimersByTimeAsync(0)
    })
    await tick()
    expect(studio.current.generation.isGenerating).toBe(true)
    expect(screen.queryByAltText(EDIT('sourceAlt'))).toBeNull()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('⭐ 单张出完：结果下面有反馈条（回归：`!activeRun?.mode` 曾把 single 一起挡掉）', async () => {
    const { studio } = renderCanvas()
    await tick()
    await generate(studio, [IMAGE])
    expect(studio.current.generation.activeRun?.mode).toBe('single')
    expect(resultImage(IMAGE)).not.toBeNull()
    expect(screen.getByRole('button', { name: SATISFIED })).toBeInTheDocument()
  })

  it('对比出完：是图墙，⛔ 反馈条（两个分支互斥）', async () => {
    const { studio } = renderCanvas()
    await tick()
    const a = generationFixture({
      id: 'gen-a',
      model: AI_MODELS.GEMINI_PRO_IMAGE,
    })
    const b = generationFixture({
      id: 'gen-b',
      model: AI_MODELS.OPENAI_GPT_IMAGE_2,
      provider: 'openai',
    })
    await generate(studio, [a, b], {
      mode: 'image',
      image: {
        modelId: AI_MODELS.GEMINI_PRO_IMAGE,
        freePrompt: 'a cat',
        aspectRatio: '1:1',
      },
      compareModels: [
        { modelId: AI_MODELS.GEMINI_PRO_IMAGE },
        { modelId: AI_MODELS.OPENAI_GPT_IMAGE_2 },
      ],
    })
    expect(studio.current.generation.activeRun?.mode).toBe('compare')
    // 图墙：两个模型各一格。
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: SATISFIED })).toBeNull()
  })

  it('标签台出的图只在标签台露面：切到自然语言台不见，切回来还在', async () => {
    const { studio } = renderCanvas()
    await tick()
    act(() =>
      studio.current.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' }),
    )
    const nai = generationFixture({
      id: 'gen-nai',
      model: AI_MODELS.NOVELAI_V5_FULL,
      provider: 'novelai',
    })
    await generate(studio, [nai], {
      mode: 'image',
      promptDialect: 'tags',
      image: {
        modelId: AI_MODELS.NOVELAI_V5_FULL,
        freePrompt: '1girl',
        aspectRatio: '1:1',
      },
    })
    expect(resultImage(nai)).not.toBeNull()

    act(() =>
      studio.current.dispatch({
        type: 'SET_PROMPT_DIALECT',
        payload: 'natural',
      }),
    )
    expect(resultImage(nai)).toBeNull()
    expect(screen.queryByRole('button', { name: SATISFIED })).toBeNull()

    act(() =>
      studio.current.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' }),
    )
    expect(resultImage(nai)).not.toBeNull()
    expect(studio.current.generation.lastGeneration?.id).toBe('gen-nai')
  })
})

/**
 * 「满意」评估跑不了（owner 2026-10-15「全跟助手」）：缺 key 就地弹那一家的配置（Hard Rule 8，
 * 与助手面板错误条同一跳），配好接着评；看不了图这种配 key 解决不了的，照实说一句。
 */
describe('「满意」评估缺 key', () => {
  const quickSetup = () =>
    screen
      .queryAllByRole('dialog')
      .find((dialog) =>
        within(dialog).queryByLabelText(text('QuickSetup.step2')),
      ) ?? null
  const providerOf = (dialog: HTMLElement) =>
    within(dialog).getAllByRole('link')[0]?.textContent

  async function satisfiedOnResult() {
    const view = renderCanvas()
    await tick()
    await generate(view.studio, [IMAGE])
    fireEvent.click(screen.getByRole('button', { name: SATISFIED }))
    await tick()
    await tick()
    return view
  }

  it('一把 key 都没有：就地弹免费档那一家（Gemini），配好接着评，⛔ 不改工作台模型', async () => {
    evaluateReplies.push(() =>
      Response.json(
        {
          success: false,
          error: 'No API key available.',
          errorCode: 'MISSING_API_KEY',
        },
        { status: 400 },
      ),
    )
    const { studio } = await satisfiedOnResult()
    // 工作台此刻在用 GPT Image 2 出图；配的是助手那一家，⛔ 顺手换掉它。
    const optionBefore = `workspace:${AI_MODELS.OPENAI_GPT_IMAGE_2}`
    act(() =>
      studio.current.dispatch({ type: 'SET_OPTION_ID', payload: optionBefore }),
    )

    const dialog = quickSetup()
    expect(dialog).not.toBeNull()
    expect(providerOf(dialog!)).toBe(
      getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI).label,
    )
    expect(toast.error).not.toHaveBeenCalled()

    fireEvent.change(within(dialog!).getByLabelText(text('QuickSetup.step2')), {
      target: { value: 'test-key-value-123' },
    })
    fireEvent.click(
      within(dialog!).getByRole('button', { name: text('QuickSetup.verify') }),
    )
    for (let i = 0; i < 6; i += 1) await tick()

    expect(savedKeys).toMatchObject([
      {
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      },
    ])
    expect(evaluations).toEqual([
      { generationId: IMAGE.id },
      { generationId: IMAGE.id },
    ])
    expect(studio.current.state.selectedOptionId).toBe(optionBefore)
  })

  it('选定的模型缺 key：就地弹**它那一家**，⛔ 不换别家', async () => {
    evaluateReplies.push(() =>
      Response.json(
        {
          success: false,
          error: 'no key',
          errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
          missingKey: {
            adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
            modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
          },
        },
        { status: 400 },
      ),
    )
    await satisfiedOnResult()
    const dialog = quickSetup()
    expect(dialog).not.toBeNull()
    expect(providerOf(dialog!)).toBe(
      getDefaultProviderConfig(AI_ADAPTER_TYPES.ANTHROPIC).label,
    )
  })

  it('看不了图：照实说一句（配 key 解决不了），不弹配置', async () => {
    evaluateReplies.push(() =>
      Response.json(
        {
          success: false,
          error: 'cannot see',
          errorCode: ASSISTANT_MODEL_CANNOT_SEE_CODE,
        },
        { status: 400 },
      ),
    )
    await satisfiedOnResult()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(quickSetup()).toBeNull()
  })
})

/**
 * 视频台桌面（底部输入框，owner 2026-09-27 视频台 A）：素材在输入框里，舞台没有参考轨。
 * 还没出过结果时，挂了首帧就把首帧当封面；⛔ 不铺参考图，也没有「编辑这张」（那是图片的）。
 */
describe('视频台桌面（没有参考轨）', () => {
  const FIRST = 'https://cdn.example.com/f.png'
  /** 封面下那一行（富文本：「首帧」加粗、后半句是字）。 */
  const posterLine = (key: string) => (_: string, node: Element | null) =>
    node?.tagName === 'P' &&
    node.textContent === richText(`StudioVideoSlots.poster.${key}`)
  const LAST = 'https://cdn.example.com/l.png'

  async function videoStage(
    model: string,
    first: string | null,
    last: string | null,
    /** 输入框里另挂一张普通参考图（舞台 ⛔ 把它铺上来）。 */
    withReference = true,
  ) {
    const view = renderCanvas({ referenceRail: false })
    await tick()
    act(() => {
      const { dispatch } = view.studio.current
      dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
      dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${model}` })
      dispatch({
        type: 'SET_VIDEO_FRAME_SLOT',
        payload: { slot: 'first', url: first },
      })
      dispatch({
        type: 'SET_VIDEO_FRAME_SLOT',
        payload: { slot: 'last', url: last },
      })
    })
    if (withReference)
      await act(async () => {
        await view.studio.current.imageUpload.addFromUrl(REFERENCE)
      })
    await tick()
    return view
  }

  it('还没出结果、挂了首尾帧：首帧当封面、尾帧缩在右下，说一句视频从这一帧开始', async () => {
    // MiniMax H3：首帧 + 尾帧两格。
    await videoStage(AI_MODELS.MINIMAX_H3_MAX_TURBO, FIRST, LAST)
    expect(screen.getByAltText(SLOTS('firstFrame'))).toHaveAttribute(
      'src',
      FIRST,
    )
    expect(screen.getByAltText(SLOTS('lastFrame'))).toHaveAttribute('src', LAST)
    expect(screen.getByText(posterLine('withLast'))).toBeInTheDocument()
    expect(screen.queryByAltText(EDIT('sourceAlt'))).toBeNull()
    expect(screen.queryByText(EDIT('stageEditThis'))).toBeNull()
  })

  it('换到只收一张图的型号：尾帧这次不发，⛔ 还缩在右下角、说明也不提尾帧', async () => {
    // Kling V3 Pro：只有首帧那一格（原先用的 fal Seedance 2.0 已于 2026-11-11 退役，
    //   官方两站的 Seedance 关键帧档都收首尾帧）。⚠ 不另挂参考图 —— 挂了参考图发送口会换到参考端点。
    await videoStage(AI_MODELS.KLING_V3_PRO, FIRST, LAST, false)
    expect(screen.getByAltText(SLOTS('firstFrame'))).toBeInTheDocument()
    expect(screen.queryByAltText(SLOTS('lastFrame'))).toBeNull()
    expect(screen.getByText(posterLine('firstOnly'))).toBeInTheDocument()
  })

  it('没挂首帧：走正常的结果区，⛔ 把参考图铺上来', async () => {
    await videoStage(AI_MODELS.SEEDANCE_20_VOLCENGINE, null, null)
    expect(screen.queryByAltText(EDIT('sourceAlt'))).toBeNull()
    expect(screen.queryByAltText(SLOTS('firstFrame'))).toBeNull()
  })
})

describe('拖放（原生 HTML5）', () => {
  function dragData(entries: Record<string, string>, files: File[] = []) {
    const types = Object.keys(entries)
    if (files.length > 0) types.push('Files')
    return { types, files, getData: (type: string) => entries[type] ?? '' }
  }
  const stageOf = (container: HTMLElement) =>
    container.querySelector('[data-studio-canvas]') ??
    (container.firstElementChild as HTMLElement)

  it('画廊的图拖到舞台：加参考图', async () => {
    const { studio, container } = renderCanvas()
    await tick()
    const stage = stageOf(container) as HTMLElement
    const dataTransfer = dragData({
      [STUDIO_GENERATION_DRAG_MIME]: JSON.stringify({
        url: 'https://cdn.example.com/a.png',
        id: 'gen-a',
      }),
    })
    fireEvent.dragEnter(stage, { dataTransfer })
    fireEvent.drop(stage, { dataTransfer })
    await tick()
    expect(studio.current.imageUpload.referenceImages).toEqual([
      'https://cdn.example.com/a.png',
    ])
  })

  it('输入框参考图条里的缩略图拖到舞台：⛔ 不再加一遍，也不去读图', async () => {
    const { studio, container } = renderCanvas()
    await tick()
    fireEvent.drop(stageOf(container) as HTMLElement, {
      dataTransfer: dragData({
        [STUDIO_REFERENCE_DRAG_MIME]: 'https://cdn.example.com/a.png',
      }),
    })
    await tick()
    expect(studio.current.imageUpload.referenceImages).toEqual([])
    expect(
      server.requests.some(
        (r) => r.path === API_ENDPOINTS.IMAGE_RECIPE_PREPARE,
      ),
    ).toBe(false)
  })

  it('电脑里的图拖到图片台舞台：去读这张图的配方；视频台不接', async () => {
    server.on(
      'POST',
      API_ENDPOINTS.IMAGE_RECIPE_PREPARE,
      () => new Promise<Response>(() => {}),
    )
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const { studio, container } = renderCanvas()
    await tick()
    fireEvent.drop(stageOf(container) as HTMLElement, {
      dataTransfer: dragData({}, [file]),
    })
    await tick()
    const reads = () =>
      server.requests.filter(
        (r) => r.path === API_ENDPOINTS.IMAGE_RECIPE_PREPARE,
      )
    expect(reads()).toHaveLength(1)

    act(() => {
      closeImageRecipeImport()
      studio.current.dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
    })
    fireEvent.drop(stageOf(container) as HTMLElement, {
      dataTransfer: dragData({}, [file]),
    })
    await tick()
    expect(reads()).toHaveLength(1)
  })
})
