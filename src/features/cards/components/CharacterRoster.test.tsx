/**
 * 角色页：真 useCharacterCards / 最近 / 模板 / 人设 / 用量 / chub hook，真视口；只在
 * api-client 边界上假那几跳（其余请求落到假服务器，没登记的当断网）。断言看发上去的东西。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { zh as zhMessages } from '@/messages'
import type { CharacterCardRecord, CharacterLookRecord } from '@/types'
import {
  invalidateCardCache,
  makeCardCacheKey,
} from '@/features/cards/lib/card-cache'
import { __resetRecipesCacheForTests } from '@/features/prompts/hooks/use-recipes'
import { queryClient } from '@/lib/query-client'
import { fakeServer } from '@/test/app-harness'
import { DESKTOP_WIDTH, setViewport } from '@/test/viewport'

import { CharacterRoster } from './CharacterRoster'

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null }),
  useAuth: () => ({ userId: 'user_roster', isSignedIn: true, isLoaded: true }),
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

const api = vi.hoisted(() => ({
  cards: [] as unknown[],
  recent: [] as unknown[],
  create: vi.fn(),
  importTavern: vi.fn(),
  update: vi.fn(),
  searchChub: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => {
  const { ASSISTANT_PERSONA_DEFAULTS } =
    await import('@/constants/assistant-persona')
  return {
    ...(await importOriginal<typeof import('@/lib/api-client')>()),
    listCharacterCardsAPI: async () => ({ success: true, data: api.cards }),
    createCharacterCardAPI: api.create,
    importTavernCardAPI: api.importTavern,
    updateCharacterCardAPI: api.update,
    getCharacterRecentActivityAPI: async () => ({
      success: true,
      data: api.recent,
    }),
    getAssistantPersonaAPI: async () => ({
      success: true,
      data: { ...ASSISTANT_PERSONA_DEFAULTS },
    }),
    searchChubCardsAPI: api.searchChub,
  }
})
vi.mock('@/lib/api-client/recipes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/recipes')>()),
  listRecipesAPI: async () => ({
    success: true,
    data: { recipes: [], total: 0 },
  }),
}))
vi.mock('@/lib/api-client/cards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/cards')>()),
  getCharacterCardGenerationsAPI: async () => ({
    success: true,
    data: { generations: [], total: 0 },
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
    pinnedFields: [],
    generationCount: 0,
    isFavorite: false,
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
      boundaries: '',
      catchphrases: [],
      learnedPhrases: [],
      relationship: '',
      interests: [],
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

function renderRoster() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <CharacterRoster />
    </NextIntlClientProvider>,
  )
}

/** 角色名单那一跳回来了（总览的格子或直接打开的那一位已经画出来）。 */
async function renderLoaded() {
  const view = renderRoster()
  await screen.findAllByText(/Denia|里希/)
  return view
}

describe('CharacterRoster（角色页 · 方向 A）', () => {
  beforeEach(() => {
    mockSearch.value = ''
    window.localStorage.clear()
    invalidateCardCache(makeCardCacheKey('character'))
    __resetRecipesCacheForTests()
    queryClient.clear()
    setViewport(DESKTOP_WIDTH)
    fakeServer()
    api.cards = CARDS
    api.recent = []
    api.create.mockReset()
    api.importTavern.mockReset()
    api.searchChub.mockReset()
    api.searchChub.mockResolvedValue({ success: false, error: 'offline' })
    api.update.mockReset()
    api.update.mockImplementation(async (id: string) => ({
      success: true,
      data: CARDS.find((item) => item.id === id),
    }))
  })

  const openDenia = (tab?: string) => {
    fireEvent.click(screen.getAllByTestId('roster-tile')[0]!)
    if (tab) fireEvent.click(screen.getByRole('tab', { name: tab }))
  }

  it('画布「在角色页打开」带 ?character= 进来：直接打开那一位', async () => {
    mockSearch.value = 'character=rixi'
    await renderLoaded()
    expect(screen.getByRole('region', { name: '里希' })).toBeTruthy()
  })

  it('总览一位角色一张卡；造型只在「模板」页签左列管，图片页签不再有造型条', async () => {
    await renderLoaded()
    expect(screen.getAllByTestId('roster-tile')).toHaveLength(2)
    openDenia('图片')
    expect(screen.queryByRole('group', { name: '造型' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '模板' }))
    expect(
      await screen.findByText('还没有模板。在台上「存成模板」时挂到这套造型。'),
    ).toBeTruthy()
    const looks = screen.getByRole('group', { name: '造型' })
    expect(looks).toHaveTextContent('默认')
    expect(looks).toHaveTextContent('Q版')
  })

  it('点一个角色进整页详情：左栏她 + 右边页签（小房间 · 人物 · 图片 · 模板 · LoRA · 记忆 · 表情包）；「‹ 角色」回总览', async () => {
    await renderLoaded()
    openDenia()
    const detail = screen.getByRole('region', { name: 'Denia' })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '小房间',
      '人物',
      '图片',
      '模板',
      'LoRA',
      '记忆',
      '表情包',
    ])
    expect(screen.getByRole('button', { name: '和她聊' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /用她/ })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '人物' }))
    expect(detail).toHaveTextContent('先替别人撑好伞')
    fireEvent.click(screen.getByRole('button', { name: '角色' }))
    expect(screen.queryByRole('region', { name: 'Denia' })).toBeNull()
  })

  it('设定里含酒馆字段：备选开场白弹框加一条；酒馆一组常开，世界书只读、不再写「只保存」', async () => {
    await renderLoaded()
    openDenia('人物')
    const detail = screen.getByRole('region', { name: 'Denia' })
    expect(detail).toHaveTextContent('雨停了。')
    expect(detail).toHaveTextContent('系统提示词')
    expect(detail).toHaveTextContent('2 条')
    expect(detail).not.toHaveTextContent('只保存')
    fireEvent.click(screen.getByRole('button', { name: /加一条备选开场白/ }))
    fireEvent.change(screen.getByRole('textbox', { name: '备选开场白 2' }), {
      target: { value: '早上好。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await vi.waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
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

  it('人物页每格有图钉：钉住写进 pv.pinnedFields，再点取消；人物组有「声音」格', async () => {
    await renderLoaded()
    openDenia('人物')
    const detail = screen.getByRole('region', { name: 'Denia' })
    expect(detail).toHaveTextContent('还没挑声音')
    fireEvent.click(screen.getByRole('button', { name: '钉住说话方式' }))
    await vi.waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        'denia',
        expect.objectContaining({
          extensions: expect.objectContaining({
            'pv.pinnedFields': ['speech'],
          }),
        }),
      ),
    )
  })

  it('新角色 = 直接进空详情页，光标在名字；名字写好离开才建卡（只有名字、不带图）', async () => {
    api.create.mockResolvedValue({ success: true, data: card('shiye', '时夜') })
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: /新角色/ }))
    const name = screen.getByRole('textbox', { name: '名字' })
    expect(document.activeElement).toBe(name)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.blur(name)
    expect(api.create).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: '时夜' } })
    fireEvent.blur(name)
    await vi.waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        name: '时夜',
      }),
    )
    await vi.waitFor(() =>
      expect(screen.queryByRole('textbox', { name: '名字' })).toBeNull(),
    )
  })

  it('导入酒馆卡：选一个文件就导入，建好直接打开她', async () => {
    api.importTavern.mockResolvedValue({ success: true, data: CARDS[1] })
    const { container } = await renderLoaded()
    expect(screen.getByRole('button', { name: '导入酒馆卡' })).toBeTruthy()
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(['{}'], 'rixi.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    await vi.waitFor(() =>
      expect(api.importTavern.mock.calls[0]?.[0]).toBe(file),
    )
    await vi.waitFor(() =>
      expect(screen.getByRole('region', { name: '里希' })).toBeTruthy(),
    )
  })

  it('把卡拖进总览也导入（只认第一个文件）', async () => {
    api.importTavern.mockResolvedValue({ success: false, error: 'bad card' })
    await renderLoaded()
    const board = screen.getAllByTestId('roster-tile')[0]!
    const file = new File(['png'], 'card.png', { type: 'image/png' })
    const dataTransfer = { types: ['Files'], files: [file] }
    fireEvent.dragOver(board, { dataTransfer })
    fireEvent.drop(board, { dataTransfer })
    await vi.waitFor(() =>
      expect(api.importTavern.mock.calls[0]?.[0]).toBe(file),
    )
  })

  it('桌面总览 = 书架：顶上计数 · 搜索 · 导入 · 新角色；chub 卡库搬去酒馆库（用户 10-25）', async () => {
    await renderLoaded()
    expect(screen.getByRole('searchbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: /导入酒馆卡/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /新角色/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /卡库/ })).toBeNull()
    expect(api.searchChub).not.toHaveBeenCalled()
  })

  it('桌面带 ?tab=library 进来也只是书架（卡库在酒馆库）', async () => {
    mockSearch.value = 'tab=library'
    await renderLoaded()
    expect(screen.queryAllByTestId('library-tile')).toHaveLength(0)
    expect(screen.getAllByTestId('roster-tile').length).toBeGreaterThan(0)
    expect(api.searchChub).not.toHaveBeenCalled()
  })

  it('新角色草稿没起名就返回 = 什么都没建', async () => {
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: /新角色/ }))
    fireEvent.click(screen.getByRole('button', { name: '角色' }))
    expect(screen.queryByRole('textbox', { name: '名字' })).toBeNull()
    expect(screen.getAllByTestId('roster-tile')).toHaveLength(2)
    expect(api.create).not.toHaveBeenCalled()
  })

  it('Esc 收起详情；叠在上面的弹层吃掉的 Esc 不收', async () => {
    await renderLoaded()
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
    await renderLoaded()
    openDenia('人物')
    fireEvent.click(screen.getByRole('button', { name: '编辑性格' }))
    fireEvent.change(screen.getByRole('textbox', { name: '性格' }), {
      target: { value: '会先把伞递给别人' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await vi.waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    const [id, data] = api.update.mock.calls[0]!
    expect(id).toBe('denia')
    expect(data.persona).toMatchObject({
      identity: '舞台魔术师',
      behavior: '会先把伞递给别人',
      speech: '叫对方「指挥官」',
    })
  })

  it('编辑框没改就保存不存；取消放弃这次改动，也不收起详情', async () => {
    await renderLoaded()
    openDenia('人物')
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
    expect(api.update).not.toHaveBeenCalled()
  })

  it('桌面总览「最近」：每位最近一件事一张卡，点一张打开她', async () => {
    api.recent = [
      {
        cardId: 'rixi',
        kind: 'journal',
        text: '今天学了一首新歌',
        fields: [],
        at: new Date().toISOString(),
      },
    ]
    await renderLoaded()
    const recent = await screen.findByTestId('character-recent-card')
    expect(recent).toHaveTextContent('里希 · 写了日记 · 今天')
    expect(recent).toHaveTextContent('今天学了一首新歌')
    fireEvent.click(recent)
    expect(screen.getByRole('region', { name: '里希' })).toBeTruthy()
  })
})
