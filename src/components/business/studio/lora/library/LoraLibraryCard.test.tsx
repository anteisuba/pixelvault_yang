import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CivitaiLoraLibraryItem } from '@/types'

import { LoraLibraryGridCard } from './LoraLibraryCard'

// 移动端封面网格的一格：整张卡是一个按钮（读屏 = LoRA 名），计数用紧凑格式
// （171px 宽的格子放不下 444,132 这种全长数字）。

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('@/hooks/use-huggingface-showcase-cover', () => ({
  useHuggingFaceShowcaseCover: (
    _repoId: string,
    _revision: string,
    fallbackCoverUrl: string | null,
  ) => ({
    coverUrl: fallbackCoverUrl,
    isPending: false,
    setObservedElement: vi.fn(),
  }),
}))

function makeCivitaiItem(): CivitaiLoraLibraryItem {
  return {
    id: 'civitai-1',
    modelId: 1,
    name: 'Detail Tweaker',
    triggerWord: 'detail',
    triggerSource: 'declared',
    loraUrl: 'https://civitai.com/api/download/models/1',
    modelPageUrl: 'https://civitai.com/models/1',
    baseModelFamily: 'illustrious',
    type: 'style',
    downloadCount: 444_132,
    thumbsUpCount: 43_120,
    isNsfw: false,
    coverImageUrl: 'https://image.civitai.com/cover.jpeg',
    coverImageUrlOriginal: null,
    cardImageUrl: 'https://image.civitai.com/width=450/cover.jpeg',
    thumbImageUrl: 'https://image.civitai.com/width=96/cover.jpeg',
    previewImageUrls: [],
    creatorName: 'someone',
    allowCommercialUse: [],
    allowNoCredit: true,
    tags: [],
  } as unknown as CivitaiLoraLibraryItem
}

describe('LoraLibraryGridCard', () => {
  it('is a single button labelled with the LoRA name and reports the open intent', () => {
    const onOpen = vi.fn()
    render(
      <LoraLibraryGridCard
        source="civitai"
        item={makeCivitaiItem()}
        onOpen={onOpen}
      />,
    )

    const card = screen.getByRole('button', { name: 'Detail Tweaker' })
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalledTimes(1)
    // 卡上不放第二动作：使用/收藏都在抽屉里，卡面只负责「打开」。
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('renders counts compactly plus the source and base-model chips', () => {
    render(
      <LoraLibraryGridCard
        source="civitai"
        item={makeCivitaiItem()}
        onOpen={vi.fn()}
      />,
    )

    expect(screen.getByText('444k')).toBeInTheDocument()
    expect(screen.getByText('43k')).toBeInTheDocument()
    expect(
      screen.getByText('LoraWorkbench:librarySourceCivitaiShort'),
    ).toBeInTheDocument()
    expect(screen.getByText('illustrious')).toBeInTheDocument()
  })
})
