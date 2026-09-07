// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_RESEARCH_EVIDENCE_PREVIEW } from '@/constants/studio-assistant-operator'

import { StudioOperatorResearchCard } from './StudioOperatorResearchCard'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'

/**
 * 调查卡的回归闸（2026-09-06 面板轮，第 6 件）。
 *
 * 钉四件事：
 *  ① 结论行写「查了什么」+ 拿回来几条；
 *  ② 证据带出处与可信度 chip，⚠ 没有 `url` 的那条⛔ 不画成链接；
 *  ③ 候选图走**复用**的 `StudioOperatorWebCandidateGrid`（含「挂上 N 张」）；
 *  ④ 过程默认折起来；
 *  ⑤ 证据默认**收着**（2026-09-07，owner「图一这个过程直接跳过不显示吧」）：
 *     每条一行、不铺摘录、`image`/`tags` 那两档默认不进列表、超过 N 条进
 *     「还有 M 条」—— 展开之后全部看得见。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const RESEARCH: StudioOperatorStepEntry = {
  kind: 'step',
  id: 'run-1:step-1',
  runKey: 'run-1',
  undone: false,
  step: {
    id: 'step-1',
    tool: 'research',
    title: '查设定',
    status: 'done',
    payload: {
      goal: '这个角色长什么样',
      entities: ['角色 A'],
      sources: ['wiki'],
      round: 1,
    },
    result: {
      totalFound: 2,
      evidence: [
        {
          title: '官方设定集',
          url: 'https://example.com/a',
          publisher: 'example.com',
          snippet: '粉发、金瞳、下双马尾。',
          kind: 'text',
          confidence: 'high',
        },
        {
          title: '共现标签',
          publisher: 'danbooru',
          snippet: 'pink_hair · yellow_eyes',
          kind: 'tags',
          confidence: 'medium',
        },
      ],
    },
  },
} as unknown as StudioOperatorStepEntry

const IMAGES: StudioOperatorStepEntry = {
  kind: 'step',
  id: 'run-1:step-2',
  runKey: 'run-1',
  undone: false,
  step: {
    id: 'step-2',
    tool: 'search_web_images',
    title: '搜图',
    status: 'done',
    payload: { query: '角色 A', limit: 4 },
    result: {
      images: [
        {
          url: 'https://cdn.test/a.png',
          thumbnailUrl: 'https://cdn.test/a-s.png',
          title: '立绘',
          pageUrl: 'https://example.com/p',
          publisher: 'example.com',
          width: 800,
          height: 1200,
          verdict: 'allowed',
        },
      ],
    },
  },
} as unknown as StudioOperatorStepEntry

/** 一步搜图，候选直链由调用方给 —— 用来钉「同一张候选只有一个格子」。 */
function imageStep(
  id: string,
  imageUrls: readonly string[],
): StudioOperatorStepEntry {
  return {
    kind: 'step',
    id: `run-1:${id}`,
    runKey: 'run-1',
    undone: false,
    step: {
      id,
      tool: 'search_web_images',
      title: '搜图',
      status: 'done',
      payload: { query: '角色 A', limit: 4 },
      result: {
        totalFound: imageUrls.length,
        images: imageUrls.map((imageUrl) => ({
          imageUrl,
          domain: 'example.com',
          usableAsInput: true,
          sourceVerdict: 'allowed',
        })),
      },
    },
  } as unknown as StudioOperatorStepEntry
}

/** 一步里塞 n 条**有信息量**的证据 —— 用来钉「默认只铺前 N 条」。 */
function manyTextEvidence(count: number): StudioOperatorStepEntry {
  return {
    ...RESEARCH,
    step: {
      ...RESEARCH.step,
      result: {
        totalFound: count,
        evidence: Array.from({ length: count }, (_unused, index) => ({
          title: `证据 ${index + 1}`,
          url: `https://example.com/${index}`,
          publisher: 'example.com',
          snippet: `摘录 ${index + 1}`,
          kind: 'text',
          confidence: 'medium',
        })),
      },
    },
  } as unknown as StudioOperatorStepEntry
}

function renderCard(steps: StudioOperatorStepEntry[], children?: string) {
  const onToggleWebImage = vi.fn()
  render(
    <StudioOperatorResearchCard
      steps={steps}
      webImportStates={{}}
      webImportLimit={4}
      onToggleWebImage={onToggleWebImage}
    >
      {children ? <span data-testid="process-row">{children}</span> : null}
    </StudioOperatorResearchCard>,
  )
  return { onToggleWebImage }
}

describe('StudioOperatorResearchCard', () => {
  it('⭐ 结论行写「查了什么」+ 几条证据', () => {
    renderCard([RESEARCH])
    expect(screen.getByTestId('operator-research-goal').textContent).toContain(
      '这个角色长什么样',
    )
    // ⚠ 头上那颗数字说的是**一共几条**（2 条），列表里默认只铺有信息量的那 1 条
    //   —— `tags` 那档是底稿，展开才看。
    expect(
      screen.getByTestId('operator-research-evidence-toggle').textContent,
    ).toContain('2')
    expect(
      screen.getAllByTestId('operator-research-evidence-item'),
    ).toHaveLength(1)
  })

  it('⭐ 证据带出处与可信度；没有 url 的那条⛔ 不是链接', () => {
    renderCard([RESEARCH])
    fireEvent.click(screen.getByTestId('operator-research-evidence-toggle'))
    const items = screen.getAllByTestId('operator-research-evidence-item')
    expect(items[0]?.dataset.confidence).toBe('high')
    expect(
      items[0]?.querySelector(
        '[data-testid="operator-research-evidence-link"]',
      ),
    ).not.toBeNull()
    // danbooru 的共现标签没有单一页面可点。
    expect(
      items[1]?.querySelector(
        '[data-testid="operator-research-evidence-link"]',
      ),
    ).toBeNull()
    expect(
      screen.getAllByTestId('operator-research-evidence-publisher')[1]
        ?.textContent,
    ).toBe('danbooru')
  })

  it('⭐ 候选图走复用的候选网格 —— ⛔ 没有另画一份', () => {
    renderCard([RESEARCH, IMAGES])
    expect(screen.getByTestId('operator-web-candidates')).toBeTruthy()
  })

  /**
   * 🔬 2026-09-07 真机：一轮里换个词再搜一次，两次召回重叠 —— 服务端只在**一次
   * 调用内**按 `imageUrl` 去重，跨调用它看不见。两个格子各算各的选中态。
   */
  it('⭐ 同一条候选直链在整张卡上只有一个格子', () => {
    renderCard([
      imageStep('step-2', ['https://cdn.test/a.png', 'https://cdn.test/b.png']),
      imageStep('step-3', ['https://cdn.test/b.png', 'https://cdn.test/c.png']),
    ])
    const tiles = screen.getAllByTestId('operator-web-candidate')
    expect(tiles).toHaveLength(3)
  })

  it('⭐ 过程默认折起来；没有过程时⛔ 一颗空折叠都不画', () => {
    renderCard([RESEARCH], '读了一页')
    const process = screen.getByTestId('operator-research-process')
    expect(process).not.toHaveAttribute('open')
    expect(process).toContainElement(screen.getByTestId('process-row'))

    process.remove()
    renderCard([RESEARCH])
    expect(screen.queryByTestId('operator-research-process')).toBeNull()
  })

  /**
   * 🔬 owner 2026-09-07 打回（图一）：19 条证据全文铺开，萌娘百科整段简介 +
   * 分类标签堆 + 「image on this page (1024×1024)」占了整屏。
   */
  it('⭐ 默认收着：⛔ 一条摘录都不铺，无信息量的那两档也不进列表', () => {
    renderCard([RESEARCH])
    expect(
      screen.queryByTestId('operator-research-evidence-snippet'),
    ).toBeNull()
    const items = screen.getAllByTestId('operator-research-evidence-item')
    expect(items).toHaveLength(1)
    expect(items[0]?.dataset.kind).toBe('text')
    expect(
      screen.getByTestId('operator-research-evidence').dataset.expanded,
    ).toBe('false')
  })

  it('⭐ 点「N 条证据」展开：摘录出来了，被降级的那档也回来了', () => {
    renderCard([RESEARCH])
    fireEvent.click(screen.getByTestId('operator-research-evidence-toggle'))

    expect(
      screen.getAllByTestId('operator-research-evidence-item'),
    ).toHaveLength(2)
    expect(
      screen.getAllByTestId('operator-research-evidence-snippet')[0]
        ?.textContent,
    ).toContain('粉发')
    // 再点一次收回去 —— 同一颗开关。
    fireEvent.click(screen.getByTestId('operator-research-evidence-toggle'))
    expect(
      screen.queryByTestId('operator-research-evidence-snippet'),
    ).toBeNull()
  })

  it('⭐ 超过前 N 条时只铺 N 条，其余进「还有 M 条」（点它 = 同一个开关）', () => {
    renderCard([manyTextEvidence(9)])

    expect(
      screen.getAllByTestId('operator-research-evidence-item'),
    ).toHaveLength(STUDIO_OPERATOR_RESEARCH_EVIDENCE_PREVIEW)
    const more = screen.getByTestId('operator-research-evidence-more')
    expect(more.textContent).toContain(
      String(9 - STUDIO_OPERATOR_RESEARCH_EVIDENCE_PREVIEW),
    )

    fireEvent.click(more)
    expect(
      screen.getAllByTestId('operator-research-evidence-item'),
    ).toHaveLength(9)
  })
})
