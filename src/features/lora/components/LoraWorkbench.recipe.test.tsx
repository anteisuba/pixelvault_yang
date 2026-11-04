import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { AI_MODELS } from '@/constants/models'
import type { LoraAssetRecord } from '@/types'

import { __resetCivitaiLibraryCacheForTests } from '@/features/lora/hooks/use-civitai-lora-library'
import { __resetMinedPromptsCacheForTests } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { __resetModelDescriptionCacheForTests } from '@/features/lora/hooks/use-civitai-model-description'
import { runIdleTasksImmediately } from '@/test/api-keys'
import {
  LORA_STACK_CLERK_ID,
  loraAsset,
  seedLoraStack,
} from '@/test/lora-stack'
import {
  applyFirstRecipe,
  generateButton,
  loraWorkbenchServer,
  minedRecipe,
  mountedLora,
  mountedPills,
  negativeBox,
  openSourceBand,
  promptBox,
  removeMountedLora,
  renderBench as renderWith,
  submitGeneration,
  toggleMountedLora,
  type BenchState,
} from '@/test/lora-workbench'
import { DESKTOP_WIDTH, setViewportWidth } from '@/test/viewport'

import { LoraWorkbench } from './LoraWorkbench'

// ── 来源图配方（做同款）与 HF 样例参考。
//
// 真挂载栈、真来源图配方 hook（配方从假服务端挖回来）、真共享配方框、真补挂（解析走
// 假服务端）、真出图 hook；只假网络。做同款落到哪，看正文 / 负面 / 挂载胶囊 / 出图请求体。

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
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('section=generate'),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/lora',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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
  ;({ bench, server } = loraWorkbenchServer())
  seedLoraStack([{ asset: mountedLora(), scale: 1 }])
  // 服务端不收这一单：出图键马上回到可按，请求体照样看得到。
  api.studioGenerateAPI
    .mockReset()
    .mockResolvedValue({ success: false, error: 'refused in test' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const generate = () => submitGeneration(api.studioGenerateAPI)
const renderBench = (pills = 1) => renderWith(<LoraWorkbench />, pills)
const mountedNames = () => mountedPills().map((pill) => pill.title)

/** 配方里叠加的额外 LoRA 在库里 / Civitai 上找得到的那一把。 */
const extraLora = (modelVersionId: number): LoraAssetRecord =>
  loraAsset(`extra-${modelVersionId}`, {
    name: `Extra ${modelVersionId}`,
    modelId: modelVersionId,
    modelVersionId,
    loraUrl: `https://example.com/${modelVersionId}.safetensors`,
  })

describe('LoraWorkbench 做同款 — 来源图配方', () => {
  it('G3b: renders the source-image thumbnail band (opens the shared recipe modal)', async () => {
    bench.minedRecipes = [minedRecipe({ prompt: 'portrait, green hanfu' })]
    await renderBench()
    openSourceBand()

    // 来源图带只放缩略图；点开是共享配方框（配方 / 参数只在框里）。
    const thumbnail = await screen.findByRole('button', {
      name: /LoraPromptControl\.generate:sourceImagePreviewLabel/,
    })
    fireEvent.click(thumbnail)
    expect(
      screen.getByRole('button', { name: 'LoraWorkbench:sourceRecipeRemake' }),
    ).toBeInTheDocument()
  })

  it('applies Civitai recipe steps and CFG to the real generation request', async () => {
    bench.minedRecipes = [
      minedRecipe({
        prompt: 'best quality, 1girl',
        negativePrompt: 'worst quality',
        steps: 32,
        cfgScale: 4,
      }),
    ]
    await renderBench()
    await applyFirstRecipe()

    expect((await generate()).advancedParams).toMatchObject({
      negativePrompt: 'worst quality',
      steps: 32,
      guidanceScale: 4,
    })
  })

  it('updates explicit Runner dimensions when a ratio is selected after a source recipe', async () => {
    bench.minedRecipes = [
      minedRecipe({
        prompt: 'Sue, white background',
        checkpoint: 'rinFlanimeIllustrious_v40',
        baseWidth: 984,
        baseHeight: 672,
      }),
    ]
    await renderBench()
    await applyFirstRecipe()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench:generate.aspectRatioLabel',
      }),
    )
    for (const [ratio, width, height] of [
      ['4:3', 1024, 768],
      ['1:1', 1024, 1024],
      ['3:4', 768, 1024],
    ] as const) {
      fireEvent.click(screen.getByRole('radio', { name: ratio }))
      expect((await generate()).advancedParams).toMatchObject({
        runnerWidth: width,
        runnerHeight: height,
      })
    }
  })

  it('waits for all recipe extras and sends the source checkpoint hash and original dimensions', async () => {
    bench.minedRecipes = [
      minedRecipe({
        prompt: 'Sue, white background, hair_twirling',
        checkpoint: 'rinFlanimeIllustrious_v40',
        checkpointHash: '29d5281e0a',
        baseWidth: 672,
        baseHeight: 984,
        steps: 25,
        cfgScale: 7,
        sampler: 'Euler a',
        extraLoras: [
          { modelVersionId: 111, weight: 0.8 },
          { modelVersionId: 222, weight: 0.8 },
        ],
      }),
    ]
    let finishMount!: () => void
    const pending = new Promise<void>((resolve) => {
      finishMount = resolve
    })
    bench.resolve = async (modelVersionId) => {
      await pending
      return extraLora(modelVersionId)
    }
    await renderBench()
    await applyFirstRecipe()

    // 补挂还没回来：出图键锁着，按了也不发。
    await waitFor(() => expect(generateButton()).toBeDisabled())
    fireEvent.click(generateButton())
    expect(api.studioGenerateAPI).not.toHaveBeenCalled()

    await act(async () => finishMount())
    await waitFor(() => expect(mountedPills()).toHaveLength(3))

    const input = await generate()
    expect(input.modelId).toBe(AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE)
    expect(input.advancedParams).toMatchObject({
      checkpointHash: '29d5281e0a',
      checkpointName: 'rinFlanimeIllustrious_v40',
      runnerWidth: 672,
      runnerHeight: 984,
      steps: 25,
      guidanceScale: 7,
      runnerSampler: 'euler_ancestral',
    })
    const loras = input.advancedParams?.loras as { scale: number }[]
    expect(loras).toHaveLength(3)
    expect(loras.slice(1).map((item) => item.scale)).toEqual([0.8, 0.8])

    // 补挂结束后暂停或卸掉配方里的 LoRA 是用户的选择，⛔ 不再锁生成键。
    toggleMountedLora(1)
    expect(generateButton()).toBeEnabled()
    removeMountedLora(2)
    await waitFor(() => expect(mountedPills()).toHaveLength(2))
    expect(generateButton()).toBeEnabled()
  })

  it('generates without a recipe extra that cannot be located', async () => {
    // 作者私有、Civitai 上没有的 LoRA（如图 135139750 的 superiorAnima）重试也挂不上：
    // 补挂一结束就放开生成键，⛔ 永久锁死。
    bench.minedRecipes = [
      minedRecipe({
        prompt: 'Sue, white background',
        extraLoras: [{ modelVersionId: 111, weight: 0.8 }],
      }),
    ]
    await renderBench()
    await applyFirstRecipe()

    await waitFor(() =>
      expect(server.requests.map((r) => r.path)).toContain(
        '/api/lora-assets/civitai/resolve',
      ),
    )
    await waitFor(() => expect(generateButton()).toBeEnabled())
    await generate()
    expect(mountedPills()).toHaveLength(1)
  })

  // H（2026-08-07 owner「点击做同款后多挂载失效」）：做同款 = 真还原——配方里叠加的
  // 其它 LoRA 一并挂进栈，配方给了权重就按配方的权重挂。
  it('H: 做同款 mounts every extra LoRA the recipe stacked, not just the primary', async () => {
    bench.minedRecipes = [
      minedRecipe({
        extraLoras: [
          { name: 'detail tweaker', weight: 0.4, modelVersionId: 111 },
          { name: 'rim light', weight: 0.6, modelVersionId: 222 },
        ],
      }),
    ]
    bench.resolve = async (modelVersionId) => extraLora(modelVersionId)
    await renderBench()
    await applyFirstRecipe()

    await waitFor(() => expect(mountedPills()).toHaveLength(3))
    expect(mountedNames()).toEqual(['Test LoRA', 'Extra 111', 'Extra 222'])
    const loras = (await generate()).advancedParams?.loras as {
      scale: number
    }[]
    expect(loras.map((item) => item.scale)).toEqual([1, 0.4, 0.6])
  })

  // 挂载不设上限（owner 2026-08-07）：主 LoRA + 3 个额外 = 4，比旧的硬上限 3 还多，
  // 一个都不许掉。（原用例另把底模能力表里的 maxLoras 改小来证明「谁都不拿它做闸」；
  // 能力表是常量，这一层改不了，留下的是真能力表下的同一条结论。）
  it('H: 做同款 mounts every extra even past the old stack cap (no cap)', async () => {
    bench.minedRecipes = [
      minedRecipe({
        extraLoras: [
          { name: 'detail tweaker', weight: 0.4, modelVersionId: 111 },
          { name: 'rim light', weight: 0.6, modelVersionId: 222 },
          { name: 'hand fix', weight: 0.2, modelVersionId: 333 },
        ],
      }),
    ]
    bench.resolve = async (modelVersionId) => extraLora(modelVersionId)
    await renderBench()
    await applyFirstRecipe()

    await waitFor(() => expect(mountedPills()).toHaveLength(4))
    expect(mountedNames().slice(1)).toEqual([
      'Extra 111',
      'Extra 222',
      'Extra 333',
    ])
  })

  it('G3b-2b: the 搭配 status bar undo restores the pre-做同款 prompt snapshot', async () => {
    bench.minedRecipes = [minedRecipe({ prompt: 'best quality, 1girl' })]
    // 不带触发词：正文就是自己写的那句。
    seedLoraStack([
      {
        asset: mountedLora({ triggerSource: 'inferred' }),
        scale: 1,
      },
    ])
    await renderBench()
    fireEvent.change(promptBox(), { target: { value: 'my draft' } })

    await applyFirstRecipe()
    expect(promptBox()).toHaveValue('best quality, 1girl')

    fireEvent.click(screen.getByRole('button', { name: /collocation:undo/ }))
    expect(promptBox()).toHaveValue('my draft')
  })
})

describe('LoraWorkbench 做同款 — 负面词与搭配条怎么摆', () => {
  const withNegative = () => {
    bench.minedRecipes = [
      minedRecipe({
        prompt: 'masterpiece, best quality',
        negativePrompt: 'bad hands, blurry',
      }),
    ]
  }

  it('reveals the negative prompt field after applying a recipe that has one', async () => {
    withNegative()
    await renderBench()

    // 负面区默认收起——工具行那颗「负面」chip 按下 = 展开。
    expect(
      screen.getByRole('button', {
        name: /LoraWorkbench:generate\.negativePromptLabel/,
      }),
    ).toHaveAttribute('aria-pressed', 'false')

    await applyFirstRecipe()

    expect(negativeBox()).toHaveValue('bad hands, blurry')
  })

  it('folds a written negative prompt into a one-line preview at rest', async () => {
    withNegative()
    await renderBench()
    await applyFirstRecipe()

    const negativeBlock = () => negativeBox().closest('.lora-mixwrap')
    const preview = screen.getByTestId('lora-negative-preview')
    expect(negativeBlock()).toHaveAttribute('data-open', 'false')
    expect(preview.closest('.lora-mixwrap')).toHaveAttribute(
      'data-open',
      'true',
    )
    expect(preview).toHaveTextContent('bad hands, blurry')

    fireEvent.click(preview)
    expect(negativeBlock()).toHaveAttribute('data-open', 'true')
    expect(preview.closest('.lora-mixwrap')).toHaveAttribute(
      'data-open',
      'false',
    )

    fireEvent.pointerDown(document.body)
    expect(negativeBlock()).toHaveAttribute('data-open', 'false')
  })

  it('tucks the applied collocation bar into a toolbar chip at rest', async () => {
    withNegative()
    await renderBench()
    await applyFirstRecipe()

    const card = screen.getByTestId('lora-composer-card')
    const chip = () =>
      within(card).queryByRole('button', {
        name: /LoraWorkbench\.generate\.collocation:label/,
      })
    // 做同款刚落下是「待审阅」、明细开着：整条照常在顶上，⛔ 收成一颗。
    expect(chip()).not.toBeInTheDocument()
    fireEvent.click(
      within(card).getByRole('button', {
        name: 'LoraWorkbench.generate.collocation:apply',
      }),
    )
    const barView = () =>
      within(card).getByRole('button', {
        name: 'LoraWorkbench.generate.collocation:view',
      })
    expect(barView().closest('.lora-mixwrap')).toHaveAttribute(
      'data-open',
      'false',
    )
    fireEvent.click(chip()!)
    expect(card).toHaveAttribute('data-expanded', 'true')
    expect(barView().closest('.lora-mixwrap')).toHaveAttribute(
      'data-open',
      'true',
    )
    expect(chip()).not.toBeInTheDocument()
  })
})

// H1 生成侧「样例参考」（lora-workbench.md §13）：挂 HF LoRA 时来源图带换成 README
// 样例（图横滚 + 提示词一键填入），与 Civitai 来源图配方互斥。样例从假服务端回。
describe('LoraWorkbench GenerateBranch — H1 HF showcase strip', () => {
  // 样例按仓库记在会话缓存里（取过一次就不再取）：每例换一个仓库。
  let repo = 0
  const hfAsset = () =>
    loraAsset('hf-lora-1', {
      name: 'Anything2Real',
      triggerWord: '',
      baseModelFamily: 'flux',
      defaultScale: 1,
      provider: 'huggingface',
      loraUrl: `https://huggingface.co/lrzjason/Anything2Real-${++repo}/resolve/main/f2k_anything2real.safetensors`,
    })
  const SHOWCASE_PATH = '/api/lora-assets/huggingface/showcase'

  beforeEach(() => {
    seedLoraStack([{ asset: hfAsset(), scale: 1 }])
  })

  it('renders the showcase image strip + prompt list instead of the (empty) civitai mined panel', async () => {
    bench.showcase = {
      images: ['https://cdn-uploads.huggingface.co/production/uploads/a.png'],
      prompts: ['change the picture 1 to realistic photograph, [description]'],
    }
    await renderBench()
    openSourceBand()

    expect(
      screen.getByRole('dialog', { name: 'LoraWorkbench.generate.band:title' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', {
        name: /LoraWorkbench:showcaseImageAlt/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'change the picture 1 to realistic photograph, [description]',
      ),
    ).toBeInTheDocument()
    // HF 挂载不出 Civitai 来源图，也不去挖。
    expect(
      screen.queryByRole('button', {
        name: /LoraPromptControl\.generate:sourceImagePreviewLabel/,
      }),
    ).not.toBeInTheDocument()
    expect(bench.minedRequests).toEqual([])
  })

  it('"填入正文" replaces the prompt textarea with the candidate prompt (D7⑤ semantics — replace, not append)', async () => {
    bench.showcase = { images: [], prompts: ['1girl, solo, masterpiece'] }
    await renderBench()

    fireEvent.change(promptBox(), { target: { value: 'existing text' } })
    openSourceBand()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'LoraWorkbench:showcaseFillPrompt',
      }),
    )

    expect(promptBox()).toHaveValue('1girl, solo, masterpiece')
  })

  it('renders nothing (falls through to the empty-recommend copy) when the HF LoRA has no README images or prompts', async () => {
    await renderBench()
    await waitFor(() =>
      expect(server.requests.map((r) => r.path)).toContain(SHOWCASE_PATH),
    )

    expect(
      screen.queryByText('LoraWorkbench:showcaseTitle'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('LoraWorkbench:generate.band.empty'),
    ).toBeInTheDocument()
  })

  it('leaves the civitai mined panel untouched for a civitai-provider mount (no regression)', async () => {
    seedLoraStack([{ asset: mountedLora({ provider: 'civitai' }), scale: 1 }])
    bench.minedRecipes = [minedRecipe({ prompt: 'portrait, green hanfu' })]
    await renderBench()
    openSourceBand()

    expect(
      await screen.findByRole('button', {
        name: /LoraPromptControl\.generate:sourceImagePreviewLabel/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('LoraWorkbench:showcaseTitle'),
    ).not.toBeInTheDocument()
    expect(server.requests.map((r) => r.path)).not.toContain(SHOWCASE_PATH)
  })
})
