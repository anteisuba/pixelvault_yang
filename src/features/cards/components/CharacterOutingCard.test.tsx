import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CharacterGrowth,
  CharacterOutingRun,
  CharacterOutingTopicPreview,
} from '@/types/character-growth'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(',')}` : key
  t.has = () => false
  return {
    useTranslations: () => t,
    useFormatter: () => ({ dateTime: () => '10月28日' }),
  }
})
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
// 模型 chip 是真的：它读 key 名单（真 ApiKeysProvider，名单走假服务器）。
const auth = vi.hoisted(() => ({ userId: 'user_0' }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: auth.userId, isSignedIn: true, isLoaded: true }),
}))

import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { openQuickSetup } from '@/test/api-keys'
import { fakeServer } from '@/test/app-harness'
import {
  apiKeyRecord,
  fakeApiKeyRoutes,
  runIdleCallbacksNow,
} from '@/test/fake-routes'
import { DESKTOP_WIDTH, setViewport } from '@/test/viewport'

import { OutingCard } from './CharacterOutingCard'

const grok = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
  (model) => model.adapterType === AI_ADAPTER_TYPES.XAI,
)!
const gemini = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
  (model) => model.adapterType === AI_ADAPTER_TYPES.GEMINI,
)!

const now = new Date()
const yesterday = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate() - 1,
  9,
).toISOString()

const run = (patch: Partial<CharacterOutingRun> = {}): CharacterOutingRun => ({
  id: 'r1',
  status: 'DONE',
  model: grok.modelId,
  sources: ['bilibili'],
  sites: ['pixiv.net'],
  videos: [],
  pinnedVideos: [],
  budgetPoints: 60,
  usedTokens: 300_000,
  kept: 3,
  nowLabel: null,
  endReason: 'budget',
  startedAt: yesterday,
  endedAt: yesterday,
  topic: null,
  ...patch,
})

const memePreview: CharacterOutingTopicPreview = {
  tags: ['meme'],
  vague: false,
  sources: ['bilibili'],
  sites: ['zh.moegirl.org.cn', 'jikipedia.com'],
}

/** 防抖 600 ms + 预览回来：给 waitFor 放宽到 3 s。 */
const PREVIEW_WAIT = { timeout: 3000 }

function hookOf(
  outing: CharacterGrowth['outing'],
  preview: CharacterOutingTopicPreview | null = null,
) {
  return {
    growth: {
      journals: [],
      revisions: [],
      findings: [],
      opinions: [],
      outing,
    },
    isLoading: false,
    error: null,
    revertingId: null,
    revert: vi.fn(),
    reload: vi.fn(),
    startOuting: vi.fn(async () => ({ ok: true as const })),
    previewTopic: vi.fn(async () => preview),
    stopOuting: vi.fn(async () => ({ ok: true as const })),
    removeFinding: vi.fn(),
    editOpinion: vi.fn(),
    removeOpinion: vi.fn(),
    editJournal: vi.fn(),
    removeJournal: vi.fn(),
  }
}

let userSeq = 0
beforeEach(() => {
  userSeq += 1
  auth.userId = `user_${userSeq}`
  localStorage.clear()
  runIdleCallbacksNow()
  setViewport(DESKTOP_WIDTH)
  fakeApiKeyRoutes(fakeServer(), [
    apiKeyRecord('k-xai', AI_ADAPTER_TYPES.XAI, 'xAI'),
    apiKeyRecord('k-gemini', AI_ADAPTER_TYPES.GEMINI, 'Gemini'),
  ])
})

function renderCard(ui: ReactElement) {
  return render(<ApiKeysProvider>{ui}</ApiKeysProvider>)
}

describe('OutingCard', () => {
  it('没出门：「上次调查：昨天」+「出门调查」；弹框记住上次的模型、来源、网址和额度', async () => {
    const hook = hookOf({
      running: null,
      recent: [run()],
      frequentSites: ['pixiv.net', 'zhihu.com'],
    })
    renderCard(<OutingCard growth={hook} />)
    expect(screen.getByText('lastOut|yesterday')).toBeTruthy()
    fireEvent.click(screen.getByText('title'))
    expect(screen.getByRole('button', { name: 'label' }).textContent).toContain(
      grok.label,
    )
    // Grok 才有 X；她常去的网址也列出来。
    expect(screen.getByText('sourceX')).toBeTruthy()
    expect(screen.getByText('zhihu.com')).toBeTruthy()
    expect(
      screen
        .getByText('pixiv.net')
        .closest('button')
        ?.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByText('articles|40')).toBeTruthy()
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByText('start'))
    await waitFor(() =>
      expect(hook.startOuting).toHaveBeenCalledWith({
        model: grok.modelId,
        sources: ['bilibili'],
        sites: ['pixiv.net'],
        videos: [],
        pinnedVideos: [],
        budgetPoints: 10,
      }),
    )
  })

  it('点「自动」清掉来源和网址；自定点数夹在上下限之间', async () => {
    const hook = hookOf({ running: null, recent: [run()], frequentSites: [] })
    renderCard(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.click(screen.getByText('auto'))
    fireEvent.click(screen.getByText('custom'))
    fireEvent.change(screen.getByLabelText('customLabel'), {
      target: { value: '999' },
    })
    fireEvent.click(screen.getByText('start'))
    await waitFor(() =>
      expect(hook.startOuting).toHaveBeenCalledWith(
        expect.objectContaining({ sources: [], sites: [], budgetPoints: 200 }),
      ),
    )
  })

  it('看视频（第 ⑥ 步）：只列选中且能看视频的来源，开关旁常驻提示；贴视频链接 = 指定视频', async () => {
    const hook = hookOf({
      running: null,
      recent: [run({ model: gemini.modelId, sources: [], sites: [] })],
      frequentSites: [],
    })
    renderCard(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    // 自动 = 全部来源：B 站、YouTube 有开关（Gemini 没有 X）。
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(2)
    expect(screen.getByText('hint.bilibiliOff')).toBeTruthy()
    expect(screen.getByText('hint.youtubeOff')).toBeTruthy()
    fireEvent.click(switches[0]!)
    expect(screen.getByText('hint.bilibiliWatch')).toBeTruthy()

    fireEvent.click(screen.getByText('addSite'))
    const input = screen.getByLabelText('addSite')
    fireEvent.change(input, {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ 3:00-5:00' },
    })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('character-outing-pinned').textContent).toContain(
      '3:00-5:00',
    )
    expect(screen.getByText('pinnedHint')).toBeTruthy()

    fireEvent.click(screen.getByText('start'))
    await waitFor(() =>
      expect(hook.startOuting).toHaveBeenCalledWith(
        expect.objectContaining({
          sources: [],
          sites: [],
          videos: ['bilibili'],
          pinnedVideos: [
            {
              platform: 'youtube',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              start: 180,
              end: 300,
            },
          ],
        }),
      ),
    )
  })

  it('别家模型：YouTube 开关灰着（换 Gemini 才能看）', () => {
    const hook = hookOf({ running: null, recent: [run()], frequentSites: [] })
    renderCard(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.click(screen.getByText('auto'))
    expect(screen.getByText('hint.youtubeNeedsGemini')).toBeTruthy()
    expect(screen.getByText('hint.xOff')).toBeTruthy()
  })

  it('调查中：在看什么 · 用了几点 / 共几点 ·「结束」', () => {
    const hook = hookOf({
      running: run({
        status: 'RUNNING',
        endedAt: null,
        endReason: null,
        budgetPoints: 30,
        usedTokens: 120_000,
        nowLabel: 'bilibili\n古籍修复',
      }),
      recent: [],
      frequentSites: [],
    })
    renderCard(<OutingCard growth={hook} />)
    expect(screen.getByText('looking|sourceBilibili,古籍修复')).toBeTruthy()
    expect(screen.getByText(/points\|12,30/)).toBeTruthy()
    fireEvent.click(screen.getByText('stop'))
    expect(hook.stopOuting).toHaveBeenCalledTimes(1)
  })

  it('话题：停顿后问预览，「看成」标签 + 配上的站带 ×，点掉就不去；开始带 topic', async () => {
    const hook = hookOf(
      {
        running: null,
        recent: [run({ sources: [], sites: [] })],
        frequentSites: [],
      },
      memePreview,
    )
    renderCard(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.change(screen.getByLabelText('topic'), {
      target: { value: '最近的梗' },
    })
    // 还没停顿，不问。
    expect(hook.previewTopic).not.toHaveBeenCalled()
    await waitFor(
      () => expect(screen.getByText('topicTag.meme')).toBeTruthy(),
      PREVIEW_WAIT,
    )
    expect(hook.previewTopic).toHaveBeenCalledTimes(1)
    expect(hook.previewTopic).toHaveBeenCalledWith('最近的梗', grok.modelId)
    expect(screen.getByText(/topicOnly/)).toBeTruthy()
    expect(screen.getByText('topicChipHint|topicTag.meme')).toBeTruthy()
    // 话题配上的站：选中且带 ×（站名用名册里的名字）。
    const moegirl = screen.getByRole('button', { name: 'topicSkip|萌娘百科' })
    expect(moegirl.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByRole('button', { name: 'topicSkip|sourceBilibili' }),
    ).toBeTruthy()
    // 自动那一颗让位给话题配的站。
    expect(
      screen.getByText('auto').closest('button')?.getAttribute('aria-pressed'),
    ).toBe('false')

    fireEvent.click(moegirl)
    expect(
      screen.queryByRole('button', { name: 'topicSkip|萌娘百科' }),
    ).toBeNull()
    // 话题配的站点掉就从来源里撤掉（再写一遍话题会重新配）。
    expect(screen.queryByText('萌娘百科')).toBeNull()

    fireEvent.click(screen.getByText('start'))
    await waitFor(() =>
      expect(hook.startOuting).toHaveBeenCalledWith(
        expect.objectContaining({
          sources: ['bilibili'],
          sites: ['jikipedia.com'],
          topic: { text: '最近的梗', tags: ['meme'] },
        }),
      ),
    )
  })

  it('话题太泛：只提示、来源照旧；清空话题恢复原来的选择', async () => {
    const hook = hookOf({
      running: null,
      recent: [run({ sources: ['danbooru'], sites: [] })],
      frequentSites: [],
    })
    hook.previewTopic.mockResolvedValueOnce({
      tags: [],
      vague: true,
      sources: [],
      sites: [],
    })
    renderCard(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.change(screen.getByLabelText('topic'), {
      target: { value: '游戏' },
    })
    await waitFor(
      () => expect(screen.getByText('topicVague')).toBeTruthy(),
      PREVIEW_WAIT,
    )
    expect(screen.queryByText(/topicOnly/)).toBeNull()
    expect(
      screen
        .getByText('sourceDanbooru')
        .closest('button')
        ?.getAttribute('aria-pressed'),
    ).toBe('true')

    // 换成对得上的话题，再清空：话题配的撤掉，原来的 Danbooru 还在。
    hook.previewTopic.mockResolvedValue(memePreview)
    fireEvent.change(screen.getByLabelText('topic'), {
      target: { value: '最近的梗' },
    })
    await waitFor(
      () => expect(screen.getByText('topicTag.meme')).toBeTruthy(),
      PREVIEW_WAIT,
    )
    fireEvent.click(screen.getByLabelText('topicClear'))
    expect(screen.queryByText('topicTag.meme')).toBeNull()
    expect(screen.queryByText('萌娘百科')).toBeNull()
    expect(
      screen
        .getByText('sourceDanbooru')
        .closest('button')
        ?.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen
        .getByText('sourceBilibili')
        .closest('button')
        ?.getAttribute('aria-pressed'),
    ).toBe('false')
    fireEvent.click(screen.getByText('start'))
    await waitFor(() =>
      expect(hook.startOuting).toHaveBeenCalledWith(
        expect.not.objectContaining({ topic: expect.anything() }),
      ),
    )
  })

  it('话题没对上现成的类型：说明 + 兜底来源带 ×', async () => {
    const hook = hookOf(
      {
        running: null,
        recent: [run({ sources: [], sites: [] })],
        frequentSites: [],
      },
      { tags: [], vague: false, sources: ['bilibili', 'web'], sites: [] },
    )
    renderCard(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.change(screen.getByLabelText('topic'), {
      target: { value: '这周 AI 圈出了什么新东西' },
    })
    await waitFor(
      () => expect(screen.getByText('topicUnmatched')).toBeTruthy(),
      PREVIEW_WAIT,
    )
    expect(
      screen.getByRole('button', { name: 'topicSkip|sourceWeb' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByText('start'))
    await waitFor(() =>
      expect(hook.startOuting).toHaveBeenCalledWith(
        expect.objectContaining({
          sources: ['bilibili', 'web'],
          topic: { text: '这周 AI 圈出了什么新东西', tags: [] },
        }),
      ),
    )
  })

  it('模型上不了网：网页类的站变淡不藏，给「换 Gemini / 换 Grok」', async () => {
    const hook = hookOf(
      {
        running: null,
        recent: [run({ sources: [], sites: [] })],
        frequentSites: [],
      },
      {
        tags: ['story', 'review'],
        vague: false,
        sources: ['bilibili'],
        sites: [],
      },
    )
    renderCard(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.change(screen.getByLabelText('topic'), {
      target: { value: '《丝之歌》的剧情和评价' },
    })
    await waitFor(
      () => expect(screen.getByText(/^topicNoWeb\|/)).toBeTruthy(),
      PREVIEW_WAIT,
    )
    // wiki / Steam 这些去不了：照列但点不动。
    expect(
      (screen.getByText('wiki').closest('button') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByText('sourceWeb').closest('button') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      screen.getByRole('button', { name: 'topicSkip|sourceBilibili' }),
    ).toBeTruthy()

    // 换 Gemini：模型变了，重新问一次预览。
    fireEvent.click(screen.getByText(/^topicSwap\|Gemini/))
    await waitFor(
      () =>
        expect(hook.previewTopic).toHaveBeenLastCalledWith(
          '《丝之歌》的剧情和评价',
          gemini.modelId,
        ),
      PREVIEW_WAIT,
    )
  })

  it('换 Gemini 但没配 Gemini 的 key：就地弹配 key，⛔ 不直接换（Hard Rule 8）', async () => {
    // 只配了 xAI —— 名单后注册的先命中。
    fakeApiKeyRoutes(fakeServer(), [
      apiKeyRecord('k-xai', AI_ADAPTER_TYPES.XAI, 'xAI'),
    ])
    const hook = hookOf(
      {
        running: null,
        recent: [run({ sources: [], sites: [] })],
        frequentSites: [],
      },
      {
        tags: ['story', 'review'],
        vague: false,
        sources: ['bilibili'],
        sites: [],
      },
    )
    renderCard(<OutingCard growth={hook} />)
    fireEvent.click(screen.getByText('title'))
    fireEvent.change(screen.getByLabelText('topic'), {
      target: { value: '《丝之歌》的剧情和评价' },
    })
    await waitFor(
      () => expect(screen.getByText(/^topicSwap\|Gemini/)).toBeTruthy(),
      PREVIEW_WAIT,
    )
    fireEvent.click(screen.getByText(/^topicSwap\|Gemini/))
    await waitFor(() => expect(openQuickSetup()).not.toBeNull())
    expect(hook.previewTopic).not.toHaveBeenCalledWith(
      '《丝之歌》的剧情和评价',
      gemini.modelId,
    )
  })

  it('比如：上次的话题排第一带「上次」，点一下填进去；「现在」卡点上次话题预填', () => {
    const hook = hookOf(
      {
        running: null,
        recent: [
          run({
            topic: { text: '最近的梗', tags: ['meme'], digest: null },
          }),
        ],
        frequentSites: [],
      },
      memePreview,
    )
    renderCard(<OutingCard growth={hook} />)
    // 没出门：第二行记上次查的话题；点它 = 打开弹框并预填。
    expect(screen.getByTestId('character-outing-last-topic').textContent).toBe(
      'topicLast|最近的梗',
    )
    fireEvent.click(screen.getByTestId('character-outing-last-topic'))
    expect((screen.getByLabelText('topic') as HTMLInputElement).value).toBe(
      '最近的梗',
    )
    fireEvent.click(screen.getByLabelText('topicClear'))
    // 上次的话题排第一带小标，后面接固定示例，一共三颗。（假翻译不会把「最近的梗」译回键名，不去重。）
    expect(screen.getByText('exampleLast')).toBeTruthy()
    expect(screen.getByText('exampleMeme')).toBeTruthy()
    expect(screen.getByText('exampleSay')).toBeTruthy()
    expect(screen.queryByText('exampleStory')).toBeNull()
    fireEvent.click(screen.getByText('exampleSay'))
    expect((screen.getByLabelText('topic') as HTMLInputElement).value).toBe(
      'exampleSay',
    )
  })

  it('「现在」卡：跑着时第二行「在查…」；没话题的趟不显示', () => {
    const base = {
      status: 'RUNNING' as const,
      endedAt: null,
      endReason: null,
      nowLabel: 'bilibili\n古籍修复',
    }
    const { unmount } = renderCard(
      <OutingCard
        growth={hookOf({
          running: run({
            ...base,
            topic: { text: '最近的梗', tags: ['meme'], digest: null },
          }),
          recent: [],
          frequentSites: [],
        })}
      />,
    )
    expect(screen.getByTestId('character-outing-topic').textContent).toBe(
      'topicNow|最近的梗',
    )
    unmount()
    renderCard(
      <OutingCard
        growth={hookOf({
          running: run(base),
          recent: [],
          frequentSites: [],
        })}
      />,
    )
    expect(screen.queryByTestId('character-outing-topic')).toBeNull()
  })

  it('从没出过门：写「还没出过门」', () => {
    renderCard(
      <OutingCard
        growth={hookOf({ running: null, recent: [], frequentSites: [] })}
      />,
    )
    expect(screen.getByText('never')).toBeTruthy()
  })
})
