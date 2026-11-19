import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LORA_BASE_MODELS } from '@/features/lora/constants/lora-base-models'
import {
  LoraStackProvider,
  useActiveLoraStack,
} from '@/features/lora/hooks/use-active-lora-stack'
import { __resetCivitaiLibraryCacheForTests } from '@/features/lora/hooks/use-civitai-lora-library'
import { __resetMinedPromptsCacheForTests } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { queryClient } from '@/lib/query-client'
import {
  LORA_STACK_CLERK_ID,
  loraAsset,
  seedLoraStack,
} from '@/test/lora-stack'
import type { CivitaiImageRecipe } from '@/types'

import { LoraBenchLibraryPanel } from './LoraBenchLibraryPanel'

/**
 * LoRA 台「+ LoRA」面板（11-18 工作台里开库）：真挂载栈；三份数据 hook 与挖配方在 hook 边界上假。
 */

const intl = vi.hoisted(() => {
  const byNamespace = new Map<
    string,
    (key: string, values?: Record<string, unknown>) => string
  >()
  return {
    t(ns: string) {
      let t = byNamespace.get(ns)
      if (!t) {
        t = (key, values) =>
          values ? `${ns}:${key}:${JSON.stringify(values)}` : `${ns}:${key}`
        byNamespace.set(ns, t)
      }
      return t
    },
  }
})
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => intl.t(ns),
  useFormatter: () => ({ number: (value: number) => String(value) }),
}))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
}))

const data = vi.hoisted(() => ({
  mine: [] as unknown[],
  recipes: [] as unknown[],
  civitaiFails: false,
  civitaiCalls: 0,
}))
// 只假 api-client 边界：真 useLoraAssets / useCharacterLoras / useCivitaiLoraLibrary / 挖配方。
vi.mock('@/lib/api-client/lora-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/lora-assets')>()),
  listLoraAssetsAPI: async () => ({ success: true, data: data.mine }),
  listDiscoverLoraAssetsAPI: async () => ({ success: true, data: [] }),
  listCivitaiLoraAssetsAPI: async () => {
    data.civitaiCalls += 1
    return data.civitaiFails
      ? { success: false, error: 'boom' }
      : {
          success: true,
          data: {
            items: [],
            page: 1,
            pageSize: 24,
            total: 0,
            totalCapped: false,
            hasNextPage: false,
            literalTotal: 0,
          },
        }
  },
  mineCivitaiLoraPromptsAPI: async () => ({
    success: true,
    data: { outfits: [], recipes: data.recipes, previewImages: [] },
  }),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  listCharacterLorasAPI: async () => ({ success: true, data: [] }),
  fetchCivitaiLoraDownloadPolicyAPI: async () => ({
    success: true,
    data: { downloadDisabled: false },
  }),
}))

const L = (key: string, values?: Record<string, unknown>) =>
  values
    ? `LoraWorkbench.benchLibrary:${key}:${JSON.stringify(values)}`
    : `LoraWorkbench.benchLibrary:${key}`

// 一个具体的 Illustrious 底模（⚠ 表里第一条是「来源图底模（自动）」，要跳过）。
const illustriousBase = LORA_BASE_MODELS.find(
  (base) => base.family === 'illustrious' && !base.translationKey,
)!
const stage = { base: illustriousBase, baseLabel: 'Illustrious XL' }

const fit = loraAsset('fit', {
  name: 'Fits',
  baseModelFamily: 'Illustrious',
  triggerWord: 'fit_trigger, second',
  modelId: 1,
  modelVersionId: 11,
})
const flux = loraAsset('flux', {
  name: 'FluxOnly',
  baseModelFamily: 'Flux.1 D',
})

const recipe = (n: number): CivitaiImageRecipe =>
  ({
    imageUrl: `https://image.civitai.com/x/${n}.jpg`,
    prompt: `prompt ${n}`,
  }) as CivitaiImageRecipe

function StackProbe() {
  const stack = useActiveLoraStack()
  return (
    <output aria-label="stack">
      {stack.items.map((entry) => entry.asset.name).join(',')}
    </output>
  )
}

function renderPanel(
  props: Partial<Parameters<typeof LoraBenchLibraryPanel>[0]> = {},
) {
  const onClose = vi.fn()
  const onMakeSame = vi.fn()
  render(
    <LoraStackProvider>
      <LoraBenchLibraryPanel
        stage={stage}
        onClose={onClose}
        onMakeSame={onMakeSame}
        {...props}
      />
      <StackProbe />
    </LoraStackProvider>,
  )
  return { onClose, onMakeSame }
}

beforeEach(() => {
  window.localStorage.clear()
  queryClient.clear()
  __resetCivitaiLibraryCacheForTests()
  __resetMinedPromptsCacheForTests()
  data.mine = [fit, flux]
  data.recipes = []
  data.civitaiFails = false
  data.civitaiCalls = 0
})

const card = (name: string) =>
  screen.findByRole('button', { name: L('cardLabel', { name }) })

describe('LoraBenchLibraryPanel', () => {
  it('空台：底模跟第一把走，哪一把都列出来、都能挂', async () => {
    renderPanel()
    expect(await card('Fits')).toBeInTheDocument()
    fireEvent.click(await card('FluxOnly'))
    const detail = screen.getByRole('article', {
      name: L('detailLabel', { name: 'FluxOnly' }),
    })
    expect(
      within(detail).getByRole('button', { name: L('mount') }),
    ).toBeEnabled()
  })

  it('台上已有一把：默认只看能配当前底模的；关掉后装不上的那把详情说清楚且挂上不可点', async () => {
    seedLoraStack([
      { asset: loraAsset('seed', { baseModelFamily: 'Illustrious' }) },
    ])
    renderPanel()
    expect(await card('Fits')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: L('cardLabel', { name: 'FluxOnly' }),
      }),
    ).toBeNull()

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(await card('FluxOnly'))
    const detail = screen.getByRole('article', {
      name: L('detailLabel', { name: 'FluxOnly' }),
    })
    expect(
      within(detail).getByText(/LoraWorkbench.benchLibrary:incompatible:/),
    ).toHaveTextContent('Illustrious XL')
    expect(
      within(detail).getByRole('button', { name: L('mount') }),
    ).toBeDisabled()
  })

  it('底模是「来源图底模（自动）」时开关按解析到的家族说', async () => {
    const auto = LORA_BASE_MODELS.find(
      (base) =>
        base.translationKey === 'sourceCheckpointAuto' &&
        base.family === 'illustrious',
    )!
    renderPanel({ stage: { base: auto, baseLabel: '来源图底模（自动）' } })
    expect(await card('Fits')).toBeInTheDocument()
    expect(
      screen.getByText(
        L('fitOnly', { base: 'LoraWorkbench:familyLabel.illustrious' }),
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/来源图底模/)).toBeNull()
  })

  it('点卡片只开详情不挂；详情里挂上 / 卸下单独一颗', async () => {
    renderPanel()
    fireEvent.click(await card('Fits'))
    expect(screen.getByLabelText('stack')).toHaveTextContent('')
    const detail = screen.getByRole('article', {
      name: L('detailLabel', { name: 'Fits' }),
    })
    expect(within(detail).getByText('fit_trigger')).toBeInTheDocument()
    expect(within(detail).getByText('second')).toBeInTheDocument()
    fireEvent.click(within(detail).getByRole('button', { name: L('mount') }))
    expect(screen.getByLabelText('stack')).toHaveTextContent('Fits')
    fireEvent.click(within(detail).getByRole('button', { name: L('unmount') }))
    expect(screen.getByLabelText('stack')).toHaveTextContent('')
  })

  it('示例图每张一颗「做同款」：先挂上再交给宿主，面板收起', async () => {
    data.recipes = [recipe(1), recipe(2), recipe(3)]
    const { onMakeSame, onClose } = renderPanel({ initialAsset: fit })
    const detail = screen.getByRole('article', {
      name: L('detailLabel', { name: 'Fits' }),
    })
    const buttons = await within(detail).findAllByRole('button', {
      name: L('makeSame'),
    })
    expect(buttons).toHaveLength(3)
    fireEvent.click(buttons[1]!)
    await waitFor(() => expect(onMakeSame).toHaveBeenCalled())
    expect(onMakeSame.mock.calls[0]![0]).toMatchObject({ id: 'fit' })
    expect(onMakeSame.mock.calls[0]![1]).toMatchObject({
      imageUrl: recipe(2).imageUrl,
    })
    expect(screen.getByLabelText('stack')).toHaveTextContent('Fits')
    expect(onClose).toHaveBeenCalled()
  })

  it('「全部」取失败只在那一栏给重试，别的栏照常', async () => {
    data.civitaiFails = true
    renderPanel()
    fireEvent.click(screen.getByRole('tab', { name: L('tabAll') }))
    const alert = await screen.findByRole('alert')
    const calls = data.civitaiCalls
    fireEvent.click(within(alert).getByRole('button', { name: L('retry') }))
    await waitFor(() => expect(data.civitaiCalls).toBeGreaterThan(calls))
    fireEvent.click(screen.getByRole('tab', { name: L('tabFavorites') }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(await card('Fits')).toBeInTheDocument()
  })

  it('空栏给说明；Esc 与收起都关', async () => {
    data.mine = []
    const { onClose } = renderPanel()
    expect(await screen.findByText(L('empty.favorites'))).toBeInTheDocument()
    fireEvent.keyDown(screen.getByText(L('title')), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: L('close') }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
