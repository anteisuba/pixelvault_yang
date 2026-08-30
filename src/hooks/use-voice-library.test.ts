import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createVoiceCardAPI,
  deleteVoiceCardAPI,
  listVoicesAPI,
} from '@/lib/api-client'
import {
  isClonedVoiceCard,
  mapFishVoiceToAsset,
  useVoiceLibrary,
} from '@/hooks/use-voice-library'
import type { FishAudioVoice } from '@/services/fish-audio-voice.service'
import type { VoiceCardRecord } from '@/types'

/**
 * 声音库内核的单元测试。
 *
 * 这里锁的是**两个域共用的规则**——画布的 `VoiceSelector` 和配音间的选角面板都
 * 靠这一份内核，任何一条破了就是两个域一起坏。渲染不在测试范围内（那是各域自己的
 * 皮肤）。
 */

/* ⚠ mock barrel，别改成深导入 `@/lib/api-client/voices`——那是另一个模块说明符，
   这份 mock 替换不到它。 */
vi.mock('@/lib/api-client', () => ({
  listVoicesAPI: vi.fn(),
  createVoiceCardAPI: vi.fn(),
  deleteVoiceCardAPI: vi.fn(),
}))

/**
 * ⚠ 这里**故意**让 `useTranslations` 每次返回新函数——这正是 2026-08-30 那个 bug 的
 * 触发条件：`t` 曾经在 `fetchVoices` 的依赖里，引用不稳 → effect 每渲染重跑 → 新请求
 * 把上一个挤成过期 → 过期响应撞上竞态守卫 return（不碰 loading）→ `isLoading` 永远
 * 回不到 false。
 *
 * 内核改用 latest-ref 之后这条不该再有影响。**别把它改成稳定引用**，那样等于把
 * 回归测试关掉了。
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const refreshMock = vi.fn(async () => {})
const cardsRef: { cards: VoiceCardRecord[] } = { cards: [] }

vi.mock('@/hooks/cards/use-voice-cards', () => ({
  useVoiceCards: () => ({
    cards: cardsRef.cards,
    isLoading: false,
    error: null,
    findCard: () => null,
    refresh: refreshMock,
  }),
}))

const mockListVoices = vi.mocked(listVoicesAPI)
const mockCreateCard = vi.mocked(createVoiceCardAPI)
const mockDeleteCard = vi.mocked(deleteVoiceCardAPI)

function makeFishVoice(overrides?: Partial<FishAudioVoice>): FishAudioVoice {
  return {
    id: 'voice-1',
    title: 'Fish Narrator',
    description: null,
    coverImage: 'https://cdn.example.com/cover.png',
    state: 'trained',
    languages: ['zh'],
    tags: ['narration'],
    samples: [
      { title: null, text: '示例文本', audio: 'https://cdn.example.com/s.mp3' },
    ],
    likeCount: 0,
    taskCount: 0,
    visibility: 'public',
    createdAt: '2026-08-01T00:00:00.000Z',
    author: null,
    ...overrides,
  }
}

function makeCard(overrides?: Partial<VoiceCardRecord>): VoiceCardRecord {
  return {
    id: 'card-1',
    userId: 'user-1',
    name: '晴',
    provider: 'fish_audio',
    modelId: 'fish-audio-s2-pro',
    voiceId: 'voice-1',
    coverImage: null,
    referenceAudioUrl: null,
    referenceAudioStorageKey: null,
    gender: null,
    age: null,
    tone: [],
    pace: 'normal',
    pitch: null,
    pronunciationDictionary: {},
    sampleAudioUrl: null,
    sampleText: null,
    isDeleted: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  cardsRef.cards = []
  mockListVoices.mockResolvedValue({
    success: true,
    data: { total: 1, items: [makeFishVoice()] },
  })
  mockCreateCard.mockResolvedValue({ success: true, data: makeCard() })
  mockDeleteCard.mockResolvedValue({ success: true })
})

describe('useVoiceLibrary', () => {
  it('公开库拉完就退出加载态', async () => {
    const { result } = renderHook(() => useVoiceLibrary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.publicVoices).toHaveLength(1)
    expect(result.current.publicVoices[0].title).toBe('Fish Narrator')
  })

  /**
   * 2026-08-30 的回归：`t` 引用不稳曾让 effect 每渲染重跑，请求彼此挤成过期，
   * `isLoading` 永远停在 true。这里靠「重渲染多次之后仍然只发了一次请求」来锁。
   */
  it('t 引用不稳也不会反复重拉（latest-ref 回归）', async () => {
    const { result, rerender } = renderHook(() => useVoiceLibrary())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const callsAfterFirstLoad = mockListVoices.mock.calls.length

    rerender()
    rerender()
    rerender()

    expect(mockListVoices.mock.calls.length).toBe(callsAfterFirstLoad)
    expect(result.current.isLoading).toBe(false)
  })

  /**
   * ⭐ 收藏必须把示例音频一起带走，且**绝不能**写进 `referenceAudioUrl`——那是
   * 克隆卡的分流判据，写了会把收藏卡错分进克隆 tab。
   */
  it('收藏时带上 sampleAudioUrl，且不碰 referenceAudioUrl', async () => {
    const { result } = renderHook(() => useVoiceLibrary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const asset = result.current.publicVoices[0]
    await act(async () => {
      await result.current.toggleFavorite(asset)
    })

    expect(mockCreateCard).toHaveBeenCalledTimes(1)
    const payload = mockCreateCard.mock.calls[0][0]
    expect(payload.sampleAudioUrl).toBe('https://cdn.example.com/s.mp3')
    expect(payload.sampleText).toBe('示例文本')
    expect(payload.voiceId).toBe('voice-1')
    // 这一条是重点：写进去就会把收藏卡错分成克隆卡
    expect(payload).not.toHaveProperty('referenceAudioUrl')
  })

  /**
   * ⭐ 2026-08-30 的回归：`toggleFavorite` 必须**返回**新建的那张卡。
   *
   * 调用方 await 完再去读 `favoriteCardOf` 是过期闭包——它捕获的是发起操作那一刻
   * 的卡列表，刷新之后的新卡永远看不见。配音间「请进房间」就因此收藏成功、班底
   * 却一动不动。这个用例故意**不更新** `cardsRef.cards`（模拟刷新还没落到闭包里），
   * 所以只有返回值这条路能通。
   */
  it('收藏返回新建的那张卡，不必回头去读列表', async () => {
    const created = makeCard({ id: 'card-new', voiceId: 'voice-1' })
    mockCreateCard.mockResolvedValue({ success: true, data: created })

    const { result } = renderHook(() => useVoiceLibrary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const asset = result.current.publicVoices[0]
    let returned: VoiceCardRecord | null = null
    await act(async () => {
      returned = await result.current.toggleFavorite(asset)
    })

    expect(returned).not.toBeNull()
    expect(returned!.id).toBe('card-new')
    // 闭包这条路依然是空的——正是它坑了调用方。
    expect(result.current.favoriteCardOf(asset)).toBeNull()
  })

  it('取消收藏返回 null（没有卡产出）', async () => {
    cardsRef.cards = [makeCard({ id: 'card-9', voiceId: 'voice-1' })]

    const { result } = renderHook(() => useVoiceLibrary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let returned: VoiceCardRecord | null = makeCard()
    await act(async () => {
      returned = await result.current.toggleFavorite(
        result.current.publicVoices[0],
      )
    })

    expect(returned).toBeNull()
  })

  it('已收藏的再点一次是取消，并通知宿主清选中态', async () => {
    const saved = makeCard({ id: 'card-9', voiceId: 'voice-1' })
    cardsRef.cards = [saved]
    const onFavoriteRemoved = vi.fn()

    const { result } = renderHook(() => useVoiceLibrary({ onFavoriteRemoved }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const asset = result.current.publicVoices[0]
    expect(result.current.favoriteCardOf(asset)?.id).toBe('card-9')

    await act(async () => {
      await result.current.toggleFavorite(asset)
    })

    expect(mockDeleteCard).toHaveBeenCalledWith('card-9')
    expect(mockCreateCard).not.toHaveBeenCalled()
    expect(onFavoriteRemoved).toHaveBeenCalledWith('card-9')
  })

  /** ⭐ 收藏与克隆同属 VoiceCard，判据只有 `referenceAudioUrl` 一个。 */
  it('按 referenceAudioUrl 把卡分流成收藏与克隆', async () => {
    cardsRef.cards = [
      makeCard({ id: 'fav-1', name: '晴', referenceAudioUrl: null }),
      makeCard({
        id: 'clone-1',
        name: '小雨',
        referenceAudioUrl: 'https://cdn.example.com/ref.mp3',
      }),
    ]

    const { result } = renderHook(() => useVoiceLibrary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.favorites.map((c) => c.id)).toEqual(['fav-1'])
    expect(result.current.cloned.map((c) => c.id)).toEqual(['clone-1'])
  })

  it('切到本地分栏时不再拉公开库', async () => {
    const { result } = renderHook(() => useVoiceLibrary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const before = mockListVoices.mock.calls.length

    act(() => result.current.setTab('cloned'))

    await waitFor(() => expect(result.current.publicVoices).toHaveLength(0))
    expect(mockListVoices.mock.calls.length).toBe(before)
    expect(result.current.isLoading).toBe(false)
  })

  it('换筛选回到第一页', async () => {
    const { result } = renderHook(() => useVoiceLibrary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.setPage(3))
    await waitFor(() => expect(result.current.page).toBe(3))

    act(() => result.current.setLanguage('ja'))
    await waitFor(() => expect(result.current.page).toBe(1))

    act(() => result.current.setPage(2))
    await waitFor(() => expect(result.current.page).toBe(2))

    act(() => result.current.setSortBy('created_at'))
    await waitFor(() => expect(result.current.page).toBe(1))
  })

  /**
   * 触底扩载：`loadMore` 是**追加**，`setPage` 是**翻页**（整屏替换）。两种语义
   * 共用一份取数，混了就会出现「翻一页丢掉前一页」或「滚一下重复一屏」。
   */
  it('loadMore 追加到列表尾巴，并按 id 去重', async () => {
    mockListVoices.mockResolvedValueOnce({
      success: true,
      data: {
        total: 3,
        items: [makeFishVoice({ id: 'v1' }), makeFishVoice({ id: 'v2' })],
      },
    })
    const { result } = renderHook(() => useVoiceLibrary())
    await waitFor(() => expect(result.current.publicVoices).toHaveLength(2))
    expect(result.current.hasMore).toBe(true)

    // 第二页与第一页有重叠（上游按热度排，两次请求之间榜单会动）。
    mockListVoices.mockResolvedValueOnce({
      success: true,
      data: {
        total: 3,
        items: [makeFishVoice({ id: 'v2' }), makeFishVoice({ id: 'v3' })],
      },
    })
    act(() => result.current.loadMore())

    await waitFor(() => expect(result.current.publicVoices).toHaveLength(3))
    expect(result.current.publicVoices.map((v) => v.voiceId)).toEqual([
      'v1',
      'v2',
      'v3',
    ])
    expect(result.current.hasMore).toBe(false)
  })

  /** ⚠ 换筛选会把页码拨回 1，那一份结果**必须替换**，哪怕扩载标记还立着。 */
  it('loadMore 之后改筛选，是替换不是追加', async () => {
    const { result } = renderHook(() => useVoiceLibrary())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.loadMore())
    act(() => result.current.setLanguage('ja'))

    await waitFor(() => expect(result.current.page).toBe(1))
    await waitFor(() => expect(result.current.publicVoices).toHaveLength(1))
  })

  it('缺 API key 与一般失败给不同的文案', async () => {
    mockListVoices.mockResolvedValue({
      success: false,
      errorCode: 'MISSING_API_KEY',
      error: 'no key',
    })

    const { result } = renderHook(() => useVoiceLibrary())
    await waitFor(() =>
      expect(result.current.error).toBe('voiceApiKeyRequired'),
    )
    expect(result.current.publicVoices).toEqual([])
  })
})

describe('isClonedVoiceCard', () => {
  it('有参考音频才算克隆卡', () => {
    expect(isClonedVoiceCard(makeCard({ referenceAudioUrl: null }))).toBe(false)
    expect(
      isClonedVoiceCard(makeCard({ referenceAudioUrl: 'https://a/b.mp3' })),
    ).toBe(true)
  })

  /**
   * ⚠ `sampleAudioUrl` 是收藏卡也会有的（收藏时把上游示例带走），它**不能**参与
   * 克隆判定——混淆这两个字段正是收藏卡被错分进克隆 tab 的那个坑。
   */
  it('只有示例音频的收藏卡不是克隆卡', () => {
    expect(
      isClonedVoiceCard(
        makeCard({
          referenceAudioUrl: null,
          sampleAudioUrl: 'https://cdn.example.com/s.mp3',
        }),
      ),
    ).toBe(false)
  })
})

describe('mapFishVoiceToAsset', () => {
  it('把上游 payload 收敛成库里的归一形态', () => {
    const asset = mapFishVoiceToAsset(makeFishVoice())

    expect(asset.id).toBe('fish_audio:voice-1')
    expect(asset.voiceId).toBe('voice-1')
    expect(asset.title).toBe('Fish Narrator')
    expect(asset.sampleUrl).toBe('https://cdn.example.com/s.mp3')
    expect(asset.sampleText).toBe('示例文本')
  })

  it('没有示例音频时两个字段都是 null，不是 undefined', () => {
    const asset = mapFishVoiceToAsset(makeFishVoice({ samples: [] }))

    expect(asset.sampleUrl).toBeNull()
    expect(asset.sampleText).toBeNull()
  })
})
