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

function openSourceRecipeDialog(): HTMLElement {
  fireEvent.click(screen.getByLabelText(/sourceImagePreviewLabel/))
  const prompt = screen.getByText(SOURCE_RECIPE.prompt)
  const dialog = prompt.closest<HTMLElement>('[role="dialog"]')
  expect(dialog).not.toBeNull()
  return dialog as HTMLElement
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
    const dialog = openSourceRecipeDialog()
    expect(within(dialog).getByText(SOURCE_RECIPE.prompt)).toBeInTheDocument()

    // Close button (Radix DialogContent close, sr-only labelled).
    const closeButton = screen.getByText('sourceRecipeClose').closest('button')
    expect(closeButton).not.toBeNull()
    fireEvent.click(closeButton as HTMLButtonElement)
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument(),
    )

    // Re-open, then Esc dismisses (Radix Dialog).
    expect(openSourceRecipeDialog()).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument(),
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
    let dialog = openSourceRecipeDialog()
    fireEvent.click(within(dialog).getByText('sourceRecipeRemake'))
    expect(onApplyRecipe).toHaveBeenLastCalledWith(recipe, {
      includeSeed: false,
    })

    // G3b-seed: checking 用原图 seed locks the recipe's original seed.
    dialog = openSourceRecipeDialog()
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByText('sourceRecipeRemake'))
    expect(onApplyRecipe).toHaveBeenLastCalledWith(recipe, {
      includeSeed: true,
    })
  })

  it('lists stacked extra LoRAs in the recipe detail before 做同款', () => {
    const recipe: CivitaiImageRecipe = {
      ...SOURCE_RECIPE,
      loraWeight: 0.6,
      extraLoras: [
        {
          name: 'illus01_style_collection_elpe_v0.22',
          weight: 0.2,
        },
        {
          modelVersionId: 777,
          weight: 0.3,
        },
      ],
    }

    render(
      <LoraSourceRecipeStrip
        assetName="Stabilizer"
        baseModelFamily="Illustrious"
        sourceUrl="https://example.com/lora"
        recipes={[recipe]}
        onApplyRecipe={vi.fn()}
      />,
    )

    const dialog = openSourceRecipeDialog()
    // 摘要卡：做同款前就看见「还会尝试挂载 N 个」
    expect(
      within(dialog).getByText('sourceRecipeExtraLorasSummary:{"count":2}'),
    ).toBeInTheDocument()
    // 详情列表：名称 + 定位强弱
    expect(
      within(dialog).getByText('illus01_style_collection_elpe_v0.22'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('#777')).toBeInTheDocument()
    expect(
      within(dialog).getByText('sourceRecipeExtraLoraLocateNameOnly'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('sourceRecipeExtraLoraLocateStrong'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('sourceRecipeExtraLoraNameOnlyHint'),
    ).toBeInTheDocument()
  })
})
