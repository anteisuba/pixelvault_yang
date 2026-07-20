import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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
  it('opens the shared source-recipe modal on image click and dismisses it', async () => {
    render(
      <LoraSourceRecipeStrip
        assetName="Lin Pianpian"
        baseModelFamily="Illustrious"
        sourceUrl="https://example.com/lora"
        recipes={[SOURCE_RECIPE]}
        onApplyRecipe={vi.fn()}
      />,
    )

    // G3b (R3): the strip is now just a thumbnail band — no inline recipe
    // panel. Clicking a source image opens the shared recipe modal (full
    // recipe on the right), the only place the recipe/params live.
    fireEvent.click(
      screen.getByRole('button', { name: /sourceImagePreviewLabel/ }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(SOURCE_RECIPE.prompt)).toBeInTheDocument()

    // Close button (Radix DialogContent close, sr-only labelled).
    fireEvent.click(screen.getByRole('button', { name: 'sourceRecipeClose' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )

    // Re-open, then Esc dismisses (Radix Dialog).
    fireEvent.click(
      screen.getByRole('button', { name: /sourceImagePreviewLabel/ }),
    )
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('做同款 applies with a fresh seed by default and the original seed when 用原图 seed is checked', async () => {
    const recipe: CivitaiImageRecipe = {
      ...SOURCE_RECIPE,
      seed: '5536891017203',
      steps: 32,
      cfgScale: 4,
      sampler: 'DPM++ 2M Karras',
    }
    const onApplyRecipe = vi.fn()

    render(
      <LoraSourceRecipeStrip
        assetName="Aisha"
        baseModelFamily="Illustrious"
        sourceUrl="https://example.com/lora"
        recipes={[recipe]}
        onApplyRecipe={onApplyRecipe}
      />,
    )

    // Default: 做同款 applies the real recipe with a fresh seed and closes the
    // modal — it never generates directly.
    fireEvent.click(
      screen.getByRole('button', { name: /sourceImagePreviewLabel/ }),
    )
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'sourceRecipeRemake' }),
    )
    expect(onApplyRecipe).toHaveBeenLastCalledWith(recipe, {
      includeSeed: false,
    })

    // G3b-seed: checking 用原图 seed locks the recipe's original seed.
    fireEvent.click(
      screen.getByRole('button', { name: /sourceImagePreviewLabel/ }),
    )
    dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'sourceRecipeRemake' }),
    )
    expect(onApplyRecipe).toHaveBeenLastCalledWith(recipe, {
      includeSeed: true,
    })
  })
})
