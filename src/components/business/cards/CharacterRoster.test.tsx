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

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/hooks/use-assistant-persona', () => ({
  useAssistantPersona: () => ({
    persona: { character: null },
    isLoading: false,
    save: vi.fn(),
  }),
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

describe('CharacterRoster（角色页 · 方向 A）', () => {
  it('总览按张数列出角色，变体跟在父卡后面并写明是谁的变体', () => {
    renderRoster()
    const tiles = screen.getAllByTestId('roster-tile')
    expect(tiles).toHaveLength(3)
    expect(screen.getByText('Denia · Q版')).toBeTruthy()
  })

  it('点一个角色进整页详情：图片在上、设定在下；「‹ 角色」回总览', () => {
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    const detail = screen.getByRole('region', { name: 'Denia' })
    expect(detail).toHaveTextContent('先替别人撑好伞')
    expect(detail).toHaveTextContent('图片')
    fireEvent.click(screen.getByRole('button', { name: '角色' }))
    expect(screen.queryByRole('region', { name: 'Denia' })).toBeNull()
  })

  it('Esc 收起详情；叠在上面的弹层吃掉的 Esc 不收', () => {
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(screen.getByRole('region', { name: 'Denia' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Denia' })).toBeNull()
  })

  it('点哪改哪：改性格、离开这一格就存，整份设定带回（没改的格不丢）', async () => {
    mockUpdate.mockClear()
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
    const behavior = screen.getByRole('textbox', { name: '性格' })
    fireEvent.change(behavior, { target: { value: '会先把伞递给别人' } })
    fireEvent.blur(behavior)
    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    const [id, data] = mockUpdate.mock.calls[0]!
    expect(id).toBe('denia')
    expect(data.persona).toMatchObject({
      identity: '舞台魔术师',
      behavior: '会先把伞递给别人',
      speech: '叫对方「指挥官」',
    })
  })

  it('没改就离开不存；改到一半按 Esc 放弃这次改动，也不收起详情', () => {
    mockUpdate.mockClear()
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    const identity = screen.getByRole('textbox', { name: '身份' })
    fireEvent.focus(identity)
    fireEvent.blur(identity)
    fireEvent.change(identity, { target: { value: '半截' } })
    fireEvent.keyDown(identity, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Denia' })).toBeTruthy()
    expect(identity).toHaveValue('舞台魔术师')
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
