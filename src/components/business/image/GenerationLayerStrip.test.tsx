import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

vi.mock('@/lib/api-client', () => ({
  downloadRemoteAsset: vi.fn(),
}))

import { GenerationLayerStrip } from '@/components/business/image/GenerationLayerStrip'
import type { GenerationLayerRecord } from '@/types'

const MESSAGES = {
  GenerationLayers: {
    sectionLabel: 'Layers ({count})',
    layerFallbackName: 'Layer {z}',
    downloadLayer: 'Download layer',
    downloadFailed: 'Could not download this layer.',
  },
  Errors: {},
}

function renderStrip(layers: GenerationLayerRecord[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <GenerationLayerStrip layers={layers} />
    </NextIntlClientProvider>,
  )
}

const LAYER: GenerationLayerRecord = {
  id: 'layer-1',
  zIndex: 1,
  url: 'https://cdn.example.com/layer-1.png',
  storageKey: 'image/run-layer-1.png',
  mimeType: 'image/png',
  width: 1273,
  height: 265,
  name: 'Seedream title text',
  description: 'Yellow serif title',
}

describe('GenerationLayerStrip', () => {
  it('lists every layer with its provider-given name and description', () => {
    renderStrip([LAYER, { ...LAYER, id: 'layer-2', zIndex: 2, name: 'Parrot' }])

    expect(screen.getByText('Layers (2)')).toBeInTheDocument()
    expect(screen.getByText('Seedream title text')).toBeInTheDocument()
    expect(screen.getAllByText('Yellow serif title')).toHaveLength(2)
    expect(screen.getByText('Parrot')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Download layer' }),
    ).toHaveLength(2)
  })

  // provider 不保证给 name —— 缺了要有能读的回退，⛔ 不画一行空白。
  it('falls back to the z-index when the model gave no name', () => {
    renderStrip([{ ...LAYER, name: null, description: null }])
    expect(screen.getByText('Layer 1')).toBeInTheDocument()
  })

  // 底图不在这个列表里；没有图层 = 整段不渲染。
  it('renders nothing without layers', () => {
    const { container } = renderStrip([])
    expect(container).toBeEmptyDOMElement()
  })
})
