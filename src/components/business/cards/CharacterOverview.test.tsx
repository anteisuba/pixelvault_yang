import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import zhMessages from '@/messages/zh.json'
import type { CharacterCardRecord } from '@/types'

import { CharacterOverview, type OverviewItem } from './CharacterOverview'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { src, alt, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt} {...rest} />
  },
}))

function card(id: string, work: string, urls: string[]): OverviewItem {
  return {
    parentName: null,
    card: {
      id,
      name: id,
      description: null,
      sourceImageUrl: urls[0] ?? null,
      sourceImages: [],
      sourceImageEntries: [],
      characterPrompt: '',
      modelPrompts: null,
      referenceImages: null,
      attributes: null,
      loras: null,
      tags: [],
      status: 'DRAFT',
      stabilityScore: null,
      parentId: null,
      variantLabel: null,
      variants: [],
      handle: id,
      referenceSlots: urls.map((url, index) => ({
        id: `slot-${index + 1}`,
        role: 'identity',
        url,
        isPrimary: index === 0,
      })),
      persona: null,
      cardTags: { character: [], appearance: [], loraTrigger: '' },
      workOverride: work,
      generationCount: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as CharacterCardRecord,
  }
}

function renderOverview(items: OverviewItem[]) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <CharacterOverview
        items={items}
        reducedMotion
        onOpen={vi.fn()}
        query=""
      />
    </NextIntlClientProvider>,
  )
}

describe('CharacterOverview · 作品书架（owner 09-28：不放一样的图）', () => {
  it('一部作品只有一位、卡上一张图：扇形里只放那一张，⛔ 不重复三遍', () => {
    renderOverview([
      card('denia', '鸣潮', ['https://cdn.test/denia.png']),
      card('shiye', '无限大', ['https://cdn.test/shiye.png']),
    ])
    const shelf = screen.getByRole('button', { name: /鸣潮.*1 位/ })
    expect(shelf.querySelectorAll('img')).toHaveLength(1)
  })

  it('人不够三位就拿她卡上别的图补齐，三张各不相同', () => {
    renderOverview([
      card('denia', '鸣潮', [
        'https://cdn.test/d1.png',
        'https://cdn.test/d2.png',
        'https://cdn.test/d3.png',
      ]),
      card('shiye', '无限大', ['https://cdn.test/shiye.png']),
    ])
    const shelf = screen.getByRole('button', { name: /鸣潮.*1 位/ })
    const srcs = [...shelf.querySelectorAll('img')].map((img) =>
      img.getAttribute('src'),
    )
    expect(new Set(srcs).size).toBe(3)
  })
})
