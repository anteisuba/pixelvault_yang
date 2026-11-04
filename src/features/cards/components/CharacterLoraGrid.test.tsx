/**
 * 她页 LoRA 页签：真 useCharacterLoras（角色 LoRA 名单走假服务器）、真 LoRA 挑选框
 * （里面是真库页、真挂载栈收集器），库那几跳在 api-client 边界上假。
 * 看的是 PUT /api/character-loras 带上去的那一组主人。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CharacterCardRecord,
  CharacterLoraGroup,
  CivitaiLoraLibraryItem,
  LoraAssetRecord,
} from '@/types'
import { LoraStackProvider } from '@/features/lora/hooks/use-active-lora-stack'
import { queryClient } from '@/lib/query-client'
import { fakeServer } from '@/test/app-harness'
import { LORA_STACK_CLERK_ID } from '@/test/lora-stack'
import { DESKTOP_WIDTH, setViewport } from '@/test/viewport'

import { CharacterLoraGrid } from './CharacterLoraGrid'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FF_COMFY_RUNNER = 'true'
})

// 和真 next-intl 一样，同一个命名空间回同一个 `t`（库页里真 hook 的 effect 依赖它）。
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
        t = Object.assign(
          (key: string, values?: Record<string, unknown>) =>
            values?.name ? `${key}:${String(values.name)}` : key,
          { rich: (key: string) => key, has: () => true },
        )
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

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
}))
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/characters/her',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const library = vi.hoisted(() => ({ items: [] as unknown[] }))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  fetchCivitaiLoraDownloadPolicyAPI: async () => ({
    success: true,
    data: { downloadDisabled: false },
  }),
}))
vi.mock('@/lib/api-client/lora-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/lora-assets')>()),
  listLoraAssetsAPI: async () => ({ success: true, data: [] }),
  listDiscoverLoraAssetsAPI: async () => ({ success: true, data: [] }),
  listCivitaiLoraAssetsAPI: async (params: { page?: number }) => ({
    success: true,
    data: {
      items: library.items,
      page: params.page ?? 1,
      pageSize: 30,
      total: library.items.length,
      totalCapped: false,
      hasNextPage: false,
      literalTotal: library.items.length,
      fallback: null,
    },
  }),
  fetchCivitaiModelDescriptionAPI: async () => ({
    success: true,
    data: { descriptionText: null, versions: [] },
  }),
  mineCivitaiLoraPromptsAPI: async () => ({
    success: true,
    data: { recipes: [], previewImages: [] },
  }),
}))

afterAll(() => {
  delete process.env.NEXT_PUBLIC_FF_COMFY_RUNNER
})

const lora = (patch: Partial<LoraAssetRecord>) =>
  ({
    id: 'l1',
    styleCode: 'pv-l1',
    name: 'Denia',
    source: 'imported',
    loraUrl: 'https://civitai.com/api/download/models/1',
    baseModelFamily: 'Illustrious',
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: false,
    isOwn: true,
    createdAt: '2026-10-25T00:00:00.000Z',
    triggerWord: '',
    type: 'style',
    provider: 'civitai',
    ...patch,
  }) as LoraAssetRecord

/** Civitai 库里的一格。 */
const libraryItem = (
  id: string,
  name: string,
  modelVersionId: number,
): CivitaiLoraLibraryItem => ({
  ...lora({ id, name, styleCode: id, isPublic: true, isOwn: false }),
  loraUrl: `https://civitai.com/api/download/models/${modelVersionId}`,
  triggerAlternates: [],
  recommendedPrompt: null,
  recommendedPromptAlternates: [],
  triggerSource: 'official',
  fileHashAutoV3: null,
  coverImageUrlOriginal: null,
  thumbImageUrl: null,
  modelId: modelVersionId,
  modelVersionId,
  versionName: 'v1',
  creatorName: null,
  creatorAvatarUrl: null,
  modelPageUrl: `https://civitai.com/models/${modelVersionId}`,
  tags: [],
  downloadCount: 1,
  thumbsUpCount: 1,
  allowCommercialUse: [],
  allowDerivatives: false,
})

const group = (
  id: string,
  loras: (LoraAssetRecord & { lookId: string | null })[],
): CharacterLoraGroup => ({
  characterCardId: id,
  name: id,
  coverUrl: null,
  looks: [],
  loras,
})

const card = {
  id: 'her',
  name: 'her',
  looks: [],
} as unknown as CharacterCardRecord

type PutBody = {
  lora: { loraUrl: string }
  characters: { characterCardId: string; lookId: string | null }[]
}

function serveCharacterLoras(groups: CharacterLoraGroup[]) {
  const puts: PutBody[] = []
  fakeServer()
    .on('GET', '/api/character-loras', () =>
      Response.json({ success: true, data: groups }),
    )
    .on('PUT', '/api/character-loras', async (request) => {
      puts.push((await request.json()) as PutBody)
      return Response.json({ success: true, data: groups })
    })
  return puts
}

// 挂载栈在应用里是全局的那一份。
function renderGrid() {
  return render(
    <LoraStackProvider>
      <CharacterLoraGrid card={card} />
    </LoraStackProvider>,
  )
}

describe('CharacterLoraGrid（她页 LoRA 页签，第 ⑧ 步）', () => {
  let puts: PutBody[]
  beforeEach(() => {
    queryClient.clear()
    window.localStorage.clear()
    setViewport(DESKTOP_WIDTH)
    Element.prototype.scrollIntoView = vi.fn()
    library.items = []
    puts = serveCharacterLoras([
      group('her', [{ ...lora({}), lookId: null }]),
      group('other', [{ ...lora({}), lookId: 'look-x' }]),
    ])
  })

  it('卸下只拿掉她那一条，别的角色原样带回', async () => {
    renderGrid()
    expect(await screen.findByText('Denia')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'unloadLoraLabel:Denia' }),
    )
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({
      lora: expect.objectContaining({ loraUrl: lora({}).loraUrl }),
      characters: [{ characterCardId: 'other', lookId: 'look-x' }],
    })
  })

  it('挑选框圈的加给她（通用），已有的主人留着', async () => {
    library.items = [
      libraryItem('denia', 'Denia', 1),
      libraryItem('fresh', 'Fresh', 2),
    ]
    renderGrid()
    await screen.findByText('Denia')

    fireEvent.click(screen.getByRole('button', { name: 'addLora' }))
    // 她已经收着的那把在框里算「已挂」，不能再圈。
    // 框里的收藏要等接口回来；全量并发跑时默认 1 秒偶尔不够。
    const pick = await screen.findByRole(
      'button',
      { name: 'selectLabel:Fresh' },
      { timeout: 5000 },
    )
    expect(
      screen.queryByRole('button', { name: 'selectLabel:Denia' }),
    ).toBeNull()
    fireEvent.click(pick)
    fireEvent.click(screen.getByRole('button', { name: 'confirmCollect' }))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({
      lora: expect.objectContaining({
        loraUrl: 'https://civitai.com/api/download/models/2',
      }),
      characters: [{ characterCardId: 'her', lookId: null }],
    })
  })
})
