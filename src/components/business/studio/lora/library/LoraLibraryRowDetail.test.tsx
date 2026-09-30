import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CivitaiLoraLibraryItem } from '@/types'

import { LoraLibraryRowDetail } from './LoraLibraryRowDetail'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values
        ? `${namespace}:${key}:${Object.values(values).join(',')}`
        : `${namespace}:${key}`
    return t
  },
}))

vi.mock('@/hooks/prompts/use-civitai-model-description', () => ({
  useCivitaiModelDescription: () => ({ descriptionText: null }),
}))

afterEach(cleanup)

describe('LoraLibraryRowDetail — civitai branch', () => {
  it('draws a different heart once favorited, not just a different colour', () => {
    const item = {
      id: 'civitai:7:2',
      name: 'Roccia',
      baseModelFamily: 'Illustrious',
      triggerWord: 'roccia',
      triggerSource: 'official',
      modelId: 7,
      modelPageUrl: 'https://civitai.com/models/7',
      coverImageUrl: null,
      creatorName: 'yuki',
      downloadCount: 8100,
      thumbsUpCount: 1200,
      allowCommercialUse: [],
    } as unknown as CivitaiLoraLibraryItem
    const heart = (isFavorited: boolean) => {
      render(
        <LoraLibraryRowDetail
          source="civitai"
          item={item}
          isFavorited={isFavorited}
          onUse={vi.fn()}
          onFavorite={vi.fn()}
          onCollapse={vi.fn()}
          sampleImages={[]}
          onSampleClick={vi.fn()}
          onPreviewCover={vi.fn()}
        />,
      )
      const svg = screen
        .getByRole('button', {
          name: isFavorited
            ? 'LoraWorkbench:unfavorite'
            : 'LoraWorkbench:favorite',
        })
        .querySelector('svg')!.innerHTML
      cleanup()
      return svg
    }
    expect(heart(true)).not.toBe(heart(false))
  })
})
