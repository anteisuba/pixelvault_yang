// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOLS,
} from '@/constants/assistant-operator'
import type { AssistantOperatorStep } from '@/types/assistant-operator'

import {
  OPERATOR_TOOL_ICONS,
  StudioOperatorLogItem,
} from './StudioOperatorLogItem'

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
        title: 'candidate A',
      },
      {
        imageUrl: 'https://cdn.other.com/b.jpg',
        domain: 'other.com',
      },
    ],
  },
}

const FOLDER_VISION_STEP: AssistantOperatorStep = {
  id: 'step-folder',
  title: 'inspected the folder',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
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
      screen.getByTestId('operator-web-import-error').textContent,
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
    expect(screen.getByTestId('operator-web-import-error')).toBeTruthy()
  })
})

/**
 * 图标表穷举（C1-pre）。`Record<Tool, …>` 在编译期已经锁了一次；这里再锁运行时
 * 那一面 —— 表里每一格都真是一枚 lucide 图标，而不是 `undefined` 混过了类型
 * （历史条那边 `?? Sparkles` 的兜底只该给**退役**的工具名用）。
 */
describe('图标表 · 画布十条（C1-pre）', () => {
  it('工具表里每一条都有图标', () => {
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      expect(OPERATOR_TOOL_ICONS[tool], tool).toBeDefined()
    }
  })

  it('`prime_node_generate` 与 `prime_generate` 同一枚 💲、同一身钱色', () => {
    expect(OPERATOR_TOOL_ICONS.prime_node_generate).toBe(
      OPERATOR_TOOL_ICONS.prime_generate,
    )
    renderItem({
      step: {
        id: 'step-9',
        title: 'armed the hero node',
        tool: ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
        status: 'done',
        payload: { nodeId: 'n1', primed: true },
        inverse: { nodeId: 'n1', primed: false },
      },
    })
    const item = screen.getByTestId('operator-log-item')
    expect(item.getAttribute('data-tool')).toBe('prime_node_generate')
    expect(item.className).toContain('amber')
  })
})
