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
    workOverride: null,
    generationCount: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

const mockUpdate = vi.fn().mockResolvedValue(true)

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
    update: (...a: unknown[]) => mockUpdate(...a),
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

  it('叠在侧栏上的弹层吃掉的 Esc 不收侧栏', () => {
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    })
    event.preventDefault()
    window.dispatchEvent(event)
    expect(screen.getByRole('complementary', { name: 'Denia' })).toBeTruthy()
  })

  it('编辑：在侧栏里改性格，保存时整份设定带回（没改的格不丢）', async () => {
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const behavior = screen.getByLabelText(/性格/)
    fireEvent.change(behavior, { target: { value: '会先把伞递给别人' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalled())
    const [id, data] = mockUpdate.mock.calls[0]!
    expect(id).toBe('denia')
    expect(data.persona).toMatchObject({
      identity: '舞台魔术师',
      behavior: '会先把伞递给别人',
      speech: '叫对方「指挥官」',
    })
  })
})
