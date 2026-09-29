import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AssetTile } from '@/components/business/assets/AssetTile'
import { FAKE_GENERATION } from '@/test/api-helpers'
import type { GenerationRecord } from '@/types'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderTile(
  generation: GenerationRecord,
  props: Partial<React.ComponentProps<typeof AssetTile>> = {},
) {
  const onClick = vi.fn()
  const onToggleFavorite = vi.fn()
  render(
    <AssetTile
      generation={generation}
      width={180}
      height={240}
      selected={false}
      showSelectionMark={false}
      selectionMode={false}
      draggable={false}
      onAudioCoverError={vi.fn()}
      onClick={onClick}
      onToggleFavorite={onToggleFavorite}
      {...props}
    />,
  )
  return { onClick, onToggleFavorite }
}

describe('AssetTile ♥ favorite key (排布与详情 A)', () => {
  it('toggles the favorite without opening the asset', () => {
    const { onClick, onToggleFavorite } = renderTile(FAKE_GENERATION)

    fireEvent.click(screen.getByRole('button', { name: 'detailFavorite' }))

    expect(onToggleFavorite).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('reads as pressed and offers to unfavorite once liked', () => {
    renderTile({ ...FAKE_GENERATION, isLiked: true })

    expect(
      screen.getByRole('button', { name: 'detailUnfavorite' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not take a second press while the request is in flight', () => {
    const { onToggleFavorite } = renderTile(FAKE_GENERATION, {
      favoritePending: true,
    })

    fireEvent.click(screen.getByRole('button', { name: 'detailFavorite' }))

    expect(onToggleFavorite).not.toHaveBeenCalled()
  })

  it('steps aside in selection mode', () => {
    renderTile(FAKE_GENERATION, { selectionMode: true })

    expect(
      screen.queryByRole('button', { name: 'detailFavorite' }),
    ).not.toBeInTheDocument()
  })
})

describe('AssetTile hover tag', () => {
  it('names the model and the pixel size', () => {
    renderTile({
      ...FAKE_GENERATION,
      model: 'anima-dit-runner',
      width: 960,
      height: 1280,
    })

    expect(screen.getByText('anima-dit-runner')).toBeInTheDocument()
    expect(screen.getByText('960×1280')).toBeInTheDocument()
  })

  it('keeps only the size for a local upload', () => {
    renderTile({
      ...FAKE_GENERATION,
      model: 'user-upload',
      width: 800,
      height: 600,
    })

    expect(screen.queryByText('user-upload')).not.toBeInTheDocument()
    expect(screen.getByText('800×600')).toBeInTheDocument()
  })
})
