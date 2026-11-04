import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LORA_BASE_MODELS } from '@/features/lora/constants/lora-base-models'
import { LoraStackProvider } from '@/features/lora/hooks/use-active-lora-stack'
import { __resetMinedPromptsCacheForTests } from '@/features/lora/hooks/use-civitai-mined-prompts'
import { __resetModelDescriptionCacheForTests } from '@/features/lora/hooks/use-civitai-model-description'
import { LORA_STACK_CLERK_ID } from '@/test/lora-stack'
import type { CivitaiLoraLibraryItem } from '@/types'

import { LoraStageProvider } from '../lora-stage-context'
import { LoraLibraryDetailPage } from './LoraLibraryDetailPage'

// 和真 next-intl 一样，同一个命名空间回同一个 `t`（真挖配方 hook 的 effect 依赖它）。
const intl = vi.hoisted(() => {
  const byNamespace = new Map<
    string,
    (key: string, values?: Record<string, unknown>) => string
  >()
  const formatter = {
    number: (value: number) => String(Math.round(value)),
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

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: LORA_STACK_CLERK_ID }),
}))

// 真作者描述 / 版本、真 HF README 样图、真挖配方 hook：只在 api-client 边界上假那三跳。
const api = vi.hoisted(() => ({
  versions: [] as unknown[],
  showcaseImages: [] as string[],
}))
vi.mock('@/lib/api-client/lora-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/lora-assets')>()),
  fetchCivitaiModelDescriptionAPI: async () => ({
    success: true,
    data: { descriptionText: 'Author notes', versions: api.versions },
  }),
  fetchHuggingFaceShowcaseAPI: async () => ({
    success: true,
    data: { images: api.showcaseImages, prompts: [] },
  }),
  mineCivitaiLoraPromptsAPI: async () => ({
    success: true,
    data: { recipes: [], previewImages: [] },
  }),
}))

function makeVersion(
  versionId: number,
  family: string,
  trigger: string,
): CivitaiLoraLibraryItem {
  return {
    id: `civitai:7:${versionId}`,
    styleCode: `civitai-${versionId}`,
    name: 'Roccia',
    source: 'imported',
    type: 'subject',
    baseModelFamily: family,
    provider: 'civitai',
    triggerWord: trigger,
    triggerAlternates: [],
    recommendedPrompt: null,
    recommendedPromptAlternates: [],
    triggerSource: 'official',
    fileHashAutoV3: null,
    loraUrl: `https://civitai.com/api/download/models/${versionId}`,
    coverImageUrl: null,
    coverImageUrlOriginal: null,
    thumbImageUrl: null,
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: '2026-08-14T00:00:00.000Z',
    modelId: 7,
    modelVersionId: versionId,
    versionName: `v${versionId}`,
    creatorName: 'yuki',
    creatorAvatarUrl: null,
    modelPageUrl: `https://civitai.com/models/7?modelVersionId=${versionId}`,
    tags: [],
    downloadCount: 8100,
    thumbsUpCount: 1200,
    allowCommercialUse: [],
    allowDerivatives: false,
    fileSizeBytes: 218 * 1024 * 1024,
  }
}

const illustriousBase =
  LORA_BASE_MODELS.find((base) => base.family === 'illustrious') ?? null

function renderPage(
  item: CivitaiLoraLibraryItem,
  onMount = vi.fn(),
  extra: Partial<Parameters<typeof LoraLibraryDetailPage>[0]> = {},
) {
  render(
    <LoraStackProvider>
      <LoraStageProvider value={{ base: illustriousBase, baseLabel: 'WAI' }}>
        <LoraLibraryDetailPage
          item={item}
          isMounted={() => false}
          mountingId={null}
          onMount={onMount}
          isFavorited={() => false}
          onToggleFavorite={vi.fn()}
          nsfwFilter="safe"
          onClose={vi.fn()}
          {...extra}
        />
      </LoraStageProvider>
    </LoraStackProvider>,
  )
  return onMount
}

describe('LoraLibraryDetailPage（库 B 详情页）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    __resetModelDescriptionCacheForTests()
    __resetMinedPromptsCacheForTests()
    api.versions = []
    api.showcaseImages = []
  })

  it('mounts whichever version is picked', async () => {
    const illustrious = makeVersion(
      2,
      'Illustrious',
      'roccia (wuthering waves)',
    )
    const pony = makeVersion(1, 'Pony', 'roccia_(wuwa)')
    api.versions = [illustrious, pony]
    const onMount = renderPage(illustrious)

    fireEvent.click(await screen.findByRole('button', { name: /v1/ }))
    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench.browse:mount' }),
    )
    expect(onMount).toHaveBeenCalledWith(pony)
  })

  it('offers the version that loads when this one does not', async () => {
    const illustrious = makeVersion(2, 'Illustrious', 'roccia')
    const pony = makeVersion(1, 'Pony', 'roccia_(wuwa)')
    api.versions = [illustrious, pony]
    renderPage(pony)

    const offer = await screen.findByRole('button', {
      name: /LoraWorkbench\.browse:switchVersion/,
    })
    expect(offer.textContent).toContain('v2 · Illustrious')
    fireEvent.click(offer)
    // 切版本：两边先淡出再淡入这一版的。
    expect(
      await screen.findByRole('button', { name: /v2/, pressed: true }),
    ).toBeInTheDocument()
  })

  it('copies a trigger word and says so on that chip, no toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const version = makeVersion(2, 'Illustrious', 'roccia (wuthering waves)')
    api.versions = [version]
    renderPage(version)

    fireEvent.click(
      screen.getByRole('button', { name: /roccia \(wuthering waves\)/ }),
    )
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('roccia (wuthering waves)'),
    )
    expect(
      await screen.findByText('LoraWorkbench.browse:copied'),
    ).toBeInTheDocument()
  })

  it('shows a Hugging Face file as it is: README images, its license name, the hub author page, no rating', async () => {
    api.versions = []
    api.showcaseImages = [
      'https://huggingface.co/example/anima/resolve/abc/a.png',
    ]
    const file: CivitaiLoraLibraryItem = {
      ...makeVersion(0, 'Illustrious', 'anima style'),
      id: 'huggingface:example/anima:anima.safetensors',
      styleCode: '',
      provider: 'huggingface',
      modelId: 0,
      modelVersionId: 0,
      versionName: 'anima.safetensors',
      creatorName: 'example',
      loraUrl:
        'https://huggingface.co/example/anima/resolve/abc/anima.safetensors',
      modelPageUrl: 'https://huggingface.co/example/anima',
      createdAt: '',
      sourceSnapshot: {
        source: 'huggingface',
        author: 'example',
        license: {
          label: 'apache-2.0',
          commercialUse: null,
          allowDerivatives: null,
          allowNoCredit: null,
          known: true,
        },
        pageUrl: 'https://huggingface.co/example/anima',
        revision: 'abc',
        retrievedAt: '2026-09-28T00:00:00.000Z',
        fileSizeBytes: 1024,
        metadataCompleteness: 'partial',
      },
    }
    renderPage(file, vi.fn(), { origin: 'huggingface', versions: [file] })

    expect(screen.getByText('LoraWorkbench.browse:files')).toBeInTheDocument()
    expect(screen.getByText('apache-2.0')).toBeInTheDocument()
    expect(screen.getByText('LoraWorkbench.browse:license')).toBeInTheDocument()
    expect(screen.queryByText('LoraWorkbench.browse:ratingSafe')).toBeNull()
    expect(
      screen.getByRole('link', { name: 'LoraWorkbench.browse:authorHome' }),
    ).toHaveAttribute('href', 'https://huggingface.co/example')
    expect(
      await screen.findAllByRole('button', {
        name: /LoraWorkbench:viewer\.imageAlt/,
      }),
    ).toHaveLength(1)
  })

  it('says the license is unknown for a favorite saved without a snapshot — never “personal use”', () => {
    api.versions = []
    const favorite: CivitaiLoraLibraryItem = {
      ...makeVersion(2, 'Illustrious', 'roccia'),
      isOwn: true,
      allowCommercialUse: [],
      sourceSnapshot: null,
    }
    renderPage(favorite)

    expect(
      screen.getByText('LoraWorkbench.browse:licenseUnknown'),
    ).toBeInTheDocument()
    expect(screen.queryByText('LoraWorkbench:licensePersonalUse')).toBeNull()
    expect(screen.queryByText('LoraWorkbench.browse:ratingSafe')).toBeNull()
  })

  it('draws a different heart once favorited, not just a different colour', () => {
    const version = makeVersion(2, 'Illustrious', 'roccia')
    api.versions = [version]
    const heart = (favorited: boolean) => {
      renderPage(version, vi.fn(), { isFavorited: () => favorited })
      const svg = screen
        .getByRole('button', {
          name: favorited
            ? 'LoraWorkbench:favorited'
            : 'LoraWorkbench:favorite',
          pressed: favorited,
        })
        .querySelector('svg')!.innerHTML
      cleanup()
      return svg
    }
    expect(heart(true)).not.toBe(heart(false))
  })
})
