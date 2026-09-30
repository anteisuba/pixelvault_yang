import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LORA_BASE_MODELS } from '@/constants/lora-base-models'
import type { CivitaiLoraLibraryItem } from '@/types'

import { LoraStageProvider } from '../lora-stage-context'
import { LoraLibraryDetailPage } from './LoraLibraryDetailPage'

vi.mock('next-intl', () => ({
  useTranslations:
    (ns: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}:${key}:${JSON.stringify(values)}` : `${ns}:${key}`,
  useFormatter: () => ({
    number: (value: number) => String(Math.round(value)),
    relativeTime: () => 'now',
    dateTime: () => 'Aug 14',
  }),
}))

vi.mock('@/hooks/use-active-lora-stack', () => ({
  useActiveLoraStack: () => ({ items: [] }),
}))

let mockVersions: CivitaiLoraLibraryItem[] = []
vi.mock('@/hooks/prompts/use-civitai-model-description', () => ({
  useCivitaiModelDetail: () => ({
    descriptionText: 'Author notes',
    versions: mockVersions,
    isLoading: false,
  }),
}))
let mockShowcaseImages: string[] = []
vi.mock('@/hooks/use-huggingface-lora-showcase', () => ({
  useHuggingFaceLoraShowcase: (source: unknown) => ({
    images: source ? mockShowcaseImages : [],
    prompts: [],
    isLoading: false,
  }),
}))
vi.mock('@/hooks/prompts/use-civitai-mined-prompts', () => ({
  useCivitaiMinedPrompts: () => ({
    recipes: [],
    previewImages: [],
    isLoading: false,
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
    </LoraStageProvider>,
  )
  return onMount
}

describe('LoraLibraryDetailPage（库 B 详情页）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockShowcaseImages = []
  })

  it('mounts whichever version is picked', () => {
    const illustrious = makeVersion(
      2,
      'Illustrious',
      'roccia (wuthering waves)',
    )
    const pony = makeVersion(1, 'Pony', 'roccia_(wuwa)')
    mockVersions = [illustrious, pony]
    const onMount = renderPage(illustrious)

    fireEvent.click(screen.getByRole('button', { name: /v1/ }))
    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench.browse:mount' }),
    )
    expect(onMount).toHaveBeenCalledWith(pony)
  })

  it('offers the version that loads when this one does not', async () => {
    const illustrious = makeVersion(2, 'Illustrious', 'roccia')
    const pony = makeVersion(1, 'Pony', 'roccia_(wuwa)')
    mockVersions = [illustrious, pony]
    renderPage(pony)

    const offer = screen.getByRole('button', {
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
    mockVersions = [version]
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

  it('shows a Hugging Face file as it is: README images, its license name, the hub author page, no rating', () => {
    mockVersions = []
    mockShowcaseImages = [
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
      screen.getAllByRole('button', { name: /LoraWorkbench:viewer\.imageAlt/ }),
    ).toHaveLength(1)
  })

  it('says the license is unknown for a favorite saved without a snapshot — never “personal use”', () => {
    mockVersions = []
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
    mockVersions = [version]
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
