import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HuggingFaceLoraSearchItem } from '@/types'

import { HuggingFaceLoraLibrary } from './HuggingFaceLoraLibrary'

const mockUseHuggingFaceLoraLibrary = vi.hoisted(() => vi.fn())
const mockImport = vi.hoisted(() => vi.fn())
const mockSetBaseModelFamily = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('@/hooks/use-huggingface-lora-library', () => ({
  useHuggingFaceLoraLibrary: mockUseHuggingFaceLoraLibrary,
}))

function makeItem(): HuggingFaceLoraSearchItem {
  return {
    repoId: 'example/anima-style',
    name: 'anima style',
    modelPageUrl: 'https://huggingface.co/example/anima-style',
    revision: 'abc123',
    files: [
      {
        filename: 'weights/anima-style.safetensors',
        downloadUrl:
          'https://huggingface.co/example/anima-style/resolve/abc123/weights/anima-style.safetensors',
        sizeBytes: 1024,
        baseModelFamily: 'anima-dit',
      },
      {
        filename: 'weights/anima-style-v2.safetensors',
        downloadUrl:
          'https://huggingface.co/example/anima-style/resolve/abc123/weights/anima-style-v2.safetensors',
        sizeBytes: 2048,
        baseModelFamily: 'pony',
      },
    ],
    triggerWord: 'anima style',
    type: 'style',
    baseModelFamily: 'anima-dit',
    coverImageUrl: null,
    tags: ['lora', 'base_model:anima'],
    downloads: 120,
    likes: 8,
    license: 'apache-2.0',
    gated: false,
    private: false,
  }
}

function libraryState(item = makeItem()) {
  return {
    items: [item],
    search: '',
    baseModelFamily: 'all' as const,
    total: null,
    page: 1,
    hasNextPage: false,
    isLoading: false,
    isRevalidating: false,
    error: null,
    setSearch: vi.fn(),
    setBaseModelFamily: mockSetBaseModelFamily,
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    refresh: vi.fn(),
  }
}

describe('HuggingFaceLoraLibrary', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    mockImport.mockReset().mockResolvedValue(null)
    mockSetBaseModelFamily.mockReset()
    mockUseHuggingFaceLoraLibrary.mockReset().mockReturnValue(libraryState())
  })

  it('imports the exact SafeTensors file selected from a repository', async () => {
    render(
      <HuggingFaceLoraLibrary
        onImport={mockImport}
        isFavorited={() => false}
      />,
    )

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(
      screen.getByRole('option', {
        name: 'anima-style-v2.safetensors · pony',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'LoraWorkbench:huggingFaceImport' }),
    )

    await waitFor(() => {
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'huggingface',
          loraUrl: expect.stringContaining('anima-style-v2.safetensors'),
          baseModelFamily: 'pony',
        }),
      )
    })
  })

  it('shows that no trigger was provided instead of inventing one from the repository name', () => {
    const item = makeItem()
    item.triggerWord = ''
    mockUseHuggingFaceLoraLibrary.mockReturnValue(libraryState(item))

    render(
      <HuggingFaceLoraLibrary
        onImport={mockImport}
        isFavorited={() => false}
      />,
    )

    expect(
      screen.getByText(/LoraWorkbench:huggingFaceNoTrigger/),
    ).toBeInTheDocument()
  })

  it('keeps long weight filenames inside the card and exposes family filters', () => {
    render(
      <HuggingFaceLoraLibrary
        onImport={mockImport}
        isFavorited={() => false}
      />,
    )

    expect(screen.getByRole('combobox')).toHaveClass(
      'min-w-0',
      'max-w-full',
      'overflow-hidden',
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench:huggingFaceFamilyAnima',
      }),
    )
    expect(mockSetBaseModelFamily).toHaveBeenCalledWith('anima-dit')
  })
})
