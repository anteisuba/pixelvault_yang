// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import type { AssistantOperatorStep } from '@/types/assistant-operator'

import { StudioOperatorLogItem } from './StudioOperatorLogItem'

/**
 * 联网候选在日志条上的回归闸（P3-B → 2026-08-31 按拍板 21 重做）。
 *
 * 钉四件事：
 *  ① 候选画的是**缩略图**（🔬 原图直链约三成 403 —— 画原图会得到一半碎图）；
 *  ② **点图 = 开灯箱看原图，一次导入都不发**（owner 打回的「浏览即采购」）；
 *  ③ 点「选用」才把那张交出去，已选的再点 = 取消；
 *  ④ 这一条**没有撤销按钮** —— 它是读类，一个字节都没落，没有东西可撤。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
    borrowedVisionRoute: false,
  },
}

function renderItem(
  overrides: Partial<Parameters<typeof StudioOperatorLogItem>[0]> = {},
) {
  const onToggleWebImage = vi.fn()
  render(
    <StudioOperatorLogItem
      entryId="run-1:step-1"
      step={WEB_STEP}
      undone={false}
      onUndo={vi.fn()}
      webImport={undefined}
      webImportLimit={4}
      onToggleWebImage={onToggleWebImage}
      renderWebCandidates
      {...overrides}
    />,
  )
  return { onToggleWebImage }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('日志条 · 联网候选（P3-B）', () => {
  it('每张候选一格，画的是缩略图（⛔ 不是原图直链）', () => {
    renderItem()
    const tiles = screen.getAllByTestId('operator-web-candidate')
    expect(tiles).toHaveLength(2)
    const images = tiles.map((tile) =>
      tile.querySelector('img')?.getAttribute('src'),
    )
    // 第一张有缩略图就用缩略图；第二张没有才回落到原图。
    expect(images).toEqual([
      'https://tbn.example.com/a.jpg',
      'https://cdn.other.com/b.jpg',
    ])
  })

  /**
   * ⭐ 拍板 21 的正面：**看不等于要**。owner 真机点一下缩略图就下载了一张，
   * 换个选择再下载一张，而换掉的还留着。
   */
  it('⭐ 点缩略图 = 开灯箱看**原图**，⛔ 一次导入都不发', () => {
    const { onToggleWebImage } = renderItem()
    fireEvent.click(screen.getAllByTestId('operator-web-candidate')[0])
    expect(onToggleWebImage).not.toHaveBeenCalled()
    // 灯箱吃原图直链（缩略图只画在格子里）—— 看大图的意义就在这儿。
    expect(openOperatorLightbox).toHaveBeenCalledWith(
      'https://cdn.example.com/a.jpg',
      'candidate A',
    )
  })

  it('点「选用」才把那张候选交出去（转存由宿主的 hook 发起）', () => {
    const { onToggleWebImage } = renderItem()
    fireEvent.click(screen.getAllByTestId('operator-web-candidate-use')[1])
    expect(onToggleWebImage).toHaveBeenCalledWith('run-1:step-1', {
      imageUrl: 'https://cdn.other.com/b.jpg',
      domain: 'other.com',
      usableAsInput: true,
      sourceVerdict: 'unknownLicense',
    })
    expect(openOperatorLightbox).not.toHaveBeenCalled()
  })

  it('⭐ 多选：已选一张时另一张照样可选（每格算自己的态）', () => {
    const { onToggleWebImage } = renderItem({
      webImport: {
        picks: [
          {
            imageUrl: 'https://cdn.example.com/a.jpg',
            status: 'imported',
            generationId: 'gen-a',
          },
        ],
      },
    })
    const tiles = screen.getAllByTestId('operator-web-candidate')
    expect(tiles[0].getAttribute('data-state')).toBe('imported')
    expect(tiles[1].getAttribute('data-state')).toBe('idle')

    fireEvent.click(screen.getAllByTestId('operator-web-candidate-use')[1])
    expect(onToggleWebImage).toHaveBeenCalledWith(
      'run-1:step-1',
      expect.objectContaining({ imageUrl: 'https://cdn.other.com/b.jpg' }),
    )
  })

  it('已选那张的「选用」钮按下态，再点 = 取消选用', () => {
    const { onToggleWebImage } = renderItem({
      webImport: {
        picks: [
          {
            imageUrl: 'https://cdn.example.com/a.jpg',
            status: 'imported',
            generationId: 'gen-a',
          },
        ],
      },
    })
    const buttons = screen.getAllByTestId('operator-web-candidate-use')
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(buttons[0])
    expect(onToggleWebImage).toHaveBeenCalledWith(
      'run-1:step-1',
      expect.objectContaining({ imageUrl: 'https://cdn.example.com/a.jpg' }),
    )
  })

  it('⛔ 失败不静默：那一格标红、原因写在下面，且那一格没消失', () => {
    renderItem({
      webImport: {
        picks: [
          {
            imageUrl: 'https://cdn.example.com/a.jpg',
            status: 'error',
            error: 'Failed to fetch image (403)',
          },
        ],
      },
    })
    const tiles = screen.getAllByTestId('operator-web-candidate')
    expect(tiles[0].getAttribute('data-state')).toBe('error')
    expect(tiles[0].getAttribute('data-selected')).toBe('true')
    expect(
      screen.getAllByTestId('operator-web-candidate-error')[0].textContent,
    ).toContain('403')
  })

  it('⛔ 清理失败也不静默（拍板 21 的零残留有没有做到，要说出来）', () => {
    renderItem({
      webImport: {
        picks: [],
        cleanupError: '换下来的那张没能删掉',
      },
    })
    expect(screen.getByTestId('operator-web-cleanup-error')).toBeTruthy()
  })

  it('在飞时那一格转圈（导入中大声说出来）', () => {
    renderItem({
      webImport: {
        picks: [
          { imageUrl: 'https://cdn.example.com/a.jpg', status: 'importing' },
        ],
      },
    })
    expect(screen.getByTestId('spinner')).toBeTruthy()
  })

  /**
   * 🔬 2026-09-07 真机：`[data-testid=operator-web-candidate]` 数出 16 个，唯一
   * 候选只有 8 张 —— 调查卡画了一份，卡底「过程」里的这条日志又画了一份。
   */
  it('⛔ 调查卡已经画过时这一条不再画（同一张候选只有一个格子）', () => {
    renderItem({ renderWebCandidates: false })
    expect(screen.queryAllByTestId('operator-web-candidate')).toHaveLength(0)
    expect(screen.queryByTestId('operator-web-candidates')).toBeNull()
  })

  it('⛔ 这一条没有撤销按钮 —— 读类，一个字节都没落', () => {
    renderItem()
    expect(screen.queryByTestId('operator-log-undo')).toBeNull()
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

  it('点证据图打开原图，展开详情能复核 2/30 的覆盖率', () => {
    renderItem({ step: FOLDER_VISION_STEP })
    fireEvent.click(screen.getAllByTestId('operator-folder-vision-image')[0])
    expect(openOperatorLightbox).toHaveBeenCalledWith(
      'https://cdn.example.com/asset-1.png',
      'front-facing portrait',
    )

    fireEvent.click(screen.getByTestId('operator-log-title'))
    expect(screen.getByTestId('operator-log-detail').textContent).toContain(
      '2/30',
    )
  })
})

/**
 * ⭐ 2026-08-30 真机抓到的那一帧：换选到一张取不到的图之后，旧那张的「已入库」
 * 角标不许消失 —— 它的附件还挂在输入框上。多选之后这条更硬：**每格各算各的**。
 */
describe('日志条 · 一格失败不该弄脏别格', () => {
  it('旧那张仍标「已入库」，新那张标红，两格互不干扰', () => {
    renderItem({
      webImport: {
        picks: [
          {
            imageUrl: 'https://cdn.example.com/a.jpg',
            status: 'imported',
            generationId: 'gen-a',
          },
          {
            imageUrl: 'https://cdn.other.com/b.jpg',
            status: 'error',
            error: '这个链接不是能收下的图片格式',
          },
        ],
      },
    })
    const tiles = screen.getAllByTestId('operator-web-candidate')
    expect(tiles[0].getAttribute('data-state')).toBe('imported')
    expect(tiles[1].getAttribute('data-state')).toBe('error')
    expect(tiles[0].getAttribute('data-selected')).toBe('true')
    expect(screen.getAllByTestId('operator-web-candidate-error')).toHaveLength(
      1,
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
  })
})

it('exposes the concrete rejection detail when the failed log is expanded', () => {
  renderItem({
    step: {
      id: 'failed',
      title: '改写提示词',
      tool: 'set_prompt',
      verb: 'apply',
      status: 'error',
      error: { reason: 'promptConflict', detail: '人物来源应为图2。' },
    },
  })
  expect(screen.queryByTestId('operator-log-detail')).toBeNull()
  fireEvent.click(screen.getByTestId('operator-log-title'))
  expect(screen.getByTestId('operator-log-detail')).toHaveTextContent(
    '人物来源应为图2。',
  )
})
