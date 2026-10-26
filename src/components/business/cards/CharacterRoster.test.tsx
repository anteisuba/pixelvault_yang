import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { zh as zhMessages } from '@/messages'
import type { CharacterCardRecord, CharacterLookRecord } from '@/types'

import { CharacterRoster } from './CharacterRoster'

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null }),
}))

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

const mockSearch = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearch.value),
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

function look(
  id: string,
  label: string | null,
  isDefault: boolean,
  url: string,
): CharacterLookRecord {
  return {
    id,
    label,
    isDefault,
    description: null,
    tags: [],
    referenceSlots: [{ id: 'slot-1', role: 'identity', url, isPrimary: true }],
  }
}

function card(
  id: string,
  name: string,
  overrides: Partial<CharacterCardRecord> = {},
): CharacterCardRecord {
  return {
    id,
    name,
    tags: [],
    handle: name,
    looks: [look(`${id}-look`, null, true, `https://cdn.test/${id}.png`)],
    persona: null,
    workOverride: null,
    summary: null,
    tavern: null,
    chatUserRole: '',
    voiceCardId: null,
    generationCount: 0,
    isFavorite: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

const mockUpdate = vi.fn().mockResolvedValue(true)
const mockToggleFavorite = vi.fn()
const mockCreate = vi.fn()
const mockImportTavern = vi.fn()
const mockImportChub = vi.fn()
const mockLibraryEnabled = vi.hoisted(() => ({ value: false }))

vi.mock('@/hooks/cards/use-chub-card', () => ({
  useChubCard: (fullPath: string | null) => ({
    status: fullPath ? 'ready' : 'idle',
    node: fullPath
      ? {
          name: 'Rei',
          topics: [],
          max_res_url: null,
          definition: {
            name: 'Rei',
            personality: '',
            tavern_personality: '',
            scenario: '',
            first_message: '欢迎光临。',
            example_dialogs: '',
            description: '',
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: ['又见面了。'],
          },
        }
      : null,
    error: null,
    retry: () => {},
  }),
}))

vi.mock('@/hooks/cards/use-chub-library', () => ({
  useChubLibrary: (enabled: boolean) => {
    mockLibraryEnabled.value = enabled
    return {
      query: '',
      setQuery: vi.fn(),
      sort: 'popular',
      setSort: vi.fn(),
      items: [
        {
          fullPath: 'maker/rei',
          name: 'Rei',
          tagline: '雨夜里的店主',
          tags: ['Original'],
          avatarUrl: null,
          starCount: 1200,
          tokenCount: 900,
        },
      ],
      status: 'ready',
      moreStatus: null,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      retry: vi.fn(),
    }
  },
}))

const CARDS = [
  card('denia', 'Denia', {
    persona: {
      identity: '舞台魔术师',
      behavior: '先替别人撑好伞',
      speech: '叫对方「指挥官」',
      boundaries: '',
      catchphrases: [],
      moods: [],
      learnedPhrases: [],
      scenario: '',
      opening: '',
      examples: [],
      backstory: '',
    },
    tavern: {
      alternateGreetings: ['雨停了。'],
      characterBook: { entries: [{ key: 'a' }, { key: 'b' }] },
    },
    looks: [
      look('denia-look', null, true, 'https://cdn.test/denia.png'),
      look('denia-q', 'Q版', false, 'https://cdn.test/denia-q.png'),
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
    findCard: (id: string) => CARDS.find((item) => item.id === id) ?? null,
    create: (...a: unknown[]) => mockCreate(...a),
    importTavern: (...a: unknown[]) => mockImportTavern(...a),
    importChub: (...a: unknown[]) => mockImportChub(...a),
    update: (...a: unknown[]) => mockUpdate(...a),
    toggleFavorite: (...a: unknown[]) => mockToggleFavorite(...a),
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
  beforeEach(() => {
    mockSearch.value = ''
  })

  it('画布「在角色页打开」带 ?character= 进来：直接打开那一位', () => {
    mockSearch.value = 'character=rixi'
    renderRoster()
    expect(screen.getByRole('region', { name: '里希' })).toBeTruthy()
  })

  it('总览一位角色一张卡；造型在详情顶上切换（角色④）', () => {
    renderRoster()
    expect(screen.getAllByTestId('roster-tile')).toHaveLength(2)
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    const looks = screen.getByRole('group', { name: '造型' })
    expect(looks).toHaveTextContent('默认')
    expect(looks).toHaveTextContent('Q版')
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

  it('设定里含酒馆字段：备选开场白弹框加一条；更多折起来，世界书只读', async () => {
    mockUpdate.mockClear()
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    const detail = screen.getByRole('region', { name: 'Denia' })
    expect(detail).toHaveTextContent('雨停了。')
    expect(detail).not.toHaveTextContent('系统提示词')
    fireEvent.click(screen.getByRole('button', { name: '展开' }))
    expect(detail).toHaveTextContent('2 条')
    fireEvent.click(screen.getByRole('button', { name: /加一条备选开场白/ }))
    fireEvent.change(screen.getByRole('textbox', { name: '备选开场白 2' }), {
      target: { value: '早上好。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        'denia',
        expect.objectContaining({
          extensions: expect.objectContaining({
            'st.card': expect.objectContaining({
              alternateGreetings: ['雨停了。', '早上好。'],
            }),
          }),
        }),
      ),
    )
  })

  it('新角色 = 直接进空详情页，光标在名字；名字写好离开才建卡（只有名字、不带图）', async () => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(card('shiye', '时夜'))
    renderRoster()
    fireEvent.click(screen.getByRole('button', { name: /新角色/ }))
    const name = screen.getByRole('textbox', { name: '名字' })
    expect(document.activeElement).toBe(name)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.blur(name)
    expect(mockCreate).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: '时夜' } })
    fireEvent.blur(name)
    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        name: '时夜',
      }),
    )
    await vi.waitFor(() =>
      expect(screen.queryByRole('textbox', { name: '名字' })).toBeNull(),
    )
  })

  it('导入酒馆卡：选一个文件就导入，建好直接打开她', async () => {
    mockImportTavern.mockReset()
    mockImportTavern.mockResolvedValue(CARDS[1])
    const { container } = renderRoster()
    expect(screen.getByRole('button', { name: '导入酒馆卡' })).toBeTruthy()
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(['{}'], 'rixi.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    await vi.waitFor(() => expect(mockImportTavern).toHaveBeenCalledWith(file))
    await vi.waitFor(() =>
      expect(screen.getByRole('region', { name: '里希' })).toBeTruthy(),
    )
  })

  it('把卡拖进总览也导入（只认第一个文件）', async () => {
    mockImportTavern.mockReset()
    mockImportTavern.mockResolvedValue(null)
    renderRoster()
    const board = screen.getAllByTestId('roster-tile')[0]!
    const file = new File(['png'], 'card.png', { type: 'image/png' })
    const dataTransfer = { types: ['Files'], files: [file] }
    fireEvent.dragOver(board, { dataTransfer })
    fireEvent.drop(board, { dataTransfer })
    await vi.waitFor(() => expect(mockImportTavern).toHaveBeenCalledWith(file))
  })

  it('桌面总览 = 书架：顶上计数 · 搜索 · 导入 · 新角色；chub 卡库搬去酒馆库（用户 10-25）', () => {
    renderRoster()
    expect(screen.getByRole('searchbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: /导入酒馆卡/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /新角色/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /卡库/ })).toBeNull()
    expect(mockLibraryEnabled.value).toBe(false)
  })

  it('桌面带 ?tab=library 进来也只是书架（卡库在酒馆库）', () => {
    mockSearch.value = 'tab=library'
    renderRoster()
    expect(screen.queryAllByTestId('library-tile')).toHaveLength(0)
    expect(screen.getAllByTestId('roster-tile').length).toBeGreaterThan(0)
  })

  it('新角色草稿没起名就返回 = 什么都没建', () => {
    mockCreate.mockReset()
    renderRoster()
    fireEvent.click(screen.getByRole('button', { name: /新角色/ }))
    fireEvent.click(screen.getByRole('button', { name: '角色' }))
    expect(screen.queryByRole('textbox', { name: '名字' })).toBeNull()
    expect(screen.getAllByTestId('roster-tile')).toHaveLength(2)
    expect(mockCreate).not.toHaveBeenCalled()
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

  it('点正文弹大编辑框：改性格点保存，整份设定带回（没改的格不丢）', async () => {
    mockUpdate.mockClear()
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    fireEvent.click(screen.getByRole('button', { name: '编辑性格' }))
    fireEvent.change(screen.getByRole('textbox', { name: '性格' }), {
      target: { value: '会先把伞递给别人' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    const [id, data] = mockUpdate.mock.calls[0]!
    expect(id).toBe('denia')
    expect(data.persona).toMatchObject({
      identity: '舞台魔术师',
      behavior: '会先把伞递给别人',
      speech: '叫对方「指挥官」',
    })
  })

  it('编辑框没改就保存不存；取消放弃这次改动，也不收起详情', async () => {
    mockUpdate.mockClear()
    renderRoster()
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    fireEvent.click(screen.getByRole('button', { name: '编辑身份' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await vi.waitFor(() =>
      expect(screen.queryByRole('textbox', { name: '身份' })).toBeNull(),
    )
    fireEvent.click(screen.getByRole('button', { name: '编辑身份' }))
    fireEvent.change(screen.getByRole('textbox', { name: '身份' }), {
      target: { value: '半截' },
    })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole('region', { name: 'Denia' })).toBeTruthy()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
