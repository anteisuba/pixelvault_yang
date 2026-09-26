import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import zhMessages from '@/messages/zh.json'
import type { CharacterCardRecord } from '@/types'

import { CharacterRoster } from './CharacterRoster'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { src, alt, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt} {...rest} />
  },
}))

// 直切（prefers-reduced-motion）：相位不经过中间档，断言只看结果。
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}))

vi.mock('@/hooks/cards/use-character-card-usage', () => ({
  useCharacterCardUsage: () => ({
    generations: [],
    total: null,
    isLoading: false,
  }),
}))

function card(
  id: string,
  name: string,
  overrides: Partial<CharacterCardRecord> = {},
): CharacterCardRecord {
  return {
    id,
    name,
    description: null,
    sourceImageUrl: `https://cdn.test/${id}.png`,
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
    handle: name,
    referenceSlots: [
      {
        id: 'slot-1',
        role: 'identity',
        url: `https://cdn.test/${id}.png`,
        isPrimary: true,
      },
    ],
    persona: null,
    cardTags: { character: [], appearance: [], loraTrigger: '' },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

const CARDS = [
  card('denia', 'Denia', {
    persona: {
      identity: '舞台魔术师',
      behavior: '先替别人撑好伞',
      speech: '叫对方「指挥官」',
      catchphrases: [],
      scenario: '',
      opening: '',
      examples: [],
      backstory: '',
    },
    variants: [
      card('denia-q', 'Denia', {
        parentId: 'denia',
        variantLabel: 'Q版',
        handle: 'Denia-Q版',
      }),
    ],
  }),
  card('rixi', '里希'),
]

vi.mock('@/hooks/cards/use-character-cards', () => ({
  useCharacterCards: () => ({
    cards: CARDS,
    isLoading: false,
    activeCardIds: [],
    toggleCardSelection: vi.fn(),
    findCard: (id: string) =>
      CARDS.flatMap((item) => [item, ...item.variants]).find(
        (item) => item.id === id,
      ) ?? null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

function renderRoster() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <CharacterRoster />
    </NextIntlClientProvider>,
  )
}

describe('CharacterRoster（卡片页 K3）', () => {
  it('网格里列出角色，变体跟在父卡后面并写明是谁的变体', () => {
    renderRoster()
    const tiles = screen.getAllByTestId('roster-tile')
    expect(tiles).toHaveLength(3)
    expect(tiles[1]).toHaveTextContent('Denia · Q版')
  })

  it('点一个角色打开侧栏；再点同一个收起', () => {
    renderRoster()
    const [denia] = screen.getAllByTestId('roster-tile')
    fireEvent.click(denia!)
    expect(screen.getByRole('complementary', { name: 'Denia' })).toBeTruthy()
    expect(denia).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(denia!)
    expect(screen.queryByRole('complementary', { name: 'Denia' })).toBeNull()
  })

  it('开着时点别的角色只换内容', () => {
    renderRoster()
    const tiles = screen.getAllByTestId('roster-tile')
    fireEvent.click(tiles[0]!)
    fireEvent.click(tiles[2]!)
    expect(screen.getByRole('complementary', { name: '里希' })).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: 'Denia' })).toBeNull()
  })

  it('三行一次只展开一行：点开设定，外观收起', () => {
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    const looks = screen.getByRole('button', { name: /外观/ })
    const setting = screen.getByRole('button', { name: /设定/ })
    expect(looks).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(setting)
    expect(setting).toHaveAttribute('aria-expanded', 'true')
    expect(looks).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('先替别人撑好伞')).toBeTruthy()
  })

  it('Esc 收起侧栏', () => {
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('complementary', { name: 'Denia' })).toBeNull()
  })
})
