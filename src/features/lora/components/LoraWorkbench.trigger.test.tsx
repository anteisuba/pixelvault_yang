import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { __resetCivitaiLibraryCacheForTests } from '@/features/lora/hooks/use-civitai-lora-library'
import { __resetMinedPromptsCacheForTests } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { __resetModelDescriptionCacheForTests } from '@/features/lora/hooks/use-civitai-model-description'
import { openQuickSetup, runIdleTasksImmediately } from '@/test/api-keys'
import { LORA_STACK_CLERK_ID, seedLoraStack } from '@/test/lora-stack'
import {
  applyFirstRecipe,
  generateButton,
  loraWorkbenchServer,
  minedRecipe,
  mountedLora,
  promptBox,
  removeMountedLora,
  renderBench as renderWith,
  submitGeneration,
  toggleMountedLora,
  triggerAddButton,
  type BenchState,
} from '@/test/lora-workbench'
import { DESKTOP_WIDTH, setViewportWidth } from '@/test/viewport'

import { LoraWorkbench } from './LoraWorkbench'

// ── 触发词写在正文里（owner 09-28）＋ 出图键不要 key。
//
// 真挂载栈（种进 localStorage）、真标签台、真来源图配方、真出图 hook；只假网络。
// 正文发出去是什么，看出图请求（`studioGenerateAPI`）的请求体。

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

beforeEach(() => {
  setViewportWidth(DESKTOP_WIDTH)
  runIdleTasksImmediately()
  window.localStorage.clear()
  window.sessionStorage.clear()
  __resetCivitaiLibraryCacheForTests()
  __resetMinedPromptsCacheForTests()
  __resetModelDescriptionCacheForTests()
  ;({ bench } = loraWorkbenchServer())
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
const renderBench = () => renderWith(<LoraWorkbench />)

describe('LoraWorkbench 出图键 — 不要 key 的 Runner 底模', () => {
  it('needs no API key on the Comfy Runner base Illustrious now defaults to', async () => {
    // 2026-09-17：托管 LoRA 底模全部退役，Illustrious LoRA 默认走 Runner 克隆——没有
    // BYOK 这条路，所以 key 名单是空的也不出「需要 key」，出图直接发。
    await renderBench()

    expect(
      screen.queryByRole('button', { name: /QuickSetup:needsKey/ }),
    ).not.toBeInTheDocument()
    expect(generateButton()).toBeEnabled()

    await generate()

    expect(openQuickSetup()).toBeNull()
  })

  it('shows the generation failure instead of silently returning to the empty result', async () => {
    api.studioGenerateAPI.mockResolvedValue({
      success: false,
      error: 'Runner dispatch failed',
    })
    await renderBench()

    await generate()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Runner dispatch failed',
    )
  })
})

describe('LoraWorkbench 触发词 — 写在正文里', () => {
  it('writes a mounted LoRA’s verified trigger into the prompt text', async () => {
    await renderBench()

    await waitFor(() => expect(promptBox()).toHaveValue('testlora'))
    expect(
      screen.queryByRole('button', {
        name: 'LoraWorkbench:generate.triggerAdd',
      }),
    ).toBeNull()
  })

  it('highlights separated comma-delimited trigger phrases individually in the prompt', async () => {
    seedLoraStack([
      {
        asset: mountedLora({ triggerWord: 'shino style, soft ink' }),
        scale: 1,
      },
    ])
    const { container } = await renderBench()

    fireEvent.change(promptBox(), {
      target: { value: 'shino style, portrait, soft ink' },
    })

    expect(
      Array.from(
        container.querySelectorAll('.lora-trigger-hl'),
        (element) => element.textContent,
      ),
    ).toEqual(['shino style', 'soft ink'])
  })

  it('does not highlight or inject triggers from a disabled LoRA while preserving user text', async () => {
    seedLoraStack([{ asset: mountedLora(), scale: 1, enabled: false }])
    const { container } = await renderBench()

    fireEvent.change(promptBox(), {
      target: { value: 'testlora, user portrait' },
    })
    expect(container.querySelectorAll('.lora-trigger-hl')).toHaveLength(0)
    expect((await generate()).freePrompt).toBe('testlora, user portrait')

    fireEvent.change(promptBox(), { target: { value: 'user portrait' } })
    expect((await generate()).freePrompt).toBe('user portrait')
  })

  it('S5: stays enabled and compiles just the trigger word when the prompt textarea is left empty', async () => {
    await renderBench()
    await waitFor(() => expect(promptBox()).toHaveValue('testlora'))

    expect((await generate()).freePrompt).toBe('testlora')
  })

  it('sends the prompt text as written — the trigger is not added a second time', async () => {
    // 标签台上那一颗（账号里存的那份）排在正文前面。
    bench.traySelections = [
      {
        id: 'sel-1',
        tagId: 'tag-1',
        promptText: 'tray_tag',
        label: 'Tray Tag',
        polarity: 'positive',
        source: 'danbooru',
        type: 'quality',
        enabled: true,
        orderIndex: 0,
        insertedAt: '2026-10-01T00:00:00.000Z',
      },
    ]
    await renderBench()

    fireEvent.change(promptBox(), {
      target: { value: 'my free text, testlora' },
    })

    await waitFor(async () =>
      expect((await generate()).freePrompt).toBe(
        'tray_tag, my free text, testlora',
      ),
    )
  })

  it('a trigger taken out of the text is not sent; the ＋ writes it back to the front', async () => {
    await renderBench()
    fireEvent.change(promptBox(), { target: { value: 'my free text' } })

    expect((await generate()).freePrompt).toBe('my free text')

    fireEvent.click(triggerAddButton())
    expect(promptBox()).toHaveValue('testlora, my free text')
    expect((await generate()).freePrompt).toBe('testlora, my free text')
  })

  it('pausing a LoRA takes its trigger out of the text; turning it back on writes it again', async () => {
    await renderBench()
    fireEvent.change(promptBox(), {
      target: { value: 'testlora, my free text' },
    })

    toggleMountedLora()
    expect(promptBox()).toHaveValue('my free text')

    toggleMountedLora()
    expect(promptBox()).toHaveValue('testlora, my free text')

    removeMountedLora()
    await waitFor(() => expect(promptBox()).toHaveValue('my free text'))
  })

  it('pause and resume put back exactly what was in the text — a trigger you took out stays out', async () => {
    seedLoraStack([
      {
        asset: mountedLora({ triggerSource: 'inferred' }),
        scale: 1,
      },
    ])
    await renderBench()
    expect(promptBox()).toHaveValue('')
    fireEvent.click(triggerAddButton())
    expect(promptBox()).toHaveValue('testlora')

    toggleMountedLora()
    expect(promptBox()).toHaveValue('')
    toggleMountedLora()
    expect(promptBox()).toHaveValue('testlora')

    fireEvent.change(promptBox(), { target: { value: 'portrait' } })
    toggleMountedLora()
    toggleMountedLora()
    expect(promptBox()).toHaveValue('portrait')
  })

  it.each(['inferred', undefined] as const)(
    '来源为 %s 的触发词挂上时不写进正文，点「＋」才写',
    async (triggerSource) => {
      seedLoraStack([
        {
          asset: mountedLora({ triggerSource }),
          scale: 1,
        },
      ])
      await renderBench()
      expect(promptBox()).toHaveValue('')
      fireEvent.change(promptBox(), { target: { value: 'my free text' } })

      expect((await generate()).freePrompt).toBe('my free text')

      fireEvent.click(triggerAddButton())
      expect((await generate()).freePrompt).toBe('testlora, my free text')
    },
  )

  // 做同款整段换正文时，原来就在正文里的触发词留着（缺了补回开头，⛔ 不写两遍）。
  it('applying a recipe keeps the trigger that was already in the prompt text', async () => {
    bench.minedRecipes = [minedRecipe({ prompt: 'best quality, 1girl' })]
    await renderBench()

    await applyFirstRecipe()

    expect(promptBox()).toHaveValue('testlora, best quality, 1girl')
    expect((await generate()).freePrompt).toBe('testlora, best quality, 1girl')
  })
})
