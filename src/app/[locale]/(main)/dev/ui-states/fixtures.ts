import { AI_MODELS } from '@/constants/models'
import type { ReferenceImageEntry } from '@/hooks/use-image-upload'
import type { GenerationRecord, RunItem } from '@/types'

/**
 * 结果区状态样板间的假数据。
 *
 * 存在理由：工作台的结果区只有「真的生成过一次」才会出现，而生成要花钱、要等
 * 几十秒、还依赖 provider 当时的可用性。于是**生成之后的那半个界面从来没被
 * 系统性看过** —— 重叠、占空、缺入口这类问题只能等用户自己撞上。
 *
 * 这些图走 `public/showcase/`，仓库里就有，不依赖任何账号或网络。
 */

const SHOWCASE = [
  '/showcase/showcase-01.webp',
  '/showcase/showcase-02.webp',
  '/showcase/showcase-03.webp',
  '/showcase/showcase-04.webp',
  '/showcase/showcase-05.webp',
  '/showcase/showcase-06.webp',
  '/showcase/showcase-07.webp',
  '/showcase/showcase-08.webp',
] as const

/** 竖构图 —— owner 截图里那轮是 9:16，最能暴露「一格占满整屏」。 */
const PORTRAIT = { width: 1080, height: 1920 } as const
const SQUARE = { width: 1024, height: 1024 } as const

const PROMPT =
  'Use image #1 and image #2 as strict character-design references. Create one polished anime-style candid portrait of the same character in a quiet school corridor on a bright afternoon.'

function makeGeneration(
  index: number,
  modelId: string,
  size: { width: number; height: number },
): GenerationRecord {
  return {
    id: `fixture-gen-${index}`,
    createdAt: new Date('2026-08-23T10:00:00Z'),
    outputType: 'IMAGE',
    status: 'COMPLETED',
    url: SHOWCASE[index % SHOWCASE.length],
    storageKey: `fixture/${index}`,
    mimeType: 'image/webp',
    width: size.width,
    height: size.height,
    prompt: PROMPT,
    model: modelId,
    provider: 'fixture',
    requestCount: 1,
    isPublic: false,
    isPromptPublic: true,
    likeCount: 0,
    isLiked: false,
  }
}

interface MatrixSpec {
  models: string[]
  perModel: number
  size?: { width: number; height: number }
  /** 把第 n 个格子改成生成中 / 失败，用来看混合态。 */
  generatingAt?: number[]
  failedAt?: number[]
}

/** 按「模型 × 每模型张数」摊平成 items —— 与 `generateCompare` 同一个形状。 */
export function makeRunItems({
  models,
  perModel,
  size = PORTRAIT,
  generatingAt = [],
  failedAt = [],
}: MatrixSpec): RunItem[] {
  return models.flatMap((modelId, modelIdx) =>
    Array.from({ length: perModel }, (_, takeIdx): RunItem => {
      const flat = modelIdx * perModel + takeIdx
      const id = `fixture-item-${modelIdx}-${takeIdx}`
      if (generatingAt.includes(flat)) {
        return {
          id,
          modelId,
          status: 'generating',
          generation: null,
          error: null,
        }
      }
      if (failedAt.includes(flat)) {
        return {
          id,
          modelId,
          status: 'failed',
          generation: null,
          error: '模型返回了空结果，请重试',
        }
      }
      return {
        id,
        modelId,
        status: 'completed',
        generation: makeGeneration(flat, modelId, size),
        error: null,
      }
    }),
  )
}

/**
 * 参考轨的槽位。第 3 条故意是 `over_limit` —— 禁用槽照样要列出来（「为什么这张
 * 没被用上」正是用户要看的），所以它必须有一个能被看见的状态。
 */
export const UI_STATE_REFERENCE_ENTRIES: ReferenceImageEntry[] = [
  { url: SHOWCASE[4], disabledReason: null },
  { url: SHOWCASE[5], disabledReason: null },
  { url: SHOWCASE[6], disabledReason: 'over_limit' },
]

export const UI_STATE_CASES = [
  {
    key: 'matrix-2x2-portrait',
    title: '2 模型 × 2 张 · 9:16（owner 截图那轮）',
    items: makeRunItems({
      models: [AI_MODELS.GEMINI_PRO_IMAGE, AI_MODELS.OPENAI_GPT_IMAGE_2],
      perModel: 2,
    }),
    selectedIndex: null,
  },
  {
    key: 'matrix-2x1-square',
    title: '2 模型 × 1 张 · 1:1',
    items: makeRunItems({
      models: [AI_MODELS.GEMINI_PRO_IMAGE, AI_MODELS.FLUX_2_PRO],
      perModel: 1,
      size: SQUARE,
    }),
    selectedIndex: null,
  },
  {
    key: 'matrix-4x2-mixed',
    title: '4 模型 × 2 张 · 混合态（生成中 / 失败 / 完成）',
    items: makeRunItems({
      models: [
        AI_MODELS.GEMINI_PRO_IMAGE,
        AI_MODELS.OPENAI_GPT_IMAGE_2,
        AI_MODELS.FLUX_2_PRO,
        AI_MODELS.GEMINI_FLASH_IMAGE,
      ],
      perModel: 2,
      generatingAt: [2, 5],
      failedAt: [4],
    }),
    selectedIndex: null,
  },
  {
    key: 'matrix-2x2-selected',
    title: '2 模型 × 2 张 · 已选中第 2 格',
    items: makeRunItems({
      models: [AI_MODELS.GEMINI_PRO_IMAGE, AI_MODELS.OPENAI_GPT_IMAGE_2],
      perModel: 2,
    }),
    selectedIndex: 1,
  },
] as const
