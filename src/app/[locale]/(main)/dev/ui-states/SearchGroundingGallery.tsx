'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { AI_MODELS } from '@/constants/models'
import { useIsMobile } from '@/hooks/use-mobile'
import { CompareGrid } from '@/components/business/image/CompareGrid'
import { GenerationPreview } from '@/components/business/studio/GenerationPreview'
import { ImageSearchGroundingSide } from '@/components/business/node/nodes/v4/image/ImageSearchGroundingSide'
import {
  addNodeSearchGroundingResult,
  finishNodeSearchGrounding,
  startNodeSearchGrounding,
} from '@/hooks/node/use-node-search-grounding'
import {
  SearchGroundingRail,
  type SearchGroundingRailState,
} from '@/components/business/studio-shared/search-grounding/SearchGroundingRail'
import { mergeSearchGroundingResults } from '@/lib/search-grounding'
import { cn } from '@/lib/utils'
import type { RunItem, SearchGroundingResult } from '@/types'

import { makeRunItems } from './fixtures'

/**
 * 「先搜再画」资料位的样板间（B 定稿 2026-10-07）：出图要花钱、而且来源只在出图
 * 当下交回一次，这几种状态平时很难同时看到。建议条用的是一段**仿写**的 HTML，
 * 只为占住位置 —— 真东西是 Google 的 `renderedContent`，原样嵌入。
 */
const SOURCES: SearchGroundingResult['sources'] = [
  {
    kind: 'web',
    url: 'https://zh.wikipedia.org/wiki/%E5%8F%B0%E5%8C%97101',
    title: '台北101 - 维基百科，自由的百科全书',
    domain: 'zh.wikipedia.org',
  },
  {
    kind: 'image',
    url: 'https://commons.wikimedia.org/wiki/Category:Taipei_101',
    title: 'Category:Taipei 101 - Wikimedia Commons',
    domain: 'commons.wikimedia.org',
  },
  {
    kind: 'image',
    url: 'https://www.taipei-101.com.tw/',
    title: 'TAIPEI 101 台北101 官方網站',
    domain: 'taipei-101.com.tw',
  },
  {
    kind: 'web',
    url: 'https://www.britannica.com/topic/Taipei-101',
    title: 'Taipei 101 | Britannica',
    domain: 'britannica.com',
  },
  {
    kind: 'web',
    url: 'https://en.wikipedia.org/wiki/Taipei_101',
    title: 'en.wikipedia.org',
    domain: 'en.wikipedia.org',
  },
]

const FAKE_SUGGESTIONS = `<style>.c{display:flex;gap:6px;padding:5px;border-radius:999px;background:#f1f3f4;overflow-x:auto;font:12px system-ui,sans-serif}.c a{flex:none;display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:#fff;border:1px solid #dadce0;color:#3c4043;text-decoration:none;white-space:nowrap}</style><div class="c"><a href="https://www.google.com/search?q=%E5%8F%B0%E5%8C%97101+%E5%A4%96%E8%A7%82">台北101 外观</a><a href="https://www.google.com/search?q=%E5%8F%B0%E5%8C%97101+%E9%9B%A8%E5%A4%9C">台北101 雨夜</a><a href="https://www.google.com/search?q=%E5%8F%B0%E5%8C%97101+%E5%A4%9C%E6%99%AF">台北101 夜景灯光</a></div>`

const RESULTS = {
  grounded: {
    status: 'grounded',
    sources: SOURCES,
    suggestionsHtml: FAKE_SUGGESTIONS,
  },
  empty: { status: 'empty', sources: [], suggestionsHtml: FAKE_SUGGESTIONS },
  error: { status: 'error', sources: [] },
} as const satisfies Record<string, SearchGroundingResult>

type GalleryState = 'searching' | keyof typeof RESULTS
type GalleryRun = 'single' | 'pair1' | 'pair2' | 'canvas'

const STATE_LABELS: Record<GalleryState, string> = {
  searching: '正在搜',
  grounded: '出图带来源',
  empty: '没搜到',
  error: '搜索出错',
}

const RUN_LABELS: Record<GalleryRun, string> = {
  single: '单跑',
  pair1: '同系列一起跑 · NB 在第 1 格',
  pair2: 'NB 在第 2 格',
  canvas: '画布卡（「收起」= 取消选中）',
}

const CANVAS_NODE_ID = 'ui-states-search-grounding-node'

function railState(state: GalleryState): SearchGroundingRailState {
  return state === 'searching'
    ? { phase: 'searching' }
    : {
        phase: 'done',
        view: mergeSearchGroundingResults([RESULTS[state]]),
      }
}

function pairItems(state: GalleryState, run: GalleryRun): RunItem[] {
  const models =
    run === 'pair2'
      ? [AI_MODELS.GEMINI_PRO_IMAGE, AI_MODELS.GEMINI_NANO_BANANA_21]
      : [AI_MODELS.GEMINI_NANO_BANANA_21, AI_MODELS.GEMINI_PRO_IMAGE]
  return makeRunItems({
    models,
    perModel: 1,
    generatingAt: state === 'searching' ? [0, 1] : [],
  }).map((item) =>
    item.modelId === AI_MODELS.GEMINI_NANO_BANANA_21
      ? {
          ...item,
          searchGrounding:
            state === 'searching' ? {} : { result: RESULTS[state] },
        }
      : item,
  )
}

export function SearchGroundingGallery() {
  const [state, setState] = useState<GalleryState>('grounded')
  const [run, setRun] = useState<GalleryRun>('single')
  const [open, setOpen] = useState(true)
  const isMobile = useIsMobile()
  const gridRef = useRef<HTMLDivElement>(null)
  const wireTarget = useCallback(
    () =>
      gridRef.current?.querySelector<HTMLElement>(
        '[data-search-grounding-tile]',
      ) ?? null,
    [],
  )
  // 画布卡的资料只住在内存表里：样板间直接往表里喂这一份。
  useEffect(() => {
    if (run !== 'canvas') return
    startNodeSearchGrounding(CANVAS_NODE_ID)
    if (state === 'searching') return
    addNodeSearchGroundingResult(CANVAS_NODE_ID, RESULTS[state])
    finishNodeSearchGrounding(CANVAS_NODE_ID)
  }, [run, state])
  const single = makeRunItems({
    models: [AI_MODELS.GEMINI_NANO_BANANA_21],
    perModel: 1,
  })[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(STATE_LABELS) as GalleryState[]).map((key) => (
          <Chip key={key} on={state === key} onClick={() => setState(key)}>
            {STATE_LABELS[key]}
          </Chip>
        ))}
        <span className="mx-2 h-4 w-px bg-border" />
        {(Object.keys(RUN_LABELS) as GalleryRun[]).map((key) => (
          <Chip key={key} on={run === key} onClick={() => setRun(key)}>
            {RUN_LABELS[key]}
          </Chip>
        ))}
        <span className="mx-2 h-4 w-px bg-border" />
        <Chip on={!open} onClick={() => setOpen(!open)}>
          离开出图那一刻（收起）
        </Chip>
      </div>

      {run === 'canvas' ? (
        <div className="flex min-h-0 flex-1 items-start justify-center pt-16 pl-72">
          <div className="relative h-106.75 w-80 rounded-node bg-card shadow-node-card">
            <ImageSearchGroundingSide
              nodeId={CANVAS_NODE_ID}
              selected={open}
              onSelect={() => setOpen(true)}
            />
          </div>
        </div>
      ) : run === 'single' && state === 'searching' ? (
        // 样板间里没有真的在跑的一轮（`isGenerating` 来自 context），出图前那一段
        // 用一个空图框代替 —— 量的是资料列，不是加载线。
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <SearchGroundingRail
            state={open ? railState(state) : null}
            layout="column"
            className="self-stretch"
          />
          <div className="aspect-9/16 h-full max-h-150 rounded-xl bg-muted" />
        </div>
      ) : run === 'single' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <GenerationPreview
            generation={state === 'searching' ? null : single.generation}
            searchGrounding={open ? railState(state) : null}
            isLatestResult
            fillStage={!isMobile}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <SearchGroundingRail
            state={open ? railState(state) : null}
            layout="column"
            wireTarget={wireTarget}
            wireKey={`${run}:${state}`}
            className="self-stretch"
          />
          <div ref={gridRef} className="flex min-w-0 flex-1 flex-col">
            <CompareGrid
              items={pairItems(state, run)}
              selectedItemId={null}
              onSelect={() => {}}
              elapsedSeconds={4}
              onEdit={() => {}}
              onUseAsReference={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'h-7 rounded-full border px-3 transition-colors duration-fast',
        on
          ? 'border-transparent bg-foreground text-background'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
