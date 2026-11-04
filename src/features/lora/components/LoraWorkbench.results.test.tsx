import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { IMAGE_GENERATION } from '@/constants/config'
import { GENERATION_COMPLETE_TOTAL_MS } from '@/constants/generation-progress'
import { AI_MODELS } from '@/constants/models'
import type { LoraAssetRecord } from '@/types'

import { __resetCivitaiLibraryCacheForTests } from '@/features/lora/hooks/use-civitai-lora-library'
import { __resetMinedPromptsCacheForTests } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { __resetModelDescriptionCacheForTests } from '@/features/lora/hooks/use-civitai-model-description'
import { FAKE_GENERATION } from '@/test/api-helpers'
import { runIdleTasksImmediately } from '@/test/api-keys'
import {
  LORA_STACK_CLERK_ID,
  loraAsset,
  seedLoraStack,
} from '@/test/lora-stack'
import {
  generateButton,
  loraWorkbenchServer,
  mountedLora,
  mountedPills,
  negativeBox,
  promptBox,
  renderBench as renderWith,
  type BenchState,
} from '@/test/lora-workbench'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import { LoraWorkbench } from './LoraWorkbench'

// ── 出图之后：结果台（胶片条 / 看大图 / 问助手 / 存成模板）、`?template=` 装回、
// 出图中 / 失败怎么说、手机上结果卡怎么摆。
//
// 真出图 hook：服务端收单（`studioGenerateAPI`）后按轮询间隔问状态
// （`checkImageGenerationStatusAPI`），轮询用 fake timers 推。其余全走假服务端。

// Runner 底模由部署环境开（Vercel 上 NEXT_PUBLIC_FF_COMFY_RUNNER=true）；常量表在
// import 时读它，所以要赶在 import 之前设。
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FF_COMFY_RUNNER = 'true'
})
afterAll(() => {
  delete process.env.NEXT_PUBLIC_FF_COMFY_RUNNER
})

// 和真 next-intl 一样：同一个命名空间回同一个 `t`；`has` 认得每一句；带 `detail`
// 的那句把原话拼在后面（看得出转述的是哪句）。
const intl = vi.hoisted(() => {
  const byNamespace = new Map<string, unknown>()
  return {
    t(ns: string) {
      let t = byNamespace.get(ns)
      if (!t) {
        t = Object.assign(
          (key: string, values?: { detail?: string }) =>
            values?.detail ? `${ns}:${key}:${values.detail}` : `${ns}:${key}`,
          { has: () => true, rich: (key: string) => `${ns}:${key}` },
        )
        byNamespace.set(ns, t)
      }
      return t
    },
    formatter: {
      number: (value: number) => String(value),
      relativeTime: () => 'relative-time',
      dateTime: () => 'date',
    },
  }
})
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => intl.t(ns),
  useFormatter: () => intl.formatter,
  useLocale: () => 'zh',
}))
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
  },
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
  useUser: () => ({ isLoaded: true, user: { id: LORA_STACK_CLERK_ID } }),
}))
// 网址：首帧读 `search`；写回网址那一跳记下来。
const nav = vi.hoisted(() => ({
  search: 'section=generate',
  replace: vi.fn(),
  push: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/lora',
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
}))

const api = vi.hoisted(() => ({
  studioGenerateAPI: vi.fn(),
  checkImageGenerationStatusAPI: vi.fn(),
  cancelGenerationsAPI: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  ...api,
}))

let bench: BenchState
let server: ReturnType<typeof loraWorkbenchServer>['server']

beforeEach(() => {
  setViewportWidth(DESKTOP_WIDTH)
  runIdleTasksImmediately()
  window.localStorage.clear()
  window.sessionStorage.clear()
  __resetCivitaiLibraryCacheForTests()
  __resetMinedPromptsCacheForTests()
  __resetModelDescriptionCacheForTests()
  nav.search = 'section=generate'
  nav.replace.mockReset()
  nav.push.mockReset()
  vi.mocked(toast.error).mockReset()
  ;({ bench, server } = loraWorkbenchServer())
  seedLoraStack([{ asset: mountedLora(), scale: 1 }])
  api.studioGenerateAPI.mockReset()
  // 没另说就一直在出（轮询回「进行中」）。
  api.checkImageGenerationStatusAPI.mockReset().mockResolvedValue({
    success: true,
    data: { jobId: 'job', status: 'IN_PROGRESS' },
  })
  api.cancelGenerationsAPI.mockReset().mockResolvedValue({
    success: true,
    data: { cancelled: [], alreadyFinished: [], notFound: [] },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const renderBench = (pills = 1) => renderWith(<LoraWorkbench />, pills)
const resultCard = () => screen.getByTestId('lora-result-card')
const composerCard = () => screen.getByTestId('lora-composer-card')
const resultBox = () => screen.queryByTestId('lora-result-main')

/** 渲染完再接管时钟（渲染期的 waitFor 照旧走真时钟）：轮询与完成节拍都靠它推。 */
function takeOverPolling() {
  vi.useFakeTimers()
}

const generation = (id: string, url: string, seed: number) => ({
  ...FAKE_GENERATION,
  id,
  url,
  seed,
})

/** 出一张图：服务端收单 → 下一拍轮询回「出好了」。 */
async function generateOnce(record: ReturnType<typeof generation>) {
  const jobId = `job-${record.id}`
  api.studioGenerateAPI.mockResolvedValueOnce({
    success: true,
    data: { jobId },
  })
  api.checkImageGenerationStatusAPI.mockResolvedValueOnce({
    success: true,
    data: { jobId, status: 'COMPLETED', generation: record },
  })
  fireEvent.click(generateButton())
  await act(async () => {
    await vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS)
  })
  // 进度线 合拢 → 停 → 淡出，新图才露出来。
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GENERATION_COMPLETE_TOTAL_MS + 100)
  })
}

/** 按出图：服务端收了这一单，还在出。 */
async function startGenerating() {
  api.studioGenerateAPI.mockResolvedValueOnce({
    success: true,
    data: { jobId: 'job-1' },
  })
  fireEvent.click(generateButton())
  await waitFor(() => expect(api.studioGenerateAPI).toHaveBeenCalled())
}

describe('LoraWorkbench 结果台 — 出过的图', () => {
  it('D7③: records each successful generation into the session filmstrip and switches the shown result', async () => {
    await renderBench()
    takeOverPolling()

    // 摆法 B：新出的放正中，之前的缩成一条（新的在前）。
    await generateOnce(generation('gen-1', 'https://example.com/1.png', 111))
    expect(
      screen.getByRole('button', {
        name: /LoraWorkbench:generate\.resultPreviewLabel/,
      }),
    ).toBeInTheDocument()
    await generateOnce(generation('gen-2', 'https://example.com/2.png', 222))
    expect(
      screen.getByTestId('lora-result-main').querySelector('img'),
    ).toHaveAttribute('src', 'https://example.com/2.png')
    const strip = within(resultCard()).getAllByRole('listitem')
    expect(strip).toHaveLength(1)

    // 点条里旧的那张：换上台，再点它，大图看的就是它。
    fireEvent.click(
      within(strip[0]!).getByRole('button', {
        name: /LoraWorkbench:generate\.resultShowLabel/,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench:generate\.resultPreviewLabel/,
      }),
    )
    expect(
      screen.getByRole('img', {
        name: /LoraWorkbench:generate\.resultPreviewLabel/,
      }),
    ).toHaveAttribute('src', 'https://example.com/1.png')
  })

  it('opens a picture-frame preview when clicking the generated result image', async () => {
    await renderBench()
    takeOverPolling()
    await generateOnce(generation('gen-1', 'https://example.com/result.png', 1))

    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench:generate\.resultPreviewLabel/,
      }),
    )
    expect(
      screen.getByRole('img', {
        name: /LoraWorkbench:generate\.resultPreviewLabel/,
      }),
    ).toHaveAttribute('src', 'https://example.com/result.png')

    fireEvent.click(
      screen.getByRole('button', { name: /LoraWorkbench:coverPreviewBack/ }),
    )
    expect(
      screen.queryByRole('img', {
        name: /LoraWorkbench:generate\.resultPreviewLabel/,
      }),
    ).not.toBeInTheDocument()
  })

  // §3.0b 第 4 条在 LoRA 装配台的落点：递给助手的是**这一格**的图——助手面板打开，
  // 那张图挂在它的输入框上。
  it.each([false, true])(
    '结果图问助手在 mobile=%s 时投递到统一助手',
    async (mobile) => {
      if (mobile) setViewportWidth(MOBILE_WIDTH)
      await renderBench()
      takeOverPolling()
      await generateOnce(
        generation('gen-1', 'https://example.com/result.png', 1),
      )
      expect(screen.queryByTestId('operator-attachment-chip')).toBeNull()

      // 桌面是图格悬停出的「交给助手」白药丸（ui-spec ㊲），手机照旧是图上那颗小圆键。
      fireEvent.click(
        screen.getByRole('button', {
          name: mobile
            ? 'StudioV3:toolAskAssistant'
            : 'LoraWorkbench:generate.handToAssistant',
        }),
      )
      await act(async () => {})

      expect(
        screen
          .getAllByTestId('operator-attachment-chip')
          .map((chip) => chip.textContent),
      ).toContain('result.png')
    },
  )
})

describe('LoRA 模板（pages/prompts.md）', () => {
  const sueAsset = () =>
    loraAsset('civitai:1', {
      styleCode: '',
      name: '祀 (Sue)',
      type: 'subject',
      triggerWord: 'sue',
      // 作者认过的触发词：挂上就写进正文（出图键才有内容可发）。
      triggerSource: 'official',
      loraUrl: 'https://civitai.com/api/download/models/111',
      previewImageUrls: ['https://image.civitai.com/sample.jpeg'],
      defaultScale: 1,
      createdAt: '2026-09-28T00:00:00.000Z',
    } as Parameters<typeof loraAsset>[1])

  it('「存成模板」存的是这一张出图那一刻的整套', async () => {
    seedLoraStack([{ asset: sueAsset(), scale: 0.9 }])
    await renderBench()
    takeOverPolling()
    await generateOnce(generation('gen-1', 'https://example.com/1.png', 111))
    vi.useRealTimers()

    fireEvent.click(screen.getByTestId('lora-save-template'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'SaveTemplate:save' }),
    )

    await waitFor(() => expect(bench.savedTemplates).toHaveLength(1))
    expect(bench.savedTemplates[0]).toEqual({
      generationId: 'gen-1',
      name: expect.any(String),
      include: { negative: true, params: true, references: true },
      loraSetup: {
        baseId: expect.any(String),
        items: [
          {
            asset: expect.objectContaining({
              id: 'civitai:1',
              triggerWord: 'sue',
              // 用不上的样例图地址不进模板。
              previewImageUrls: [],
            }),
            scale: 0.9,
          },
        ],
      },
    })
    expect(
      await screen.findByRole('button', {
        name: 'LoraWorkbench:generate.templateSaved',
      }),
    ).toBeDisabled()
  })

  it('装配台那一份记录缺格时只存链接与权重（⛔ 整个存不成）', async () => {
    // 早先版本存进 localStorage 的那份挂载只有几格（没有 source / styleCode / 建档时间）。
    seedLoraStack([
      {
        asset: {
          id: 'lora-1',
          name: 'Test LoRA',
          triggerWord: 'testlora',
          triggerSource: 'official',
          baseModelFamily: 'illustrious',
          defaultScale: 1,
          loraUrl: 'https://example.com/lora.safetensors',
        } as unknown as LoraAssetRecord,
        scale: 1,
      },
    ])
    await renderBench()
    takeOverPolling()
    await generateOnce(generation('gen-1', 'https://example.com/1.png', 111))
    vi.useRealTimers()

    fireEvent.click(screen.getByTestId('lora-save-template'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'SaveTemplate:save' }),
    )

    await waitFor(() => expect(bench.savedTemplates).toHaveLength(1))
    expect(bench.savedTemplates[0]).toEqual({
      generationId: 'gen-1',
      name: expect.any(String),
      include: { negative: true, params: true, references: true },
    })
  })

  it('?template= 按整套装回来：清栈挂回、提示词与负面、参数照存的，种子回随机，装完拿掉 param', async () => {
    nav.search = 'section=generate&template=recipe-1'
    bench.recipe = (id) =>
      id === 'recipe-1'
        ? {
            id: 'recipe-1',
            outputType: 'IMAGE',
            compiledPrompt: 'sue, 1girl, city at dusk',
            negativePrompt: 'worst quality',
            modelId: AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
            params: {
              aspectRatio: '3:4',
              advancedParams: {
                steps: 28,
                guidanceScale: 5,
                runnerSampler: 'euler_ancestral',
              },
              loraSetup: {
                baseId: 'illustrious-runner',
                items: [{ asset: sueAsset(), scale: 0.9 }],
              },
            },
          }
        : null
    renderWith(<LoraWorkbench />, 1)

    await waitFor(() =>
      expect(mountedPills().map((pill) => pill.title)).toEqual(['祀 (Sue)']),
    )
    await waitFor(() =>
      expect(promptBox()).toHaveValue('sue, 1girl, city at dusk'),
    )
    expect(nav.replace).toHaveBeenCalledWith('/studio/lora?section=generate', {
      scroll: false,
    })
    // 只装一次：再渲染也不再去取。
    expect(
      server.requests.filter((r) => r.path === '/api/recipes/recipe-1'),
    ).toHaveLength(1)
  })

  it('?template= 标签台存的只换提示词和负面：挂载不动，触发词留着，权重按底模写法', async () => {
    nav.search = 'section=generate&template=nai-1'
    // 模板比挂载栈晚到（真网络总比读 localStorage 慢）。
    let deliver!: () => void
    const delivered = new Promise<void>((resolve) => {
      deliver = resolve
    })
    bench.recipe = async () => {
      await delivered
      return {
        id: 'nai-1',
        outputType: 'IMAGE',
        compiledPrompt: '1girl, rain:1.2, night',
        negativePrompt: null,
        modelId: AI_MODELS.NOVELAI_V45_FULL,
        params: {
          promptDialect: 'tags',
          advancedParams: { negativePrompt: 'lowres, bad hands' },
        },
      }
    }
    await renderBench()
    await waitFor(() => expect(promptBox()).toHaveValue('testlora'))
    deliver()

    // 加过权重的标签按 Illustrious 的写法落（括号）；正文里原有的触发词留着
    // （挂载栈读回来晚于首帧，模板按回来那一刻的挂载套，11-04 修）。
    await waitFor(() =>
      expect(promptBox()).toHaveValue('testlora, 1girl, (rain:1.2), night'),
    )
    expect(negativeBox()).toHaveValue('lowres, bad hands')
    expect(mountedPills().map((pill) => pill.title)).toEqual(['Test LoRA'])
    expect(nav.replace).toHaveBeenCalledWith('/studio/lora?section=generate', {
      scroll: false,
    })
  })

  it('模板打不开（已删）就说一句，台上什么都不动', async () => {
    nav.search = 'section=generate&template=gone'
    await renderBench()

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'LoraWorkbench:generate.templateLoadFailed',
      ),
    )
    expect(mountedPills().map((pill) => pill.title)).toEqual(['Test LoRA'])
    expect(promptBox()).toHaveValue('testlora')
  })
})

// owner 反馈（2026-09-12）：点「出图」后页面中间的生成中状态整个消失过。锁两条：
// ① 生成中态真的渲染在结果框里；② 耗时提示按首次 / 非首次分岔。
describe('LoraWorkbench GenerateBranch — generating state and ETA hint', () => {
  beforeEach(() => {
    seedLoraStack([])
  })

  it('renders the in-progress state inside the result box on stage', async () => {
    await renderBench(0)
    fireEvent.change(promptBox(), { target: { value: 'sunset railway' } })
    await startGenerating()

    const progress = await screen.findByRole('progressbar')
    expect(resultBox()).not.toBeNull()
    expect(resultBox()).toContainElement(progress)
  })

  it('shows only the one-line hint when idle — no box, no progress, no ETA', async () => {
    await renderBench(0)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(resultBox()).toBeNull()
    expect(
      screen.getByText('LoraWorkbench:generate.hintPure'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('lora-generating-eta')).not.toBeInTheDocument()
  })

  it('warns that the first Runner run loads the base model, then drops to the steady estimate', async () => {
    // 服务端收下就一直在出（不回）。
    api.studioGenerateAPI.mockReturnValue(new Promise(() => {}))
    const first = await renderBench(0)
    fireEvent.change(promptBox(), {
      target: { value: 'sunset railway, anime girl' },
    })
    fireEvent.click(generateButton())

    expect(await screen.findByTestId('lora-generating-eta')).toHaveTextContent(
      'LoraWorkbench:generate.etaColdStart',
    )

    // 第二次：同一底模、同一会话 —— worker 已经热了，回到常态估计。重新挂载（真实场景
    // 是重进生成台），sessionStorage 里的「已跑过」还在。
    first.unmount()
    await renderBench(0)
    fireEvent.change(promptBox(), {
      target: { value: 'sunset railway, anime girl' },
    })
    fireEvent.click(generateButton())

    await waitFor(() =>
      expect(screen.getByTestId('lora-generating-eta')).toHaveTextContent(
        /^LoraWorkbench:generate\.eta$/,
      ),
    )
  })
})

describe('LoraWorkbench 出图失败 / 取消', () => {
  it('says the failure in place inside the result box on desktop, never in the composer', async () => {
    api.studioGenerateAPI.mockResolvedValue({
      success: false,
      error: 'Runner dispatch failed',
    })
    await renderBench()
    fireEvent.click(generateButton())

    // 生成台 B（加载态 A）：框里原因 + 就地重试，线停住变灰。
    await waitFor(() =>
      expect(resultCard()).toHaveTextContent('Runner dispatch failed'),
    )
    expect(resultCard()).toContainElement(
      screen.getByRole('button', {
        name: 'LoraWorkbench:generate.resultFailedRetry',
      }),
    )
    // ⛔ 输入框里不再另写一行报错。
    expect(composerCard()).not.toHaveTextContent('Runner dispatch failed')
  })

  // LoRA 出图单次无批次：取消键读的是出图 hook 为这一单建的那一格，点它把这一单的
  // jobId 交给服务端去取消。
  it('shows a cancel button while generating and cancels that job on the server', async () => {
    await renderBench()
    await startGenerating()

    fireEvent.click(await screen.findByTestId('lora-generation-cancel'))

    await waitFor(() =>
      expect(api.cancelGenerationsAPI).toHaveBeenCalledWith(['job-1']),
    )
  })

  it('does not show a cancel button when idle (not generating)', async () => {
    await renderBench()

    expect(
      screen.queryByTestId('lora-generation-cancel'),
    ).not.toBeInTheDocument()
  })
})

// ── 移动端 Generate（owner 2026-09-03「结果在眼前、输入在拇指区」）：手机上结果卡排在
// composer 之上、composer 顶部 chip 行点开装配 sheet、失败态带就地重试。
describe('LoraWorkbench GenerateBranch — mobile generate layout', () => {
  beforeEach(() => {
    setViewportWidth(MOBILE_WIDTH)
  })

  it('renders the result card before the composer, with no CSS order classes left', async () => {
    await renderBench()

    // B 稿：两块是同一个 flex 列里的兄弟，DOM 顺序就是视觉顺序。
    expect(resultCard().className).not.toMatch(/\border-\d/)
    expect(resultCard().className).not.toContain('md:col-start-4')
    expect(resultCard().className).not.toContain('md:row-span-2')
    expect(resultCard().className).not.toContain('workbench-card')
    expect(composerCard().className).not.toMatch(/\border-\d/)
    expect(composerCard().className).toContain('lora-composer')

    const position = resultCard().compareDocumentPosition(composerCard())
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('opens the assembly sheet from the composer chip-row summary button', async () => {
    await renderBench()

    const opener = screen.getByRole('button', {
      name: 'LoraWorkbench:spine.openAssembly',
    })
    // 摘要 chip 行挂在 composer 里，不是独立的底部浮条。
    expect(composerCard().contains(opener)).toBe(true)

    fireEvent.click(opener)

    await waitFor(() =>
      expect(
        screen.getAllByText('LoraWorkbench:spine.currentLora').length,
      ).toBeGreaterThan(0),
    )
  })

  it('renders the failure inside the result card with an in-card retry', async () => {
    api.studioGenerateAPI.mockResolvedValue({
      success: false,
      error: 'Runner dispatch failed',
    })
    await renderBench()
    fireEvent.click(generateButton())

    const retry = await screen.findByRole('button', {
      name: 'LoraWorkbench:generate.resultFailedRetry',
    })
    expect(resultCard()).toContainElement(retry)
    expect(resultCard()).toHaveTextContent('Runner dispatch failed')
    expect(retry).toBeEnabled()

    // 重试走的是与「出图」同一个入口：再发一单。
    fireEvent.click(retry)
    await waitFor(() => expect(api.studioGenerateAPI).toHaveBeenCalledTimes(2))
  })

  it('scrolls the result card to the top of the viewport when a run starts (mobile only)', async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    await renderBench()
    scrollIntoView.mockClear()

    await startGenerating()

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: 'start' }),
      ),
    )
    scrollIntoView.mockRestore()
  })

  it('does not auto-scroll on desktop', async () => {
    setViewportWidth(DESKTOP_WIDTH)
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    await renderBench()
    scrollIntoView.mockClear()

    await startGenerating()
    await screen.findByRole('progressbar')

    expect(scrollIntoView).not.toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    )
    scrollIntoView.mockRestore()
  })
})
