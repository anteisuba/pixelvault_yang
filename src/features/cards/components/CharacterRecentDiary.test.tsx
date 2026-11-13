import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantMemory } from '@/types/assistant-memory'
import type {
  CharacterGrowth,
  CharacterMemoryList,
  CharacterOutingRun,
} from '@/types/character-growth'
import type { CharacterStickerRecord } from '@/types/character-sticker'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(',')}` : key
  t.has = () => false
  return {
    useTranslations: () => t,
    useFormatter: () => ({ dateTime: () => '09:10' }),
  }
})
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
// 出门卡里的模型 chip 是真的：它读 key 名单（真 ApiKeysProvider，名单走假服务器）。
const auth = vi.hoisted(() => ({ userId: 'user_0' }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: auth.userId, isSignedIn: true, isLoaded: true }),
}))

import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { fakeServer } from '@/test/app-harness'
import { fakeApiKeyRoutes, runIdleCallbacksNow } from '@/test/fake-routes'
import { DESKTOP_WIDTH, setViewport } from '@/test/viewport'

import { CharacterRecentDiary, buildDiary } from './CharacterRecentDiary'

const now = new Date()
const today = (hour: number) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour).toISOString()
const daysBack = (days: number) =>
  new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - days,
    9,
  ).toISOString()

function growthOf(patch: Partial<CharacterGrowth> = {}): CharacterGrowth {
  return {
    journals: [{ id: 'j1', text: '数他叹了七口气。', createdAt: daysBack(1) }],
    revisions: [],
    findings: [
      {
        id: 'f1',
        source: 'bilibili',
        url: 'https://www.bilibili.com/video/BV1',
        title: '水彩叠色',
        note: '先铺冷色再压暖色。',
        seenAt: today(9),
      },
      {
        id: 'f2',
        source: 'danbooru',
        url: 'https://danbooru.donmai.us/posts/1',
        title: '透明伞',
        note: '透明的伞我想要。',
        seenAt: today(9),
      },
      {
        id: 'f3',
        source: 'civitai',
        url: 'https://civitai.com/models/1',
        title: '水彩 LoRA',
        note: '人脸有点糊。',
        seenAt: daysBack(2),
      },
    ],
    opinions: [{ id: 'o1', text: '厚涂更适合画雨天。', createdAt: today(10) }],
    outing: { running: null, recent: [], frequentSites: [] },
    ...patch,
  }
}

const run = (patch: Partial<CharacterOutingRun> = {}): CharacterOutingRun => ({
  id: 'r1',
  status: 'DONE',
  model: 'claude',
  sources: [],
  sites: [],
  videos: [],
  pinnedVideos: [],
  budgetPoints: 30,
  usedTokens: 120_000,
  kept: 2,
  nowLabel: null,
  endReason: 'budget',
  startedAt: today(8),
  endedAt: today(10),
  topic: null,
  ...patch,
})

const memoryRow = (patch: Partial<AssistantMemory> = {}): AssistantMemory => ({
  id: 'o1',
  scope: 'cards',
  kind: 'fact',
  source: 'assistant',
  text: '观点：厚涂更适合画雨天。',
  characterCardId: 'card-1',
  pinned: false,
  expiresAt: null,
  dormant: false,
  createdAt: today(10),
  updatedAt: today(10),
  ...patch,
})

function memoriesOf(patch: Partial<CharacterMemoryList> | null = {}) {
  return {
    list: patch
      ? { remembered: [], dormant: [], findings: [], ...patch }
      : null,
    isLoading: false,
    error: null,
    reload: vi.fn(),
    add: vi.fn(async () => ({ ok: true as const })),
    edit: vi.fn(async () => ({ ok: true as const })),
    setPinned: vi.fn(async () => ({ ok: true as const })),
    wake: vi.fn(async () => ({ ok: true as const })),
    remove: vi.fn(async () => ({ ok: true as const })),
  }
}

const topicRun = (patch: Partial<CharacterOutingRun> = {}) =>
  run({
    sources: ['bilibili'],
    sites: ['zh.moegirl.org.cn'],
    topic: {
      text: '最近的梗',
      tags: ['meme'],
      digest: {
        lines: [
          {
            text: '「哈基米」原来是蜂蜜的意思。',
            urls: ['https://zh.moegirl.org.cn/哈基米'],
          },
          {
            text: 'B 站评论区刷得最多的是「6」。',
            urls: ['https://www.bilibili.com/video/BV1', 'javascript:alert(1)'],
          },
        ],
      },
    },
    ...patch,
  })

function hookOf(growth: CharacterGrowth) {
  return {
    growth,
    isLoading: false,
    error: null,
    revertingId: null,
    revert: vi.fn(),
    reload: vi.fn(),
    startOuting: vi.fn(async () => ({ ok: true as const })),
    previewTopic: vi.fn(async () => null),
    stopOuting: vi.fn(async () => ({ ok: true as const })),
    removeFinding: vi.fn(async () => ({ ok: true as const })),
    editOpinion: vi.fn(async () => ({ ok: true as const })),
    removeOpinion: vi.fn(async () => ({ ok: true as const })),
    editJournal: vi.fn(async () => ({ ok: true as const })),
    removeJournal: vi.fn(async () => ({ ok: true as const })),
  }
}

function stickersOf(rows: CharacterStickerRecord[] = []) {
  return {
    stickers: rows,
    setBlocked: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    upload: vi.fn(async () => ({ ok: true as const })),
  }
}

const sticker = (
  id: string,
  patch: Partial<CharacterStickerRecord> = {},
): CharacterStickerRecord => ({
  id,
  url: `https://cdn.example/${id}.png`,
  sourceUrl: null,
  whenToUse: '开心的时候',
  isBlocked: false,
  fromCreator: false,
  createdAt: today(9),
  sentAt: null,
  ...patch,
})

let userSeq = 0
beforeEach(() => {
  userSeq += 1
  auth.userId = `user_${userSeq}`
  localStorage.clear()
  runIdleCallbacksNow()
  setViewport(DESKTOP_WIDTH)
  fakeApiKeyRoutes(fakeServer(), [])
})

function renderWithKeys(ui: ReactElement) {
  return render(<ApiKeysProvider>{ui}</ApiKeysProvider>)
}

function diary(
  hook: ReturnType<typeof hookOf>,
  options: {
    stickers?: ReturnType<typeof stickersOf>
    memories?: ReturnType<typeof memoriesOf>
    lead?: ReactElement
  } = {},
) {
  return renderWithKeys(
    <CharacterRecentDiary
      stickers={options.stickers ?? stickersOf()}
      growth={hook}
      memories={options.memories ?? memoriesOf()}
      {...(options.lead ? { lead: options.lead } : {})}
    />,
  )
}

describe('CharacterRecentDiary（第 ③ 步 + 小房间活动记录）', () => {
  it('一天一块：日记在上，当天的小条挂在下面；只出门没写日记的那天只放小条', () => {
    const days = buildDiary(growthOf(), [sticker('s1')])
    expect(days.map((day) => day.journals.length)).toEqual([0, 1, 0])
    expect(days[0]!.events.map((event) => event.kind)).toEqual([
      'opinion',
      'outing',
      'stickers',
    ])
    diary(hookOf(growthOf()), { stickers: stickersOf([sticker('s1')]) })
    expect(screen.getAllByTestId('character-diary-journal')).toHaveLength(1)
    expect(screen.getByText('数他叹了七口气。')).toBeTruthy()
    // 调查折着，点开才看她记下的话
    expect(screen.queryByText('先铺冷色再压暖色。')).toBeNull()
    fireEvent.click(screen.getByText('wentOut|sourceBilibili · sourceDanbooru'))
    expect(screen.getByText('先铺冷色再压暖色。')).toBeTruthy()
  })

  it('顶上有筛选条，默认「全部」；筛到一类只剩那一类（日记也算一类），空了的那天不出', () => {
    diary(hookOf(growthOf()), { stickers: stickersOf([sticker('s1')]) })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'filterAll',
      'filterFindings',
      'filterOpinions',
      'filterJournal',
      'filterRevisions',
      'filterStickers',
    ])
    expect(screen.getByRole('tab', { name: 'filterAll' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    fireEvent.click(screen.getByRole('tab', { name: 'filterJournal' }))
    expect(screen.getByText('数他叹了七口气。')).toBeTruthy()
    expect(screen.queryByText(/opinionText/)).toBeNull()
    expect(screen.queryByText(/wentOut/)).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'filterFindings' }))
    expect(screen.queryByText('数他叹了七口气。')).toBeNull()
    expect(
      screen.getByText('wentOut|sourceBilibili · sourceDanbooru'),
    ).toBeTruthy()
    expect(screen.queryByText(/opinionText/)).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'filterOpinions' }))
    expect(screen.getByText('opinionText|厚涂更适合画雨天。')).toBeTruthy()
    expect(screen.queryByText(/wentOut/)).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'filterStickers' }))
    expect(screen.getByText('gotStickers|1')).toBeTruthy()
    expect(screen.queryByText(/opinionText/)).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'filterRevisions' }))
    expect(screen.getByText('nothingHere')).toBeTruthy()
  })

  it('buildDiary 按筛选只留那一类', () => {
    const growth = growthOf()
    expect(
      buildDiary(growth, [], 'journal').flatMap((day) => day.events),
    ).toEqual([])
    expect(
      buildDiary(growth, [], 'finding').flatMap((day) =>
        day.events.map((event) => event.kind),
      ),
    ).toEqual(['outing', 'outing'])
    expect(buildDiary(growth, [], 'revision')).toEqual([])
  })

  it('话题那趟：标题写「查了「话题」」，小结每句挂站名丸子，最新一趟默认摊开、见闻折在底下', () => {
    const hook = hookOf(
      growthOf({
        opinions: [],
        outing: { running: null, recent: [topicRun()], frequentSites: [] },
      }),
    )
    diary(hook)
    expect(screen.getByText('topicTitle|最近的梗')).toBeTruthy()
    // 站名一行：现有来源走界面语言，名册里的网页站写名册的名
    expect(
      screen.getByText(
        (text) =>
          text.includes('sourceBilibili · 萌娘百科') &&
          text.includes('findingCount|2'),
      ),
    ).toBeTruthy()
    const digest = screen.getByTestId('character-outing-digest')
    expect(within(digest).getByText(/「哈基米」原来是蜂蜜的意思/)).toBeTruthy()
    const moegirl = within(digest).getByRole('link', { name: '萌娘百科' })
    expect(moegirl).toHaveAttribute('href', 'https://zh.moegirl.org.cn/哈基米')
    expect(moegirl).toHaveAttribute('target', '_blank')
    expect(moegirl).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      within(digest).getByRole('link', { name: 'sourceBilibili' }),
    ).toHaveAttribute('href', 'https://www.bilibili.com/video/BV1')
    // 非 http(s) 的链接不做成可点的
    expect(
      within(digest).queryByRole('link', { name: /javascript/ }),
    ).toBeNull()
    // 见闻折在底下，点开才看
    expect(screen.queryByText('先铺冷色再压暖色。')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'findingCount|2' }))
    expect(screen.getByText('先铺冷色再压暖色。')).toBeTruthy()
  })

  it('更早的话题趟小结折着，点标题才摊开；最新一趟没小结就没有小结块', () => {
    const older = topicRun({
      id: 'r0',
      startedAt: daysBack(1),
      endedAt: daysBack(1),
    })
    const noDigest = topicRun({
      id: 'r2',
      startedAt: today(11),
      endedAt: today(12),
      topic: { text: '《丝之歌》的剧情', tags: ['story'], digest: null },
    })
    diary(
      hookOf(
        growthOf({
          outing: {
            running: null,
            recent: [noDigest, older],
            frequentSites: [],
          },
        }),
      ),
    )
    expect(screen.getByText('topicTitle|《丝之歌》的剧情')).toBeTruthy()
    expect(screen.queryByTestId('character-outing-digest')).toBeNull()
    // 更早的一趟有小结，但不是最新：折着
    fireEvent.click(screen.getByText('topicTitle|最近的梗'))
    expect(screen.getByTestId('character-outing-digest')).toBeTruthy()
  })

  it('旧行（topic = null）照现在的长相：出门调查 · 来源', () => {
    diary(
      hookOf(
        growthOf({
          outing: {
            running: null,
            recent: [run({ sources: ['bilibili'] })],
            frequentSites: [],
          },
        }),
      ),
    )
    expect(screen.getByText('runSummary|sourceBilibili')).toBeTruthy()
    expect(screen.queryByText(/topicTitle/)).toBeNull()
    expect(screen.queryByTestId('character-outing-digest')).toBeNull()
  })

  it('见闻在活动记录里能删：先确认，确认了走 growth.removeFinding', async () => {
    const hook = hookOf(growthOf({ opinions: [], journals: [] }))
    diary(hook)
    fireEvent.click(screen.getByText('wentOut|sourceBilibili · sourceDanbooru'))
    fireEvent.click(screen.getAllByText('delete')[0]!)
    expect(hook.removeFinding).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByText('delete'))
    await vi.waitFor(() =>
      expect(hook.removeFinding).toHaveBeenCalledWith('f1'),
    )
  })

  it('观点：能改、能删，有记忆那份就能钉住', async () => {
    const hook = hookOf(growthOf({ findings: [] }))
    const memories = memoriesOf({ remembered: [memoryRow()] })
    diary(hook, { memories })
    fireEvent.click(screen.getByRole('button', { name: 'pin' }))
    await vi.waitFor(() =>
      expect(memories.setPinned).toHaveBeenCalledWith('o1', true),
    )

    fireEvent.click(screen.getByRole('button', { name: 'edit' }))
    const input = screen.getByRole('textbox', { name: 'editOpinion' })
    fireEvent.change(input, { target: { value: '薄涂也行。' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await vi.waitFor(() =>
      expect(hook.editOpinion).toHaveBeenCalledWith('o1', '薄涂也行。'),
    )

    await vi.waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    fireEvent.click(screen.getAllByRole('button', { name: 'delete' })[0]!)
    expect(hook.removeOpinion).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByText('delete'))
    await vi.waitFor(() =>
      expect(hook.removeOpinion).toHaveBeenCalledWith('o1'),
    )
  })

  it('钉住了的观点写「钉住了」、按钮变取消钉住；睡着的观点只给唤醒', async () => {
    const pinned = memoriesOf({ remembered: [memoryRow({ pinned: true })] })
    const view = diary(hookOf(growthOf({ findings: [] })), {
      memories: pinned,
    })
    expect(screen.getByText('pinned')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'unpin' }))
    await vi.waitFor(() =>
      expect(pinned.setPinned).toHaveBeenCalledWith('o1', false),
    )
    view.unmount()

    const asleep = memoriesOf({ dormant: [memoryRow({ dormant: true })] })
    diary(hookOf(growthOf({ findings: [] })), { memories: asleep })
    expect(screen.getByText('opinionAsleep')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'pin' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'wake' }))
    await vi.waitFor(() => expect(asleep.wake).toHaveBeenCalledWith('o1'))
  })

  it('记忆那份还没读到：观点只有改 / 删，不出钉住', () => {
    diary(hookOf(growthOf({ findings: [] })), { memories: memoriesOf(null) })
    expect(screen.getByText('opinionText|厚涂更适合画雨天。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'pin' })).toBeNull()
    expect(screen.getByRole('button', { name: 'edit' })).toBeTruthy()
  })

  it('什么都没有：一句话；筛出来没有：这一类还没有', () => {
    diary(hookOf(growthOf({ findings: [], opinions: [], journals: [] })))
    expect(screen.getByText('diaryEmpty')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'filterJournal' }))
    expect(screen.getByText('nothingHere')).toBeTruthy()
  })

  it('日记能改：编辑框保存走 editJournal；删前先确认', async () => {
    const hook = hookOf(growthOf({ findings: [], opinions: [] }))
    diary(hook)
    fireEvent.click(screen.getByText('editJournal'))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '数他叹了八口气。' },
    })
    fireEvent.click(screen.getByText('editorSave'))
    await vi.waitFor(() =>
      expect(hook.editJournal).toHaveBeenCalledWith('j1', '数他叹了八口气。'),
    )
    fireEvent.click(screen.getByText('delete'))
    expect(hook.removeJournal).not.toHaveBeenCalled()
    expect(screen.getByText('deleteJournalTitle')).toBeTruthy()
  })

  it('改了自己：一行带撤回，点开看改前改后', () => {
    const hook = hookOf(
      growthOf({
        findings: [],
        opinions: [],
        revisions: [
          {
            id: 'r1',
            source: 'REFLECTION',
            fields: ['speech'],
            before: { speech: '慢吞吞' },
            after: { speech: '熟了会拖长音' },
            reason: null,
            revertedAt: null,
            createdAt: daysBack(1),
          },
        ],
      }),
    )
    diary(hook)
    expect(screen.queryByText('熟了会拖长音')).toBeNull()
    fireEvent.click(screen.getByText('changedField|speech'))
    expect(screen.getByText('熟了会拖长音')).toBeTruthy()
    fireEvent.click(screen.getByText('revert'))
    expect(hook.revert).toHaveBeenCalledWith('r1')
  })
  it('收了工的一趟一条：挂它起止之间的见闻，写用了几点；一条没带回也有一条', () => {
    diary(
      hookOf(
        growthOf({
          outing: {
            running: null,
            recent: [
              run({ startedAt: today(8), endedAt: today(10) }),
              run({
                id: 'r0',
                startedAt: daysBack(1),
                endedAt: daysBack(1),
                usedTokens: 20_000,
                kept: 0,
                endReason: 'nothing',
              }),
            ],
            frequentSites: [],
          },
        }),
      ),
    )
    expect(
      screen.getByText('runSummary|sourceBilibili · sourceDanbooru'),
    ).toBeTruthy()
    expect(screen.getByText('· findingCount|2 · runPoints|12')).toBeTruthy()
    expect(
      screen.getByText('· findingCount|0 · runPoints|2 · end.nothing'),
    ).toBeTruthy()
  })

  it('她逛来的表情在「全部」里按天一条，点一张拉黑；你上传的不进记录', () => {
    const rows = stickersOf([
      sticker('s1'),
      sticker('s2', { fromCreator: true }),
    ])
    diary(hookOf(growthOf()), { stickers: rows })
    // 折着的一行，点开才看到那几张。
    fireEvent.click(screen.getByText('gotStickers|1'))
    fireEvent.click(screen.getByLabelText('blockSticker'))
    expect(rows.setBlocked).toHaveBeenCalledWith('s1', true)
  })

  it('手机（lead）：出门卡在最上面，筛选条跟在它后面，和记录在同一个滚动区里', () => {
    diary(hookOf(growthOf()), {
      lead: <div data-testid="outing-lead">lead</div>,
    })
    const lead = screen.getByTestId('outing-lead')
    const filters = screen.getByRole('tablist')
    const scroller = lead.closest('.overflow-y-auto')
    expect(scroller).not.toBeNull()
    expect(scroller?.contains(filters)).toBe(true)
    expect(
      lead.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
