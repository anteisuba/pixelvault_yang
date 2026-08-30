import { render, screen } from '@testing-library/react'
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

function model3DGeneration(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  const modelUrl = 'https://cdn.example.com/3d/model.glb'
  return {
    ...FAKE_GENERATION,
    outputType: 'MODEL_3D',
    url: modelUrl,
    storageKey: '3d/model.glb',
    mimeType: 'model/gltf-binary',
    modelUrl,
    modelStorageKey: '3d/model.glb',
    referenceImageUrl: 'https://cdn.example.com/source.png',
    width: 0,
    height: 0,
    ...overrides,
  } as GenerationRecord
}

function renderTile(generation: GenerationRecord) {
  return render(
    <AssetTile
      generation={generation}
      width={180}
      height={180}
      selected={false}
      showSelectionMark={false}
      selectionMode={false}
      draggable={false}
      onAudioCoverError={vi.fn()}
      onClick={vi.fn()}
    />,
  )
}

describe('AssetTile 3D preview', () => {
  it('never sends a GLB URL to an image element when the poster is missing', () => {
    renderTile(model3DGeneration())

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/source.png',
    )
    expect(screen.getByRole('img')).not.toHaveAttribute(
      'src',
      expect.stringContaining('.glb'),
    )
  })

  it('renders a 3D placeholder instead of an image when no still is available', () => {
    renderTile(model3DGeneration({ referenceImageUrl: null }))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getAllByText('sidebarModel3D')).toHaveLength(1)
  })
})
