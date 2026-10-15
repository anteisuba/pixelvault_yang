// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import type { AssistantOperatorStep } from '@/types/assistant-operator'

import { StudioOperatorLogItem } from './StudioOperatorLogItem'

/**
 * 日志条的回归闸。
 *
 * ⚠ 联网候选网格**不在这里**了（搜索期切片 1，2026-10-15）：找到的图摆在回答底下，
 *   闸在 `StudioOperatorWebCandidateGrid.web.test.tsx`。这里只钉找图那一步只剩一句
 *   「搜索 Google 图片：… · N 张」、且没有撤销按钮（读类，一个字节都没落）。
 */

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}))

vi.mock('motion/react', () => ({
  motion: { button: 'button' },
  useReducedMotion: () => true,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span data-testid="spinner" />,
}))

const openOperatorLightbox = vi.hoisted(() => vi.fn())
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorLightbox',
  () => ({ openOperatorLightbox }),
)

const WEB_STEP: AssistantOperatorStep = {
  id: 'step-1',
  title: 'searched the web',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
  verb: 'research',
  status: 'done',
  payload: { query: 'pvc figure studio shot', limit: 8 },
  result: {
    totalFound: 2,
    images: [
      {
        imageUrl: 'https://cdn.example.com/a.jpg',
        thumbnailUrl: 'https://tbn.example.com/a.jpg',
        pageUrl: 'https://example.com/a',
        domain: 'example.com',
        publisher: 'Example',
        usableAsInput: true,
        sourceVerdict: 'unknownLicense',
        title: 'candidate A',
      },
      {
        imageUrl: 'https://cdn.other.com/b.jpg',
        domain: 'other.com',
        usableAsInput: true,
        sourceVerdict: 'unknownLicense',
      },
    ],
  },
}

const FOLDER_VISION_STEP: AssistantOperatorStep = {
  id: 'step-folder',
  title: 'inspected the folder',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
  verb: 'look',
  status: 'done',
  payload: {
    folderId: 'hero-folder',
    instruction: '挑出适合做角色参考的图',
  },
  result: {
    folder: {
      folderId: 'hero-folder',
      name: 'Hero',
      path: 'Characters / Hero',
      imageCount: 30,
    },
    totalImages: 30,
    inspectedImages: 2,
    truncated: true,
    batchCount: 1,
    findings: [
      {
        assetId: 'asset-1',
        url: 'https://cdn.example.com/asset-1.png',
        thumbnailUrl: 'https://cdn.example.com/asset-1-thumb.webp',
        createdAt: '2026-08-31T00:00:00.000Z',
        observation: 'front-facing portrait',
        relevance: 'high',
        reason: 'clear face',
        tags: ['portrait'],
      },
      {
        assetId: 'asset-2',
        url: 'https://cdn.example.com/asset-2.png',
        createdAt: '2026-08-30T00:00:00.000Z',
        observation: 'full-body sheet',
        relevance: 'medium',
        reason: 'clear silhouette',
        tags: ['full-body'],
      },
    ],
    batchSummaries: ['two character references'],
    uncertainties: [],
    visionAdapter: 'gemini',
  },
}

function renderItem(
  overrides: Partial<Parameters<typeof StudioOperatorLogItem>[0]> = {},
) {
  render(
    <StudioOperatorLogItem step={WEB_STEP} undone={false} {...overrides} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('日志条 · 找图那一步（搜索期切片 1）', () => {
  it('⭐ 只留一句「搜索 Google 图片：… · N 张」，⛔ 网格不再画在这一条里', () => {
    renderItem()
    expect(screen.getByTestId('operator-log-item').textContent).toContain(
      'web.found {"query":"pvc figure studio shot","count":2}',
    )
    expect(screen.queryByTestId('operator-web-candidates')).toBeNull()
    expect(screen.queryAllByTestId('operator-web-candidate')).toHaveLength(0)
  })

  it('还在搜时写「正在搜索…」', () => {
    renderItem({
      step: {
        id: 'step-1',
        title: 'searching',
        tool: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
        verb: 'research',
        status: 'running',
        payload: { query: 'pvc figure studio shot', limit: 8 },
        result: null,
      },
    })
    expect(screen.getByTestId('operator-log-item').textContent).toContain(
      'web.searching {"query":"pvc figure studio shot"}',
    )
  })

  it('⛔ 这一条没有撤销按钮 —— 读类，一个字节都没落', () => {
    renderItem()
    expect(screen.queryByTestId('operator-log-undo')).toBeNull()
  })
})

describe('日志条 · 找视频那一步（搜索期第二片）', () => {
  it('只留一句「搜索视频：… · N 个」，⛔ 卡片不画在这一条里', () => {
    renderItem({
      step: {
        id: 'step-2',
        title: 'videos',
        tool: ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
        verb: 'research',
        status: 'done',
        payload: { query: '长离 PV', limit: 8, bilibili: true },
        result: {
          totalFound: 1,
          videos: [
            {
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              title: 'Changli PV',
              platform: 'youtube',
            },
          ],
        },
      },
    })
    expect(screen.getByTestId('operator-log-item').textContent).toContain(
      'web.videosFound {"query":"长离 PV","count":1}',
    )
    expect(screen.queryByTestId('operator-web-videos')).toBeNull()
    expect(screen.queryByTestId('operator-log-undo')).toBeNull()
  })

  it('还在搜时写「正在搜索视频…」', () => {
    renderItem({
      step: {
        id: 'step-2',
        title: 'videos',
        tool: ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
        verb: 'research',
        status: 'running',
        payload: { query: '长离 PV', limit: 8, bilibili: false },
        result: null,
      },
    })
    expect(screen.getByTestId('operator-log-item').textContent).toContain(
      'web.videosSearching {"query":"长离 PV"}',
    )
  })
})

describe('日志条 · 文件夹视觉检查', () => {
  it('只展示实际检查过的证据图，并用缩略图绘制', () => {
    renderItem({ step: FOLDER_VISION_STEP })
    const images = screen
      .getAllByTestId('operator-folder-vision-image')
      .map((tile) => tile.querySelector('img')?.getAttribute('src'))
    expect(images).toEqual([
      'https://cdn.example.com/asset-1-thumb.webp',
      'https://cdn.example.com/asset-2.png',
    ])
    expect(screen.queryByTestId('operator-log-undo')).toBeNull()
  })

  it('点证据图打开原图，那一行就写着 2/30 的覆盖率', () => {
    renderItem({ step: FOLDER_VISION_STEP })
    fireEvent.click(screen.getAllByTestId('operator-folder-vision-image')[0])
    expect(openOperatorLightbox).toHaveBeenCalledWith(
      'https://cdn.example.com/asset-1.png',
      'front-facing portrait',
    )

    expect(screen.getByTestId('operator-log-item').textContent).toContain(
      '2/30',
    )
  })
})

describe('日志条 · 证据卡（research，2026-09-06）', () => {
  const RESEARCH_STEP = {
    id: 'step-1',
    tool: 'research',
    verb: 'research',
    status: 'done',
    title: 'research the character',
    payload: {
      goal: 'appearance and outfit',
      entities: ['Ananta', 'Shiye'],
      sources: ['wiki', 'web', 'danbooru'],
      round: 1,
    },
    result: {
      totalFound: 2,
      evidence: [
        {
          title: '萌娘百科 · 时夜',
          url: 'https://zh.moegirl.org.cn/shiye',
          publisher: 'zh.moegirl.org.cn',
          snippet: '黑色长发，金色瞳孔。',
          kind: 'text',
          confidence: 'high',
        },
        {
          // ⚠ 没有 url —— danbooru 的共现标签不指向单一页面。
          title: 'danbooru tags',
          publisher: 'danbooru',
          snippet: 'black_hair, yellow_eyes',
          kind: 'tags',
          confidence: 'low',
        },
      ],
    },
  } as unknown as Parameters<typeof StudioOperatorLogItem>[0]['step']

  it('每条证据一行，带出处 / 形状 / 置信度三枚标', () => {
    renderItem({ step: RESEARCH_STEP })

    const items = screen.getAllByTestId('operator-evidence-item')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveAttribute('data-kind', 'text')
    expect(items[0]).toHaveAttribute('data-confidence', 'high')
    expect(items[1]).toHaveAttribute('data-kind', 'tags')
    expect(items[1]).toHaveAttribute('data-confidence', 'low')

    const publishers = screen
      .getAllByTestId('operator-evidence-publisher')
      .map((node) => node.textContent)
    expect(publishers).toEqual(['zh.moegirl.org.cn', 'danbooru'])
  })

  it('⭐ 有 url 的标题可点开原页；⛔ 没有 url 的不渲染成点不开的链接', () => {
    renderItem({ step: RESEARCH_STEP })

    const links = screen.getAllByTestId('operator-evidence-link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://zh.moegirl.org.cn/shiye')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
    // 没链接那条照样看得见标题。
    expect(screen.getByText('danbooru tags')).toBeInTheDocument()
  })

  it('摘要照原样显示（标签档就是那串可直接用的词）', () => {
    renderItem({ step: RESEARCH_STEP })
    expect(screen.getByText('black_hair, yellow_eyes')).toBeInTheDocument()
  })

  it('⭐ 标成视频、能嵌的那条：标题点了就地播（同一个播放器）；嵌不了的仍是新窗口链接', () => {
    const step = {
      ...RESEARCH_STEP,
      result: {
        totalFound: 2,
        evidence: [
          {
            title: '时夜 PV',
            url: 'https://www.bilibili.com/video/BV1ji421e7nM',
            publisher: 'bilibili.com',
            snippet: 'UP主：官方',
            kind: 'video',
            confidence: 'high',
          },
          {
            title: '短链里的那支',
            url: 'https://b23.tv/AbCdEf1',
            publisher: 'b23.tv',
            snippet: '短链',
            kind: 'video',
            confidence: 'medium',
          },
        ],
      },
    } as unknown as Parameters<typeof StudioOperatorLogItem>[0]['step']
    renderItem({ step })

    // 认不出稿件号的短链：仍是新窗口链接。
    const links = screen.getAllByTestId('operator-evidence-link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://b23.tv/AbCdEf1')
    expect(links[0]).toHaveAttribute('target', '_blank')

    const play = screen.getByTestId('operator-evidence-play')
    expect(play.tagName).toBe('BUTTON')
    fireEvent.click(play)
    expect(play).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('operator-web-video-iframe')).toHaveAttribute(
      'src',
      'https://player.bilibili.com/player.html?bvid=BV1ji421e7nM&autoplay=0',
    )
    fireEvent.click(play)
    expect(screen.queryByTestId('operator-web-video-player')).toBeNull()
  })
})

describe('日志条 · 读回来的正文（read_url，2026-09-06）', () => {
  const READ_STEP = {
    id: 'step-1',
    tool: 'read_url',
    verb: 'research',
    status: 'done',
    title: 'read the page',
    payload: {
      url: 'https://zh.moegirl.org.cn/shiye',
      focus: '外貌与服饰',
    },
    result: {
      title: 'https://zh.moegirl.org.cn/shiye',
      url: 'https://zh.moegirl.org.cn/shiye',
      excerpt: '外貌与服饰：黑色长发，金色瞳孔。',
    },
  } as unknown as Parameters<typeof StudioOperatorLogItem>[0]['step']

  it('⭐ 正文段**摊开画**（不折进详情）—— 用户要能当场对照助手写进提示词的原文', () => {
    renderItem({ step: READ_STEP })
    expect(screen.getByTestId('operator-read-url-excerpt')).toHaveTextContent(
      '金色瞳孔',
    )
  })

  it('地址可点开原页', () => {
    renderItem({ step: READ_STEP })
    expect(screen.getByTestId('operator-read-url-link')).toHaveAttribute(
      'href',
      'https://zh.moegirl.org.cn/shiye',
    )
    expect(screen.queryByTestId('operator-read-url-snippet-only')).toBeNull()
  })

  it('⛔ 全文没读到（via snippet）时明说只是搜索摘要（2026-10-15）', () => {
    renderItem({
      step: {
        ...READ_STEP,
        result: {
          title: '时夜 - 角色介绍',
          url: 'https://blocked.example.test/shiye',
          excerpt: '时夜：黑色长发，金色瞳孔。',
          via: 'snippet',
        },
      } as unknown as Parameters<typeof StudioOperatorLogItem>[0]['step'],
    })
    expect(
      screen.getByTestId('operator-read-url-snippet-only'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('operator-read-url-excerpt')).toHaveTextContent(
      '金色瞳孔',
    )
  })
})

it('a returned draft is marked as such and not painted as a failure', () => {
  renderItem({
    step: {
      id: 'draft',
      title: '写提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'error',
      draft: true,
      error: { reason: 'unknownValue', detail: 'Not tags.' },
    },
  })
  expect(document.querySelector('[data-draft="true"]')).not.toBeNull()
  expect(document.querySelector('.text-status-risk')).toBeNull()
})

it('exposes the concrete rejection detail when the failed log is expanded', () => {
  renderItem({
    step: {
      id: 'failed',
      title: '改写提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'error',
      error: { reason: 'unknownValue', detail: '人物来源应为图2。' },
    },
  })
  expect(screen.queryByTestId('operator-log-detail')).toBeNull()
  fireEvent.click(screen.getByTestId('operator-log-title'))
  expect(screen.getByTestId('operator-log-detail')).toHaveTextContent(
    '人物来源应为图2。',
  )
})
