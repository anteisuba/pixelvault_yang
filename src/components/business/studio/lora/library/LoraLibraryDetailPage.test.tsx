import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function renderPage(item: CivitaiLoraLibraryItem, onMount = vi.fn()) {
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
      />
    </LoraStageProvider>,
  )
  return onMount
}

describe('LoraLibraryDetailPage（库 B 详情页）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
