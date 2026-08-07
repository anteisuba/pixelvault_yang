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
    // extraLoras 是做同款要补挂的那批（modal 里勾中的）——这条配方没有额外
    // LoRA，所以是空数组。
    expect(onApplyRecipe).toHaveBeenLastCalledWith(recipe, {
      includeSeed: false,
      extraLoras: [],
    })

    // G3b-seed: checking 用原图 seed locks the recipe's original seed.
    dialog = openSourceRecipeDialog()
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByText('sourceRecipeRemake'))
    expect(onApplyRecipe).toHaveBeenLastCalledWith(recipe, {
      includeSeed: true,
      extraLoras: [],
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

  // owner 2026-08-07：额外 LoRA 默认全挂，但要能逐个取消——做同款只补挂勾中的。
  it('做同款 only mounts the checked extra LoRAs (all checked by default)', () => {
    const keptExtra = { modelVersionId: 777, weight: 0.3 }
    const recipe: CivitaiImageRecipe = {
      ...SOURCE_RECIPE,
      extraLoras: [
        { name: 'illus01_style_collection_elpe_v0.22', weight: 0.2 },
        keptExtra,
      ],
    }
    const onApplyRecipe = vi.fn()

    render(
      <LoraSourceRecipeStrip
        assetName="Stabilizer"
        baseModelFamily="Illustrious"
        sourceUrl="https://example.com/lora"
        recipes={[recipe]}
        onApplyRecipe={onApplyRecipe}
      />,
    )

    const dialog = openSourceRecipeDialog()
    fireEvent.click(
      within(dialog).getByLabelText(
        'sourceRecipeExtraLoraInclude:{"name":"illus01_style_collection_elpe_v0.22"}',
      ),
    )
    // 摘要卡的承诺跟着降到 1——它说的是「将会挂几个」，不能还报总数。
    expect(
      within(dialog).getByText('sourceRecipeExtraLorasSummary:{"count":1}'),
    ).toBeInTheDocument()

    fireEvent.click(within(dialog).getByText('sourceRecipeRemake'))
    expect(onApplyRecipe).toHaveBeenLastCalledWith(recipe, {
      includeSeed: false,
      extraLoras: [keptExtra],
    })
  })

  // 取消勾选是**跟着这一张图**的：翻到下一张再翻回来要回到「全勾」，上一张的
  // 取消不该跟着走。排除集连着 index 一起存、render 期判失效实现——不是
  // useEffect 里 setState 重置（那会级联渲染，lint 也拦）。
  it('resets the extra-LoRA checkboxes when paging to another source image', () => {
    const withExtra: CivitaiImageRecipe = {
      ...SOURCE_RECIPE,
      extraLoras: [{ name: 'eduardo-xl', weight: 0.8 }],
    }
    const other: CivitaiImageRecipe = {
      ...SOURCE_RECIPE,
      imageUrl: 'https://example.com/second.png',
      prompt: 'second recipe',
    }

    render(
      <LoraSourceRecipeStrip
        assetName="Stabilizer"
        baseModelFamily="Illustrious"
        sourceUrl="https://example.com/lora"
        recipes={[withExtra, other]}
        onApplyRecipe={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByLabelText(
        'sourceImagePreviewLabel:{"name":"Stabilizer","n":1}',
      ),
    )
    const dialog = screen
      .getByText(SOURCE_RECIPE.prompt)
      .closest<HTMLElement>('[role="dialog"]') as HTMLElement
    const box = () =>
      within(dialog).getByLabelText(
        'sourceRecipeExtraLoraInclude:{"name":"eduardo-xl"}',
      ) as HTMLInputElement

    expect(box().checked).toBe(true)
    fireEvent.click(box())
    expect(box().checked).toBe(false)

    // 翻走再翻回来 → 回到全勾
    fireEvent.click(within(dialog).getByLabelText('sourceRecipeNext'))
    fireEvent.click(within(dialog).getByLabelText('sourceRecipePrev'))
    expect(box().checked).toBe(true)
  })
})
