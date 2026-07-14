import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CivitaiImageRecipe } from '@/types'

import { LoraSourceRecipeStrip } from './LoraSourceRecipeStrip'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

const SOURCE_RECIPE: CivitaiImageRecipe = {
  imageUrl: 'https://example.com/source-image.png',
  source: 'model_version_image',
  prompt: 'portrait, green hanfu',
}

describe('LoraSourceRecipeStrip', () => {
  it('selects a source recipe and opens a keyboard-dismissible image preview', async () => {
    const onSelectedImageUrlChange = vi.fn()

    render(
      <LoraSourceRecipeStrip
        assetName="Lin Pianpian"
        recipes={[SOURCE_RECIPE]}
        selectedImageUrl={null}
        includeSeed={false}
        extraMountStatusByKey={{}}
        extraStackFull={false}
        onSelectedImageUrlChange={onSelectedImageUrlChange}
        onIncludeSeedChange={vi.fn()}
        onMountExtraLora={vi.fn()}
        onApplyRecipe={vi.fn()}
      />,
    )

    const previewButton = screen.getByRole('button', {
      name: /sourceImagePreviewLabel/,
    })

    fireEvent.click(previewButton)

    expect(onSelectedImageUrlChange).toHaveBeenCalledWith(
      SOURCE_RECIPE.imageUrl,
    )
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /sourceImageAlt/ })).toHaveAttribute(
      'src',
      SOURCE_RECIPE.imageUrl,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'sourceImagePreviewClose' }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(previewButton).toHaveFocus()
    })

    fireEvent.click(previewButton)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(previewButton).toHaveFocus()
    })
  })

  it('shows executable versus unsupported fields and accepts a large seed', () => {
    const recipe: CivitaiImageRecipe = {
      ...SOURCE_RECIPE,
      seed: '5536891017203',
      steps: 32,
      cfgScale: 4,
      sampler: 'DPM++ 2M Karras',
      clipSkip: 2,
    }
    const onApplyRecipe = vi.fn()

    render(
      <LoraSourceRecipeStrip
        assetName="Aisha"
        recipes={[recipe]}
        selectedImageUrl={recipe.imageUrl}
        includeSeed={true}
        extraMountStatusByKey={{}}
        extraStackFull={false}
        onSelectedImageUrlChange={vi.fn()}
        onIncludeSeedChange={vi.fn()}
        onMountExtraLora={vi.fn()}
        onApplyRecipe={onApplyRecipe}
      />,
    )

    expect(screen.getByText(/recipeWillApply/)).toHaveTextContent('seed')
    expect(screen.getByText(/recipeSkipped/)).toHaveTextContent('clipSkip')
    fireEvent.click(screen.getByRole('button', { name: 'recipeApply' }))
    expect(onApplyRecipe).toHaveBeenCalledWith(recipe, { includeSeed: true })
    expect(screen.getByText(/recipeApplied/)).toHaveTextContent('sampler')
  })
})
