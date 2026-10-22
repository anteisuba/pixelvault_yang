import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import zhMessages from '@/messages/zh.json'
import type { CharacterCardRecord } from '@/types'
import { useIsMobile } from '@/hooks/use-mobile'

import { CharacterOverview, type OverviewItem } from './CharacterOverview'

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

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
      loras: null,
      tags: [],
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
      summary: null,
      tavern: null,
      chatUserRole: '',
      generationCount: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as CharacterCardRecord,
  }
}

function renderOverview(
  items: OverviewItem[],
  extra: { onOpen?(id: string): void; onLongPress?(id: string): void } = {},
) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <CharacterOverview
        items={items}
        reducedMotion
        onOpen={extra.onOpen ?? vi.fn()}
        query=""
        {...(extra.onLongPress ? { onLongPress: extra.onLongPress } : {})}
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

describe('CharacterOverview · 全部角色（owner 09-28）', () => {
  it('人比「用得最多」多：最底下按名字列全员', () => {
    renderOverview(
      ['f', 'b', 'e', 'a', 'd', 'c'].map((id) =>
        card(id, id < 'd' ? '鸣潮' : '无限大', [`https://cdn.test/${id}.png`]),
      ),
    )
    const section = screen.getByRole('heading', { name: '全部角色' })
      .parentElement!.parentElement!
    const names = [
      ...section.querySelectorAll('[data-testid="roster-tile"]'),
    ].map((tile) => tile.textContent?.charAt(0))
    expect(names).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('人不多（都已在「用得最多」里）：不再摆一遍', () => {
    renderOverview([
      card('denia', '鸣潮', ['https://cdn.test/denia.png']),
      card('shiye', '无限大', ['https://cdn.test/shiye.png']),
    ])
    expect(screen.queryByRole('heading', { name: '全部角色' })).toBeNull()
  })
})

describe('CharacterOverview · 手机（iOS 稿 v16）', () => {
  afterEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(false)
    vi.useRealTimers()
  })

  it('名字写在图下面：图那一格里没有字', () => {
    vi.mocked(useIsMobile).mockReturnValue(true)
    renderOverview([
      card('denia', '鸣潮', ['https://cdn.test/denia.png']),
      card('shiye', '无限大', ['https://cdn.test/shiye.png']),
    ])
    const tile = screen.getAllByTestId('roster-tile')[0]!
    const picture = tile.querySelector('img')!.parentElement!
    expect(picture.textContent).toBe('')
    expect(tile.textContent).toContain('denia')
  })

  it('长按一张：交给 onLongPress，紧跟的那一下点击不打开详情；底下有一句提示', () => {
    vi.mocked(useIsMobile).mockReturnValue(true)
    vi.useFakeTimers()
    const onOpen = vi.fn()
    const onLongPress = vi.fn()
    renderOverview(
      [
        card('denia', '鸣潮', ['https://cdn.test/denia.png']),
        card('shiye', '无限大', ['https://cdn.test/shiye.png']),
      ],
      { onOpen, onLongPress },
    )
    const tile = screen.getAllByTestId('roster-tile')[0]!
    fireEvent.pointerDown(tile, {
      pointerType: 'touch',
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(onLongPress).toHaveBeenCalledWith('denia')
    fireEvent.click(tile)
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(tile)
    expect(onOpen).toHaveBeenCalledWith('denia')
    expect(screen.getByText('长按一张卡：编辑 · 复制 · 删除')).toBeTruthy()
  })
})
