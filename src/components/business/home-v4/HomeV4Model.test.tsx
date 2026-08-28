import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  HOME_V4_ALL_MODELS,
  HOME_V4_MODEL_FACETS,
  type HomeV4Model,
} from '@/constants/homepage-v4'

import { HomeV4ModelPage } from './HomeV4ModelPage'

vi.mock('next-intl', () => {
  const translate = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  })
  return { useTranslations: () => translate }
})

const model = (key: string): HomeV4Model => {
  const found = HOME_V4_ALL_MODELS.find((entry) => entry.key === key)
  if (!found) throw new Error(`no model ${key}`)
  return found
}

const renderModel = (key: string) =>
  render(<HomeV4ModelPage model={model(key)} onOpenDetail={() => undefined} />)

/**
 * One template, twenty-five records, four background states. jsdom has no
 * layout, so nothing here measures anything — what is pinned is which branch a
 * record takes, because that is the part a data edit can silently flip.
 */
describe('HomeV4ModelPage', () => {
  it('renders every model without throwing, each with a full strip', () => {
    for (const entry of HOME_V4_ALL_MODELS) {
      const { container, unmount } = renderModel(entry.key)

      expect(container.querySelectorAll('.m-glass')).toHaveLength(1)
      /* Two blocks, not three — 站内规格 was retired 2026-08-28. A stray `dl`
         would mean the spec column came back with it. */
      expect(container.querySelectorAll('.m-strip .pm')).toHaveLength(2)
      expect(container.querySelectorAll('.m-strip dl')).toHaveLength(0)
      expect(container.querySelectorAll('.m-strip .pm ul li')).toHaveLength(
        HOME_V4_MODEL_FACETS.PLUS + HOME_V4_MODEL_FACETS.MINUS,
      )
      expect(container.querySelectorAll('.m-tags i')).toHaveLength(
        HOME_V4_MODEL_FACETS.TAGS,
      )

      unmount()
    }
  })

  it('bleeds one shot with a scrim for a cover page', () => {
    const { container } = renderModel('gpt')
    const background = container.querySelector('.m-bg')

    expect(background?.className).toBe('m-bg l1')
    expect(container.querySelectorAll('.m-bg img')).toHaveLength(1)
    expect(container.querySelector('.m-bg .veil')).not.toBeNull()
    expect(container.querySelector('.m-bg .src')).not.toBeNull()
  })

  /* A portrait stood on paper needs no scrim — the glass sits on white. */
  it('stands the shot on the side, unscrimmed, for a side page', () => {
    const { container } = renderModel('wai')

    expect(container.querySelector('.m-bg')?.className).toBe('m-bg side l1')
    expect(container.querySelectorAll('.m-bg img')).toHaveLength(1)
    expect(container.querySelector('.m-bg .veil')).toBeNull()
  })

  it('hangs three panels for a wall page', () => {
    const { container } = renderModel('novelai')

    expect(container.querySelector('.m-bg')?.className).toBe('m-bg wall l1')
    expect(container.querySelectorAll('.m-bg img')).toHaveLength(3)
    expect(container.querySelector('.m-bg .veil2')).not.toBeNull()
  })

  /**
   * ⭐ The page with no shot says so, and prints the prompt that will make it.
   * The prompt stays in Chinese in every locale — it is a task addressed to a
   * model, not a sentence addressed to a reader — so it comes from the constant
   * and never from the message files.
   */
  it('shows the prompt card, in the original Chinese, when there is no shot', () => {
    const { container } = renderModel('wan30')
    const card = container.querySelector('.m-bg.plain .want')

    expect(card).not.toBeNull()
    expect(card?.querySelector('p')?.textContent).toBe(
      model('wan30').wantPrompt,
    )
    expect(container.querySelector('.m-bg img')).toBeNull()
    /* No shot means no provenance to claim. */
    expect(container.querySelector('.m-bg .src')).toBeNull()
  })

  it('draws a mark for the three brands that have one and types the rest', () => {
    expect(
      renderModel('gpt').container.querySelectorAll('.lg svg'),
    ).toHaveLength(1)
    expect(
      renderModel('seedream').container.querySelectorAll('.lg.seedmark b'),
    ).toHaveLength(1)
    expect(
      renderModel('flux').container.querySelector('.lg.textmark')?.textContent,
    ).toBe(model('flux').mark)
  })
})
