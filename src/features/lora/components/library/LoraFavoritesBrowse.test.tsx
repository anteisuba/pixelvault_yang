import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LoraStackProvider,
  useActiveLoraStack,
} from '@/features/lora/hooks/use-active-lora-stack'
import { __resetMinedPromptsCacheForTests } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { __resetModelDescriptionCacheForTests } from '@/features/lora/hooks/use-civitai-model-description'
import { LORA_STACK_CLERK_ID } from '@/test/lora-stack'
import type { CivitaiLoraLibraryItem, LoraAssetRecord } from '@/types'

import { LoraFavoritesBrowse } from './LoraFavoritesBrowse'

// 和真 next-intl 一样，同一个命名空间回同一个 `t`（真挖配方 hook 的 effect 依赖它）。
const intl = vi.hoisted(() => {
  const byNamespace = new Map<
    string,
    (key: string, values?: Record<string, unknown>) => string
  >()
  const formatter = {
    number: (value: number) => String(value),
    relativeTime: () => 'now',
    dateTime: () => 'Aug 14',
  }
  return {
    formatter,
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
  useFormatter: () => intl.formatter,
}))

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
}))

// 真挂载栈、真下载闸、真详情 / 挖配方 hook、真本机偏好；只在 api-client 边界上假那几跳。
// 详情页取回的那一版：链接写法与收藏记录不同，版本号相同。
const api = vi.hoisted(() => ({ versions: [] as CivitaiLoraLibraryItem[] }))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  fetchCivitaiLoraDownloadPolicyAPI: async () => ({
    success: true,
    data: { downloadDisabled: false },
  }),
}))
vi.mock('@/lib/api-client/lora-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/lora-assets')>()),
  fetchCivitaiModelDescriptionAPI: async () => ({
    success: true,
    data: { descriptionText: null, versions: api.versions },
  }),
  mineCivitaiLoraPromptsAPI: async () => ({
    success: true,
    data: { recipes: [], previewImages: [] },
  }),
}))

/** 挂载栈里现在有哪几把（按名字）。 */
function StackProbe() {
  const stack = useActiveLoraStack()
  return (
    <output aria-label="stack">
      {stack.items.map((entry) => entry.asset.name).join(',')}
    </output>
  )
}

function makeAsset(
  id: string,
  name: string,
  overrides: Partial<LoraAssetRecord> = {},
): LoraAssetRecord {
  return {
    id,
    styleCode: `pv-${id}`,
    name,
    source: 'imported',
    type: 'subject',
    baseModelFamily: 'Anima',
    provider: 'civitai',
    triggerWord: `${name.toLowerCase()} (wuwa)`,
    loraUrl: `https://civitai.com/api/download/models/${id}`,
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: false,
    isOwn: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

const roccia = makeAsset('3001', 'Roccia', {
  modelId: 30,
  modelVersionId: 3001,
})
const qingxiao = makeAsset('3002', 'Qingxiao', {
  modelId: 31,
  modelVersionId: 3002,
  baseModelFamily: 'Illustrious',
  createdAt: '2026-09-10T00:00:00.000Z',
})

function renderFavorites(overrides: Record<string, unknown> = {}) {
  const props = {
    section: 'favorites' as const,
    trained: [],
    favorites: [roccia, qingxiao],
    isLoading: false,
    error: null,
    onRefresh: vi.fn(),
    onUnfavoriteByUrl: vi.fn().mockResolvedValue(true),
    onFavoriteCivitai: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(true),
    onVisibilityChange: vi.fn(),
    isFavorited: (url: string) =>
      [roccia.loraUrl, qingxiao.loraUrl].includes(url),
    onGoLibrary: vi.fn(),
    onGoTrain: vi.fn(),
    ...overrides,
  }
  render(
    <LoraStackProvider>
      <LoraFavoritesBrowse {...props} />
      <StackProbe />
    </LoraStackProvider>,
  )
  return props
}

/** 第 `index` 格的「更多」（挂载收在里面）。 */
function openMore(index: number) {
  const trigger = screen.getAllByRole('button', {
    name: 'LoraWorkbench.browse:more',
  })[index]
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
}

describe('LoraFavoritesBrowse（库 B · 收藏）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    __resetModelDescriptionCacheForTests()
    __resetMinedPromptsCacheForTests()
    api.versions = []
  })

  it('lists favorites newest first with the trigger word under each name', () => {
    renderFavorites()

    const names = screen
      .getAllByRole('button', { name: /^(Roccia|Qingxiao)$/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual(['Qingxiao', 'Roccia'])
    expect(screen.getByText('Anima · roccia (wuwa)')).toBeInTheDocument()
  })

  it('filters on this machine by name or trigger word', () => {
    renderFavorites()

    fireEvent.change(
      screen.getByRole('searchbox', {
        name: 'LoraWorkbench:myLorasSearchPlaceholder',
      }),
      { target: { value: 'qing' } },
    )
    expect(screen.queryByRole('button', { name: 'Roccia' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Qingxiao' })).toBeInTheDocument()
  })

  it('mounts the favorite record itself, in place', async () => {
    renderFavorites()

    openMore(1)
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'LoraWorkbench.browse:mountLabel:{"name":"Roccia"}',
      }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'stack' })).toHaveTextContent(
        'Roccia',
      ),
    )
  })

  it('knows the fetched version is the favorite — unfavorites by the record’s own link', async () => {
    api.versions = [
      {
        ...roccia,
        id: 'civitai:30:3001',
        loraUrl:
          'https://civitai.com/api/download/models/3001?type=Model&format=SafeTensor',
        modelId: 30,
        modelVersionId: 3001,
        versionName: 'v1.0',
        creatorName: null,
        creatorAvatarUrl: null,
        modelPageUrl: 'https://civitai.com/models/30?modelVersionId=3001',
        tags: [],
        downloadCount: 175,
        thumbsUpCount: 17,
        allowCommercialUse: [],
        allowDerivatives: false,
        thumbImageUrl: null,
        coverImageUrlOriginal: null,
        triggerAlternates: [],
        recommendedPrompt: null,
        recommendedPromptAlternates: [],
        triggerSource: 'official',
        fileHashAutoV3: null,
      },
    ]
    const props = renderFavorites()

    fireEvent.click(screen.getByRole('button', { name: 'Roccia' }))
    const favorite = await screen.findByRole('button', {
      name: 'LoraWorkbench:favorited',
    })
    fireEvent.click(favorite)

    await waitFor(() =>
      expect(props.onUnfavoriteByUrl).toHaveBeenCalledWith(roccia.loraUrl),
    )
    expect(props.onFavoriteCivitai).not.toHaveBeenCalled()
  })

  it('the first tile of 自训 is the dashed 训练新 LoRA (ui-spec ㊲)', () => {
    const props = renderFavorites({ section: 'trained' })

    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:trainTitle' }),
    )
    expect(props.onGoTrain).toHaveBeenCalled()
  })

  it('the bookmark on a tile unfavorites it in place', () => {
    const props = renderFavorites()

    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'LoraWorkbench.browse:unfavorite',
      })[1],
    )
    expect(props.onUnfavoriteByUrl).toHaveBeenCalledWith(roccia.loraUrl)
  })

  it('characters section lists each character’s LoRAs once, switchable by character', () => {
    const group = (id: string, name: string, loras: LoraAssetRecord[]) => ({
      characterCardId: id,
      name,
      coverUrl: null,
      looks: [],
      loras: loras.map((lora) => ({ ...lora, lookId: null })),
    })
    renderFavorites({
      section: 'characters',
      characterGroups: [
        group('c1', 'Denia', [roccia]),
        group('c2', 'Mira', [roccia, qingxiao]),
      ],
    })

    expect(screen.getAllByRole('button', { name: 'Roccia' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Qingxiao' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Denia' }))
    expect(screen.queryByRole('button', { name: 'Qingxiao' })).toBeNull()
  })
})
