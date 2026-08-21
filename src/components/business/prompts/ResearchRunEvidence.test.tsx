import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import {
  EVIDENCE_SOURCE_TIERS,
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCE_IDS,
  RESEARCH_SOURCE_STATUSES,
} from '@/constants/research'
import type { EvidenceItem, ResearchRunDetail } from '@/types/research'

/**
 * 正文里的 `[n]` 引用（AI 导演内核 · 切片 1 · UI 批）。
 *
 * 三条被守的性质：
 *  1. **懒**：一条回答可能有八九个 `[n]`，挂载即拉等于把「懒加载」写成「并发
 *     加载」；同一个 run 的多个引用还必须共用**一次**请求。
 *  2. **可达原文**：点开给的是那条证据的 title / url / retrievedAt / 层级，
 *     §3.6 验收的「引用点开可达原文」就是这一条。
 *  3. **不静默**：引用指向不存在的编号时如实说「查无实据」—— 幻引用闸在服务端
 *     漏了才会走到这里，藏起来等于把那道闸的报警也一并关掉。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('|')}` : key,
  useLocale: () => 'en',
}))

// 引用弹层在触屏紧凑态会换成抽屉；这套断言只跑桌面那条路（细指针）。
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

const { getResearchRunAPIMock } = vi.hoisted(() => ({
  getResearchRunAPIMock: vi.fn(),
}))

vi.mock('@/lib/api-client/research', () => ({
  getResearchRunAPI: getResearchRunAPIMock,
}))

import { Markdown } from '@/components/ui/markdown'
import { buildResearchCitationComponents } from './ResearchRunEvidence'

function textEvidence(over: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    kind: 'text',
    id: 'ev-1',
    sourceId: RESEARCH_SOURCE_IDS.moegirl,
    sourceTier: EVIDENCE_SOURCE_TIERS.community,
    retrievedAt: '2026-08-20T02:00:00.000Z',
    title: '长离（鸣潮）',
    url: 'https://zh.moegirl.org.cn/长离',
    excerpt: '长离是《鸣潮》中的共鸣者，粉发挑染、金瞳。',
    ...over,
  } as EvidenceItem
}

function detail(over: Partial<ResearchRunDetail> = {}): ResearchRunDetail {
  return {
    id: 'run-1',
    status: RESEARCH_RUN_STATUSES.succeeded,
    grounded: true,
    goal: 'analyze_character',
    query: '长离是什么发色',
    perSource: [
      {
        sourceId: RESEARCH_SOURCE_IDS.moegirl,
        status: RESEARCH_SOURCE_STATUSES.ok,
        count: 2,
        tookMs: 300,
      },
    ],
    evidence: [textEvidence()],
    model: 'gpt-5.6-sol',
    error: null,
    createdAt: '2026-08-20T02:00:00.000Z',
    completedAt: '2026-08-20T02:00:10.000Z',
    ...over,
  }
}

function renderBody(text: string, runId: string | undefined) {
  return render(
    <Markdown components={buildResearchCitationComponents(runId)}>
      {text}
    </Markdown>,
  )
}

beforeAll(() => {
  // jsdom 没有 Radix/floating-ui 依赖的这些观察器。
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
})

beforeEach(() => {
  getResearchRunAPIMock.mockReset()
  getResearchRunAPIMock.mockResolvedValue({ success: true, data: detail() })
})

describe('buildResearchCitationComponents', () => {
  it('turns bare [n] into a button and leaves other brackets as text', () => {
    renderBody(
      '粉发挑染[1]，见 [萌百](https://example.com) 与 [abc]。',
      'run-a',
    )

    expect(
      screen.getByRole('button', { name: 'research.citationAria:1' }),
    ).toBeInTheDocument()
    // ⚠ 链接在 mdast 阶段已经是 link 节点，文本里没有方括号；非数字方括号
    // 不该被误切成引用。
    expect(screen.getByRole('link', { name: '萌百' })).toBeInTheDocument()
    expect(screen.getByText(/\[abc\]/)).toBeInTheDocument()
  })

  it('renders citations without a run id but never pretends to have evidence', () => {
    renderBody('这句话带引用[1]。', undefined)

    fireEvent.click(
      screen.getByRole('button', { name: 'research.citationAria:1' }),
    )

    expect(screen.getByText('research.citationUnavailable')).toBeInTheDocument()
    expect(getResearchRunAPIMock).not.toHaveBeenCalled()
  })

  it('fetches nothing until a citation is opened, then once per run', async () => {
    renderBody('第一处[1]、第二处[2]。', 'run-lazy')

    expect(getResearchRunAPIMock).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: 'research.citationAria:1' }),
    )
    expect(await screen.findByText('长离（鸣潮）')).toBeInTheDocument()
    expect(getResearchRunAPIMock).toHaveBeenCalledWith('run-lazy')

    // 关掉第一处再点第二处：同一个 run 共享同一次请求，不重打接口。
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'research.citationAria:2' }),
    )

    expect(getResearchRunAPIMock).toHaveBeenCalledTimes(1)
  })

  it('shows the source, tier and original link behind a citation', async () => {
    getResearchRunAPIMock.mockResolvedValue({
      success: true,
      data: detail({ id: 'run-detail', evidence: [textEvidence()] }),
    })
    renderBody('粉发挑染[1]。', 'run-detail')

    fireEvent.click(
      screen.getByRole('button', { name: 'research.citationAria:1' }),
    )

    expect(await screen.findByText('长离（鸣潮）')).toBeInTheDocument()
    expect(screen.getByText('research.tierCommunity')).toBeInTheDocument()
    expect(screen.getByText('research.sourceMoegirl')).toBeInTheDocument()
    expect(screen.getByText(/research\.retrievedAt/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /research\.openSource/ }),
    ).toHaveAttribute('href', 'https://zh.moegirl.org.cn/长离')
  })

  it('flags an injection-downgraded excerpt instead of hiding the source', async () => {
    getResearchRunAPIMock.mockResolvedValue({
      success: true,
      data: detail({
        id: 'run-untrusted',
        evidence: [
          textEvidence({
            id: 'ev-untrusted',
            sourceTier: EVIDENCE_SOURCE_TIERS.social,
            sourceId: RESEARCH_SOURCE_IDS.bilibili,
            untrusted: true,
            excerpt: '[This excerpt was withheld…]',
          }),
        ],
      }),
    })
    renderBody('社区说法[1]。', 'run-untrusted')

    fireEvent.click(
      screen.getByRole('button', { name: 'research.citationAria:1' }),
    )

    expect(await screen.findByText('research.untrusted')).toBeInTheDocument()
    expect(screen.getByText('research.tierSocial')).toBeInTheDocument()
  })

  it('renders structured tag evidence as chips, not as a paragraph', async () => {
    getResearchRunAPIMock.mockResolvedValue({
      success: true,
      data: detail({
        id: 'run-tags',
        evidence: [
          {
            kind: 'tags',
            id: 'ev-tags',
            sourceId: RESEARCH_SOURCE_IDS.danbooru,
            sourceTier: EVIDENCE_SOURCE_TIERS.community,
            retrievedAt: '2026-08-20T02:00:00.000Z',
            title: 'changli',
            tags: ['pink hair', 'yellow eyes'],
            provenance: 'danbooru 100 张样本共现',
          },
        ],
      }),
    })
    renderBody('外观特征[1]。', 'run-tags')

    fireEvent.click(
      screen.getByRole('button', { name: 'research.citationAria:1' }),
    )

    expect(await screen.findByText('pink hair')).toBeInTheDocument()
    expect(screen.getByText('yellow eyes')).toBeInTheDocument()
    expect(screen.getByText('danbooru 100 张样本共现')).toBeInTheDocument()
  })

  it('says so out loud when a citation points at evidence that does not exist', async () => {
    getResearchRunAPIMock.mockResolvedValue({
      success: true,
      data: detail({ id: 'run-phantom', evidence: [textEvidence()] }),
    })
    renderBody('这句话引用了第 7 条[7]。', 'run-phantom')

    fireEvent.click(
      screen.getByRole('button', { name: 'research.citationAria:7' }),
    )

    expect(
      await screen.findByText('research.citationMissing'),
    ).toBeInTheDocument()
  })

  it('surfaces a load failure inside the citation popover', async () => {
    getResearchRunAPIMock.mockResolvedValue({
      success: false,
      error: 'Research run not found or access denied',
    })
    renderBody('引用[1]。', 'run-error')

    fireEvent.click(
      screen.getByRole('button', { name: 'research.citationAria:1' }),
    )

    expect(await screen.findByText('research.loadFailed')).toBeInTheDocument()
  })
})
