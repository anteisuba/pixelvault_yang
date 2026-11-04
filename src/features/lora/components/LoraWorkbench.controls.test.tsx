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

import { __resetCivitaiLibraryCacheForTests } from '@/features/lora/hooks/use-civitai-lora-library'
import { __resetMinedPromptsCacheForTests } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { __resetModelDescriptionCacheForTests } from '@/features/lora/hooks/use-civitai-model-description'
import { FAKE_GENERATION } from '@/test/api-helpers'
import { runIdleTasksImmediately } from '@/test/api-keys'
import { seedLoraStack } from '@/test/lora-stack'
import {
  generateButton,
  loraWorkbenchServer,
  mountedLora,
  negativeBox,
  promptBox,
  renderBench as renderWith,
  renderInProviders,
  submitGeneration,
  type BenchState,
} from '@/test/lora-workbench'
import { DESKTOP_WIDTH, setViewportWidth } from '@/test/viewport'

import { LoraWorkbench } from './LoraWorkbench'

// ── 输入框与工具行：参考图、纯底模 / Runner 参数、负面词、收薄，以及「挑 LoRA」与
// 桌面上的分区深链。
//
// 真上传 hook（上传接口在 api-client 上替掉）、真挂载栈、真出图 hook；其余走假服务端。
// 参数落到哪，看出图请求体。

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
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}))
// 登录的是谁：换账号那一例在中途改它。
const auth = vi.hoisted(() => ({ userId: 'clerk_lora_stack_test' }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: auth.userId }),
  useUser: () => ({ isLoaded: true, user: { id: auth.userId } }),
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
  uploadImageFileAPI: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  ...api,
}))

let bench: BenchState

beforeEach(() => {
  setViewportWidth(DESKTOP_WIDTH)
  runIdleTasksImmediately()
  window.localStorage.clear()
  window.sessionStorage.clear()
  __resetCivitaiLibraryCacheForTests()
  __resetMinedPromptsCacheForTests()
  __resetModelDescriptionCacheForTests()
  auth.userId = 'clerk_lora_stack_test'
  nav.search = 'section=generate'
  nav.replace.mockReset()
  nav.push.mockReset()
  ;({ bench } = loraWorkbenchServer())
  seedLoraStack([{ asset: mountedLora(), scale: 1 }])
  api.uploadImageFileAPI.mockReset()
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
const uploaded = (url: string) => ({
  success: true,
  data: { generation: { ...FAKE_GENERATION, url } },
})
/** 往提示词里贴一张图（参考图三条来路之一）。 */
function pasteImage(name: string) {
  const file = new File(['image'], name, { type: 'image/png' })
  fireEvent.paste(promptBox(), {
    clipboardData: { files: [file], getData: () => '' },
  })
}

describe('LoraWorkbench 参考图', () => {
  it('B9: threads the reference image + strength into the generate request when one is attached', async () => {
    api.uploadImageFileAPI.mockResolvedValue(
      uploaded('https://cdn.example.com/ref.png'),
    )
    await renderBench()

    pasteImage('ref.png')
    await waitFor(() => expect(api.uploadImageFileAPI).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByText('ImageUpload:uploading')).toBeNull(),
    )

    const request = await generate()
    expect(request.referenceImages).toEqual(['https://cdn.example.com/ref.png'])
    expect(request.advancedParams?.referenceStrength).toEqual(
      expect.any(Number),
    )
  })

  // 参考图按账号记：换了账号，上一个人挂的、还在传的都不算数。（这台底模只收一张参考图，
  // 所以「已挂上」与「还在传」分两例。）
  const switchAccount = (view: Awaited<ReturnType<typeof renderBench>>) => {
    auth.userId = 'clerk_lora_stack_other'
    view.rerender(<LoraWorkbench />)
  }

  it('clears the previous account’s references', async () => {
    api.uploadImageFileAPI.mockResolvedValue(
      uploaded('https://cdn.example.com/a-ref.png'),
    )
    const view = await renderBench()
    pasteImage('a-ref.png')
    await waitFor(() => expect(api.uploadImageFileAPI).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByText('ImageUpload:uploading')).toBeNull(),
    )

    switchAccount(view)
    fireEvent.change(promptBox(), { target: { value: 'portrait' } })

    expect((await generate()).referenceImages).toBeUndefined()
  })

  it('rejects the previous account’s pending upload', async () => {
    let finishPending!: () => void
    api.uploadImageFileAPI
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishPending = () =>
              resolve(uploaded('https://cdn.example.com/a-late.png'))
          }),
      )
      .mockResolvedValueOnce(uploaded('https://cdn.example.com/b-ref.png'))
    const view = await renderBench()
    pasteImage('a-late.png')
    expect(await screen.findByText('ImageUpload:uploading')).toBeInTheDocument()

    switchAccount(view)
    expect(screen.queryByText('ImageUpload:uploading')).toBeNull()
    await act(async () => finishPending())
    fireEvent.change(promptBox(), { target: { value: 'portrait' } })
    expect((await generate()).referenceImages).toBeUndefined()

    // 账号 B 自己贴的照常挂上。
    pasteImage('b-ref.png')
    await waitFor(() => expect(api.uploadImageFileAPI).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.queryByText('ImageUpload:uploading')).toBeNull(),
    )
    expect((await generate()).referenceImages).toEqual([
      'https://cdn.example.com/b-ref.png',
    ])
  })
})

describe('LoraWorkbench GenerateBranch — pure base and Runner controls', () => {
  beforeEach(() => {
    seedLoraStack([])
  })

  it('defaults an empty LoRA stack to Anima Turbo and generates without a fake LoRA', async () => {
    await renderBench(0)

    // 输入框里只有「+ LoRA」那一颗（没挂）；纯底模空栈默认 Anima Turbo v1.1（owner 2026-09-28）。
    expect(
      within(screen.getByTestId('lora-mount-pills')).getAllByRole('button'),
    ).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: /Anima Turbo v1\.1/ }),
    ).toBeInTheDocument()

    fireEvent.change(promptBox(), {
      target: { value: 'sunset railway, anime girl' },
    })
    const request = await generate()
    expect(request.modelId).toBe(AI_MODELS.ANIMA_TURBO_RUNNER)
    expect(request.advancedParams?.loras).toBeUndefined()
  })

  // ④ 画板 N1–N3：CFG 1 的底模上负面词不起作用 —— chip 让开、那行收起、出图不带；写的
  // 内容留着，CFG 调到 1 以上原样回来。
  it('steps the negative prompt aside on a CFG 1 base and brings it back above CFG 1', async () => {
    await renderBench(0)

    const chip = screen.getByRole('button', {
      name: /LoraWorkbench:generate\.negativePromptLabel/,
    })
    expect(chip).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    // 参数 chip 直接写底模自己的默认（euler · 10 步），不写「默认参数」。
    const params = screen.getByRole('button', {
      name: /LoraWorkbench:generate\.advanced\.title · euler · LoraWorkbench:generate\.paramsSteps/,
    })

    fireEvent.change(negativeBox(), { target: { value: 'worst quality' } })
    fireEvent.change(promptBox(), { target: { value: 'sunset railway' } })
    expect((await generate()).advancedParams?.negativePrompt).toBeUndefined()
    // 内容还在，只是收着。
    expect(chip).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(params)
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.paramsLabels.cfg'),
      { target: { value: '3' } },
    )
    expect(chip).not.toHaveAttribute('aria-disabled', 'true')
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect((await generate()).advancedParams).toMatchObject({
      negativePrompt: 'worst quality',
      guidanceScale: 3,
    })
  })

  // 回归（2026-07-31 生产）：平台总闸关着时 runner 整条死，余额再多也花不出去。总闸
  // 状态必须压过余额。
  it('warns that Runner is switched off instead of advertising leftover budget', async () => {
    bench.runnerUsage = {
      enabled: true,
      used: 40,
      limit: 100,
      remaining: 60,
      exempt: false,
      platformEnabled: false,
    }
    await renderBench(0)

    expect(
      await screen.findByText('LoraWorkbench:generate.runnerUnavailable'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('LoraWorkbench:generate.runnerBudgetRemaining'),
    ).not.toBeInTheDocument()
  })

  it('sends manually edited Runner controls and 4x-AnimeSharp in the real request', async () => {
    await renderBench(0)

    // 工具行右组「参数」chip 的弹层：Seed 先拨到「固定」才有输入框。
    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench:generate\.advanced\.title/,
      }),
    )
    fireEvent.click(
      screen.getByRole('radio', { name: 'LoraWorkbench:generate.seedFixed' }),
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.seed'),
      { target: { value: '5536891017203' } },
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.paramsLabels.steps'),
      { target: { value: '32' } },
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.paramsLabels.cfg'),
      { target: { value: '4' } },
    )
    // 精确宽高住在「比例」chip 的弹层里（虚线下那一格）。
    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench:generate.aspectRatioLabel',
      }),
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.width'),
      { target: { value: '1024' } },
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.height'),
      { target: { value: '1024' } },
    )
    fireEvent.click(screen.getByRole('radio', { name: '4x-AnimeSharp' }))
    fireEvent.change(promptBox(), {
      target: { value: 'cinematic anime city' },
    })

    expect((await generate()).advancedParams).toMatchObject({
      runnerSeed: '5536891017203',
      steps: 32,
      guidanceScale: 4,
      runnerWidth: 1024,
      runnerHeight: 1024,
      runnerUpscaler: '4x-AnimeSharp',
    })
  })

  it('blocks generation when only one exact dimension is entered', async () => {
    await renderBench(0)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench:generate.aspectRatioLabel',
      }),
    )
    fireEvent.change(
      screen.getByLabelText('LoraWorkbench:generate.advanced.width'),
      { target: { value: '1024' } },
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'LoraWorkbench:generate.advanced.dimensionPairError',
    )
    expect(generateButton()).toBeDisabled()
  })
})

describe('LoraWorkbench GenerateBranch — negative prompt visibility', () => {
  it('manually reveals an empty negative prompt field on request', async () => {
    await renderBench()

    // 生成台 B：工具行左组「负面」chip，点它在提示词下原位展开一行负面词。
    const toggle = screen.getByRole('button', {
      name: /LoraWorkbench:generate\.negativePromptLabel/,
    })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // 平时（收薄）点「负面」：输入框一起长回，负面整块不挂 inert（否则聚焦落空）。
    expect(negativeBox().closest('.lora-mixwrap')).toHaveAttribute(
      'data-open',
      'true',
    )
    expect(screen.getByTestId('lora-composer-card')).toHaveAttribute(
      'data-expanded',
      'true',
    )
  })

  // 输入框平时收薄（lora-generate §2.4，owner 09-29 第二轮 A）。
  it('slims the composer at rest and grows it back while you write', async () => {
    await renderBench()
    const card = screen.getByTestId('lora-composer-card')
    expect(card).toHaveAttribute('data-expanded', 'false')

    fireEvent.focus(promptBox())
    expect(card).toHaveAttribute('data-expanded', 'true')

    // chip 弹层 / 标签补全不算「外面」。
    const listbox = document.createElement('div')
    listbox.setAttribute('role', 'listbox')
    document.body.appendChild(listbox)
    fireEvent.pointerDown(listbox)
    expect(card).toHaveAttribute('data-expanded', 'true')
    listbox.remove()

    fireEvent.pointerDown(document.body)
    expect(card).toHaveAttribute('data-expanded', 'false')
  })
})

describe('LoraWorkbench 挑 LoRA 与分区深链（桌面）', () => {
  it('「＋ 添加 LoRA」弹「挑 LoRA」框（ui-spec ㉔），台不走', async () => {
    await renderBench()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:pill.addLabel' }),
    )

    expect(
      await screen.findByRole('dialog', {
        name: 'LoraWorkbench.picker:title',
      }),
    ).toBeInTheDocument()
    expect(nav.push).not.toHaveBeenCalled()
  })

  // 桌面台上没有「生成 / 训练」切换了（ui-spec ㊲）：训练从 LoRA 库「自训」第一格进来
  // （`?section=train`），台顶上一颗「‹ 训练新 LoRA」回到生成。
  it('has no generate / train switch on the bench', async () => {
    await renderBench()

    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(
      screen.queryByRole('button', { name: 'LoraWorkbench:trainTitle' }),
    ).toBeNull()
  })

  // 旧链接 `?section=mine` 送去库叠层的收藏那一格，台回到生成。
  it('sends the legacy mine deep link to the library overlay favorites', async () => {
    nav.search = 'section=mine'
    renderInProviders(<LoraWorkbench />)

    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith('/library/lora?view=favorites'),
    )
    expect(nav.replace).toHaveBeenCalledWith(
      '/studio/lora',
      expect.objectContaining({ scroll: false }),
    )
  })

  it('the train deep link opens the wizard with a way back to generate', async () => {
    nav.search = 'section=train'
    renderInProviders(<LoraWorkbench />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench:trainTitle' }),
    )
    expect(nav.replace).toHaveBeenCalledWith(
      '/studio/lora',
      expect.objectContaining({ scroll: false }),
    )
  })
})
